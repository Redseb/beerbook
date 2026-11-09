//! Brew: the beer behind a page. Inputs, in order: `level` (where the
//! surface sits, 0 to 1 of the canvas's height from its foot), `dark` (1 in
//! the dark scheme), `still` (1 under Reduce Motion: one frame, no clock) and
//! `card` (1 when it sits on a card rather than the page). Every pixel is
//! opaque — the paper above the beer is the shader's too — so the canvas
//! composes alike under Metal's and WebGPU's alpha modes.

use crate::shaders::brew::{entry, module, Uniforms, GROUP_0, U};
use exact_gpu::json::number;
use exact_gpu::wgpu;
use exact_gpu::{Frame, FrameUniform, Surface, SurfaceError, Value};

/// The brew surface.
#[derive(Default)]
pub struct BrewSurface {
    level: f32,
    dark: f32,
    still: bool,
    card: f32,
    gpu: Option<Gpu>,
}

struct Gpu {
    format: wgpu::TextureFormat,
    generation: u32,
    pipeline: wgpu::RenderPipeline,
    uniforms: FrameUniform,
    bind_groups: Vec<wgpu::BindGroup>,
}

impl BrewSurface {
    /// A fresh surface.
    pub fn new() -> BrewSurface {
        BrewSurface { level: 0.5, ..BrewSurface::default() }
    }
}

impl Surface for BrewSurface {
    fn bind(&mut self, inputs: &[Value], _: Option<f64>) -> Result<(), SurfaceError> {
        let [level, dark, still, card] = inputs else {
            return Err(SurfaceError(format!("brew: expected 4 inputs, got {}", inputs.len())));
        };
        self.level = number(level, "level")?.clamp(0.0, 1.0) as f32;
        self.dark = if number(dark, "dark")? != 0.0 { 1.0 } else { 0.0 };
        self.still = number(still, "still")? != 0.0;
        self.card = if number(card, "card")? != 0.0 { 1.0 } else { 0.0 };
        Ok(())
    }

    fn opaque(&self) -> bool {
        true
    }

    fn render(
        &mut self,
        frame: &Frame,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        encoder: &mut wgpu::CommandEncoder,
        target: &wgpu::TextureView,
        format: wgpu::TextureFormat,
    ) -> bool {
        if self.gpu.as_ref().map(|g| (g.format, g.generation)) != Some((format, frame.shader_generation)) {
            self.gpu = Some(build(device, format, frame.shader_generation));
        }
        let gpu = self.gpu.as_mut().unwrap();
        let (w, h) = frame.pixels();
        let uniforms = Uniforms {
            // Held at a moment where the bubbles are spread out, under Reduce Motion.
            time: if self.still { 7300.0 } else { (frame.now_ms % 3_600_000.0) as f32 },
            width: w as f32,
            height: h as f32,
            scale: frame.scale.max(1.0),
            level: self.level,
            dark: self.dark,
            card: self.card,
            pad: 0.0,
        };
        let slot = gpu.uniforms.write(queue, &uniforms.bytes());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("brew"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    resolve_target: None,
                    depth_slice: None,
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&gpu.pipeline);
            pass.set_bind_group(0, &gpu.bind_groups[slot], &[]);
            pass.draw(0..3, 0..1);
        }
        // Lit from the clock: another frame, unless it holds still.
        !self.still
    }
}

fn build(device: &wgpu::Device, format: wgpu::TextureFormat, generation: u32) -> Gpu {
    let shader = device.create_shader_module(module());
    let layout = device.create_bind_group_layout(&GROUP_0);
    let uniforms = FrameUniform::new(device, Uniforms::SIZE, "brew uniforms");
    let bind_groups = (0..uniforms.slots())
        .map(|slot| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("brew"),
                layout: &layout,
                entries: &[wgpu::BindGroupEntry { binding: U.binding, resource: uniforms.buffer(slot).as_entire_binding() }],
            })
        })
        .collect();
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("brew"),
        bind_group_layouts: &[Some(&layout)],
        immediate_size: 0,
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("brew"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState { module: &shader, entry_point: Some(entry::VS), buffers: &[], compilation_options: Default::default() },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some(entry::FS),
            targets: &[Some(format.into())],
            compilation_options: Default::default(),
        }),
        primitive: Default::default(),
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    Gpu { format, generation, pipeline, uniforms, bind_groups }
}
