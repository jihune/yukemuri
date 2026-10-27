#!/usr/bin/env bash
# Deploy (or with --dry-run, only check) the built Worker with the crawl key as
# its secret. The key goes from CRAWL_ACCESS_KEY into a 0600 temporary file for
# wrangler's --secrets-file and is removed when this script exits; it never
# reaches arguments or output. A dry run uses a placeholder, never the key.
# Wrangler is the locked one (node_modules, 4.92.0) with an explicit --config;
# WRANGLER_JS replaces it only in check-deploy-config.mjs. A request to the
# Cloudflare API can fail once and pass on the next try (10-23 and 10-25:
# assets-upload-session, code 10013, which failed the snapshot deploy and ended
# the C06 chain), so such a failure deploys once more after
# WRANGLER_RETRY_SECONDS (30); any other failure ends the script at once.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
dry_run=()
if [[ "${1:-}" == "--dry-run" ]]; then dry_run=(--dry-run); fi
umask 077
secrets="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/worker-secrets.XXXXXX")"
log="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/worker-deploy.XXXXXX")"
trap 'rm -f "$secrets" "$log"' EXIT
if (( ${#dry_run[@]} )); then
  printf '{"CRAWL_ACCESS_KEY":"preflight-placeholder-not-a-key"}' > "$secrets"
else
  node -e 'const k=process.env.CRAWL_ACCESS_KEY;if(!k){console.error("CRAWL_ACCESS_KEY is required");process.exit(1)}process.stdout.write(JSON.stringify({CRAWL_ACCESS_KEY:k}))' > "$secrets"
fi
deploy=(node "${WRANGLER_JS:-node_modules/wrangler/bin/wrangler.js}" deploy "${dry_run[@]}" --config dist/server/wrangler.json --secrets-file "$secrets")
if ! "${deploy[@]}" 2>&1 | tee "$log"; then
  grep -q 'A request to the Cloudflare API' "$log" || exit 1
  echo "A Cloudflare API request failed; deploying once more in ${WRANGLER_RETRY_SECONDS:-30} s."
  sleep "${WRANGLER_RETRY_SECONDS:-30}"
  "${deploy[@]}" 2>&1 | tee "$log"
fi
version=$(grep -oE 'Current Version ID: [0-9a-f-]+' "$log" | head -1 | cut -d' ' -f4 || true)
if (( ${#dry_run[@]} )); then
  echo "Dry run passed: built Worker and secrets file accepted, nothing uploaded."
else
  echo "Deployed Worker version: \`${version:-not found in wrangler output}\` from ${GITHUB_SHA:-local}"
fi
