import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-prices-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/booking-query.ts','lib/jalan-prices.ts','--outDir',dir,'--module','commonjs','--target','es2020','--esModuleInterop','--skipLibCheck','--resolveJsonModule'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 const require=createRequire(join(dir,'test.cjs'));
 const {bookingError,datedLink,jalanPlanUrl,nights}=require(join(dir,'lib/booking-query.js'));
 const {parseJalanPrices}=require(join(dir,'lib/jalan-prices.js'));
 const quotes=[];
 for(const day of [10,14]){
  const query={checkIn:`2026-11-${day}`,checkOut:`2026-11-${day+1}`,adults:2};
  const raw=readFileSync(`scripts/crawler/fixtures/jalan-price-${day}.html`,'utf8');
  const source=jalanPlanUrl('https://www.jalan.net/yad364904/',query);
  const quote=parseJalanPrices(raw,'daiichi-takimotokan',source,query,'2026-10-03T16:00:00Z');quotes.push(quote);
  assert(quote.plans.length>0);
  assert(quote.plans.every(p=>p.taxIncluded&&p.currency==='JPY'&&p.total>0&&p.url.startsWith('https://www.jalan.net/uw/')));
  assert.equal(new Set(quote.plans.map(p=>p.id)).size,quote.plans.length);
  assert(quote.plans.every((p,i)=>!i||quote.plans[i-1].total<=p.total));
  assert(quote.plans.every(p=>!p.roomOnsen&&!p.roomOutdoor)); // communal 温泉 in plan headers cannot qualify a room
  assert.throws(()=>parseJalanPrices(raw,'daiichi-takimotokan',source,{...query,adults:3}));
  assert.throws(()=>parseJalanPrices(raw,'daiichi-takimotokan',source,{...query,checkOut:`2026-11-${day+2}`}));
  assert.throws(()=>parseJalanPrices(raw.replace(/value="0"/g,'value="1"'),'daiichi-takimotokan',source,query));
  assert.throws(()=>parseJalanPrices('<span>5000円</span>','daiichi-takimotokan',source,query));
  assert.equal(bookingError(query,'2026-10-04'),null);assert.equal(nights(query),1);
 }
 assert.equal(quotes[0].plans[0].total,34560);assert.equal(quotes[1].plans[0].total,56000);
 assert.notEqual(quotes[0].plans.length,quotes[1].plans.length);
 const multiQuery={checkIn:'2026-11-10',checkOut:'2026-11-12',adults:3};
 const multi=parseJalanPrices(readFileSync('scripts/crawler/fixtures/jalan-price-multi.html','utf8'),'daiichi-takimotokan',jalanPlanUrl('https://www.jalan.net/yad364904/',multiQuery),multiQuery);
 assert.equal(multi.observedPlans,84);assert.equal(multi.plans[0].total,87480);assert.equal(nights(multiQuery),2);
 const q=quotes[0].query;
 for(const bad of [{...q,checkIn:'2026-02-30'},{...q,checkOut:q.checkIn},{...q,adults:0},{...q,adults:2.5},{...q,checkOut:'2026-11-30'},{...q,checkIn:'2027-11-10',checkOut:'2027-11-11'}])assert(bookingError(bad,'2026-10-04'));
 const trip=new URL(datedLink({provider:'trip',url:'https://www.trip.com/hotels/noboribetsu-hotel-detail-842622/dai-ichi-takimotokan/',kind:'property',label:''},q));
 assert.equal(trip.searchParams.get('checkIn'),q.checkIn);assert.equal(trip.searchParams.get('adult'),'2');
 assert.throws(()=>jalanPlanUrl('https://example.invalid/yad364904/',q));
 console.log(`Price checks passed: actual dated totals ${quotes[0].plans[0].total}/${quotes[1].plans[0].total} JPY; condition matching, tax/occupancy totals, source links, date changes and communal/room bath isolation.`);
}finally{rmSync(dir,{recursive:true,force:true})}
