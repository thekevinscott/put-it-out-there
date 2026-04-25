# Remote environment

You are reading this because `CLAUDE_CODE_REMOTE=true` is set, meaning you
are running in a remote/managed-agent context — Claude Code on the web, a
cloud session, or the Claude Code GitHub Action. There is no live operator
watching this session, so the PR you produce is the only artefact a human
will see.

## The work loop

Every unit of work must:

1. **Start from a GitHub issue.** If no issue exists for the task, open one
   first. The issue is the durable record of *why* the work is happening —
   a PR alone is not enough, because squash-merge collapses the body into a
   commit message and the original framing is lost.
2. **Land as a PR that closes the issue.** Include a `Closes #<n>` line in
   the PR body so the issue auto-closes on merge. One issue, one PR.
3. **End with green CI and no merge conflicts.** Don't stop with failing
   required checks or a `behind`/`conflicting` mergeable state. Either
   resolve it or — if you genuinely can't — say so explicitly in the PR
   description and call out what would unblock it.

## Done checklist

Before declaring a task complete:

- [ ] A tracking issue exists.
- [ ] A PR targets the default branch.
- [ ] The PR body contains `Closes #<issue>` (or `Fixes #<issue>`).
- [ ] CI is green on the PR head commit.
- [ ] The PR's mergeable status is `mergeable` (no conflicts, no failing
      required checks).
- [ ] If any of the above is unsatisfied, the PR description explains why
      and what would unblock it.
