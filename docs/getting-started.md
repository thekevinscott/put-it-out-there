# Getting started

Put It Out There is a polyglot release orchestrator. One `putitoutthere.toml` describes your packages; the CLI computes a release plan from git + a commit trailer and publishes to crates.io, PyPI, and npm.

## Install

```bash
npx putitoutthere init
```

Scaffolds:

- `putitoutthere.toml` — declare your packages.
- `.github/workflows/release.yml` — plan → build → publish pipeline.
- `.github/workflows/putitoutthere-check.yml` — PR dry-run check.
- `putitoutthere/AGENTS.md` — the trailer convention your LLM agent will follow.

## Minimum config

```toml
[putitoutthere]
version = 1

[[package]]
name = "my-crate"
kind = "crates"
path = "."
paths = ["src/**", "Cargo.toml"]
first_version = "0.1.0"
```

## Release a version

Merge to `main`. A patch release ships automatically. To bump minor or major:

```
release: minor
```

in the merge commit body. See [the trailer guide](/guide/trailer) for the full grammar.

## Further reading

- [Concepts](/guide/concepts) — cascade, trailer, plan/build/publish.
- [Configuration](/guide/configuration) — every field in `putitoutthere.toml`.
- [CLI reference](/api/cli).
