// Brew: the beer behind a page. One full-screen triangle; every pixel is the
// fragment shader's, opaque: the paper above, a foam head on a moving surface,
// the beer below it with light playing through, and bubbles rising in streams
// that grow as they climb and pop under the foam. Lengths are in points.
struct Uniforms {
    time: f32,
    width: f32,
    height: f32,
    scale: f32,
    // Where the surface sits: 0 to 1 of the height, from the foot.
    level: f32,
    dark: f32,
    card: f32,
    pad: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct Fragment {
    @builtin(position) position: vec4<f32>,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Fragment {
    var out: Fragment;
    let x = f32(i32(i & 1u) * 4 - 1);
    let y = f32(i32(i >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    return out;
}

fn hash1(n: f32) -> f32 {
    return fract(sin(n * 127.1) * 43758.5453123);
}

fn hash2(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let s = f * f * (3.0 - 2.0 * f);
    let a = hash2(i);
    let b = hash2(i + vec2<f32>(1.0, 0.0));
    let c = hash2(i + vec2<f32>(0.0, 1.0));
    let d = hash2(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var p = p0;
    for (var i = 0; i < 4; i = i + 1) {
        v = v + a * noise(p);
        p = p * 2.07 + vec2<f32>(3.1, 7.7);
        a = a * 0.5;
    }
    return v;
}

// The distance to the nearest of a jittered grid of points, and to the second:
// their difference is small along a cell's wall, which is the foam's texture.
fn cells(p: vec2<f32>, t: f32) -> f32 {
    let i = floor(p);
    let f = fract(p);
    var d1 = 8.0;
    var d2 = 8.0;
    for (var y = -1; y <= 1; y = y + 1) {
        for (var x = -1; x <= 1; x = x + 1) {
            let g = vec2<f32>(f32(x), f32(y));
            let h = hash2(i + g);
            let o = 0.5 + 0.35 * sin(vec2<f32>(t * 0.6 + h * 6.28, t * 0.5 + h * 3.1));
            let d = length(g + o - f);
            if (d < d1) {
                d2 = d1;
                d1 = d;
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    return d2 - d1;
}

// The surface's height above its rest, at `x`: two swells crossing and a ripple.
fn swell(x: f32, t: f32) -> f32 {
    return sin(x * 0.017 + t * 0.9) * 3.5
        + sin(x * 0.043 - t * 1.6) * 1.6
        + (noise(vec2<f32>(x * 0.025 + t * 0.35, t * 0.2)) - 0.5) * 4.0;
}

@fragment
fn fs(f: Fragment) -> @location(0) vec4<f32> {
    let px = 1.0 / u.scale;
    let p = f.position.xy / u.scale;
    let size = vec2<f32>(u.width, u.height) / u.scale;
    let t = u.time * 0.001;

    // The scheme's colours: app.tamber's paper (or card) and amber.
    let paper_light = mix(vec3<f32>(0.961, 0.925, 0.851), vec3<f32>(1.0, 0.980, 0.941), u.card);
    let paper_dark = mix(vec3<f32>(0.110, 0.090, 0.071), vec3<f32>(0.165, 0.133, 0.098), u.card);
    let paper = mix(paper_light, paper_dark, u.dark);
    let beer_top = mix(vec3<f32>(0.957, 0.722, 0.337), vec3<f32>(0.560, 0.360, 0.100), u.dark);
    let beer_deep = mix(vec3<f32>(0.820, 0.490, 0.120), vec3<f32>(0.330, 0.190, 0.050), u.dark);
    let foam_lit = mix(vec3<f32>(1.0, 0.984, 0.945), vec3<f32>(0.760, 0.700, 0.600), u.dark);
    let foam_shade = mix(vec3<f32>(0.925, 0.855, 0.735), vec3<f32>(0.560, 0.490, 0.390), u.dark);
    // How much of the beer shows through the page: a background, not a poster.
    let strength = mix(0.62, 0.70, u.dark);

    let rest = size.y * (1.0 - u.level);
    let surface = rest - swell(p.x, t);
    // The head: its top rises and falls in bumps; it reaches down past the surface.
    let head_top = surface - 7.0 - 4.0 * fbm(vec2<f32>(p.x * 0.06, t * 0.25));
    let head_foot = surface + 5.0 + 2.0 * noise(vec2<f32>(p.x * 0.05 - t * 0.3, 1.7));

    var col = paper;

    // The beer: deeper and darker toward the foot, light playing through it.
    if (p.y > head_top) {
        let depth = clamp((p.y - surface) / max(size.y - surface, 1.0), 0.0, 1.0);
        var beer = mix(beer_top, beer_deep, pow(depth, 0.8));
        let q = vec2<f32>(p.x * 0.012, p.y * 0.02);
        let warp = vec2<f32>(fbm(q + vec2<f32>(t * 0.08, t * 0.05)), fbm(q + vec2<f32>(4.2, 1.3) - t * 0.06));
        let caustic = pow(fbm(q * 2.4 + warp * 2.0 + vec2<f32>(0.0, -t * 0.12)), 3.0);
        beer = beer + vec3<f32>(1.0, 0.85, 0.55) * caustic * mix(0.55, 0.30, u.dark) * (1.0 - depth * 0.7);
        // Shafts of light leaning down from the surface.
        let shaft = pow(0.5 + 0.5 * sin(p.x * 0.035 + p.y * 0.012 + t * 0.3 + fbm(q * 3.0) * 2.0), 6.0);
        beer = beer + vec3<f32>(1.0, 0.9, 0.7) * shaft * 0.10 * (1.0 - depth);

        // Bubbles: a stream per 16-point column, two bubbles to a stream; each
        // pixel asks its own column and its neighbours'.
        let column = 16.0;
        let ci = floor(p.x / column);
        let bottom = size.y + 6.0;
        var bubble_light = 0.0;
        var bubble_rim = 0.0;
        for (var dc = -1; dc <= 1; dc = dc + 1) {
            let c = ci + f32(dc);
            let live = hash1(c * 1.37 + 0.2);
            if (live < 0.45) {
                continue;
            }
            for (var k = 0; k < 2; k = k + 1) {
                let kf = f32(k);
                let h = hash1(c * 7.13 + kf * 3.71);
                let speed = 18.0 + 30.0 * hash1(c * 2.9 + kf);
                let climb = max(bottom - rest, 1.0);
                let fr = fract(t * speed / climb + h);
                let cy = bottom - fr * (bottom - surface + 4.0);
                let cx = (c + 0.5) * column + (hash1(c * 5.3 + kf * 1.9) - 0.5) * column * 0.6
                    + sin(t * (1.5 + h * 2.0) + h * 6.28) * 2.2 * fr;
                let r = (1.1 + 2.3 * hash1(c * 3.3 + kf * 8.1)) * (0.65 + 0.55 * fr);
                let d = length(p - vec2<f32>(cx, cy));
                // Popping: gone where the head begins.
                let alive = smoothstep(0.0, 6.0, cy - surface);
                let body = 1.0 - smoothstep(r - px, r + px, d);
                let rim = body * smoothstep(r * 0.45, r, d);
                let glint = 1.0 - smoothstep(0.0, r * 0.45, length(p - vec2<f32>(cx - r * 0.35, cy - r * 0.35)));
                bubble_light = max(bubble_light, (body * 0.25 + glint * 0.9) * alive);
                bubble_rim = max(bubble_rim, rim * alive);
            }
        }
        let rim_colour = mix(vec3<f32>(1.0, 0.95, 0.82), vec3<f32>(0.95, 0.80, 0.55), u.dark);
        beer = mix(beer, rim_colour, bubble_rim * 0.75);
        beer = beer + vec3<f32>(1.0, 0.97, 0.9) * bubble_light * 0.45;

        col = mix(paper, beer, strength);
    }

    // The head over it: cream bubbles, shaded in their walls and toward its foot.
    if (p.y > head_top - px && p.y < head_foot + px) {
        let inside = smoothstep(head_top - px, head_top + px, p.y) * (1.0 - smoothstep(head_foot - 2.0, head_foot + 1.0, p.y));
        let wall = smoothstep(0.0, 0.22, cells(vec2<f32>(p.x * 0.28, p.y * 0.34), t));
        let small = smoothstep(0.0, 0.3, cells(vec2<f32>(p.x * 0.7 + 13.0, p.y * 0.8), t * 1.3));
        let down = clamp((p.y - head_top) / max(head_foot - head_top, 1.0), 0.0, 1.0);
        var foam = mix(foam_shade, foam_lit, wall * 0.75 + small * 0.25);
        foam = mix(foam, foam_shade, down * 0.45);
        col = mix(col, mix(paper, foam, strength + 0.15), inside);
    }

    return vec4<f32>(col, 1.0);
}
