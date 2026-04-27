# E2E harness

End-to-end tests that publish the `piot-fixture-zzz-*` family to **real registries** (crates.io, TestPyPI, npm) on every PR + push to main via OIDC trusted publishing. One job per distinct publish-path manifestation; see `.github/workflows/e2e.yml`.

## What this covers

Unit + integration suites mock the registry. This harness is the last-mile check that the full pipeline works against the live registries: OIDC mint → publish → tag, end-to-end. If the matrix is green, every distinct shape this library claims to support actually publishes.

## Canary family

All packages are prefixed with `piot-fixture-zzz-*` so they sink in registry search results and nobody mistakes them for real packages. The `zzz` keeps them at the bottom of alphabetical listings.

| Fixture                  | Registry        | Package(s)                                                                |
|--------------------------|-----------------|---------------------------------------------------------------------------|
| `js-vanilla`             | npm             | `piot-fixture-zzz-cli`                                                    |
| `js-napi`                | npm             | `piot-fixture-zzz-js-napi` (+5 platform sub-pkgs)                         |
| `js-bundled-cli`         | npm             | `piot-fixture-zzz-js-bundled` (+5 platform sub-pkgs)                      |
| `js-python-no-rust`      | npm + TestPyPI  | `piot-fixture-zzz-js-no-rust` + `piot-fixture-zzz-python-no-rust`         |
| `python-pure-hatch`      | TestPyPI        | `piot-fixture-zzz-python-hatch`                                           |
| `python-pure-sdist-only` | TestPyPI        | `piot-fixture-zzz-python-sdist`                                           |
| `python-rust-maturin`    | TestPyPI        | `piot-fixture-zzz-python-maturin` (5 wheels + sdist under one name)       |
| `rust-crate-only`        | crates.io       | `piot-fixture-zzz-rust`                                                   |
| `polyglot-everything`    | all 3           | `-rust` + `-python` + `-cli` (+5 platform sub-pkgs for the bundled-cli)   |

## Auth

OIDC trusted publishing is the only auth path the suite exercises — no long-lived registry tokens. The `e2e` GitHub Actions environment grants `id-token: write`; the engine mints OIDC tokens for npm / twine / crates.io as needed.

A fixture's job stays red until its trusted publishers are registered (`piot-fixture-zzz-*` for npm/TestPyPI/crates.io). That's deliberate: the failure is the signal to wire the publisher.

## Version computation

Each run uses `0.0.{unix_seconds}` as the version. Monotonically increasing, never collides with a human-authored version, and crates.io's immutable-publish rule isn't blocking. Packages published in the same run share a version; their tag names disambiguate.

## Running locally

```bash
pnpm run test:e2e
```

This actually attempts to publish to real registries. Locally that fails (no OIDC env present) — e2e is a CI-shaped check, not a dev-loop one. Use unit + integration suites for local iteration.

## Architecture

`test/e2e/harness.ts` copies a fixture into a tmp dir, rewrites `__VERSION__` to a fresh `canaryVersion()`, initializes a throwaway git repo, and runs the CLI from a Node child process. Each `*.e2e.test.ts` file is one fixture, with one test that calls `publish --json` and asserts the result.
