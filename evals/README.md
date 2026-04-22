# Agent-behavior evals

Spike harness for testing how external agents perceive `putitoutthere`'s
docs and code. See issue #164 for motivation.

## Running

```sh
./evals/spike.sh [fixture] [scope]
```

Defaults: `dirsql-scope webfetch`.

Requires the `claude` CLI on `$PATH` and Anthropic API access. Isolated
fixtures additionally require `git` (they clone a consumer repo).

## Fixture shapes

Two shapes exist, inferred from the presence of `setup.sh` in the
fixture dir.

### Isolated fixtures — faithful reproduction

**`dirsql-isolated`** — probe runs inside a fresh clone of
`thekevinscott/dirsql` with default Claude Code tools (Read / Grep /
Glob / Bash / WebSearch / WebFetch). Piot is strictly off-disk; the
agent must reach it through the public web, exactly like the session
that motivated this eval.

The `scope` arg is ignored for isolated fixtures — the invariant is
"no tool restrictions" to match the original session.

**This is the shape that reproduces (or fails to reproduce) the
failure mode #164 is tracking.** Scored primitives live in
`expected.json`; the prompt replays the session's turn that first
asked "what do you think of this scope of work?" plus the follow-up
that reframes the question as "what blocks dirsql from adopting piot?"

### Scope fixtures — docs-regression harness

| Fixture                 | Prompt shape                                                                                   |
|-------------------------|------------------------------------------------------------------------------------------------|
| `dirsql-scope`          | Leading: names specific pain points in the prompt itself. Evaluator-framing, no filesystem.    |
| `dirsql-scope-blinder`  | Structural only: no pain points pre-specified. Evaluator-framing, no filesystem.               |

Scope arg picks tool access:

| Scope        | Allowed tools         |
|--------------|-----------------------|
| `webfetch`   | WebSearch + WebFetch  |
| `websearch`  | WebSearch only        |

These fixtures test "how does the piot docs site hold up to external
evaluation?" — a related but different question from the isolated
shape. Kept because they catch a different class of regression.

## What the harness does

1. **Setup** (isolated fixtures only) — runs `setup.sh` to populate the
   probe's working directory (e.g. `git clone dirsql`).
2. **Probe** — invokes `claude -p` (Opus 4.7) with the fixture's
   `prompt.md` as a single-turn input. Captures prose output to
   `snapshots/<variant>-<ts>-raw.md`.
3. **Extract** — a Haiku call reads the prose and emits a structured
   JSON claim per primitive. Saved to `snapshots/<variant>-<ts>-extracted.json`.
4. **Grade** — compares extracted claims to
   `fixtures/<name>/expected.json`. Exits non-zero on any mismatch.
   Saved to `snapshots/<variant>-<ts>-grade.json`.

Variant name is `<fixture>` for isolated shapes, `<fixture>__<scope>`
for scope shapes.

## Fixture layout

```
fixtures/<name>/
  prompt.md       # single-turn task given to the probe
  expected.json   # ground truth: what each primitive actually is
  setup.sh        # (optional) populates the probe's working dir;
                  #           presence marks the fixture as "isolated"
```

## Known limitations

- **Single-turn, not multi-turn.** The motivating dirsql session was 8
  turns of evolving context. Even the isolated fixture condenses the
  opening and pivot turns into one prompt. Faithful multi-turn replay
  is future work.
- **Clone is a moving target.** `dirsql-isolated` clones `main` at run
  time, so the exact source the agent sees drifts as dirsql evolves.
  For stable grading, pin a SHA in `setup.sh` when cutover matters.
- **Extractor is itself an LLM.** Treat a single run as a sample, not
  a verdict. Repeat 3× before concluding.

See #164 for the roadmap beyond this spike.
