# Agent-behavior evals

Spike harness for testing how external agents perceive `putitoutthere`'s
docs and code. See issue #164 for motivation.

## Running

```sh
./evals/spike.sh [fixture] [scope]
```

Defaults: `dirsql-scope webfetch`.

Requires the `claude` CLI on `$PATH` and Anthropic API access.

## Variants

Two axes vary independently. Compare scores across variants to separate
prompt-shape effects from tool-scope effects.

### Fixtures (prompt axis)

| Fixture                 | What's in the prompt                                                                           |
|-------------------------|------------------------------------------------------------------------------------------------|
| `dirsql-scope`          | Leading: names specific pain points (cross-compile runners, OIDC filename pinning, partial-failure semantics). Pre-specifies what to evaluate. |
| `dirsql-scope-blinder`  | Structural only: says dirsql is a Cargo workspace with three OIDC-published artifacts. Does not name specific pain points. Agent has to discover them. |

Both fixtures grade against the **same** `expected.json` — ground truth
about piot doesn't change based on how the probe was prompted.

### Scopes (tool axis)

| Scope        | Allowed tools         | Approximates                                                     |
|--------------|-----------------------|------------------------------------------------------------------|
| `webfetch`   | WebSearch + WebFetch  | Agent can read source code via `raw.githubusercontent.com`.      |
| `websearch`  | WebSearch only        | Docs-site snippets only. Closer to the original dirsql session.  |

## What the harness does

1. **Probe** — runs `claude -p` (Opus 4.7, allowed-tools restricted per
   scope, no local filesystem access) against the fixture's prompt.
   Captures prose output to `snapshots/<variant>-<ts>-raw.md`.
2. **Extract** — a Haiku call reads the prose and emits a structured
   JSON claim object per primitive. Saved to
   `snapshots/<variant>-<ts>-extracted.json`.
3. **Grade** — compares extracted claims to
   `fixtures/<fixture>/expected.json`. Exits non-zero on any mismatch.
   Saved to `snapshots/<variant>-<ts>-grade.json`.

`<variant>` is `<fixture>__<scope>`, e.g. `dirsql-scope-blinder__websearch`.

## Fixture shape

```
fixtures/<name>/
  prompt.md       # open-ended task given to the probe agent
  expected.json   # ground truth: what each primitive actually is
```

## Known limitations of the spike

- **Single-turn, not multi-turn.** The motivating dirsql session was
  8 turns of evolving context. The spike condenses into one prompt.
  Faithful multi-turn replay is future work.
- **Grader model is an evaluator itself.** The Haiku extraction step
  uses an LLM to map prose → structured claims. Treat a single run as a
  sample, not a verdict; repeat 3× before concluding.
- **Variants are not yet run as a matrix.** The harness runs one variant
  per invocation. A driver that runs the full matrix and reports a
  scoreboard is the obvious next step.

See #164 for the roadmap beyond this spike.
