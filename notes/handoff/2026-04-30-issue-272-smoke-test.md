# Issue 272 — nested reusable workflow smoke test

## Why this exists

Issue 272 proposes extracting the build matrix from `release.yml` into
`_matrix.yml`, then having both `release.yml` and a new `build.yml` call
into it. That introduces a *nested* reusable workflow — a `workflow_call`
workflow invoking another `workflow_call` workflow.

Two community sources disagree on whether `uses: ./.github/workflows/_matrix.yml`
resolves correctly inside a nested reusable workflow
([community#66094](https://github.com/orgs/community/discussions/66094) vs
[community#31054](https://github.com/orgs/community/discussions/31054)),
and the documentation is silent. Separately,
[community#48693](https://github.com/orgs/community/discussions/48693)
documents that nested reusable workflows fail to resolve when pinned to
*annotated* git tags.

The issue 272 design comment
([#272 issue comment](https://github.com/thekevinscott/putitoutthere/issues/272#issuecomment-4355509383))
recommends:

1. Use the **explicit ref form** (`thekevinscott/putitoutthere/.github/workflows/_matrix.yml@v0`)
   inside `release.yml`, not `./`.
2. Pin to the **lightweight `v0` tag** (already how `release-npm.yml:152`
   creates it), not a per-release annotated tag.

Both behaviors need a real GitHub Actions run to validate before merging
the refactor. This brief is the runbook for that run.

## Setup

You need two repos:

- A **fork of `thekevinscott/putitoutthere`** with the fixture workflows
  below committed and tagged `v0` (force-moved over today's tag for the
  test).
- A **separate consumer repo** that pins the fork's `release.yml@v0`.

Use a throwaway GitHub account or a sandbox org if you want to avoid
mutating the production `v0` tag during the test.

## Fixture: inner workflow (`_matrix.yml`)

Drop this at `.github/workflows/_matrix.yml` in the fork. Single
`workflow_call` interface, single echo step, one declared output to
exercise output propagation:

```yaml
name: smoke matrix
on:
  workflow_call:
    outputs:
      has_pypi:
        description: smoke value
        value: ${{ jobs.smoke.outputs.has_pypi }}

jobs:
  smoke:
    runs-on: ubuntu-latest
    outputs:
      has_pypi: ${{ steps.set.outputs.has_pypi }}
    steps:
      - id: set
        run: |
          echo "hello from _matrix.yml"
          echo "has_pypi=true" >> "$GITHUB_OUTPUT"
```

## Fixture: outer workflow (`release.yml`)

Replace the fork's `release.yml` with this minimal shell. The only thing
under test is the `uses:` resolution — everything else is stripped:

```yaml
name: smoke release
on:
  workflow_call:
    outputs:
      has_pypi:
        value: ${{ jobs.build.outputs.has_pypi }}

jobs:
  build:
    uses: thekevinscott/putitoutthere/.github/workflows/_matrix.yml@v0
    # Replace with your fork's owner/name. Must use the explicit form
    # (not `uses: ./...`) — that asymmetry is the whole point of the test.

  confirm:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "build.has_pypi=${{ needs.build.outputs.has_pypi }}"
          test "${{ needs.build.outputs.has_pypi }}" = "true"
```

## Fixture: consumer workflow

In the separate consumer repo, at `.github/workflows/release.yml`:

```yaml
name: smoke consumer
on:
  workflow_dispatch:

jobs:
  release:
    uses: <fork-owner>/putitoutthere/.github/workflows/release.yml@v0
    permissions:
      contents: read
```

## Tag the fork

In the fork, after committing the two fixture workflows:

```sh
git tag -f v0           # lightweight, matches release-npm.yml:152
git push -f origin v0
```

Lightweight is load-bearing here — community#48693's failure mode
reproduces with `git tag -a v0 -m '...'`, so if you want to *also*
confirm the annotated-tag bug still exists in 2026, run the test twice
(once lightweight, once annotated) and expect the annotated run to fail
at job-graph resolution.

## Run

In the consumer repo, trigger via the Actions tab → "smoke consumer" →
Run workflow.

## Pass criteria

1. The `build` job in the fork's `release.yml` runs (proves the
   nested `uses:` resolves).
2. The `confirm` job sees `build.has_pypi=true` and exits 0 (proves
   the output propagates through both reusable-workflow boundaries).
3. The whole run is green.

## Fail modes to recognize

- **Job-graph error before any job runs**, message mentioning
  `_matrix.yml` not found: nested resolution is broken at `@v0`. Try a
  full SHA pin to confirm — if SHA works and tag doesn't, you've hit the
  annotated-tag bug. If neither works, the explicit-ref form is also
  broken and the design needs revisiting.
- **`build` runs but `confirm` fails the equality check**: output
  propagation is broken across one of the boundaries. Inspect raw
  values; `workflow_call` outputs are always strings, so a literal
  `"true"` mismatch usually points at a typo, not GHA semantics.
- **Permission error in `confirm`**: the consumer didn't grant enough,
  or the inner workflow tried to escalate. Both fixtures above are
  intentionally `contents: read` only — if you see a permissions
  failure here, it's a real finding worth a follow-up.

## Cleanup

Delete the fork (or reset its `v0` tag back to wherever it was) when
done. The consumer repo can be deleted outright.

## Outcome captured where

When the test runs, append the result (run URL + one-line verdict)
under "## Outcome" at the bottom of this file, then link to it from
the issue 272 comment thread.

## Outcome

_(Pending — fill in after running the test.)_
