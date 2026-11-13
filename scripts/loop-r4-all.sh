#!/bin/bash
# every regression rig (loop-r4 join; r4-final: the round 4 rigs added; test-speed: run by scripts/rigs.mjs in parallel,
# JOBS=3 by default, the roads rigs in their --regress sample): a line each at the end, `RIG <name> exit=<c> :: <summary>
# :: <fails>`, in RIGS order, and a WALL line. RIGS="a b" runs those; JOBS=1 runs them one at a time in order (the old
# loop); FULL=1 the roads rigs' full sweeps; CHANGED=<ref> only the rigs that change touches. See scripts/rigs.mjs.
# (run under ~/pw/bwca-run.sh, which sets APP and RELAY)
cd "$(dirname "$0")/.."
exec node scripts/rigs.mjs "$@"
