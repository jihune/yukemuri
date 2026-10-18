// collection-budget.mjs without an account: pages from today's usage, the
// fallback when usage cannot be read, and the skip when the day is used up.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BUDGET,budgetToday,pagesFor} from './collection-budget.mjs';

// The measured costs (2026-10-17) and the share of each free limit.
assert.deepEqual({...BUDGET},{maxPages:120,fallbackPages:16,share:0.85,writesPerPage:151,readsPerPage:3000,snapshotReads:330000});

// A fresh day: the cap. Nothing recorded yet counts as zero (an authorised query with no rows).
assert.equal(pagesFor({rowsRead:0,rowsWritten:0}).pages,120);
assert.equal(pagesFor({rowsRead:null,rowsWritten:null}).pages,120);
// Writes decide: 85,000 - 80,000 = 5,000 rows -> 33 pages.
assert.equal(pagesFor({rowsRead:0,rowsWritten:80_000}).pages,33);
// 2026-10-17 23:31Z: 90 a page allowed 79 pages, which wrote 10,224 rows and ended the day at 88.1%.
// 7,172 rows left -> 47 pages.
assert.equal(pagesFor({rowsRead:3_170_016,rowsWritten:77_828}).pages,47);
// Whatever today's usage, a run's pages stay within 85% at the costliest per-page costs measured on
// 2026-10-17: 150.4 rows written, 2,981 read, and a snapshot after the run (none at 0 pages) of
// 257,099 rows plus two days of that day's growth (2 x 33,760).
for(let written=0;written<=85_000;written++){
 const {pages}=pagesFor({rowsRead:0,rowsWritten:written});
 assert.ok(written+pages*150.4<=85_000,'writes '+written);
}
for(let read=0;read<=4_250_000;read++){
 const {pages}=pagesFor({rowsRead:read,rowsWritten:0});
 assert.ok(pages===0||read+pages*2981+257_099+2*33_760<=4_250_000,'reads '+read);
}
// Reads decide: 4,250,000 - 3,800,000 - 330,000 = 120,000 rows -> 40 pages.
assert.equal(pagesFor({rowsRead:3_800_000,rowsWritten:0}).pages,40);
// 2026-10-13 05:36Z (87,579 written): over 85% of the writes, so the run skips.
assert.equal(pagesFor({rowsRead:1_647_393,rowsWritten:87_579}).pages,0);
assert.equal(pagesFor({rowsRead:4_200_000,rowsWritten:0}).pages,0);
// Unreadable usage: the pre-C03 run size, never the cap.
for(const bad of [null,undefined,{rowsRead:'x',rowsWritten:0},{rowsRead:0,rowsWritten:-1},{rowsRead:NaN,rowsWritten:0}])
 assert.equal(pagesFor(bad).pages,16,JSON.stringify(bad));

// budgetToday through cloudflare-usage.mjs queryDay with a stand-in GraphQL endpoint.
const folder=mkdtempSync(join(tmpdir(),'collection-budget-')),config=join(folder,'cloudflare-deploy.json');
writeFileSync(config,JSON.stringify({workerName:'yukemuri',databaseId:'0123abcd-4567-89ab-cdef-0123456789ab'}));
const env={CLOUDFLARE_API_TOKEN:'test-only-token',CLOUDFLARE_ACCOUNT_ID:'0123456789abcdef0123456789abcdef'};
const account=(read,written)=>({total:[],byStatus:[],d1:[],accountWorkers:[],accountD1:read===null?[]:[{sum:{rowsRead:read,rowsWritten:written}}]});
const answer=(status,body)=>{const calls=[];return {calls,fetch:async(url,init)=>{calls.push(JSON.parse(init.body).variables);return new Response(JSON.stringify(body),{status})}}};
const now=new Date('2026-10-14T00:30:00Z');
try{
 let api=answer(200,{data:{viewer:{accounts:[account(200_000,10_000)]}}});
 let result=await budgetToday({fetch:api.fetch,env,config,now});
 assert.equal(result.pages,120);assert.match(result.reason,/today 10000 rows written, 200000 read/);
 assert.equal(api.calls[0].date,'2026-10-14','today in UTC');
 api=answer(200,{data:{viewer:{accounts:[account(0,84_000)]}}});
 assert.equal((await budgetToday({fetch:api.fetch,env,config,now})).pages,6);
 api=answer(200,{data:{viewer:{accounts:[account(null,null)]}}});
 assert.equal((await budgetToday({fetch:api.fetch,env,config,now})).pages,120,'no rows yet today');
 // Permission errors, server errors, an account the token cannot see, no token: fallback, never a throw.
 for(const [status,body] of [[403,{errors:[{message:'not authorized'}]}],[500,{}],[200,{data:{viewer:{accounts:[]}}}]]){
  api=answer(status,body);
  assert.equal((await budgetToday({fetch:api.fetch,env,config,now})).pages,16,String(status));
 }
 api=answer(200,{data:{viewer:{accounts:[account(0,0)]}}});
 assert.equal((await budgetToday({fetch:api.fetch,env:{},config,now})).pages,16,'no token');
 assert.equal(api.calls.length,0,'no request without a token');
 assert.equal((await budgetToday({fetch:async()=>{throw new TypeError('network')},env,config,now})).pages,16,'network error');
 assert.equal((await budgetToday({fetch:api.fetch,env,config:join(folder,'missing.json'),now})).pages,16,'no config');
}finally{rmSync(folder,{recursive:true,force:true})}
console.log('Collection budget passed: 120 pages on a fresh day, fewer as writes or reads near 85% of the free limits (snapshot reads reserved), 0 when used up, 16 when usage cannot be read.');
