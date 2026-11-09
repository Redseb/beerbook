"""Draws the test photos in fixtures/: a pint, a can and a bottle on a table,
as plain PNGs (no image library), then sips makes them JPEGs."""
import math, struct, subprocess, sys, zlib
from pathlib import Path

W, H = 600, 800

def png(path, px):
    raw = b"".join(b"\0" + bytes(c for p in row for c in p) for row in px)
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def scene(shape, wall, table):
    px = []
    for y in range(H):
        row = []
        for x in range(W):
            c = mix(wall, mix(wall, (255, 255, 255), 0.3), y / H) if y < 560 else mix(table, (40, 25, 15), (y - 560) / 240)
            row.append(shape(x, y, c))
        px.append(row)
    return px

def pint(x, y, c):
    top, bottom = 140, 640
    if not (top <= y <= bottom): return c
    half = 150 - (y - top) * 0.09
    dx = abs(x - 300)
    if dx > half: return c
    if y < top + 70: return mix((255, 250, 235), (240, 230, 205), (y - top) / 70)          # foam
    beer = mix((246, 178, 40), (150, 70, 10), (y - top) / (bottom - top))
    return mix(beer, (255, 230, 160), 0.35) if dx > half - 14 or (x - 300) < -half + 40 else beer

def can(x, y, c):
    if not (180 <= y <= 640 and abs(x - 300) <= 120): return c
    shade = 1 - abs(x - 300) / 120 * 0.45
    base = (36, 120, 170) if (y // 60) % 3 else (240, 200, 60)
    if y < 200 or y > 620: base = (200, 200, 205)
    return tuple(int(v * shade) for v in base)

def bottle(x, y, c):
    if 120 <= y < 300: half = 34 + max(0, y - 230) * 0.9
    elif 300 <= y <= 650: half = 95
    else: return c
    if abs(x - 300) > half: return c
    shade = 1 - abs(x - 300) / half * 0.5
    if 380 <= y <= 520 and y >= 300: base = (245, 236, 215)                                 # label
    elif y < 150: base = (190, 160, 60)                                                     # cap
    else: base = (70, 40, 12)
    return tuple(int(v * shade) for v in base)

out = Path(sys.argv[1])
for name, shape, wall, table in [("pint", pint, (60, 90, 70), (120, 80, 50)),
                                 ("can", can, (200, 90, 80), (90, 60, 40)),
                                 ("bottle", bottle, (90, 110, 160), (150, 110, 70))]:
    p = out / f"{name}.png"
    png(p, scene(shape, wall, table))
    subprocess.run(["sips", "-s", "format", "jpeg", str(p), "--out", str(out / f"{name}.jpg")], check=True, capture_output=True)
    p.unlink()
