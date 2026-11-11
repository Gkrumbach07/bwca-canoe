#!/bin/bash
# every regression rig in turn (loop-r4 join; r4-final: the round 4 rigs added, r2-starter and r4-roads given an hour): a line each, its exit code and its last summary line
# (run under ~/pw/bwca-run.sh, which sets APP and RELAY)
cd "$(dirname "$0")/.."
RIGS="${RIGS:-gl-a-test gl-b-test gl-c-test gl-d-test gl-e-test gl-join-test glf-f1-store-ui-test glf-f2-trip-tasks-test glf-f3-names-keepers-test gl-ground-lint r2-tickets-test r2-pma-test r2-starter-test r2-join-test r2-wizard-test r2-markers-test r2-ep-check r2-npc-motion-test r2-npc2-test r3-replay-test r3-replay-play r3-start-test r3-guide-test r3-join-test r3-journal-test r3-locator-test r3-final-test r3-final-play edge-test e3-roads-test loop-tasks-test coop/game-loop coop/give coop/adventure coop/parties coop/r2-replay loop-r4-test r4-loopfix-test r4-roads-test r5-roads-test round4-test r4-body-test r4-tut-test r4-cabins-test r4-final-test r5-mapkit-test r5-fixes-test r5-final-test r4-doorstep-check}"
mkdir -p rig-logs
for r in $RIGS; do
  f="rig-logs/$(echo $r | tr / _).log"
  t=1500; [ "$r" = r2-starter-test ] && t=3600; [ "$r" = r4-roads-test ] && t=3600; [ "$r" = r5-roads-test ] && t=3600
  timeout $t node scripts/$r.mjs > "$f" 2>&1; c=$?
  s=$(grep -E "[0-9]+/[0-9]+ (passed|checks)|passed|broken|FAIL" "$f" | tail -1 | cut -c1-200)
  fl=$(grep -E "^\S+ +FAIL|  FAIL" "$f" | cut -c1-160 | head -4 | tr '\n' '|')
  echo "RIG $r exit=$c :: $s :: $fl"
done
