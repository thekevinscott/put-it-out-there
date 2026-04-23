I have enough. Here's the evaluation.

---

## Scope of what we'd be replacing

Release machinery in this repo is substantial — 7 release-relevant workflows + 3 Python scripts with tests, ~2,100 lines that were hand-written to solve the polyglot problem:

| File | Lines | Role |
|---|---|---|
| `.github/workflows/release.yml` | 296 | cargo-dist-generated — builds tarballs, creates GH Release, npm OIDC trust anchor |
| `.github/workflows/patch-release.yml` | 262 | Scheduler (cron + push + dispatch), change-detection, dispatches to `publish.yml`, inlines the npm leg |
| `.github/workflows/publish.yml` | 374 | Reusable: tag, maturin build matrix (5 targets), sdist, PyPI OIDC, crates OIDC, GH Release, conditional rollback |
| `.github/workflows/publish-npm.yml` | 176 | napi build matrix + synthesised per-platform `@dirsql/*` packages + top-level `dirsql` with `optionalDependencies` |
| `scripts/release/compute_version.py` (+ test) | 76 + 64 | Next-version from `v*` tag + bump type |
| `scripts/release/check_published.py` (+ test) | 89 + 94 | `isPublished` probe for crates/PyPI/npm (idempotency) |
| `scripts/release/resolve_publish_targets.py` (+ test) | 129 + 214 | Glob-based change detection → `*_changed` flags |
| `.github/workflows/release-scripts.yml` | 42 | pytest + actionlint for the above |
| `dist-workspace.toml` | 27 | cargo-dist config |

The non-obvious invariants embedded here (and which any replacement must preserve):
- **Workflow filename is a trust anchor**: `patch-release.yml:1-4` explicitly warns renaming breaks the OIDC policy on crates.io + npm with HTTP 400.
- **aarch64 Linux needs the native ARM runner** (`publish.yml:141-150`) — a prior cross-compile attempt failed at link time.
- **The Rust CLI binary is staged into the Python wheel** (`publish.yml:172-188`) so `pip install dirsql` ships a working `dirsql` command. This is pre-`maturin`, not part of `maturin` itself.
- **Rollback only fires when both PyPI and crates fail** (`publish.yml:350-374`) — crates.io is immutable, so partial-success rollback can dangle a GH Release on a missing tag.
- **All matrix rows must succeed before PyPI** (`publish.yml:224-235`) — a prior release shipped without an aarch64-linux wheel when fail-fast was loose.
- **Dual CLI publish paths**: `dirsql` CLI ships to (a) crates.io via `cargo publish --features cli`, (b) npm via `@dirsql/cli-<slug>` family with a launcher, (c) PyPI wheels as a `console_scripts` shim — so it's installable via `cargo`, `npm`, and `pip`.

Three separate versioning surfaces get rewritten per release: workspace `Cargo.toml` (`publish.yml:282-288`), `packages/python/pyproject.toml` (`publish.yml:158-161`), and `packages/ts/package.json` (`patch-release.yml:216-219`) — plus each synthesised `@dirsql/*` sub-package.

## What piot already covers

From the docs, piot is squarely aimed at exactly this shape — the polyglot-Rust page is literally titled "Polyglot Rust library (dirsql shape)" (`guide/handoffs/polyglot-rust.html`). Direct replacements:

| dirsql component | piot equivalent | Evidence |
|---|---|---|
| `resolve_publish_targets.py` (213 lines incl. tests) | Glob-based cascade via `paths` + transitive `depends_on` | `guide/concepts.html` § Cascade |
| `compute_version.py` (140 lines incl. tests) | `release: patch\|minor\|major [pkgs…]` trailer | `guide/trailer.html`; full grammar |
| `check_published.py` (183 lines incl. tests) | Built-in `isPublished` on every handler | `guide/concepts.html` § Idempotency |
| `publish.yml` PyPI leg (OIDC + skip-existing) | `kind="pypi"`, `build="maturin"`, OIDC via `/_/oidc/mint-token` | `guide/auth.html` § PyPI |
| `publish.yml` crates leg (OIDC + retry) | `kind="crates"`, `rust-lang/crates-io-auth-action` | `guide/auth.html` § crates.io |
| `publish-npm.yml` synthesis (`buildLibPlatforms.ts`, `buildPlatforms.ts`, `syncVersion.ts`) | `build="napi"` + `build="bundled-cli"` — synthesises sub-packages, narrows `os`/`cpu`/`libc`, rewrites `optionalDependencies`, publishes top-level last | `guide/npm-platform-packages.html` steps 1-4 |
| Topological ordering (implicit in our `needs:` DAG) | Explicit DFS over `depends_on` | `guide/concepts.html` § Publishing order |
| GH Release creation | Per-package `{name}-v{version}` tag + GH Release | polyglot-rust page |

This is a tight fit. The napi platform-family is the most painful piece in our setup (`publish-npm.yml` + the three `tools/*.ts` scripts), and piot claims it as a first-class declarative feature.

## What's missing or would change for dirsql

### Blockers

1. **Not verifiably installable yet.** Docs prescribe `npx putitoutthere init` but nothing in the docs says "install from npm" or links to a registry page; the GitHub repo is `thekevinscott/put-it-out-there` (private likely — I couldn't probe from sandbox). The Action is advertised as `thekevinscott/put-it-out-there@v0` with no versioning story. If the npm package isn't published and the Action isn't tagged, "adopt piot" reduces to "vendor piot source," which defeats the point. **Fix: piot needs a public `v0` Action tag and a `putitoutthere` npm package before dirsql can consume it.**

2. **Tag-scheme breaking change.** piot tags each package as `{name}-v{version}` (polyglot-rust page, "Two tag schemes" gotcha). dirsql currently ships a single `v{version}` across all three packages (`publish.yml:115-128`), and a second workflow — `release.yml` (cargo-dist) — is triggered by `push.tags: **[0-9]+.[0-9]+.[0-9]+*`. Switching to per-package tags will:
   - Break the cargo-dist trigger regex (or require three per-release tag pushes).
   - Break any downstream installer / docs that hardcodes `v0.x.y`.
   - Require a PARITY.md note about synchronised-vs-independent versioning since `ARCHITECTURE.md:15` currently mandates "complete API parity across all three SDKs" — piot would let the Python SDK drift a minor behind Rust.

3. **No pre-build hook means the wheel-embedded CLI stays workflow-owned.** Our `publish.yml:172-188` does `cargo build --bin dirsql --features cli` → stage into `packages/python/python/dirsql/_binary/` → `maturin build`. The polyglot-rust page admits this: *"piot doesn't have a pre-build hook for this yet; the staging step stays in your `build` job."* Not a blocker — piot's design explicitly puts build in the consumer's workflow — but it means we don't get to delete that logic. It stays, it just moves from `publish.yml` to a user-owned build job that feeds piot.

4. **cargo-dist overlap.** We use cargo-dist (`dist-workspace.toml`) for the `.tar.xz`/`.zip` installable binaries attached to GH Releases. piot explicitly disclaims this — getting-started page: *"That's `cargo-dist`'s / `goreleaser`'s lane; compose with them, don't replace them with piot."* So we keep `release.yml` (296 lines) and run piot alongside it. Only `patch-release.yml` + `publish.yml` + `publish-npm.yml` + the three Python scripts go away (~1,400 of the ~2,100 lines).

### Smaller gaps / risks

5. **Scheduled / cron releases are half-specified.** `patch-release.yml:11-13` is cron-driven at 2am UTC, and our `check.decide` step distinguishes `schedule` / `push` / `workflow_dispatch`. piot says `cadence = "scheduled"` exists in `[putitoutthere]` (configuration page) and getting-started says *"piot is not a cron-driven release orchestrator at the tool level (though you can run it from a cron workflow)."* There's no docs page explaining what `cadence` does or how the scheduled flow differs from the merge-driven one. **Fix: need a docs section on scheduled cadence, otherwise we don't know whether to keep our 2am-UTC cron or delete it.**

6. **`features` on `crates` packages.** Configuration page lists `features: string[]` under `kind = "crates"` — good, maps to our `publish.yml:312-328` `cargo publish -p dirsql --features cli` need. But the same table lists a singular `target: string[]` field with note "Build matrix (empty = host only)" — which looks like a typo (should be `targets` to match `pypi`/`npm`). Minor doc bug; worth filing but not a blocker.

7. **Dynamic `pyproject.toml` versions are explicitly unsettled** — the polyglot-rust page calls this out as issue #171. We don't use `hatch-vcs` (our version is static, `sed`-rewritten), so this doesn't block us, but it's worth knowing.

8. **No `doctor` check for the OIDC trust policy.** CLI page § doctor explicitly admits: it doesn't verify the trusted-publisher policy is registered on the registry, and doesn't verify the caller-workflow filename matches what crates.io/npm pinned. That's exactly the class of error our `publish.yml:1-4` comment is warning about — so migrating still requires the operator to re-register trust policies with the new `release.yml` filename before the first piot-driven publish, or the first release fails HTTP 400.

9. **Rollback semantics differ.** Ours deletes the tag on double-failure (`publish.yml:350-374`). piot deliberately doesn't rollback (getting-started "piot is probably not the right tool if… automatic tag rollback"). Defensible — completeness-check before publish is better than cleanup after — but it means our current "safety net" behaviour disappears. Acceptable but worth flagging.

10. **Mutually exclusive `napi` + `bundled-cli` in one package.** npm-platform-packages "Constraints worth knowing" is explicit: a single `[[package]]` can be `napi` or `bundled-cli`, not both. We currently publish both — `@dirsql/lib-<slug>` (napi) and `@dirsql/cli-<slug>` (CLI binary) — under separate top-level npm names. piot handles this fine as two `[[package]]` entries; just noting that our `publish-npm.yml:139-167` which synthesises both in one workflow becomes two piot packages.

11. **The "Polyglot Rust library" teaser link 404s from getting-started.** The sidebar path `guide/handoffs/polyglot-rust.html` works; but `guide/handoffs/polyglot-rust` (no extension, what the getting-started page links to) returns an error. Small docs-site bug.

12. **Scaffolding lives on CLAUDE.md.** `putitoutthere init` appends `@putitoutthere/AGENTS.md` to CLAUDE.md (CLI reference page). Our `AGENTS.md` is already `@../AGENTS.md` into a global; need to verify the piot append doesn't collide or that we can point it at the nested AGENTS.md.

## Concrete conclusion

**Adoption is feasible and the shape match is strong** — piot covers ~70% of the custom machinery by line count (all of `patch-release.yml`, most of `publish.yml` except the build steps, all of `publish-npm.yml`, and all three Python scripts). We keep cargo-dist for binary archives and keep a user-owned build job for cross-compile + wheel-embedded-CLI staging.

**Two hard blockers before dirsql can `npx putitoutthere init` for real:**

1. **Ship `putitoutthere` to npm and tag `thekevinscott/put-it-out-there@v0`.** Without those, adoption means vendoring. The docs describe both surfaces as if they exist; the installability path needs to be proven end-to-end (even a `0.0.1` on npm that just runs `init` would unblock the scaffolding flow).
2. **Document the scheduled-cadence flow.** `cadence = "scheduled"` is named but unexplained. Our current releases run from a nightly cron; we can't drop `patch-release.yml` until the piot-native cron story is pinned down.

**One project decision to make** (not piot's problem to solve): whether we're OK moving from a single synchronised `v0.x.y` tag to per-package `dirsql-rust-v0.x.y` / `dirsql-py-v0.x.y` / `dirsql-v0.x.y` tags. That contradicts `ARCHITECTURE.md:15` and affects any installer/docs that assume a shared version.

Everything else is documented-and-known: keep cargo-dist alongside, keep the wheel-CLI staging step in the build job, re-register the trust policies on each registry against the piot-scaffolded workflow filename before the first release.
