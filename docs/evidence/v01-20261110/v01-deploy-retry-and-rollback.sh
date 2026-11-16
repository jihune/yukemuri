#!/usr/bin/env bash
# V01-6 and V01-10, with a stand-in for wrangler (no Cloudflare call, no key). Run from the repository root.
#  A. scripts/cloudflare-deploy-worker.sh --dry-run: which failures deploy once more.
#  B. scripts/cloudflare-rollback.mjs ACTION=worker-rollback when only `d1 time-travel info` fails.
set -uo pipefail
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
cat > "$work/wrangler.js" <<'JS'
const fs=require('fs'),path=require('path');
const calls=path.join(process.env.FAKE_DIR,'calls');fs.appendFileSync(calls,process.argv.slice(2,5).join(' ')+'\n');
const n=fs.readFileSync(calls,'utf8').trim().split('\n').length,mode=process.env.FAKE_MODE,args=process.argv.slice(2).join(' ');
const api='✘ [ERROR] A request to the Cloudflare API (/accounts/0123456789abcdef0123456789abcdef/workers/scripts/yukemuri/assets-upload-session) failed.';
if(mode==='api-once'&&n===1){console.error(api);process.exit(1)}
if(mode==='connection'){console.error('✘ [ERROR] fetch failed');process.exit(1)}
if(mode==='d1-down'&&args.startsWith('d1 time-travel info')){console.error('✘ [ERROR] A request to the Cloudflare API (/accounts/0123456789abcdef0123456789abcdef/d1/database/x/time_travel/bookmark) failed.');process.exit(1)}
if(args.startsWith('d1 time-travel info')){console.log(JSON.stringify({bookmark:'00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683'}));process.exit(0)}
if(args.startsWith('deployments status')){const back=fs.readFileSync(calls,'utf8').includes('rollback --name');console.log(JSON.stringify({id:back?'d2':'d1',versions:[{version_id:(back?'2':'1').repeat(8)+'-1111-4111-8111-111111111111',percentage:100}]}));process.exit(0)}
console.log('Current Version ID: 11111111-1111-4111-8111-111111111111');
JS
echo "A. cloudflare-deploy-worker.sh --dry-run"
for mode in ok api-once connection; do
  rm -f "$work/calls"
  FAKE_DIR="$work" FAKE_MODE=$mode WRANGLER_JS="$work/wrangler.js" WRANGLER_RETRY_SECONDS=1 bash scripts/cloudflare-deploy-worker.sh --dry-run >/dev/null 2>&1
  echo "  mode=$mode exit=$? wrangler calls=$(wc -l < "$work/calls")"
done
echo "B. cloudflare-rollback.mjs ACTION=worker-rollback"
for mode in ok d1-down; do
  rm -f "$work/calls"
  out=$(FAKE_DIR="$work" FAKE_MODE=$mode YUKEMURI_WRANGLER="$work/wrangler.js" ACTION=worker-rollback CONFIRM=rollback node scripts/cloudflare-rollback.mjs 2>&1); code=$?
  echo "  mode=$mode exit=$code wrangler calls=$(wc -l < "$work/calls") ($(tr '\n' ';' < "$work/calls"))"
  echo "$out" | grep -E '실패' | head -1 | sed 's/^/    /'
done
