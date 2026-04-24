# CI gates and the `Skip-Gates` escape hatch

One workflow enforces per-PR discipline that is correct in the common case but occasionally costly during tight-loop debugging:

- **`.github/workflows/tdd-lint.yml`** (`require-tests`) — every `src/` change must touch at least one `*.test.ts` file.

During a session that's debugging a cascading CI failure (each fix is two lines, each cycle is one round-trip), the gate roughly doubles the cycle time without catching real bugs. That's the motivation behind the escape hatch.

> **History:** a second `bundle.yml` gate used to require `pnpm run build:action` output to be committed alongside source changes. That gate and the checked-in `dist-action/` bundle were retired (see `notes/handoff/2026-04-24-dist-action.md`); the ncc bundle is now built and committed only onto release tag commits by `release-npm.yml`.

## How to bypass

Add a `Skip-Gates: <reason>` trailer to any commit in the PR:

```
fix(handler): guard against empty stderr in npm error dump

Skip-Gates: stderr-shape tweak; no behaviour change, unit tests still cover the happy path
```

If any commit between the PR's base SHA and head SHA has that trailer, the gate emits a `::notice::` with the reason and skips its work. The trailer is visible in the PR's commit list, so reviewers can push back if the bypass is unwarranted.

The check is literal: the line must start with `Skip-Gates:` and have at least one non-whitespace character after the colon. Anything less and the gates run as normal.

## When to use it

- **Good fit**: mechanical follow-up to a just-merged fix where the diff crosses into `src/` for a one-line refactor that's already covered at a different layer.
- **Bad fit**: anything that introduces new behaviour, changes error handling, or touches a handler's publish path. If you're reaching for `Skip-Gates:` because writing a test is annoying, the test is probably the cheapest thing you can do.

## After-the-fact audit

`git log --grep='^Skip-Gates:'` surfaces every historical use. If one pattern of bypass keeps recurring, the fix is usually to make the gate smarter (whitelist the pattern) rather than keep bypassing.

## Related

- Tracked under #120
- Audit that motivated it: `notes/audits/2026-04-20-canary-e2e-audit.md` item #7
