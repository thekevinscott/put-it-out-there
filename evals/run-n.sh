#!/usr/bin/env bash
# Run the spike eval N times in sequence, print a score table.
#
# Usage:
#   ./evals/run-n.sh [fixture] [n]
#
# Defaults: dirsql-isolated 5.
#
# Sequential (not parallel) because agent-browser shares a daemon and
# the docs server binds a fixed port per run. Budget: each run is
# ~$5-8; N=5 runs about $25-40.

set -uo pipefail

FIXTURE="${1:-dirsql-isolated}"
N="${2:-5}"
EVAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
LOG_PREFIX="/tmp/evals-${FIXTURE}-${TS}"

declare -a SCORES
declare -a FAILS_ROWS

for i in $(seq 1 "$N"); do
  echo "=== run $i/$N ==="
  logfile="${LOG_PREFIX}-run${i}.log"
  "$EVAL_ROOT/spike.sh" "$FIXTURE" > "$logfile" 2>&1
  score=$(grep '"score"' "$logfile" | head -1 | grep -oE '[0-9]+/[0-9]+' || echo '?/?')
  fails=$(grep -A 20 '"fails"' "$logfile" | grep -oE '"[a-z_]+"' | tr '\n' ',' | sed 's/"//g; s/,$//')
  SCORES+=("$score")
  FAILS_ROWS+=("run $i: $score | fails: ${fails:-none}")
  echo "  → $score"
done

echo
echo "=== summary ($FIXTURE × $N runs) ==="
for row in "${FAILS_ROWS[@]}"; do echo "$row"; done
echo
echo "Snapshots: $(ls -1 /home/user/put-it-out-there/evals/snapshots/${FIXTURE}-*.md 2>/dev/null | tail -"$N")"
