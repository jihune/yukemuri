// Prepare the catalogue through the deployed Worker's maintenance path, as the
// collector does before a run: POST /api/crawl-prepare until it reports done.
// deploy.yml runs it only when the search snapshot found the catalogue
// unprepared for this release (a changed seed; public reads no longer seed, P03).
// Prints statuses only; the key comes from YUKEMURI_CRAWL_ACCESS_KEY.
// Usage: node scripts/cloudflare-prepare.mjs <public workers.dev origin>
import assert from 'node:assert/strict';
const origin=process.argv[2],key=process.env.YUKEMURI_CRAWL_ACCESS_KEY;
assert.match(origin??'',/^https:\/\/yukemuri\.[a-z0-9-]+\.workers\.dev$/,'Expected the public workers.dev origin');
assert(key,'YUKEMURI_CRAWL_ACCESS_KEY is required');
for(let attempt=1;;attempt++){
 const response=await fetch(origin+'/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':key,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(120_000)});
 const body=/json/.test(response.headers.get('Content-Type')??'')?await response.json():null;
 console.log(`crawl-prepare ${attempt}: HTTP ${response.status}${body&&typeof body.done==='boolean'?' done='+body.done:''}`);
 // 503 is a retryable step failure; anything else but 200 is not.
 if(response.status!==200&&response.status!==503)throw new Error('crawl-prepare failed: HTTP '+response.status);
 if(body?.done===true)break;
 if(attempt>=20)throw new Error('crawl-prepare did not finish in 20 calls');
 await new Promise(r=>setTimeout(r,3000));
}
