# `dist-action/` is no longer tracked on main

## What changed

- `dist-action/` is gitignored on `main`. The previous checked-in ncc
  bundle (441KB `dist-action/index.js`) is gone.
- The CI bundle gate (`.github/workflows/bundle.yml`, the
  "`dist-action/` is up to date" check) is deleted.
- `release-npm.yml` now builds the bundle at release time and folds it
  into a release-only commit *before* `putitoutthere publish` runs.
  `publish` captures HEAD and places the per-package tag
  (`putitoutthere-v<x.y.z>`) on that commit. The floating `v<major>`
  tag is then moved onto the same commit, so scaffolded consumer
  workflows that do `uses: thekevinscott/put-it-out-there@v1` resolve
  to a ref whose tree contains `dist-action/index.js`.
- The bundle commit is never pushed to main. It exists only as the
  target of the tag refs; `git branch --contains <tag>` returns empty.

## Why (consumer-facing)

The action's surface for consumers is unchanged:

| Consumer ref | Works? |
|---|---|
| `@v1` (floating major) | yes — points at the bundle commit |
| `@putitoutthere-v1.2.3` | yes |
| `@<sha-of-a-release-commit>` | yes (SHA-pin hardening pattern) |
| `@main` | no — no bundle exists there |
| `@<sha-of-any-main-commit>` | no |
| `@my-feature-branch` (contributor fork) | no unless the contributor rebuilds + commits locally |

The 95% case (`@v1` or SHA-pinned release) is transparent. Degradation
is concentrated on "reference something unreleased," which is a small
population and has clean mitigations (pre-release tags, fast release
cadence).

## Why (maintainer-facing)

- No merge conflicts on `dist-action/index.js`. Every PR previously
  needed `pnpm run build:action` and a rebuilt-bundle commit; two
  PRs touching `src/` inevitably collided.
- No "bundle out of date" CI gate blocking PRs. The audit at
  `notes/audits/2026-04-20-canary-e2e-audit.md` item #7 called this
  out as cycle-time friction; that friction is now gone.
- `Skip-Gates:` trailer remains for the `require-tests` gate; the
  bundle half of the bypass is retired.

## Internals

The mechanism hinges on `src/publish.ts:141` capturing
`head = headCommit({ cwd })` when `publish` starts, and
`src/publish.ts:180` tagging that SHA. Under the new flow:

1. `release-npm.yml` `publish` job checks out main at the merge SHA.
2. `pnpm run build:action` writes `dist-action/` into the gitignored
   directory.
3. A new step runs `git add -f dist-action/ && git commit`. Commit
   parent is the main merge commit; the commit itself is off-main.
4. `node dist/cli.js publish` runs. `headCommit()` returns the
   new bundle commit. `createTag` + `pushTag` publish the tag pointing
   at that commit; git implicitly pushes the commit object.
5. `Move floating major tag` step moves `v<major>` onto the same
   commit.

## Departures from prior model

- Previously, per `src/publish.ts` header comment (§13.6), tags
  pointed at the main merge commit. Now tags point at a commit that
  is a direct descendant of the main merge commit but never itself
  on main.
- `src/publish.ts:13-14` docstring ("tag points at the merge commit;
  no bump commit is pushed to main") is now slightly stale: still no
  bump commit is pushed to main, but the tag points at a one-commit
  descendant of the merge, not the merge itself. Not updated in-tree
  to avoid churn in code that doesn't need functional changes; revisit
  if the comment starts causing confusion.

## Verification checklist (next release)

- [ ] Trigger `release-npm.yml` (push or workflow_dispatch).
- [ ] Confirm `putitoutthere-v<x.y.z>` tag exists and points at a
      commit whose tree contains `dist-action/index.js`.
- [ ] Confirm `v<major>` floating tag points at the same commit.
- [ ] Confirm main's HEAD tree has no `dist-action/` directory.
- [ ] Smoke: invoke `uses: thekevinscott/put-it-out-there@v<major>`
      from a throwaway workflow and verify the action starts.
- [ ] `git branch --contains v<major>` returns empty (the bundle
      commit is not on any branch).

## Related

- Branch: `claude/remove-build-artifacts-7sZXs`.
- Prior discussion surfaced three alternatives (a dedicated release
  branch, a post-merge rebuild bot, a composite-wrapping-npx action);
  user rejected all three. Research round explored ~8 options and
  settled on tag-only because it composes cleanly with the existing
  `release-npm.yml` + floating-major-tag infrastructure.
- Audit that motivated it: `notes/audits/2026-04-20-canary-e2e-audit.md`
  items #1, #7.
