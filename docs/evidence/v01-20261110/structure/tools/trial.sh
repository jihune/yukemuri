#!/usr/bin/env bash
# Delete one bundle of files in the repository COPY, run the type check and the
# quick shared check, then restore the files from git. One line per bundle goes
# to <log dir>/trial-summary.txt; the verdict is computed here, not read off logs.
# Usage: trial.sh <repo copy> <log dir> <bundle name> <file>...
set -uo pipefail
repo="$1"; logs="$2"; name="$3"; shift 3
cd "$repo" || exit 2
case "$repo" in */scratchpad/v01/structure/repo) ;; *) echo "refusing to run outside the scratch copy" >&2; exit 2 ;; esac
if [ -n "$(git status --porcelain)" ]; then echo "$name: copy not clean before the trial" >> "$logs/trial-summary.txt"; exit 2; fi
missing=0
for f in "$@"; do [ -e "$f" ] || { echo "$name: no such file $f" >> "$logs/trial-summary.txt"; missing=1; }; done
[ "$missing" = 0 ] || exit 2
rm -rf -- "$@"
deleted=$(git status --porcelain | grep -c '^ D')
node node_modules/typescript/bin/tsc --noEmit > "$logs/trial-$name-tsc.log" 2>&1; tsc_rc=$?
python3 scripts/cloud-check.py > "$logs/trial-$name-quick.log" 2>&1; quick_rc=$?
last=$(grep '^Running: ' "$logs/trial-$name-quick.log" | tail -1)
git checkout HEAD -- "$@"
clean=$([ -z "$(git status --porcelain)" ] && echo clean || echo DIRTY)
verdict=FAIL; [ "$tsc_rc" = 0 ] && [ "$quick_rc" = 0 ] && verdict=PASS
echo "$name: $verdict files_deleted=$deleted tsc_exit=$tsc_rc quick_check_exit=$quick_rc restored=$clean last_step=[$last]" >> "$logs/trial-summary.txt"
