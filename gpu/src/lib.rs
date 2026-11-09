//! Beer Book's GPU module: `brew`, the beer at the foot of each page — a
//! liquid with a moving surface, a foam head, and bubbles that rise and pop.

#![deny(missing_docs)]

pub mod brew;
pub use brew::BrewSurface;

use exact_gpu::{Registry, Surface};

/// The shaders under `shaders/`, reflected at build (`build.rs`): entry points,
/// bindings and layouts as Rust, the WGSL their one authority.
pub mod shaders {
    include!(concat!(env!("OUT_DIR"), "/shaders.rs"));
}

fn brew() -> Box<dyn Surface> {
    Box::new(BrewSurface::new())
}

/// The module's surfaces — name, arity, factory — and their shaders. A surface
/// is named by its shader's file (`shaders/brew.wgsl`): the build finds them so.
pub static REGISTRY: Registry = Registry {
    surfaces: &[("brew", 4, brew)],
    shaders: shaders::SHADERS,
};

exact_gpu::module!(REGISTRY);
