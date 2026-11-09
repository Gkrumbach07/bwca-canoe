#!/bin/bash
# every regression rig in turn (loop-r4 join): a line each, its exit code and its last summary line
# (run under ~/pw/bwca-run.sh, which sets APP and RELAY)
cd "$(dirname "$0")/.."
RIGS="${RIGS:-gl-a-test gl-b-test gl-c-test gl-d-test gl-e-test gl-join-test glf-f1-store-ui-test glf-f2-trip-tasks-test glf-f3-names-keepers-test gl-ground-lint r2-tickets-test r2-pma-test r2-starter-test r2-join-test r2-wizard-test r2-markers-test r2-ep-check r2-npc-motion-test r2-npc2-test r3-replay-test r3-replay-play r3-start-test r3-guide-test r3-join-test r3-journal-test r3-locator-test r3-final-test r3-final-play edge-test e3-roads-test loop-tasks-test coop/game-loop coop/give coop/adventure coop/parties coop/r2-replay}"
mkdir -p rig-logs
for r in $RIGS; do
  f="rig-logs/$(echo $r | tr / _).log"
  timeout 1500 node scripts/$r.mjs > "$f" 2>&1; c=$?
  s=$(grep -E "[0-9]+/[0-9]+ (passed|checks)|passed|broken|FAIL" "$f" | tail -1 | cut -c1-200)
  fl=$(grep -E "^\S+ +FAIL|  FAIL" "$f" | cut -c1-160 | head -4 | tr '\n' '|')
  echo "RIG $r exit=$c :: $s :: $fl"
done
