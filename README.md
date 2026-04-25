# Put It Out There

Polyglot release orchestrator for single-maintainer, LLM-authored projects
that publish to crates.io, PyPI, and npm from one monorepo. One config file,
one CLI, a paths-based cascade — no per-package release plumbing.

**[Documentation](https://thekevinscott.github.io/put-it-out-there/)**

## Install

```sh
npx putitoutthere init
```

Scaffolds a `putitoutthere.toml`, a `release.yml` workflow, and an
`AGENTS.md` file documenting the trailer convention for future contributors.

For one-off runs without scaffolding:

```sh
pnpm add -D putitoutthere
pnpm putitoutthere plan
```

*Read more: [Getting started](./docs/getting-started.md)*

## Concepts

You declare packages in `putitoutthere.toml`. On every push to `main`, piot
looks at which files changed and which packages list those paths — those
packages cascade and ship at `patch`. Paths in, releases out.

*Read more: [Concepts](./docs/guide/concepts.md)*

## Configuration

```toml
# putitoutthere.toml
[putitoutthere]
version = 1

[[package]]
name  = "my-lib"
kind  = "npm"        # or "pypi" | "crates"
path  = "."
paths = ["src/**", "package.json"]
```

`paths` are the globs that trigger a release for this package. Any commit
touching a matching file makes the package a candidate.

*Read more: [Configuration](./docs/guide/configuration.md)*

## Cascade

When a low-level package changes, packages that `depends_on` it cascade and
ship together at the same bump. That's how a Rust core change can publish a
crate, a PyO3 wheel, and an npm CLI in a single merge.

```toml
[[package]]
name = "my-tool-rust"
kind = "crates"
path = "packages/rust"
paths = ["packages/rust/**"]

[[package]]
name = "my-tool-python"
kind = "pypi"
path = "packages/python"
paths = ["packages/python/**"]
build = "maturin"
depends_on = ["my-tool-rust"]

[[package]]
name = "my-tool-cli"
kind = "npm"
path = "packages/ts"
paths = ["packages/ts/**"]
build = "bundled-cli"
depends_on = ["my-tool-rust"]
```

Reference fixture: [`test/fixtures/polyglot-everything/`](./test/fixtures/polyglot-everything/).

*Read more: [Cascade](./docs/guide/cascade.md)*

## Authentication

Trusted publishing (OIDC) is the default on all three registries — no
long-lived tokens. One-time setup per registry:

- **npm:** [trusted publishing](https://docs.npmjs.com/trusted-publishers) — `--provenance` is added automatically.
- **PyPI:** [pending publisher](https://docs.pypi.org/trusted-publishers/) — register the project pointing at this repo's `release.yml`.
- **crates.io:** [OIDC via `rust-lang/crates-io-auth-action@v1`](https://github.com/rust-lang/crates-io-auth-action) — needs one manual bootstrap publish.

Token fallbacks (`NPM_TOKEN`, `PYPI_API_TOKEN`, `CARGO_REGISTRY_TOKEN`) are
still read from env if OIDC isn't available. `putitoutthere doctor` reports
which path is active.

*Read more: [Authentication](./docs/guide/auth.md)*

## Library shapes

End-to-end walkthroughs — config + `release.yml` + prerequisites + gotchas
— for the common shapes:

**Single-package**

- [Python library](./docs/guide/shapes/python-library.md)
- [npm library](./docs/guide/shapes/npm-library.md)
- [Rust crate](./docs/guide/shapes/rust-crate.md)

**Multi-package workspaces**

- [Rust workspace](./docs/guide/shapes/rust-workspace.md)
- [npm workspace](./docs/guide/shapes/npm-workspace.md)

**Rust core, multi-registry**

- [Rust + PyO3 wheels](./docs/guide/shapes/rust-pyo3.md)
- [Rust + napi npm](./docs/guide/shapes/rust-napi.md)
- [Polyglot Rust library](./docs/guide/shapes/polyglot-rust.md)
- [Python wheels with C extensions](./docs/guide/shapes/python-cibuildwheel.md)

**Distribution patterns**

- [Bundled-CLI npm family](./docs/guide/shapes/bundled-cli.md)
- [Dual-family npm (CLI + napi)](./docs/guide/shapes/dual-family-npm.md)

*Read more: [Library shapes overview](./docs/guide/shapes/index.md)*

## Nightly release

Prefer to batch a day's commits into one nightly release? Add a `cron`
schedule to `release.yml`; piot runs the same plan-and-publish flow against
the accumulated unreleased commits.

*Read more: [Nightly release](./docs/guide/nightly-release.md)*

## Dynamic versions

If your `pyproject.toml` uses `dynamic = ["version"]` (`hatch-vcs`,
`setuptools-scm`, maturin), piot writes the resolved version into the build
at publish time so the wheel matches the tag.

*Read more: [Dynamic versions](./docs/guide/dynamic-versions.md)*

## npm platform packages

For native binaries shipped as platform packages
(`@your/cli-darwin-arm64`, etc.), piot publishes the per-platform wrappers
and the parent package together with `optionalDependencies` resolution
intact.

*Read more: [npm platform packages](./docs/guide/npm-platform-packages.md)*

## Custom build workflows

When the default per-kind build matrix doesn't cover a package — a wheel
that needs a CUDA toolchain, say — declare a custom `build = "..."` and
provide a workflow that produces the artefact.

*Read more: [Custom build workflows](./docs/guide/custom-build-workflows.md)*

## Runner prerequisites

`putitoutthere` shells out to standard toolchains (`cargo`,
`uv`/`maturin`/`hatch`, `npm`, `twine`). The scaffolded `release.yml`
installs what each package needs; the docs page lists exact versions and
cross-compile prerequisites.

*Read more: [Runner prerequisites](./docs/guide/runner-prerequisites.md)*

## Testing your release workflow

Before merging a change to `release.yml` or `putitoutthere.toml`, run
`putitoutthere plan --dry-run` locally to print the matrix that would ship.
Combine with `act` to exercise the full workflow without cutting tags.

*Read more: [Testing your release workflow](./docs/guide/testing-your-release-workflow.md)*

## CLI

`putitoutthere` ships a CLI with `init`, `plan`, `publish`, and `doctor`
subcommands. JSON output is stable for piping into other tools.

*Read more: [CLI reference](./docs/api/cli.md)*

## GitHub Action

`thekevinscott/put-it-out-there@v0` wraps the CLI for use directly in
workflows. Inputs and outputs are documented and stable.

*Read more: [GitHub Action](./docs/api/action.md)*

## Overriding the default release

By default, every cascaded package ships at `patch`. To bump `minor` or
`major`, scope a bump to specific packages, or skip a release for a
particular merge, add a `release:` trailer to the commit:

```
feat: new parser

release: minor
```

The trailer is optional — leave it off and piot patches whatever cascaded.

*Read more: [Release trailer](./docs/guide/trailer.md)*

## Migrations

Two distinct flavours of migration, both step-by-step:

- [Upgrading between piot versions](./MIGRATIONS.md)
- [Adopting piot from hand-rolled release infra](./migrations/)

*Read more: [Migrations](./docs/guide/migrations.md)*

## Known gaps

piot is deliberately scope-bounded — no version computation, no changelog
generation, no monorepo discovery, no arbitrary shell hooks. Compose with
release-please / cargo-dist / changesets for those.

*Read more: [Known gaps](./docs/guide/gaps.md)*
