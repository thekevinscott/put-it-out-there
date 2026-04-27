# Configuration

`putitoutthere.toml` lives at the repo root. Schema below.

## `[putitoutthere]`

```toml
[putitoutthere]
version = 1              # required; only 1 is valid today
cadence = "immediate"    # or "scheduled" (cron-triggered releases)
```

## `[[package]]` (one per releasable unit)

Shared fields across every `kind`:

| Field           | Type     | Required | Notes                                             |
|-----------------|----------|----------|---------------------------------------------------|
| `name`          | string   | yes      | Must be unique across the config.                 |
| `kind`          | enum     | yes      | `crates` \| `pypi` \| `npm`.                      |
| `path`          | string   | yes      | Package working dir: `Cargo.toml` (crates), `pyproject.toml` (pypi), or `package.json` (npm). |
| `paths`         | string[] | yes      | Globs that cascade this package.                  |
| `depends_on`    | string[] | no       | Package names this one depends on.                |
| `first_version` | string   | no       | Default `0.1.0`.                                  |
| `tag_format`    | string   | no       | Template for the git tag cut on release. Default `"{name}-v{version}"`. Single-package repos can pick `"v{version}"`. `{version}` is required; `{name}` is optional. |
| `trust_policy`  | table    | no       | Declared OIDC trust-policy expectations — see [Authentication](./auth.md#declaring-trust-policy-expectations). |

### `kind = "crates"`

| Field                 | Type     | Notes                                                      |
|-----------------------|----------|------------------------------------------------------------|
| `crate`               | string   | Override `name` → crates.io name.                          |
| `features`            | string[] | Pass through to `cargo publish --features`.                |
| `no_default_features` | bool     | Pass `--no-default-features` to `cargo publish` when true. |

Crates are always built on the runner host. There is no cross-target build
matrix — `cargo publish` uploads source to crates.io, which compiles on the
consumer's machine.

### `kind = "pypi"`

| Field        | Type                   | Notes                                              |
|--------------|------------------------|----------------------------------------------------|
| `pypi`       | string                 | Override `name` → PyPI registered project name. Set this when the importable Python package name (and the value used by `[[package]].name` for piot's internal graph) differs from the name registered on PyPI. Used by token-scope checks and by the pypi handler when calling the upload API. |
| `build`      | enum                   | `maturin` \| `setuptools` \| `hatch`. Default `setuptools`. |
| `targets`    | (string \| object)[]   | Required when `build = "maturin"`. See [Target entries](#target-entries). |
| `bundle_cli` | table                  | Opt-in recipe to cross-compile a Rust CLI per target and stage the binary into the package source tree so maturin includes it in each wheel. Only valid with `build = "maturin"` + non-empty `targets`. See [Bundled CLI](#bundled-cli). |

#### Bundled CLI

The `ruff` / `uv` / `pydantic-core` shape: `pip install my-py` on
any platform gets a working CLI on `PATH` without requiring a Rust
toolchain on the user's machine.

```toml
[[package]]
name = "my-py"
kind = "pypi"
path = "py/my-py"
paths = ["py/my-py/**", "crates/my-rust/**"]
build = "maturin"
targets = [
  "x86_64-unknown-linux-gnu",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
]

[package.bundle_cli]
bin        = "my-cli"            # `cargo build --bin <this>` per target
stage_to   = "src/my_py/_binary" # path inside pkg.path where the binary lands
crate_path = "crates/my-rust"    # cwd for `cargo build`; defaults to "." (repo root)
```

| Sub-field    | Type   | Required | Notes |
|--------------|--------|----------|-------|
| `bin`        | string | yes      | Binary name passed to `cargo build --bin`. |
| `stage_to`   | string | yes      | Destination path **relative to `pkg.path`**. `[tool.maturin].include` must cover it so the binary ends up inside each wheel. |
| `crate_path` | string | no       | Directory to run `cargo build` from. Defaults to `"."` (works for workspace `Cargo.toml` at the repo root). Override when the crate lives outside a workspace. |

The scaffolded build job branches on `matrix.bundle_cli.bin`: when
set, it installs the Rust toolchain with the target triple, runs
`cargo build --release --bin <bin> --target <triple>` from
`crate_path`, and copies the binary (including the Windows `.exe`
suffix) into `<pkg.path>/<stage_to>/` before maturin builds the
wheel.

`pyproject.toml` needs to reference the staged binary so it ends
up on `PATH`. The common pattern:

```toml
# pyproject.toml

[project.scripts]
my-cli = "my_py._binary:entrypoint"    # stub in src/my_py/_binary/__init__.py

[tool.maturin]
include = ["src/my_py/_binary/**"]     # ship the binary as package data
```

Where `src/my_py/_binary/__init__.py` is a few lines that `os.execv`
into the staged binary. See [Polyglot Rust library](/guide/shapes/polyglot-rust#shipping-a-rust-cli-inside-the-pypi-wheel)
for a worked example with the full `__init__.py`.

### `kind = "npm"`

| Field     | Type                   | Notes                                                |
|-----------|------------------------|------------------------------------------------------|
| `npm`     | string                 | Override `name` → npm name (for scoped packages).    |
| `access`  | enum                   | `public` \| `restricted`. Default `public`.          |
| `tag`     | string                 | dist-tag. Default `latest`.                          |
| `build`   | enum                   | `napi` \| `bundled-cli`. Omitted = vanilla.          |
| `targets` | (string \| object)[]   | Required when `build ∈ {napi, bundled-cli}`. See [Target entries](#target-entries). |

### Target entries

Each entry in `targets` is either:

- A **bare triple string** — the planner picks a sensible default GitHub
  Actions runner (`macos-latest` for darwin, `windows-latest` for msvc,
  `ubuntu-24.04-arm` for aarch64-linux, `ubuntu-latest` otherwise).
- An **object** `{ triple, runner }` — `runner` overrides the default
  for that specific triple. Use this when you need a non-default runner
  (e.g. native-arm cross-compile, a macOS 14 image instead of latest,
  or a self-hosted label). Unknown keys inside the object are rejected.

```toml
targets = [
  "x86_64-unknown-linux-gnu",                                            # bare, uses mapping default
  { triple = "aarch64-unknown-linux-gnu", runner = "ubuntu-24.04-arm" }, # override
  { triple = "aarch64-apple-darwin",      runner = "macos-14" },        # override
]
```

With `build = "napi"` or `build = "bundled-cli"` set, piot synthesizes a per-platform package for each target, publishes them, then rewrites the top-level's `optionalDependencies` to pin them at the just-published version — the esbuild/biome family pattern. See [npm platform packages](/guide/npm-platform-packages) for the full shape.

## Build phase

The reusable workflow runs the build phase internally — toolchain
setup, per-target compilation, artifact upload — based on the
`kind` and `build` fields each package declares. Consumers do not
write build steps.

If you need a binary archive attached to the GitHub Release (the
`curl | tar x` install shape), compose with
[`cargo-dist`](https://axodotdev.github.io/cargo-dist/) or
[`goreleaser`](https://goreleaser.com/) in a separate workflow;
piot doesn't emit release tarballs.

## Example shapes

Drop one of these into `putitoutthere.toml` to start.

### Single-package Python library to PyPI

```toml
[putitoutthere]
version = 1

[[package]]
name  = "my-lib"
kind  = "pypi"
path  = "."
paths = ["src/**", "pyproject.toml"]
build = "hatch"            # or "setuptools"
tag_format = "v{version}"  # single-package repos often want this
```

### Single-package npm library

```toml
[putitoutthere]
version = 1

[[package]]
name  = "my-lib"
kind  = "npm"
path  = "."
paths = ["src/**", "package.json"]
tag_format = "v{version}"
```

### Single-package Rust crate to crates.io

```toml
[putitoutthere]
version = 1

[[package]]
name  = "my-crate"
kind  = "crates"
path  = "."
paths = ["src/**", "Cargo.toml"]
tag_format = "v{version}"
```

### Multi-crate Rust workspace

```toml
[putitoutthere]
version = 1

[[package]]
name  = "my-core"
kind  = "crates"
path  = "crates/core"
paths = ["crates/core/**"]

[[package]]
name       = "my-macros"
kind       = "crates"
path       = "crates/macros"
paths      = ["crates/macros/**"]
depends_on = ["my-core"]   # cascade: a my-core change ships my-macros too
```

### Multi-package npm workspace

```toml
[putitoutthere]
version = 1

[[package]]
name  = "@my/core"
kind  = "npm"
path  = "packages/core"
paths = ["packages/core/**"]

[[package]]
name       = "@my/parser"
kind       = "npm"
path       = "packages/parser"
paths      = ["packages/parser/**"]
depends_on = ["@my/core"]
```

### Polyglot: Rust crate + PyO3 wheels + npm bundled CLI

```toml
[putitoutthere]
version = 1

[[package]]
name  = "my-rust"
kind  = "crates"
path  = "crates/my-rust"
paths = ["crates/my-rust/**"]

[[package]]
name       = "my-py"
kind       = "pypi"
path       = "py/my-py"
paths      = ["py/my-py/**"]
build      = "maturin"
targets    = ["x86_64-unknown-linux-gnu", "aarch64-apple-darwin"]
depends_on = ["my-rust"]

[[package]]
name       = "my-cli"
kind       = "npm"
path       = "packages/ts"
paths      = ["packages/ts/**"]
build      = "bundled-cli"
targets    = ["x86_64-unknown-linux-gnu", "aarch64-apple-darwin"]
depends_on = ["my-rust"]
```

A change to `crates/my-rust/` cascades: the crate ships, then the
Python wheels and npm family ship on top. A change to only the
TS shim ships just the npm package.

See [Polyglot Rust library](/guide/shapes/polyglot-rust) for the
full walkthrough including the cargo workspace + maturin layout
gotchas.
