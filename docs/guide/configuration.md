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

| Field     | Type                   | Notes                                              |
|-----------|------------------------|----------------------------------------------------|
| `build`   | enum                   | `maturin` \| `setuptools` \| `hatch`. Default `setuptools`. |
| `targets` | (string \| object)[]   | Required when `build = "maturin"`. See [Target entries](#target-entries). |

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

## Build-side responsibilities

piot covers *publish-side* packaging: given artifacts on disk, it produces the registry publishes described above. It does **not** cross-compile, select GitHub Actions runners, or generate a matrix. Your workflow's `build` job owns:

- Picking runner OSes per target (e.g. `ubuntu-24.04-arm` for `aarch64-unknown-linux-gnu`).
- Running `maturin build --target …`, `napi build --target …`, `cargo build --target …` etc.
- Staging the outputs where the `publish` job can find them.

If you want a pre-built CLI archive attached to the GitHub Release (the `curl | tar x` install shape), compose with [`cargo-dist`](https://axodotdev.github.io/cargo-dist/) or [`goreleaser`](https://goreleaser.com/) alongside piot; piot doesn't emit release tarballs.

## Example

```toml
[putitoutthere]
version = 1

[[package]]
name = "my-rust"
kind = "crates"
path = "crates/my-rust"
paths = ["crates/my-rust/**"]

[[package]]
name = "my-py"
kind = "pypi"
path = "py/my-py"
paths = ["py/my-py/**"]
build = "maturin"
targets = ["x86_64-unknown-linux-gnu", "aarch64-apple-darwin"]
depends_on = ["my-rust"]
```
