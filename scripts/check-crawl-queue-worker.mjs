// Integration checks against the built Worker and a disposable D1 database.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-queue-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const options={modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'queue-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'queue-test-only'}};
const runtime=new Miniflare(options);
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(path,method='GET',data,expected=200,authorized=true)=>{
  const r=await runtime.dispatchFetch('http://localhost'+path,{method,headers:{'Content-Type':'application/json',...(authorized?{'X-Yukemuri-Crawl-Key':'queue-test-only'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));return body;
 };
 await api('/api/crawl-prepare','POST');
 await db.prepare('DELETE FROM crawl_jobs').run();
 const fixtures=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8'));
 const fixture=(provider,digits)=>{
  const old=fixtures.find(h=>h.id.startsWith(provider+'-'));
  const id=provider+'-'+digits,h=JSON.parse(JSON.stringify(old).replaceAll(old.id,id));
  const url=provider==='jalan'?`https://www.jalan.net/yad${digits}/`:`https://www.trip.com/hotels/tokyo-hotel-detail-${digits}/queue-test/`;
  h.links=h.links.map(l=>l.provider===provider?{...l,url}:l);
  h.sources=[{sourceId:id,sourceType:'web',label:(provider==='jalan'?'Jalan':'Trip.com')+' 숙소 상세',retrievedAt:'2026-10-05T05:00:00Z',verifiedAt:'2026-10-05',url,isMock:false}];
  h.names={ko:'Current Queue Hotel '+digits,ja:'Current Queue Hotel '+digits,en:'Current Queue Hotel '+digits};h.aliases=[];
  return h;
 };
 const h=fixture('jalan','999100'),url=h.sources[0].url;
 for(const digits of ['999100','999101'])await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail','pref-hokkaido','pending',0,0)").bind(`https://www.jalan.net/yad${digits}/`).run();
 await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token:randomUUID()},403,false);
 await api('/api/crawl','POST',{provider:'jalan',phase:'names',token:randomUUID()},400);
 const tokens=Array.from({length:8},()=>randomUUID());
 const claims=await Promise.all(tokens.map(token=>api('/api/crawl','POST',{provider:'jalan',phase:'detail',token})));
 assert.equal(claims.filter(c=>c.jobs.length).length,1,'Only one worker may claim the provider');
 const winner=claims.findIndex(c=>c.jobs.length),token=tokens[winner];assert.equal(claims[winner].jobs[0].url,url);
 assert.equal((await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token})).jobs[0].url,url,'POST retry must return the same job');
 const payload={url,status:'done',observations:[h],links:[],claimToken:token};
 await api('/api/crawl','PUT',{...payload,claimToken:randomUUID()},409);
 const legacy={...payload};delete legacy.claimToken;await api('/api/crawl','PUT',legacy,409);
 const other=fixture('jalan','999102');other.sources[0].url=url;
 await api('/api/crawl','PUT',{...payload,observations:[other]},400);
 const result=await api('/api/crawl','PUT',payload);assert.equal(result.accepted,1);
 // P01: the PUT reports the exact record count (the collector prints it).
 const storedCoverage=row=>JSON.parse(row.value).coverage;
 const hotelCount=async()=>(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;
 assert.equal(result.coverage.records,await hotelCount());assert.equal(result.coverage.crawledRecords,result.coverage.records-20);
 const job=await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(url).first();assert.equal(job.attempts,1);assert.equal(job.lease_until,0);
 assert.equal((await api('/api/crawl','PUT',payload)).replayed,true);
 assert.equal((await db.prepare('SELECT attempts FROM crawl_jobs WHERE url=?').bind(url).first()).attempts,1,'Ack retry must not increase attempts');
 assert.equal((await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token:randomUUID()})).jobs.length,0,'Shared provider pacing must persist');
 await db.prepare("DELETE FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").run();
 const secondToken=randomUUID(),second=(await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token:secondToken})).jobs[0];
 await db.prepare('UPDATE crawl_jobs SET lease_until=0 WHERE url=?').bind(second.url).run();
 const recoveredToken=randomUUID(),recovered=(await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token:recoveredToken})).jobs[0];assert.equal(recovered.url,second.url);
 await api('/api/crawl','PUT',{url:second.url,status:'retry',observations:[],links:[],claimToken:secondToken},409);
 await api('/api/crawl','PUT',{url:recovered.url,status:'retry',error:'http_429',retryAfterSeconds:7200,providerCooldownSeconds:7200,observations:[],links:[],claimToken:recoveredToken});
 assert.equal((await api('/api/crawl','POST',{provider:'jalan',phase:'baths',token:randomUUID()})).jobs.length,0,'Cooldown includes enrichment');
 // Only the exact obsolete one-page redirect pause can be isolated. Failed
 // repair attempts preserve every queue row and all provider metadata.
 const redirectUrl='https://www.jalan.net/yad999130/',legacyNext=Date.now()/1000+86400;
 await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at,error) VALUES (?,'jalan','detail','retry',1,?,'source_redirect_requires_review')").bind(redirectUrl,legacyNext).run();
 const repair={action:'isolate-legacy-redirect',url:redirectUrl,expectedNextAt:legacyNext};
 const setReady=async value=>db.prepare("INSERT INTO catalog_meta(key,value) VALUES ('crawl-provider-ready:jalan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(value)).run();
 const snapshot=async()=>JSON.stringify([(await db.prepare('SELECT * FROM crawl_jobs ORDER BY url').all()).results,(await db.prepare('SELECT * FROM catalog_meta ORDER BY key').all()).results]);
 await setReady(legacyNext);
 await api('/api/crawl','POST',repair,403,false);
 await api('/api/crawl','POST',{...repair,override:true},400);
 for(const block of ['active','newer','another-403','another-redirect']){
  await setReady(legacyNext);
  await db.prepare("UPDATE crawl_jobs SET lease_until=0,next_at=0,error=NULL WHERE url=?").bind(second.url).run();
  if(block==='active')await db.prepare('UPDATE crawl_jobs SET lease_until=? WHERE url=?').bind(Date.now()/1000+180,second.url).run();
  if(block==='newer')await setReady(legacyNext+300);
  if(block.startsWith('another-'))await db.prepare('UPDATE crawl_jobs SET next_at=?,error=? WHERE url=?').bind(legacyNext,block==='another-403'?'http_403':'source_redirect_requires_review',second.url).run();
  const before=await snapshot();await api('/api/crawl','POST',repair,409);assert.equal(await snapshot(),before,block+' must prevent repair');
 }
 await db.prepare("UPDATE crawl_jobs SET lease_until=0,next_at=0,error=NULL WHERE url=?").bind(second.url).run();
 await setReady(legacyNext);
 assert.equal((await api('/api/crawl','POST',repair)).repaired,true);
 const isolated=await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(redirectUrl).first();
 assert.equal(isolated.error,'source_redirect_page_review');assert.equal(isolated.next_at,legacyNext);assert.equal(isolated.attempts,1);
 assert(Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").first()).value)<legacyNext);
 assert.equal((await api('/api/crawl','POST',repair)).alreadyIsolated,true);
 assert((await api('/api/collection-status')).providers.find(p=>p.provider==='jalan').issues.some(i=>i.reason==='source_review'),'Isolated redirect remains visible as page review');
 // An ordinary error, including an old updater's overbroad cooldown, must
 // leave other pages available. A reported source Retry-After still wins.
 for(const [i,error] of ['ValueError','URLError','source_redirect_page_review','source_access_redirect_repeated','http_503'].entries()){
  await setReady(0);const testUrl=`https://www.jalan.net/yad${999140+i}/`;
  await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at) VALUES (?,'jalan','detail','pending',0,0)").bind(testUrl).run();
  await api('/api/crawl','PUT',{url:testUrl,status:'retry',error,retryAfterSeconds:3600,providerCooldownSeconds:21600});
  const ready=Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").first()).value);
  assert(ready<Date.now()/1000+10,error+' must not pause the provider');
 }
 const hintUrl='https://www.jalan.net/yad999149/';await setReady(0);
 await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at) VALUES (?,'jalan','detail','pending',0,0)").bind(hintUrl).run();
 await api('/api/crawl','PUT',{url:hintUrl,status:'retry',error:'http_503',retryAfterSeconds:900,providerCooldownSeconds:900,providerWaitReason:'retry_after'});
 assert(Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").first()).value)>Date.now()/1000+890);
 const release={action:'release-reviewed-redirect',url:redirectUrl,expectedNextAt:legacyNext};
 await api('/api/crawl','POST',release,409); // Explicit server pause is preserved.
 await setReady(0);await api('/api/crawl','POST',release,403,false);
 for(const error of ['http_403','http_429','source_access_bot_challenge']){
  await db.prepare('UPDATE crawl_jobs SET error=?,next_at=? WHERE url=?').bind(error,legacyNext,second.url).run();
  const before=await snapshot();await api('/api/crawl','POST',release,409);assert.equal(await snapshot(),before);
 }
 await db.prepare('UPDATE crawl_jobs SET error=NULL,next_at=0,lease_until=? WHERE url=?').bind(Date.now()/1000+180,second.url).run();
 const beforeActive=await snapshot();await api('/api/crawl','POST',release,409);assert.equal(await snapshot(),beforeActive);
 await db.prepare('UPDATE crawl_jobs SET lease_until=0 WHERE url=?').bind(second.url).run();
 await api('/api/crawl','POST',{...release,expectedNextAt:legacyNext+1},409);
 assert.equal((await api('/api/crawl','POST',release)).repaired,true);
 const released=await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(redirectUrl).first();
 assert.equal(released.next_at,0);assert.equal(released.attempts,1);assert.equal(released.error,'source_redirect_page_review');
 const beforeReplay=await snapshot();await api('/api/crawl','POST',release,409);assert.equal(await snapshot(),beforeReplay);
 // A lexically later local timestamp can still be an older observation.
 const stale=structuredClone(h);stale.names.ko='Rejected stale alias';stale.aliases=['Rejected stale alias'];stale.sources[0].retrievedAt='2026-10-05T11:00:00+09:00';
 assert.equal((await api('/api/crawl','PUT',{...legacy,observations:[stale]})).accepted,0);
 assert.equal((await api('/api/hotels/'+h.id)).names.ko,h.names.ko);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM hotel_names WHERE name='Rejected stale alias'").first()).n,0,'Rejected observation must not alter search aliases');
 const list=structuredClone(stale);list.names.ko='Rejected list alias';list.aliases=['Rejected list alias'];list.sources[0].retrievedAt='2026-10-06T08:00:00Z';list.sources[0].label='Jalan 숙소 목록';
 await api('/api/crawl','PUT',{...legacy,observations:[list]});
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM hotel_names WHERE name='Rejected list alias'").first()).n,0);
 // Enrichment uses an indexed hotel identity lookup, including completed jobs.
 await db.prepare("DELETE FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").run();
 const baths=await api('/api/crawl','POST',{provider:'jalan',phase:'baths',token:randomUUID()});assert.equal(baths.jobs[0].url,url);
 // D05: the phase revisits a Jalan detail saved by an older parser (v1) and
 // leaves one saved by the current parser (v2) alone.
 const bathsAgain=async version=>{
  await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.sources[0].bathDataVersion',?) WHERE id=?").bind(version,h.id).run();
  await db.prepare('UPDATE crawl_jobs SET lease_token=NULL,lease_until=0 WHERE url=?').bind(url).run();
  return (await api('/api/crawl','POST',{provider:'jalan',phase:'baths',token:randomUUID()})).jobs[0]?.url??null;
 };
 assert.equal(await bathsAgain('v1'),url,'A v1 Jalan detail is revisited');
 assert.equal(await bathsAgain('v2'),null,'A v2 Jalan detail is not revisited');
 assert.equal((await api('/api/crawl?provider=jalan&kind=detail&baths=1&limit=5')).jobs.length,0,'The queue view agrees');
 await db.prepare("UPDATE hotels SET payload=json_remove(payload,'$.sources[0].bathDataVersion') WHERE id=?").bind(h.id).run();
 const trip=fixture('trip','999110');await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'trip','detail','pref-tokyo','pending',0,0)").bind(trip.sources[0].url).run();
 const tripPut=await api('/api/crawl','PUT',{url:trip.sources[0].url,status:'done',observations:[trip],links:[]});
 assert.equal(tripPut.coverage.records,result.coverage.records+1,'Only the new property is counted; updates and rejected observations are not');
 assert.equal(tripPut.coverage.records,await hotelCount());
 // A list page can repeat a property; it is inserted and counted once.
 const listUrl='https://www.jalan.net/010000/LRG_010200/',repeated=fixture('jalan','999190');repeated.sources[0]={...repeated.sources[0],url:listUrl,label:'Jalan 숙소 목록'};
 await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','list','pref-hokkaido','pending',0,0)").bind(listUrl).run();
 const listPut=await api('/api/crawl','PUT',{url:listUrl,status:'done',observations:[repeated,repeated],links:[]});
 assert.equal(listPut.coverage.records,tripPut.coverage.records+1);assert.equal(listPut.coverage.records,await hotelCount());
 // A wrong counter (for example after a restore) is reset by the full count
 // the collector reads at the end of each run.
 await db.prepare("UPDATE catalog_meta SET value='5' WHERE key='hotel-records'").run();
 assert.equal((await api('/api/crawl?provider=trip&kind=detail&limit=1')).coverage.records,await hotelCount());
 assert.equal(Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='hotel-records'").first()).value),await hotelCount());
 // D05: a room count and a view bath reach the hotel row and the detail API.
 // A count that names another source, or no rooms, is refused.
 const counted=fixture('jalan','999155'),countedUrl=counted.sources[0].url;
 counted.rooms={total:123,byType:{western:31,japanese:42,japaneseWestern:38,other:12},sourceId:counted.id,verifiedAt:'2026-10-05',note:'자란 객실 수 표'};
 counted.features.viewBath={value:true,sourceId:counted.id,verifiedAt:'2026-10-05',scope:'property',note:'자란 욕탕 항목: その他の風呂施設: 展望風呂'};
 counted.sources[0].bathDataVersion='v2';
 await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail','pref-hokkaido','pending',0,0)").bind(countedUrl).run();
 for(const rooms of [{...counted.rooms,sourceId:'jalan-999156'},{...counted.rooms,total:0}])await api('/api/crawl','PUT',{url:countedUrl,status:'done',observations:[{...counted,rooms}],links:[]},400);
 assert.equal((await api('/api/crawl','PUT',{url:countedUrl,status:'done',observations:[counted],links:[]})).accepted,1);
 const countedDetail=await api('/api/hotels/'+counted.id);
 assert.deepEqual(countedDetail.rooms,counted.rooms);assert.equal(countedDetail.features.viewBath.value,true);
 const viewBit=1<<13,countedRow=await db.prepare('SELECT bath_features,bath_known FROM hotels WHERE id=?').bind(counted.id).first();
 assert.equal(countedRow.bath_features&viewBit,viewBit);assert.equal(countedRow.bath_known&viewBit,viewBit);
 assert.equal(Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='hotel-records'").first()).value),await hotelCount());
 // Overlapping collector runs: a full-count GET racing new-property PUTs must
 // not drop their increments (Codex review on PR #28).
 for(let round=0;round<30;round++){
  const puts=[0,1,2].map(i=>{const p=fixture('jalan',String(999300+round*3+i));p.sources[0].label='Jalan 숙소 상세';return p});
  for(const p of puts)await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail','pref-hokkaido','pending',0,0)").bind(p.sources[0].url).run();
  const later=ms=>new Promise(r=>setTimeout(r,ms));
  const gets=[0,0,1,1,2,2,3].map(ms=>later(ms+round%3).then(()=>api('/api/crawl?provider=trip&kind=detail&limit=1')));
  await Promise.all([...puts.map(p=>api('/api/crawl','PUT',{url:p.sources[0].url,status:'done',observations:[p],links:[]})),...gets]);
  assert.equal(Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='hotel-records'").first()).value),await hotelCount(),'Counter after overlapping GET and PUTs, round '+round);
  // The stored aggregate is never older than one a GET already returned
  // (records and completed pages only grow here; Codex review on PR #31).
  const seen=(await Promise.all(gets)).map(r=>r.coverage),stored=storedCoverage(await db.prepare("SELECT value FROM catalog_meta WHERE key='coverage-snapshot'").first());
  for(const key of ['records','completedDetailPages'])assert(stored[key]>=Math.max(...seen.map(c=>c[key])),`Stored ${key} ${stored[key]} is older than a returned one, round ${round}`);
 }
 // That GET also stores the aggregate. A new isolate shows it (here with a
 // marked field) instead of counting both tables again, with the exact count.
 const full=(await api('/api/crawl?provider=trip&kind=detail&limit=1')).coverage;
 assert.deepEqual(storedCoverage(await db.prepare("SELECT value FROM catalog_meta WHERE key='coverage-snapshot'").first()),full);
 // A GET whose sequence number is lower than the stored one (a slower,
 // overlapping GET) leaves the newer aggregate in place.
 const newer=(await db.prepare("SELECT value FROM catalog_meta WHERE key='coverage-snapshot'").first()).value;
 await db.prepare("UPDATE catalog_meta SET value=json_set(value,'$.seq',1e9,'$.coverage.failed',-8) WHERE key='coverage-snapshot'").run();
 await api('/api/crawl?provider=trip&kind=detail&limit=1');
 assert.equal(storedCoverage(await db.prepare("SELECT value FROM catalog_meta WHERE key='coverage-snapshot'").first()).failed,-8,'An older aggregate must not replace a newer stored one');
 await db.prepare("UPDATE catalog_meta SET value=? WHERE key='coverage-snapshot'").bind(newer).run();
 await db.prepare("UPDATE catalog_meta SET value=json_set(value,'$.coverage.failed',-7) WHERE key='coverage-snapshot'").run();
 const fresh=new Miniflare(options);
 try{
  // A replayed PUT answers with the record counter over the stored aggregate.
  const replay=randomUUID();await db.prepare('UPDATE crawl_jobs SET last_token=? WHERE url=?').bind(replay,url).run();
  const shown=await (await fresh.dispatchFetch('http://localhost/api/crawl',{method:'PUT',headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'queue-test-only'},body:JSON.stringify({...payload,claimToken:replay})})).json();assert.equal(shown.replayed,true,JSON.stringify(shown).slice(0,300));
  assert.equal(shown.coverage.failed,-7,'A new isolate reads the stored aggregate');
  assert.equal(shown.coverage.records,await hotelCount());assert.equal(shown.coverage.pending,full.pending);
 }finally{await fresh.dispose()}
 await db.prepare("UPDATE catalog_meta SET value=? WHERE key='coverage-snapshot'").bind(newer).run();
 await db.prepare("DELETE FROM catalog_meta WHERE key='crawl-provider-ready:trip'").run();
 assert.equal((await api('/api/crawl','POST',{provider:'trip',phase:'names',token:randomUUID()})).jobs[0].url,trip.sources[0].url);
 await api('/api/crawl?report=1','GET',undefined,403,false);
 const health=await api('/api/crawl?report=1');assert(health.quality.records>1600);assert(health.phases.some(p=>p.active===1));assert.equal(health.inventoryComplete,false);
 const plan=await db.prepare("EXPLAIN QUERY PLAN SELECT url FROM crawl_jobs WHERE provider='jalan' AND kind='detail' AND status='pending' AND next_at<=0").all();assert(plan.results.some(r=>r.detail.includes('idx_crawl_jobs_provider_ready')));
 // A large new-page backlog must not starve due retries. Future page waits,
 // failed pages, wrong kinds and genuine provider pauses remain ineligible.
 await db.prepare('DELETE FROM crawl_jobs').run();
 await db.prepare("DELETE FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").run();
 const readyAt=Date.now()/1000;
 for(const [digits,status,nextAt,kind,priority,attempts] of [
  ['999160','pending',0,'detail',0,0],
  ['999170','retry',readyAt-120,'detail',100,1],
  ['999171','retry',readyAt-240,'detail',100,1],
  ['999172','retry',readyAt+3600,'detail',100,1],
  ['999173','failed',readyAt-3600,'detail',100,3],
  ['999174','retry',readyAt-7200,'list',100,1],
 ])await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at,priority) VALUES (?,'jalan',?,?,?,?,?)").bind(`https://www.jalan.net/yad${digits}/`,kind,status,attempts,nextAt,priority).run();
 const claimDetail=async(lane,token=randomUUID())=>api('/api/crawl','POST',{provider:'jalan',phase:'detail',lane,token});
 assert.equal((await claimDetail('priority')).jobs[0].url,'https://www.jalan.net/yad999160/','Priority discovery remains unchanged');
 await db.prepare('UPDATE crawl_jobs SET lease_until=0').run();
 const retryToken=randomUUID(),due=await claimDetail('national',retryToken);
 assert.equal(due.jobs[0].url,'https://www.jalan.net/yad999171/','National lane selects the oldest due detail retry');
 assert.equal((await claimDetail('national',retryToken)).jobs[0].url,due.jobs[0].url,'Retry claim replay returns the same lease');
 assert.equal((await claimDetail('national')).jobs.length,0,'Other workers cannot overtake an active retry');
 await db.prepare('UPDATE crawl_jobs SET lease_until=0,next_at=? WHERE url=?').bind(readyAt+3600,due.jobs[0].url).run();
 assert.equal((await claimDetail('national')).jobs[0].url,'https://www.jalan.net/yad999170/');
 await db.prepare('UPDATE crawl_jobs SET lease_until=0').run();
 await setReady(readyAt+7200);
 assert.equal((await claimDetail('national')).jobs.length,0,'Retry preference never bypasses a provider restriction');
 await setReady(0);
 await db.prepare("UPDATE crawl_jobs SET next_at=? WHERE status='retry'").bind(readyAt+3600).run();
 assert.equal((await claimDetail('national')).jobs[0].url,'https://www.jalan.net/yad999160/','Future retries and failed pages leave normal discovery available');
 console.log('Queue checks passed: due retry fairness, future/access/lease preservation, replay, crash recovery, provider pacing, guarded redirect repair, identity, chronology, enrichment and protected health.');
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
