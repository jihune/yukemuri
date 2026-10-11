// Public status against the built Worker and disposable D1: no live sources.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-status-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(path=>path.endsWith('.js')&&path!=='index.js').map(path=>({type:'ESModule',path:resolve('dist/server',path)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'status-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'private-maintenance-only',GOOGLE_PLACES_ENABLED:'true',GOOGLE_PLACES_API_KEY:'private-google-key-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())for(const sql of readFileSync(join('drizzle',file),'utf8').split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await db.prepare(sql).run();
 await runtime.dispatchFetch('http://localhost/api/hotels');
 const baseline=await(await runtime.dispatchFetch('http://localhost/api/collection-status')).json();
 const row=await db.prepare('SELECT * FROM hotels LIMIT 1').first(),columns=Object.keys(row);
 for(const [id,known,natural,room,detail] of [
  ['qa-grade-only',4096,null,null,false],['qa-explicit-false',1,0,null,true],
  ['qa-unverified',0,null,null,false],['qa-room-confirmed',17,1,1,true],
 ]){
  const hotel=JSON.parse(row.payload);hotel.id=id;hotel.sources=[{...hotel.sources[0],label:detail?'Jalan 숙소 상세':'Jalan 숙소 목록'}];
  const fixture={...row,id,bath_known:known,natural,room_onsen:room,payload:JSON.stringify(hotel)};
  await db.prepare(`INSERT INTO hotels(${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...columns.map(key=>fixture[key])).run();
 }
 await db.prepare('DELETE FROM crawl_jobs').run();
 const now=Date.now()/1000;
 const fixtures=[
  ['trip-old','trip','detail','done','2026-10-07T09:00:00+09:00',null,0],
  ['trip-current','trip','detail','done','2026-10-07T01:00:00Z',null,0],
  ['trip-foreign','trip','detail','skipped','2099-01-01T00:00:00Z','Explicit non-Japanese source country',now+90],
  ['trip-missing','trip','list','failed',null,'http_404',0],
  ['jalan-retry','jalan','detail','retry',null,'ValueError',0],
  ['jalan-redirect','jalan','detail','retry',null,'source_redirect_requires_review',0],
  ['jalan-robots-denied','jalan','detail','retry',null,'robots_disallowed',0],
  ['jalan-robots-offline','jalan','detail','retry',null,'robots_unavailable',0],
  ['jalan-robots-rate','jalan','detail','retry',null,'robots_http_429',0],
  ['jalan-robots-server','jalan','detail','retry',null,'robots_http_503',0],
  ['jalan-robots-format','jalan','detail','retry',null,'robots_response_requires_review',0],
  ['jalan-active','jalan','detail','pending',null,null,now+90],
  ['jalan-expired','jalan','detail','pending',null,'PRIVATE ERROR DETAIL https://example.invalid/?token=secret',now-10],
 ];
 for(const [url,provider,kind,status,fetchedAt,error,leaseUntil] of fixtures)await db.prepare('INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at,fetched_at,error,lease_token,lease_until) VALUES (?,?,?,?,0,0,?,?,?,?)').bind(url,provider,kind,status,fetchedAt,error,'private-claim-token',leaseUntil).run();
 await db.prepare("INSERT INTO catalog_meta(key,value) VALUES ('crawl-provider-ready:trip',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+3600)).run();
 await db.prepare("INSERT INTO catalog_meta(key,value) VALUES ('crawl-provider-ready:jalan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+3)).run();
 const before=JSON.stringify((await db.prepare('SELECT * FROM crawl_jobs ORDER BY url').all()).results);
 const response=await runtime.dispatchFetch('http://localhost/api/collection-status'),raw=await response.text(),status=JSON.parse(raw);
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(status.providers.length,2);assert.equal(status.google.connected,true);
 assert.deepEqual(status.quality,{
  records:baseline.quality.records+4,detailRecords:baseline.quality.detailRecords+2,
  bathKnownRecords:baseline.quality.bathKnownRecords+2,naturalOnsenRecords:baseline.quality.naturalOnsenRecords+1,roomOnsenRecords:baseline.quality.roomOnsenRecords+1,
 },'Grade-only and unknown records are not bath evidence; explicit absence is known; affirmative counts remain separate');
 const trip=status.providers.find(provider=>provider.provider==='trip'),jalan=status.providers.find(provider=>provider.provider==='jalan');
 assert.equal(trip.lastSuccessAt,'2026-10-07T01:00:00.000Z','Timestamps must be compared chronologically across offsets');
 assert.equal(trip.completedDetailPages,2);assert.equal(trip.activePages,0,'Skipped jobs are excluded');assert.equal(trip.failedPages,1);
 assert(Math.abs(Date.parse(trip.waitingUntil)/1000-(now+3600))<.001);assert.deepEqual(trip.issues,[{reason:'missing_page',count:1}]);
 assert.equal(jalan.lastSuccessAt,null);assert.equal(jalan.activePages,1,'Only live leases count');assert.equal(jalan.waitingUntil,null,'Ordinary pacing is not a suspension');assert.equal(jalan.pendingPages,2);assert.equal(jalan.retryPages,7);
 assert.deepEqual(jalan.issues,[{reason:'access_limited',count:2},{reason:'connection',count:2},{reason:'source_review',count:2},{reason:'other',count:1},{reason:'source_format',count:1}]);
 for(const privateValue of ['private-maintenance-only','private-google-key-only','private-claim-token','PRIVATE ERROR DETAIL','https://example.invalid','secret','trip-current','lease_token'])assert(!raw.includes(privateValue),'No queue identity or private data in public status');
 assert.equal(JSON.stringify((await db.prepare('SELECT * FROM crawl_jobs ORDER BY url').all()).results),before,'Reading status never modifies claims or queue records');
 const protectedResponse=await runtime.dispatchFetch('http://localhost/api/crawl?report=1');assert.equal(protectedResponse.status,403,'Full maintenance report remains protected');
 const maintenance=await(await runtime.dispatchFetch('http://localhost/api/crawl?report=1',{headers:{'X-Yukemuri-Crawl-Key':'private-maintenance-only'}})).json();
 assert.equal(maintenance.quality.bath_known,status.quality.bathKnownRecords,'Public and protected reports use the same bath evidence boundary');
 assert.equal(maintenance.phases.find(row=>row.provider==='trip'&&row.kind==='detail'&&row.status==='done').last_success,'2026-10-07T01:00:00Z','Maintenance chronology also handles timezone offsets');
 assert.equal(maintenance.failureExamples.length,8);
 assert(maintenance.failureExamples.some(row=>row.error==='source_redirect_requires_review'));
 for(const sample of maintenance.failureExamples)assert.deepEqual(Object.keys(sample).sort(),['attempts','error','fetched_at','kind','next_at','provider','status','url'].sort(),'Samples include diagnostic fields only');
 for(let i=0;i<25;i++)await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at,error) VALUES (?,'jalan','detail','retry',0,0,'ValueError')").bind('qa-failure-'+i).run();
 const expandedBefore=JSON.stringify((await db.prepare('SELECT * FROM crawl_jobs ORDER BY url').all()).results);
 const bounded=await(await runtime.dispatchFetch('http://localhost/api/crawl?report=1',{headers:{'X-Yukemuri-Crawl-Key':'private-maintenance-only'}})).json();
 assert.equal(bounded.failureExamples.length,20,'Maintenance samples stay bounded');
 assert.equal(JSON.stringify((await db.prepare('SELECT * FROM crawl_jobs ORDER BY url').all()).results),expandedBefore,'Diagnostics never modify the queue');
 const page=await runtime.dispatchFetch('http://localhost/');assert.equal(page.status,200);assert((await page.text()).includes('전국 수집 현황'));
 console.log('Collection status passed: quality counts, source/robots reason categories, bounded protected failure samples, chronology, leases, cooldowns, privacy, unchanged queue and existing page.');
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
