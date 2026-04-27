# Library shapes

Two pages live here, one per genuinely shape-specific pattern:

- [**Polyglot Rust library**](/guide/shapes/polyglot-rust) — one Rust
  core feeds three artifacts: crate on crates.io, PyO3 wheels on PyPI
  via `maturin`, and an npm family via `napi-rs` or bundled CLI. Cascade
  interaction across registries is the non-obvious part.
- [**Bundled-CLI npm family**](/guide/shapes/bundled-cli) — a compiled
  CLI shipped as an npm per-platform family with a JS launcher. The
  `esbuild` / `biome` distribution pattern.

For everything else — single-package Python / npm / Rust libraries,
multi-package workspaces, plain library publishing — read
[Configuration](/guide/configuration). The config grammar plus the
example blocks on that page cover the common cases without a separate
walkthrough per language.
