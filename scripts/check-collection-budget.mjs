// collection-budget.mjs without an account: pages from today's usage, the
// fallback when usage cannot be read, and the skip when the day is used up.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BUDGET,budgetToday,pagesFor} from './collection-budget.mjs';

// The measured costs (2026-10-18, after C04 and P04) and the share of each free limit.
assert.deepEqual({...BUDGET},{maxPages:120,fallbackPages:16,share:0.85,writesPerPage:180,readsPerPage:3600,snapshotReads:168000});

// A fresh day: the cap. Nothing recorded yet counts as zero (an authorised query with no rows).
assert.equal(pagesFor({rowsRead:0,rowsWritten:0}).pages,120);
assert.equal(pagesFor({rowsRead:null,rowsWritten:null}).pages,120);
// Writes decide: 85,000 - 80,000 = 5,000 rows -> 27 pages.
assert.equal(pagesFor({rowsRead:0,rowsWritten:80_000}).pages,27);
// 2026-10-17 23:31Z: 90 a page allowed 79 pages, which wrote 10,224 rows and ended the day at 88.1%.
// 7,172 rows left -> 39 pages.
assert.equal(pagesFor({rowsRead:3_170_016,rowsWritten:77_828}).pages,39);
// Whatever today's usage, a run's pages stay within 85% at the costliest per-page costs measured
// (2026-10-18): 179.5 rows written (a round of a Jalan detail and a new Jalan list page; runs wrote
// at most 56.0 a page), 2,981 read plus 525 for the D07 names scan of a one-page round, and a
// snapshot after the run (none at 0 pages) of 122,302 rows plus 10,000 for D07's names and two days
// of 10-17's hotel growth (2 x 3,051 x 5.73).
for(let written=0;written<=85_000;written++){
 const {pages}=pagesFor({rowsRead:0,rowsWritten:written});
 assert.ok(written+pages*179.5<=85_000,'writes '+written);
}
for(let read=0;read<=4_250_000;read++){
 const {pages}=pagesFor({rowsRead:read,rowsWritten:0});
 assert.ok(pages===0||read+pages*(2981+525)+122_302+10_000+2*3_051*5.73<=4_250_000,'reads '+read);
}
// Reads decide: 4,250,000 - 3,800,000 - 168,000 = 282,000 rows -> 78 pages.
assert.equal(pagesFor({rowsRead:3_800_000,rowsWritten:0}).pages,78);
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
 assert.equal((await budgetToday({fetch:api.fetch,env,config,now})).pages,5);
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
