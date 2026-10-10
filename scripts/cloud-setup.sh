#!/usr/bin/env bash
# Cloud containers only: no production credentials or remote DB access.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node --input-type=module -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22 && b<13)) throw new Error("Node >=22.13 required; select Node 24 in the cloud environment")'
python3 -c 'import sys; assert sys.version_info >= (3,10), "Python >=3.10 required"'
python3 scripts/materialize-source-assets.py
node --input-type=module -e 'import {readExecutionProfile} from "./scripts/execution-profile.mjs"; if(readExecutionProfile()!=="portable") throw new Error("Cloud setup expects a clean portable clone; use the Sites managed setup in Work")'
if command -v pnpm >/dev/null; then
  pnpm_command=(pnpm)
elif command -v corepack >/dev/null; then
  pnpm_command=(corepack pnpm)
else
  pnpm_command=(npm exec --yes --package=pnpm@11.25.0 -- pnpm)
fi
version="$("${pnpm_command[@]}" --version)"
[[ "$version" == "11.25.0" ]] || { echo 'pnpm 11.25.0 required; retain packageManager and pnpm-lock.yaml.' >&2; exit 1; }
"${pnpm_command[@]}" install --frozen-lockfile
echo 'Cloud dependencies ready. Next: python3 scripts/cloud-check.py --full'
