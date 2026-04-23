# Docs-eval methodology

A pattern for measuring — and then improving — how well an external
AI agent can evaluate your library from its published docs alone. The
problem it solves: library consumers increasingly delegate integration
research to agents, and if the docs don't carry enough signal the
agents fabricate gaps. This pattern makes that signal measurable and
gives you a tight edit-and-test loop for closing it.

Developed for [`putitoutthere`](https://github.com/thekevinscott/put-it-out-there)
(#164). Intended to be reusable for any library.

## The phases

1. **Define what you want agents to conclude.** Pick a handful of
   features + gaps that a well-informed agent should get right about
   your library, and write down the correct answer for each with a
   pointer to the source-of-truth in your code.
2. **Build a harness that reproduces a representative agent's
   environment.** Same tool surface, same docs surface, same
   filesystem access — nothing more. Run a probe against the harness,
   have a second (smaller) model extract structured claims from the
   probe's prose, grade claims against ground truth.
3. **Run it until you have a reproducible red baseline**, preserve the
   baseline snapshots as a reference to diff against, then iterate on
   docs.
4. **Iterate.** Edit docs → re-run → read the probe's reasoning, not
   just the score → repeat. Ship when the score is stable green
   across multiple runs.

## What you need before starting

- The library's **published docs site** (hosted or serveable locally).
- A **characterising session** where an agent got things wrong. This
  tells you which primitives to grade and which phrasings to expect.
  In our case it was a real dirsql-integration session that reported
  several "missing" features that actually shipped.
- A way to run a probing agent **inside your own infrastructure** so
  you can control the environment. Anthropic's Managed Agents SDK,
  `claude -p`, OpenAI assistants, etc. The pattern is model-agnostic.
- A different model for extraction (smaller is fine; we use Sonnet
  for the probe and Sonnet for extraction — Haiku was too noisy).

## Ground truth: `expected.json`

Pick 4–10 primitives. For each: `truth` (`shipped` | `missing`),
`evidence` (file:line cite into your source), and `failure_mode_if_wrong`
(why getting this wrong matters). Keep it tight — you grade the
probe against these exact claims, and the more primitives you list
the more extractor noise you inherit.

```json
{
  "description": "Ground truth for <fixture>. Derived from code audit on <sha>.",
  "primitives": {
    "npm_platform_family": {
      "truth": "shipped",
      "evidence": "src/handlers/npm-platform.ts synthesizes per-platform packages; config: build = 'napi' | 'bundled-cli' + targets = [...]",
      "failure_mode_if_claimed_missing": "false-negative — agent proposes adding a primitive that exists"
    },
    "per_target_runner_override": {
      "truth": "missing",
      "evidence": "src/plan.ts:224-236 hardcodes triple → runner mapping; no config syntax",
      "failure_mode_if_claimed_shipped": "false-positive — agent claims support that doesn't exist"
    }
  }
}
```

Rules of thumb:

- **Mix shipped and missing.** Pure-shipped leads the grader into
  treating silence as failure; pure-missing leads the agent into
  uncritical "nothing works here." Aim for ~50/50.
- **Pick primitives the session actually got wrong.** You're not
  testing general doc quality, you're testing the specific failure
  modes you already saw.
- **One primitive = one claim**, not a cluster. "npm platform family"
  is one; "npm platform family with combined CLI + napi in one
  top-level package" is two and you'll want the extractor to
  distinguish them.

## Environment fidelity: isolate your library; replicate the consumer's tools

The invariant: **the probe sees your library only through the
surfaces an external agent would see.** Everything else matches the
consumer's environment as closely as possible. Both halves matter.

Isolation (what the probe must *not* reach):

- Your library's source tree on disk. Either don't mount it in the
  probe's container at all, or mask it with a user+mount namespace
  (`unshare --user --mount --map-root-user`, then
  `mount -t tmpfs tmpfs /path/to/your/lib`).
- Your library's internal GitHub refs (issues, PRs, internal docs).
- Private registry URLs if applicable.

Replication (what the probe *should* have):

- A consumer repo clone in the working dir (e.g. a real library that
  would plausibly integrate yours).
- The same tool surface the consumer's agent would have. For Claude
  Code consumers: Read / Grep / Glob / Bash / WebFetch / WebSearch.
  Don't over-restrict — if the session-we-are-reproducing had Bash,
  the probe needs Bash.
- Your published docs, reachable the way they'd be reachable for a
  real consumer. This is the hard part. See next section.

## Serving docs to the probe

`web_fetch` in most managed-agent environments runs **server-side**
and has a domain allow-list the probe can't alter. Neither
`localhost` nor arbitrary public URLs are guaranteed reachable. You
generally have three options:

| Approach | Pros | Cons |
|---|---|---|
| WebFetch against your deployed docs | Highest fidelity | Only works if your domain is allow-listed (rare) |
| Tunnel localhost to a public domain (ngrok / cloudflared) | Works from anywhere | Requires install + egress; may violate sandbox |
| Local browser (Vercel's `agent-browser` + Chromium) driving a local HTTP server | Works anywhere; full vitepress/Docusaurus/MkDocs render | More moving parts |

We landed on the third. Concretely:

1. `vitepress build` (or your docs toolkit's equivalent) → static HTML
   in `dist/`.
2. Serve `dist/` via `python3 -m http.server` on a random port, with
   a `put-it-out-there/`-style base-path subdir if your docs use one.
3. Give the probe `Bash(agent-browser:*)` and tell it the URL. The
   probe uses `agent-browser open / snapshot -i / click / close` to
   navigate.

**Avoid dev servers with HMR.** `vitepress dev` crashes mid-probe
under concurrent-chromium memory pressure roughly 1/3 of the time.
Static build + static serve is dramatically more reliable.

## The probe → extract → grade pipeline

Three process stages. Each is a single model call.

1. **Probe.** Opus-class model, the consumer repo as cwd, the
   probe prompt, and the tools described above. Open-ended task; the
   probe investigates the consumer and the library's docs, writes
   prose. 2–5 minutes per run. ~$3–5 per run.

2. **Extract.** Sonnet-class model, no tools, reads the probe's prose
   and emits a flat JSON object mapping each primitive to one of
   `shipped` / `missing` / `not_mentioned`. Use a smaller model than
   the probe, but not too small: Haiku drops semantically clear
   mentions (it failed to flag runner selection as "missing" even
   when the probe explicitly said "runner selection stays in the
   consumer's workflow"). Sonnet + few-shot phrasing examples worked.
   ~$0.10–0.30 per run.

3. **Grade.** Diff extraction against `expected.json`. Exit code 0
   if every primitive matches, non-zero otherwise. Print a per-primitive
   table so you can see what regressed or improved.

### Extractor prompt: what we learned

- Give the extractor **explicit phrasing examples** of what counts as
  each verdict. "piot doesn't support X" is easy; "X stays in the
  consumer's workflow" is semantically equivalent but extractors miss
  it without prompting.
- **Warn the extractor against conflation.** "Library has feature X"
  and "library's feature X fits my specific shape" are different
  claims. Without an explicit instruction to distinguish, the
  extractor flattens them.
- **Primitive-by-primitive definition.** Don't expect the extractor
  to infer from the primitive name. Define each one the way you
  defined it in `expected.json`, with the failure mode called out.

## Operating the baseline

- Run the harness **3× before drawing any conclusion.** Probe
  navigation is nondeterministic; a single 6/6 can be followed by
  a 3/6 that's mostly extractor noise.
- **Commit the red-baseline snapshot trio.** Force-add the raw /
  extracted / grade triples into your repo for the first stable red
  run. Diff against them later to see what a docs change actually
  changed.
- **Read the probe's reasoning, not just the score.** The probe is
  very specific about which doc page it relied on for each conclusion;
  that's your single best signal for which page has to change.

## Iterating on docs

Three edit patterns we found consistently move the score:

1. **"Does your library fit?" checklist on getting-started.** Lets
   the probe quickly locate your library's shape relative to the
   consumer's. Explicit yes-to-this / no-to-this criteria with links
   to supporting pages outperform a generic feature tour.

2. **Scope sections that name non-goals.** A "what this library does
   *not* do" block — delegated to tool X, owned by the consumer's
   workflow — lets the probe correctly conclude "missing"  on
   primitives that are intentionally absent. Without this, the probe
   either misses the primitive entirely or guesses wrong about
   whether absence is a gap or a non-goal.

3. **Handoff guides per library shape.** For each common consumer
   shape (e.g. "polyglot Rust library with a PyO3 wheel and a napi-rs
   npm package"), write a dedicated page that walks through: what
   you cover, what the consumer owns, the config that lands, the
   gotchas. The probe hits these first when the consumer matches.

Anti-patterns to avoid:

- **Describing config values without describing behavior.** The probe
  reads `build = "bundled-cli"` as a string unless you say what
  happens when that value is set.
- **Scattering scope information across many pages.** Put the "what
  this tool does / doesn't do" up front — concepts page or
  getting-started — where every navigation path hits it.
- **Silent non-support.** If your tool deliberately doesn't do X, say
  so. Don't let the probe have to infer it from absence.

## What "green" means

6/6 (or whatever your total is) across **≥3 consecutive runs**. A
single clean run is luck. If the variance is high, the extractor is
the problem, not the docs — tighten the extractor prompt, or use a
bigger extractor model, before more doc edits.

Also: score is a proxy. A 6/6 agent that doesn't navigate the page
you edited isn't evidence your edit worked. Cross-reference the
probe's prose against the edit — if the primitive flipped green
without the page being mentioned, your change was inert.

## Cost envelope

Per run, end-to-end (probe + extract + grade): ~$3–5. A full
iteration (3 runs to establish a trend) is ~$10–15. A red baseline +
full green confirmation is ~$30.

Scale: trivially cheap compared to a day-of-engineering-time spent
arguing about docs quality with no measurement.

## Known limits

- **Single-turn.** Real integration sessions are multi-turn with
  context accumulation that produces its own failure modes (early
  loose claims become late asserted facts). This harness is a
  single-turn probe; reproducing multi-turn dynamics is an open
  problem.
- **Model-specific.** A probe run with Opus is not a probe run with
  GPT-5 or Gemini. If your library's primary consumers use a
  different model family, run the probe against that family too.
  Differing results imply docs are adequate for some models but not
  others.
- **Extractor noise floor.** Even with a good extractor and phrasing
  examples, expect ~10–15% run-to-run variance on individual
  primitives. Live with it or add more runs.
- **Environment fidelity isn't perfect.** Our agent-browser probe
  sees the docs via a real browser, which is close to but not
  identical to a foreign agent fetching via `WebFetch`. Content is
  the same; navigation cost and rendering edge cases differ.

## Repeatable recipe

Rough step-by-step for applying this to another library:

1. Find a session where a foreign agent got something wrong about
   your library. List the specific wrong claims.
2. Translate each wrong claim into a primitive with `truth`,
   `evidence`, `failure_mode_if_wrong`. Save as
   `evals/fixtures/<consumer>-isolated/expected.json`.
3. Write a short `prompt.md` from the consumer's perspective (*not*
   "evaluate my library" — "should I use my-library for this
   integration?"). Use `{{DOCS_URL}}` as a placeholder.
4. Write `setup.sh` that clones the consumer repo into a target dir.
5. Copy our `spike.sh` and adjust: repo root path, docs build
   command, base path, primitives list in the extractor prompt.
6. Install Chromium (`storage.googleapis.com/chromium-browser-snapshots/…`
   is allow-listed in Managed Agents; `googlechromelabs.github.io`
   is not), point `AGENT_BROWSER_EXECUTABLE_PATH` at it.
7. Run 3×. If all three are red on the same primitives, you have a
   baseline. Commit the snapshots.
8. Iterate docs. Aim for green across ≥3 consecutive runs before
   calling any primitive fixed.

## Files we ended up with (for reference)

- `evals/spike.sh` — the full pipeline.
- `evals/fixtures/<name>/expected.json` — ground truth.
- `evals/fixtures/<name>/prompt.md` — single-turn probe prompt.
- `evals/fixtures/<name>/setup.sh` — stages the consumer repo.
- `evals/fixtures/<name>/docs_server` — marker file; presence opts a
  fixture into the docs-server pipeline.
- `evals/snapshots/` — gitignored run outputs; the red-baseline
  trio is force-added as the reference.
- `evals/README.md` — user-facing doc for the harness.
- `notes/handoff/YYYY-MM-DD-eval-harness-red-baseline.md` — per-run
  handoff for the next agent picking up iteration.

## Prior art

- Anthropic's public writeups on agent evaluations focus on task
  completion rather than docs comprehension; this pattern is
  orthogonal to those benchmarks.
- Docs-site analytics (scroll depth, search queries) tell you what
  *humans* hit; they don't tell you what an agent misreads.
- `doctor` / preflight commands validate your library's state, not
  your library's docs — complementary, not a substitute.
