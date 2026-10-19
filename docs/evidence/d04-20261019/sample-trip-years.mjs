// D04 follow-up: a small public sample of Trip.com records on the production site (docs/D04-20261015.md 8).
// Only public GETs: the static snapshot and /api/hotel-comparison (4 ids a request), one request every
// 3 s, so at most 20 a minute against the detail limit of 30 per IP per 60 s (H02). Requests go
// through real Chromium (HeadlessChrome), which the site's automated-agent rule allows. No key.
// Usage: node docs/evidence/d04-20261019/sample-trip-years.mjs [origin] [out.json]
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(new URL('../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [origin='https://yukemuri.jihune.workers.dev',out]=process.argv.slice(2);
const SIZE=100,SEED=20261019,D04_RELEASE='2026-10-15T02:14:00Z';
// mulberry32: a seeded draw, so the same snapshot gives the same sample.
let state=SEED;const rand=()=>{state=state+0x6D2B79F5|0;let t=Math.imul(state^state>>>15,1|state);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 // A static file gives the page the site's origin without a Worker request.
 await page.goto(origin+'/snapshot/manifest.json');
 const get=path=>page.evaluate(async path=>{const r=await fetch(path,{cache:'no-store'});return{status:r.status,body:await r.json()}},path);
 const manifest=(await get('/snapshot/manifest.json')).body,core=(await get(manifest.files.core)).body,status=(await get(manifest.files.status)).body;
 const trip=core.ids.filter(id=>id.startsWith('trip-')),pool=[...trip];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 const sample=pool.slice(0,SIZE).sort(),rows=[],requests=[];
 for(let i=0;i<sample.length;i+=4){
  if(i)await page.waitForTimeout(3000);
  const ids=sample.slice(i,i+4),at=new Date().toISOString(),r=await get('/api/hotel-comparison?ids='+ids.join(','));
  requests.push({at,status:r.status,ids});
  if(r.status!==200)throw new Error(`comparison ${r.status}: ${JSON.stringify(r.body)}`);
  for(const h of r.body.hotels){
   const own=h.sources.find(s=>s.sourceId===h.id);
   rows.push({id:h.id,detail:!!own?.label.includes('상세'),retrievedAt:own?.retrievedAt??null,afterRelease:!!own&&own.retrievedAt>=D04_RELEASE,facilityYears:h.facilityYears??null});
  }
  for(const id of r.body.missingIds)rows.push({id,missing:true});
 }
 const detail=rows.filter(r=>r.detail),parsed=detail.filter(r=>r.afterRelease);
 const summary={sampled:rows.length,missing:rows.filter(r=>r.missing).length,detail:detail.length,parsedByD04:parsed.length,withYears:parsed.filter(r=>r.facilityYears).length,
  opened:parsed.filter(r=>r.facilityYears?.opened!==undefined).length,renovated:parsed.filter(r=>r.facilityYears?.renovated!==undefined).length,
  yearsBeforeRelease:detail.filter(r=>!r.afterRelease&&r.facilityYears).length,yearsFromOtherSource:rows.filter(r=>r.facilityYears&&r.facilityYears.sourceId!==r.id).length};
 const result={measuredAt:new Date().toISOString(),origin,userAgent:await page.evaluate(()=>navigator.userAgent),snapshot:{id:manifest.id,generatedAt:manifest.generatedAt,tripRecords:trip.length,fill:status.fill.scopes.trip.rows.years,detail:status.fill.scopes.trip.rows.detail,pages:status.fill.pages.trip},
  sample:{size:SIZE,seed:SEED,d04Release:D04_RELEASE},summary,requests,rows};
 console.log(JSON.stringify({summary,snapshot:result.snapshot},null,1));
 if(out)writeFileSync(out,JSON.stringify(result,null,1)+'\n',{encoding:'utf8'});
}finally{await browser.close()}
