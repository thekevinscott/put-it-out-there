## Evaluation: can dirsql adopt piot today?

**Short answer: ~80% conceptual fit, three concrete blockers, one of which is in piot's docs, one in piot's feature set, and one in dirsql's workflow shape.**

### What dirsql's release process actually does

Release-relevant surface:
- `release.yml` — cargo-dist-generated, fires on `**[0-9]+.[0-9]+.[0-9]+*` tags, uploads binary archives to a GitHub Release.
- `patch-release.yml` — cron @ 02:00 UTC + `workflow_dispatch`. Orchestrator.
- `publish.yml` (reusable) — computes version (via `scripts/release/compute_version.py`), builds maturin wheels per-platform, runs OIDC publish to PyPI + crates.io, creates tag + GitHub Release, rollback job if both publishes fail.
- `publish-npm.yml` — runs `on: workflow_run: [release.yml]`, synthesizes `@dirsql/cli-<slug>` + `@dirsql/lib-<slug>` sub-packages, publishes each, then publishes `dirsql` top-level with merged `optionalDependencies` (see `packages/ts/tools/syncVersion.ts:3-5`).
- `scripts/release/{compute_version,check_published,resolve_publish_targets}.py` — ~300 LOC total of release-plan logic (version math + registry idempotency GET + changed-files cascade via globs).

Key shapes: **single shared workspace version** (`Cargo.toml [workspace.package] version`), one `v0.1.0` tag for all three SDKs, OIDC trusted publishers on all three registries, Python wheels embed a Rust CLI binary via maturin `include`, and the npm `dirsql` top-level package optionally-depends on BOTH the CLI family AND the napi-lib family.

### What piot already covers (= dirsql can delete)

From `/guide/concepts.html`, `/guide/configuration.html`, `/guide/npm-platform-packages.html`, `/guide/auth.html`, `/api/cli.html`:

| dirsql today | piot equivalent |
|---|---|
| `resolve_publish_targets.py` globs + change detection | `[[package]].paths` + cascade (concepts, `#cascade`) |
| `compute_version.py` semver math | `release:` trailer + patch-on-cascade default (`/guide/trailer.html`) |
| `check_published.py` GET-before-publish | handler's first move is `isPublished`, idempotent skip (`#idempotency`) |
| OIDC plumbing for crates/PyPI/npm | built-in, `/guide/auth.html` |
| `tools/syncVersion.ts` + `tools/buildLibPlatforms.ts` / `tools/buildPlatforms.ts` synthesizing per-triple npm sub-packages and pinning `optionalDependencies` | `build = "napi"` / `build = "bundled-cli"` (`/guide/npm-platform-packages.html`) — nearly exactly what dirsql wrote by hand |
| tag + GitHub Release creation | per-package `{name}-v{version}` tag |
| `release-scripts.yml` (CI for the deleted scripts) | obsolete |
| `publish.yml` rollback job | piot deliberately doesn't do this; relies on pre-publish completeness check |

If adoption worked, the work-done inventory would delete the three Python scripts + `release-scripts.yml` + the tag/OIDC plumbing in `publish.yml` + `syncVersion.ts` + `buildLibPlatforms.ts` + `buildPlatforms.ts` and replace them with a `putitoutthere.toml` plus the scaffolded `release.yml` from `putitoutthere init`.

### The three concrete blockers

**1. The worked example for dirsql's exact shape is a 404.** Getting Started links to `Polyglot Rust library (Rust crate + PyO3 wheel + napi npm) — the dirsql shape` pointing at `/guide/handoffs/polyglot-rust`. The Guide sidebar shows the same link labeled `Polyglot Rust library (dirsql shape)`. Both return `Error code: 404 - File not found.` This is *the* page that would answer every open integration question below. Until it exists, adoption means reverse-engineering piot's assumptions from four other pages — which defeats the "day of work" point.

**2. piot explicitly doesn't support dirsql's npm shape.** From `/guide/npm-platform-packages.html` → *Constraints worth knowing*:

> Shipping cli + napi in the same top-level package is not supported. Each `[[package]]` picks one build mode. If you need a published package that bundles both a CLI binary and a napi addon under one name, declare them as two packages and consume one from the other.

But `packages/ts/tools/syncVersion.ts:3-5` merges both families into one `dirsql` top-level. Adopting piot as-specified forces a user-visible split: either `npm install dirsql` stops shipping the CLI (breaking for CLI consumers), or you invert to `npm install dirsql-cli`. This is either a piot feature gap (mixed-family top-level) or a dirsql API break. Pick one — but it has to be picked, and it should be documented on the missing polyglot-rust page.

**3. Single-shared-tag → per-package-tag migration is not a one-line change.** piot's tag scheme is `{name}-v{version}`, and the cargo-dist `release.yml` triggers on `**[0-9]+.[0-9]+.[0-9]+*` (matches any). That glob still accepts `dirsql-rust-v1.2.3`, but `dist-workspace.toml` + cargo-dist's semantics will need a sanity check, and `publish-npm.yml`'s `on: workflow_run: [release.yml]` dependency assumes one tag per release. With per-package tags the Rust tag fires cargo-dist while the npm tag fires… nothing unless rewired. Not hard, but also not free.

### Softer issues worth flagging

**Trigger model drift.** dirsql is cron + `workflow_dispatch`-driven; piot is merge-commit + `release:`-trailer driven. Config has `cadence = "scheduled"` (configuration.html) and `init --cadence scheduled` exists, but piot's docs are clear the trailer is the happy path (Getting Started: *"piot is not a cron-driven release orchestrator at the tool level (though you can run it from a cron workflow)"*). There's no documented pattern for "cron job computes bump type then hands off to piot" — you'd have to invent the glue.

**cargo-dist coexistence is asserted but not demonstrated.** Concepts page says *"compose with them, don't replace them with piot"* — good. But dirsql's `publish-npm.yml` specifically downloads cargo-dist release archives to extract the CLI binary for the bundled-cli npm family. Under piot, that handoff becomes the workflow's responsibility. The only place this would be shown is — again — the missing `polyglot-rust.html` page.

**Python wheel that bundles a Rust CLI binary isn't named as a piot shape.** piot's `build = "maturin"` is described as "sdist + wheel from an existing manifest." dirsql's wheels additionally stage a Rust CLI into `packages/python/python/dirsql/_binary/` before `maturin build` runs. This should Just Work because it's the workflow's job to stage artifacts before the publish step — but it's worth a sentence confirming that wheel-ships-a-CLI is a supported variant, again on the missing page.

### What needs to change for dirsql to adopt piot

Minimum viable blockers to clear (in priority order):

1. **Write `/guide/handoffs/polyglot-rust.html`.** It's the linchpin. It must cover: (a) config for `dirsql-rust` (crates) + `dirsql-py` (pypi/maturin) + `dirsql-cli` (npm/bundled-cli) + `dirsql-napi` (npm/napi) with `depends_on` wiring; (b) how the workflow stages a CLI binary into the wheel before `maturin build`; (c) how cargo-dist runs alongside piot (or replaces the tarball part); (d) the tag-per-package migration story from a single-shared-version repo.
2. **Decide on mixed cli+napi top-level.** Either implement it (lift the constraint in `npm-platform-packages.html`) or document the supported migration: rename, split, redirect. Without this dirsql can't adopt without breaking consumers.
3. **Document the cron → piot handoff.** Show a worked `cadence = "scheduled"` workflow that picks a bump type (per-package or global) without a merge-commit trailer, since cron has no merge commit. Even if the answer is "run `putitoutthere plan --bump minor`," that CLI flag isn't listed in `/api/cli.html` — either add it or name the replacement pattern.

If all three land, dirsql's adoption is roughly: write `putitoutthere.toml`, run `putitoutthere init`, delete the three Python scripts + `release-scripts.yml` + `syncVersion.ts` + the two `buildPlatforms` tools, and keep cargo-dist + the workflow's build matrix. That's a ~500-line net deletion.

Until (1) is fixed, none of this is safely actionable — you'd be guessing, which is the cost you built piot to eliminate.
