#!/usr/bin/env bash
# V01-2: a script whose entry guard is import.meta.url===`file://${process.argv[1]}` does nothing and
# exits 0 when its path is not its own file URL (a symlinked checkout, a space in a folder name).
# Run from the repository root; it writes only under a temporary folder and removes it.
set -uo pipefail
root=$(pwd); work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
ln -s "$root" "$work/linked"; mkdir "$work/space dir"
cp scripts/check-collection-freshness.mjs cloudflare-deploy.json "$work/space dir/"
run(){ ( cd "$1" && env -u GH_TOKEN -u GITHUB_REPOSITORY node "$2" 2>&1; echo "exit=$?" ) | tail -2 | tr '\n' ' '; echo; }
echo "control, real path, no token (the check runs and fails): $(run "$root" scripts/check-collection-freshness.mjs)"
echo "symlinked checkout path: $(run "$work/linked" "$work/linked/scripts/check-collection-freshness.mjs")"
echo "folder name with a space: $(run "$work/space dir" check-collection-freshness.mjs)"
echo "scripts with this guard: $(grep -l 'import.meta.url===`file://${process.argv\[1\]}`' scripts/*.mjs | tr '\n' ' ')"
