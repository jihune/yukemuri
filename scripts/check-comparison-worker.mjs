// Comparison against the built Worker and disposable D1. No live provider calls.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-comparison-'));
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
let runtime;
try{
 const compiled=join(temp,'helpers');
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/hotel-comparison.ts','--outDir',compiled,'--module','commonjs','--target','es2020','--esModuleInterop','--skipLibCheck','--resolveJsonModule'],{encoding:'utf8'});
 assert.equal(compile.status,0,compile.stdout+compile.stderr);
 const helper=existsSync(join(compiled,'lib/hotel-comparison.js'))?join(compiled,'lib/hotel-comparison.js'):join(compiled,'hotel-comparison.js');
 const {storedComparisonIds,toggleComparisonId,comparisonFeatureLabel}=require(helper);
 for(const value of ['{broken','["one","one"]','["../private"]','["one","two","three","four","five"]','"one"',null])assert.deepEqual(storedComparisonIds(value),[],'Corrupt or unsupported saved selections reset safely');
 assert.deepEqual(storedComparisonIds('["trip-123","jalan-456"]'),['trip-123','jalan-456']);
 assert.equal(toggleComparisonId(['one','two','three','four'],'five'),null,'The fifth candidate is rejected');
 assert.deepEqual(toggleComparisonId(['one','two','three','four'],'two'),['one','three','four'],'Removal works even when full');
 assert.equal(comparisonFeatureLabel('roomOnsen',{value:null}),'확인 필요');
 assert.equal(comparisonFeatureLabel('roomOnsen',{value:false,scope:'someRooms'}),'없음');
 assert.equal(comparisonFeatureLabel('roomOnsen',{value:true,scope:'someRooms'}),'일부 객실');
 assert.equal(comparisonFeatureLabel('roomOnsen',{value:true,scope:'allRooms'}),'전 객실');
 assert.equal(comparisonFeatureLabel('roomOnsen',{value:true}),'있음 · 객실 타입 확인');
 const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(path=>path.endsWith('.js')&&path!=='index.js').map(path=>({type:'ESModule',path:resolve('dist/server',path)}))];
 runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'comparison-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'comparison-test-only'}});
 const db=await runtime.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())for(const sql of readFileSync(join('drizzle',file),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(value=>value.trim()).filter(Boolean))await db.prepare(sql).run();
 const api=async(path,expected=200,init={})=>{
  const response=await runtime.dispatchFetch('http://localhost'+path,init),body=await response.json();
  assert.equal(response.status,expected,JSON.stringify(body));
  if(path.startsWith('/api/hotel-comparison'))assert.equal(response.headers.get('Cache-Control'),'no-store');
  return body;
 };
 for(const query of ['', '?ids=', '?ids=one,two,three,four,five', '?ids=one,one', '?ids=..%2Fprivate', '?ids=one&ids=two', '?ids=one&token=private'])await api('/api/hotel-comparison'+query,400);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n,0,'Invalid requests are rejected before catalog initialization');
 // The collector's preparation fills the catalogue (no list request does since P03).
 await runtime.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':'comparison-test-only'}});
 const row=await db.prepare("SELECT * FROM hotels WHERE id='takinoya'").first(),columns=Object.keys(row);
 for(const id of ['qa-current','qa-stale']){
  const hotel=JSON.parse(row.payload);hotel.id=id;hotel.description='日本語の現在の説明 '+id;
  hotel.descriptionTranslation={text:'Stale embedded payload',translatedAt:'2020-01-01'};
  const fixture={...row,id,payload:JSON.stringify(hotel)};
  await db.prepare(`INSERT INTO hotels(${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...columns.map(key=>fixture[key])).run();
  await db.prepare('INSERT INTO hotel_description_translations(hotel_id,source_text,text_ko,translated_at) VALUES (?,?,?,?)').bind(id,id==='qa-current'?hotel.description:'Older source text','현재 원문에 대응하는 설명','2026-10-07T12:00:00Z').run();
 }
 const visitor='a'.repeat(64),headers={'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'comparison-test-only','X-Yukemuri-Visitor':visitor};
 await api('/api/favorites',200,{method:'PUT',headers,body:JSON.stringify({hotelId:'qa-current',saved:true})});
 await api('/api/hotel-lifecycle',200,{method:'PUT',headers,body:JSON.stringify({id:'qa-current',state:'temporarily_closed',sourceUrl:'https://official.example/closure',sourceKind:'official_property',sourceLabel:'QA official notice',evidence:'Whole property temporarily closed for renovation.',identityEvidence:'Exact hotel name and address verified.',checkedAt:new Date().toISOString(),effectiveDate:new Date().toISOString().slice(0,10),closedUntil:'2027-06-30'})});
 const tables=['crawl_jobs','hotel_description_requests','hotel_description_translations','visitor_favorites','hotel_source_groups','hotel_source_observations','hotel_lifecycle','hotels'];
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,JSON.stringify((await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results)])));
 const before=await snapshot();
 const ids=['qa-stale','takinoya','qa-current','jalan-327522'];
 const result=await api('/api/hotel-comparison?ids='+ids.join(','));
 assert.deepEqual(result.hotels.map(h=>h.id),ids,'Requested order is preserved');assert.deepEqual(result.missingIds,[]);assert(Number.isFinite(Date.parse(result.measuredAt)));
 assert.equal(result.hotels[0].descriptionTranslation,undefined,'A translation for an old source is omitted');
 assert.equal(result.hotels[2].descriptionTranslation.text,'현재 원문에 대응하는 설명');assert.equal(result.hotels[2].lifecycle.state,'temporarily_closed','Comparison retains closed candidates and official state');
 assert(!JSON.stringify(result).includes('comparison-test-only'));assert(!JSON.stringify(result).includes(visitor));
 const partial=await api('/api/hotel-comparison?ids=qa-missing,qa-current');assert.deepEqual(partial.missingIds,['qa-missing']);assert.deepEqual(partial.hotels.map(h=>h.id),['qa-current']);
 const empty=await api('/api/hotel-comparison?ids=qa-missing');assert.deepEqual(empty.hotels,[]);assert.deepEqual(empty.missingIds,['qa-missing']);
 assert.deepEqual(await snapshot(),before,'Comparison reads do not change saved evidence, claims, translation queues or favorites');
 // Individual detail intentionally prioritizes an untranslated description.
 // Check value parity only after the comparison's no-write assertion.
 for(const hotel of result.hotels)assert.deepEqual(hotel,await api('/api/hotels/'+hotel.id),'Bulk reads retain the individual detail contract');
 console.log('Comparison passed: storage recovery, four-item cap, room scope/unknown/absence, invalid request isolation, order, partial missing IDs, current translations, lifecycle, individual contract, privacy and unchanged D1.');
}finally{if(runtime)await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
