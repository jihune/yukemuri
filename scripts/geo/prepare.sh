#!/usr/bin/env bash
# Prepares the offline geocoder for the snapshot build (deploy.yml, D06):
# a venv with the hash-pinned jageocoder, the dictionary zip (from actions/cache
# or downloaded) checked against scripts/geo/pins.json, then installed.
# Outputs (GITHUB_OUTPUT): db and python when ready; reason when not. deploy.yml
# runs this with continue-on-error, so a failure only leaves the snapshot
# without geocoded points.
# Usage: GEO_DIR=<work dir> bash scripts/geo/prepare.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
dir="${GEO_DIR:?GEO_DIR is required}"
output="${GITHUB_OUTPUT:-/dev/null}"
step='setup'
trap 'echo "reason=geocoder $step failed" >> "$output"; echo "Geocoder not prepared: $step failed; the snapshot is built without geocoded points." >&2' ERR
started=$SECONDS
mkdir -p "$dir"
step='venv'
python3 -m venv "$dir/venv"
step='pip install (hash-pinned)'
"$dir/venv/bin/pip" install --quiet --disable-pip-version-check --require-hashes --only-binary=:all: --no-deps -r scripts/geo/requirements.txt
file=$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["dictionary"]["file"])' scripts/geo/pins.json)
step='dictionary download or check'
"$dir/venv/bin/python" -I scripts/geo/dictionary.py fetch --zip "$dir/$file"
step='dictionary install'
"$dir/venv/bin/python" -I scripts/geo/dictionary.py install --zip "$dir/$file" --db-dir "$dir/db"
echo "db=$dir/db" >> "$output"
echo "python=$dir/venv/bin/python" >> "$output"
echo "Geocoder ready in $((SECONDS-started))s: jageocoder $("$dir/venv/bin/python" -I -c 'import jageocoder;print(jageocoder.__version__)'), $file"
