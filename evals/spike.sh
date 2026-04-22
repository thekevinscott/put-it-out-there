#!/usr/bin/env bash
# Agent-behavior eval spike.
#
# Runs a single-turn probe against a fixture and grades the output
# against its expected.json.
#
# Two fixture shapes exist:
#
#   1. "scope" fixtures (dirsql-scope, dirsql-scope-blinder) — probe
#      runs in a scratch dir with only web tools. Uses the `scope` arg
#      (`webfetch` | `websearch`) to vary tool access. This is a
#      docs-regression harness, not a reproduction of the motivating
#      session's failure mode. Kept for coverage.
#
#   2. "isolated" fixtures (dirsql-isolated, …) — probe runs in a
#      cloned copy of the target consumer repo (e.g. dirsql) with
#      piot's `docs/` markdown tree copied in alongside as
#      `./piot-docs/`. Path-scoped Read/Grep/Glob and a strict
#      permissions file keep the probe from reaching piot's source
#      on the host — the probe's only view of piot is what its
#      published docs say. `settings.local.json` in the workdir
#      denies Bash entirely (to close `cat /abs/path` escapes) and
#      denies reads under `/home` / `/root` / `/etc`.
#      (VitePress served over localhost was considered and dropped
#      because Claude Code's WebFetch refuses `http://localhost`
#      URLs as invalid.)
#
# Which shape a fixture uses is inferred from the presence of
# `fixtures/<name>/setup.sh`; the docs-copy opt-in is inferred from
# `fixtures/<name>/docs_server` (retained name, now triggers a docs
# tree copy rather than a live server).
#
# Usage:
#   ./evals/spike.sh [fixture] [scope]
#   ./evals/spike.sh dirsql-isolated
#   ./evals/spike.sh dirsql-scope-blinder websearch
#
# Requires: `claude` CLI on $PATH; Anthropic API access; `git` for
# isolated fixtures that clone a consumer repo; `pnpm` + docs deps
# installed (`pnpm install --dir docs`) for docs-server fixtures.
# Not wired into CI yet; see issue #164.

set -euo pipefail

FIXTURE="${1:-dirsql-scope}"
SCOPE="${2:-webfetch}"
EVAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$EVAL_ROOT/.." && pwd)"
FIXTURE_DIR="$EVAL_ROOT/fixtures/$FIXTURE"
SNAP_DIR="$EVAL_ROOT/snapshots"
TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

mkdir -p "$SNAP_DIR"

if [[ ! -f "$FIXTURE_DIR/prompt.md" ]]; then
  echo "ERROR: fixture '$FIXTURE' not found at $FIXTURE_DIR/prompt.md" >&2
  exit 1
fi
if [[ ! -f "$FIXTURE_DIR/expected.json" ]]; then
  echo "ERROR: fixture '$FIXTURE' missing expected.json at $FIXTURE_DIR/expected.json" >&2
  exit 1
fi

# Shape is inferred from setup.sh; docs-server opt-in from docs_server marker.
SHAPE="scope"
DOCS_SERVER="no"
if [[ -x "$FIXTURE_DIR/setup.sh" ]]; then
  SHAPE="isolated"
  VARIANT="$FIXTURE"
  if [[ -f "$FIXTURE_DIR/docs_server" ]]; then
    DOCS_SERVER="yes"
  fi
else
  VARIANT="${FIXTURE}__${SCOPE}"
  case "$SCOPE" in
    webfetch)   ALLOWED_TOOLS="WebSearch WebFetch" ;;
    websearch)  ALLOWED_TOOLS="WebSearch" ;;
    *)
      echo "ERROR: unknown scope '$SCOPE'. Expected: webfetch | websearch" >&2
      exit 1
      ;;
  esac
fi

RAW="$SNAP_DIR/${VARIANT}-${TS}-raw.md"
EXTRACT="$SNAP_DIR/${VARIANT}-${TS}-extracted.json"
GRADE="$SNAP_DIR/${VARIANT}-${TS}-grade.json"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Substitute {{DOCS_PATH}} in prompt if the fixture opted into docs copy.
PROMPT_TEXT="$(cat "$FIXTURE_DIR/prompt.md")"
DOCS_PATH=""
if [[ "$DOCS_SERVER" == "yes" ]]; then
  DOCS_PATH="./piot-docs"
  PROMPT_TEXT="${PROMPT_TEXT//\{\{DOCS_PATH\}\}/$DOCS_PATH}"
fi

if [[ "$SHAPE" == "isolated" ]]; then
  echo "==> setup: running $FIXTURE_DIR/setup.sh $WORK"
  "$FIXTURE_DIR/setup.sh" "$WORK"
  if [[ "$DOCS_SERVER" == "yes" ]]; then
    echo "==> docs: copying piot's docs/ into $WORK/piot-docs (a run-time snapshot)"
    cp -r "$REPO_ROOT/docs" "$WORK/piot-docs"
    # Strip the local node_modules and build output; the agent should
    # see markdown sources only, not rendered HTML or vendored deps.
    rm -rf "$WORK/piot-docs/node_modules" "$WORK/piot-docs/.vitepress/dist" \
           "$WORK/piot-docs/.vitepress/cache" 2>/dev/null || true
  fi
  cd "$WORK"
  if [[ "$DOCS_SERVER" == "yes" ]]; then
    # Lock the probe: reads/grep/glob allowed anywhere except /home, /root,
    # /etc (hides piot's canonical source tree on the host); WebFetch and
    # WebSearch denied (agent must use the docs copied into ./piot-docs/);
    # Bash denied entirely (closes `cat /abs/path`, `git --git-dir=…`
    # escapes). The agent's only view of piot is the docs snapshot in
    # ./piot-docs/.
    mkdir -p "$WORK/.claude"
    cat > "$WORK/.claude/settings.local.json" <<'EOF'
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "Glob"
    ],
    "deny": [
      "Read(/home/**)",
      "Read(/root/**)",
      "Read(/etc/**)",
      "Grep(/home/**)",
      "Grep(/root/**)",
      "Grep(/etc/**)",
      "Glob(/home/**)",
      "Glob(/root/**)",
      "Glob(/etc/**)",
      "Bash",
      "WebFetch",
      "WebSearch"
    ]
  }
}
EOF
    echo "==> probe: variant=$VARIANT (Opus 4.7, scoped reads, no Bash/web, docs → ./piot-docs/)"
    # HOME=$WORK isolates the probe from the host's ~/.claude (notably a
    # global Stop hook that otherwise fires in the probe's context and
    # derails the eval with git-status prompts). Probe reads only the
    # settings.local.json we wrote above.
    HOME="$WORK" claude -p \
      --model claude-opus-4-7 \
      --max-budget-usd 3 \
      --output-format text \
      "$PROMPT_TEXT" \
      > "$RAW"
  else
    echo "==> probe: variant=$VARIANT (Opus 4.7, unrestricted tools, cwd=$WORK)"
    claude -p \
      --model claude-opus-4-7 \
      --max-budget-usd 3 \
      --output-format text \
      "$PROMPT_TEXT" \
      > "$RAW"
  fi
else
  echo "==> probe: variant=$VARIANT (Opus 4.7, tools: $ALLOWED_TOOLS)"
  cd "$WORK"
  claude -p \
    --model claude-opus-4-7 \
    --tools "$(echo "$ALLOWED_TOOLS" | tr ' ' ',')" \
    --allowed-tools "$ALLOWED_TOOLS" \
    --max-budget-usd 3 \
    --output-format text \
    "$PROMPT_TEXT" \
    > "$RAW"
fi

echo "    raw output: $RAW ($(wc -l < "$RAW") lines)"

# Probe failed to produce real output — typically an API rate-limit or
# permission denial. Bail before burning the extractor on garbage.
if ! [[ -s "$RAW" ]] || [[ "$(wc -c < "$RAW")" -lt 200 ]]; then
  echo "ERROR: probe output is empty or suspiciously short. Contents:" >&2
  cat "$RAW" >&2
  exit 2
fi

echo "==> extract: Haiku reads the prose and emits structured claims"
EXTRACTION_PROMPT=$(cat <<'EOF'
You are an extractor. Read the evaluation below and determine, for each
primitive, whether the evaluator CLAIMS it is shipped, missing, or does
not mention it.

Output a single JSON object on its own line, no markdown, no prose:

{
  "npm_platform_family":               "shipped" | "missing" | "not_mentioned",
  "depends_on_serialization":          "shipped" | "missing" | "not_mentioned",
  "idempotent_precheck":               "shipped" | "missing" | "not_mentioned",
  "bundled_cli_understood":            "shipped" | "missing" | "not_mentioned",
  "per_target_runner_override":        "shipped" | "missing" | "not_mentioned",
  "doctor_oidc_trust_policy_check":    "shipped" | "missing" | "not_mentioned"
}

Rules:
- "shipped" means the evaluator concludes piot already has it.
- "missing" means the evaluator concludes piot lacks it or recommends
  adding it.
- "not_mentioned" means the evaluator does not address this primitive.
- If the evaluator hedges ("worth verifying", "unclear"), treat as
  "not_mentioned" unless the overall conclusion is clear.
- Match by meaning, not keyword. For "bundled_cli_understood": does the
  evaluator demonstrate understanding of what bundled-cli does, or
  merely note the name exists?

Evaluation follows.
===
EOF
)

# Extractor also needs HOME isolation — otherwise the host's global Stop
# hook fires (cwd is $WORK, which has an uncommitted dirsql clone + the
# piot-docs copy), and Haiku returns a reply to the hook instead of the
# JSON object we asked for.
HOME="$WORK" claude -p \
  --model claude-haiku-4-5-20251001 \
  --tools "" \
  --max-budget-usd 1 \
  --output-format text \
  "$EXTRACTION_PROMPT

$(cat "$RAW")" \
  > "$EXTRACT.raw"

# The model sometimes wraps JSON in fences; strip them.
python3 -c "
import json, re, sys
raw = open('$EXTRACT.raw').read()
m = re.search(r'\{[^{}]*\}', raw, re.DOTALL)
if not m:
    print('ERROR: no JSON object found in extractor output', file=sys.stderr)
    print(raw, file=sys.stderr)
    sys.exit(1)
obj = json.loads(m.group(0))
open('$EXTRACT', 'w').write(json.dumps(obj, indent=2) + '\n')
print('    extracted: $EXTRACT')
print(json.dumps(obj, indent=2))
"

echo "==> grade: compare extracted vs. expected"
python3 -c "
import json, sys
extracted = json.load(open('$EXTRACT'))
expected = json.load(open('$FIXTURE_DIR/expected.json'))['primitives']

results = {}
fails = []
for key, spec in expected.items():
    truth = spec['truth']
    claim = extracted.get(key, 'not_mentioned')
    ok = (claim == truth)
    results[key] = {'truth': truth, 'claim': claim, 'pass': ok}
    if not ok:
        fails.append(key)

grade = {
    'fixture': '$FIXTURE',
    'shape': '$SHAPE',
    'scope': '$SCOPE',
    'variant': '$VARIANT',
    'timestamp': '$TS',
    'model': 'claude-opus-4-7',
    'docs_server': '$DOCS_SERVER',
    'docs_path': '$DOCS_PATH',
    'pass': len(fails) == 0,
    'score': f'{len(expected) - len(fails)}/{len(expected)}',
    'results': results,
    'fails': fails,
}
open('$GRADE', 'w').write(json.dumps(grade, indent=2) + '\n')
print(json.dumps(grade, indent=2))
sys.exit(0 if grade['pass'] else 1)
"
