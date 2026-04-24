# Library shapes

Worked end-to-end examples, one per common library shape. Each page
walks through the `putitoutthere.toml`, the `release.yml`, the
publish-job prerequisites, and the gotchas specific to that shape.

Pick the one that matches your repo. If none quite fit, the closest
shape plus [Configuration](/guide/configuration) should cover it.

## Shapes

- [**Single-package Python library**](/guide/shapes/python-library) —
  one `pyproject.toml` at the repo root, publishing to PyPI. Covers
  both static-version (literal `version = "…"`) and dynamic-version
  (`hatch-vcs` / `setuptools-scm`) setups.

- [**Polyglot Rust library**](/guide/shapes/polyglot-rust) — one Rust
  core, three artifacts: a crate on crates.io, PyO3 wheels on PyPI via
  `maturin`, and a napi-rs package on npm as a per-platform family.

## Not covered here (yet)

If your shape isn't listed, start with [Concepts](/guide/concepts) for
what piot does and doesn't cover, then
[Configuration](/guide/configuration) for the `[[package]]` grammar.
[Known gaps](/guide/gaps) enumerates the shapes piot deliberately
won't absorb (so you can rule them out early).

Want a shape added? Open an issue with your `putitoutthere.toml` and
`release.yml`; it's the fastest path to a new page.
