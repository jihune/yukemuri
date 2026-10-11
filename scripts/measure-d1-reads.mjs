// Count D1 rows read/written and time representative requests against the built
// Worker and a temporary Miniflare D1. Never touches the production database.
// Usage: node scripts/measure-d1-reads.mjs [--grow] [--check] [--out evidence.json] [--dist dir --label commit]
//  --grow   copy checked-in rows up to the 2026-10-08 production row counts
//  --check  fail when a request reads more rows than its P01 upper bound
//  --dist   build to measure (default dist) and --label, the commit it was built from
//  --schema last migration to apply (e.g. 0012 for a build from before 0013)
// Row counts come from the meta that Miniflare's D1 returns per statement.
// Whether Miniflare counts rows exactly like production D1 is unverified.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),grow=argv.includes('--grow'),check=argv.includes('--check'),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,dist=argv.includes('--dist')?argv[argv.indexOf('--dist')+1]:'dist',label=argv.includes('--label')?argv[argv.indexOf('--label')+1]:null,schema=argv.includes('--schema')?argv[argv.indexOf('--schema')+1]:'9999';
// INSERT statement counts in the 2026-10-08 account export (docs/hosting-review-20261011.md 1.2).
const TARGET={hotels:12271,hotel_names:13849,crawl_jobs:15417};
const KEY='measure-d1-only',VISITOR='d'.repeat(64);
const temp=mkdtempSync(join(tmpdir(),'yukemuri-d1-reads-'));
// The app reads env.DB from cloudflare:workers. A test-only entry module wraps
// that binding in place and serves the counters on /__d1meter. The copied build
// is the one under test; dist/ itself is not modified.
const server=join(temp,'server');cpSync(resolve(dist,'server'),server,{recursive:true});
writeFileSync(join(server,'__d1meter.js'),`import app from './index.js';
import {env} from 'cloudflare:workers';
const empty=()=>({statements:0,rowsRead:0,rowsWritten:0,heaviest:[]});
let meter=empty(),wrapped=false;
const count=(meta,sql)=>{meter.statements++;meter.rowsRead+=meta?.rows_read??0;meter.rowsWritten+=meta?.rows_written??0;if(meta?.rows_read>=1000)meter.heaviest.push({rowsRead:meta.rows_read,sql:sql.replace(/\\s+/g,' ').slice(0,160)})};
const statement=(inner,sql)=>({__inner:inner,__sql:sql,
 bind:(...args)=>statement(inner.bind(...args),sql),
 all:async()=>{const r=await inner.all();count(r.meta,sql);return r},
 run:async()=>{const r=await inner.run();count(r.meta,sql);return r},
 first:async column=>{const r=await inner.all();count(r.meta,sql);const row=r.results[0]??null;return column===undefined?row:row?(row[column]??null):null},
 raw:async()=>{throw new Error('raw() is not metered')}});
function wrap(){
 if(wrapped)return;wrapped=true;
 const db=env.DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db);
 db.prepare=sql=>statement(prepare(sql),sql);
 db.batch=async list=>{const results=await batch(list.map(s=>s.__inner??s));results.forEach((r,i)=>count(r.meta,list[i].__sql??''));return results};
 db.exec=async()=>{throw new Error('exec() is not metered')};
}
export default {async fetch(request,env2,ctx){
 wrap();
 if(new URL(request.url).pathname==='/__d1meter'){const body=JSON.stringify(meter);meter=empty();return new Response(body)}
 return app.fetch(request,env2,ctx);
}};
`);
const modules=[{type:'ESModule',path:join(server,'__d1meter.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__d1meter.js').map(p=>({type:'ESModule',path:join(server,p)}))];
const start=()=>new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'d1-reads'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const call=async(runtime,path,init={},expected=200)=>{
 await runtime.dispatchFetch('http://localhost/__d1meter');
 const t=performance.now();
 const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers:{'Content-Type':'application/json','X-Yukemuri-Visitor':VISITOR,...(path.startsWith('/api/crawl')||path.startsWith('/api/catalog-export')?{'X-Yukemuri-Crawl-Key':KEY}:{}),...init.headers}});
 const body=await r.json(),ms=performance.now()-t;
 assert.equal(r.status,expected,path+' '+JSON.stringify(body).slice(0,300));
 const meter=await (await runtime.dispatchFetch('http://localhost/__d1meter')).json();
 return{ms,meter,body};
};
let runtime=start();
const counts={};
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f.slice(0,4)<=schema).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const seeding=await call(runtime,'/api/crawl-prepare',{method:'POST'});
 if(grow){
  // Copies of the checked-in rows under new ids, the way measure-map-area.mjs grows
  // the catalogue. Names and queue rows are copied with them so joins see real sizes.
  const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
  for(let n=1;;n++){
   const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;
   await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run();
  }
  for(let n=1;;n++){
   const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;
   const added=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();
   if(!added.meta.changes)break;
  }
  for(let n=1;;n++){
   const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=TARGET.crawl_jobs)break;
   await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(TARGET.crawl_jobs-have).run();
  }
 }
 for(const table of ['hotels','hotel_names','crawl_jobs','hotel_lifecycle'])counts[table]=(await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;
 // One pending Trip detail job whose observation is a checked-in record with a
 // newer retrieval time, so the PUT really writes like a collector page does.
 const puts=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')).filter(h=>/^trip-\d+$/.test(h.id)&&h.sources?.[0]?.url&&h.links?.[0]?.url===h.sources[0].url).slice(0,2).map(base=>{
  const observation={...base,sources:[{...base.sources[0],retrievedAt:new Date().toISOString()}]};
  return JSON.stringify({url:base.sources[0].url,status:'done',observations:[observation],links:[]});
 });
 for(const body of puts){const {url,observations:[h]}=JSON.parse(body);await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'trip','detail',?,'pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',lease_token=NULL,lease_until=0,last_token=NULL").bind(url,h.prefecture).run()}
 // A list page that finds 30 new properties (new ids, new detail jobs) and 15
 // known ones, the write-heavy case of a collector list PUT.
 const listUrl='https://www.jalan.net/130000/LRG_130200/';
 await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','list','pref-tokyo','pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',lease_token=NULL,lease_until=0,last_token=NULL").bind(listUrl).run();
 const listPut=(()=>{
  const at=new Date().toISOString(),bases=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')).filter(h=>/^jalan-\d+$/.test(h.id));
  const observe=(base,id)=>{const url='https://www.jalan.net/yad'+id.slice(6)+'/';return{...base,id,links:base.links.map(l=>l.provider==='jalan'?{...l,url}:l),sources:[{...base.sources[0],sourceId:id,url:listUrl,label:'Jalan 목록',retrievedAt:at}],features:Object.fromEntries(Object.entries(base.features).map(([k,f])=>[k,f&&{...f,sourceId:id}])),ratings:base.ratings.map(r=>({...r,sourceId:id}))}};
  const fresh=bases.slice(0,30).map((b,i)=>observe(b,'jalan-'+(9000000+i))),known=bases.slice(30,45).map(b=>observe(b,b.id));
  return JSON.stringify({url:listUrl,status:'done',observations:[...fresh,...known],links:fresh.map(h=>({url:'https://www.jalan.net/yad'+h.id.slice(6)+'/',kind:'detail',prefecture:h.prefecture}))});
 })();
 const sample=(await db.prepare("SELECT id FROM hotels WHERE id NOT LIKE '%-copy%' ORDER BY id LIMIT 4").all()).results.map(r=>r.id);
 // A previous collector run ended with its full-count GET, as in production.
 await call(runtime,'/api/crawl?provider=jalan&kind=list&limit=1');
 await runtime.dispose();runtime=null;

 const scenarios=[
  // [key, label, path, init, expected, cold]. List, search and map requests no
  // longer reach the Worker (P03: static snapshot).
  ['detailCold','상세(새 isolate)','/api/hotels/'+sample[0],{},200,true],
  ['detail','상세','/api/hotels/'+sample[0]],
  ['compare','비교 3곳','/api/hotel-comparison?ids='+sample.slice(0,3).join(',')],
  // Every other public route (no maintenance key), P03 PR C.
  ['compare4','비교 4곳(최대)','/api/hotel-comparison?ids='+sample.join(',')],
  ['detailMissing','상세(없는 숙소)','/api/hotels/no-such-hotel',{},404],
  ['favoritesPut','즐겨찾기 저장(PUT)','/api/favorites',{method:'PUT',body:JSON.stringify({hotelId:sample[0],saved:true})}],
  ['favoritesGet','즐겨찾기 목록','/api/favorites'],
  ['photoCredits','사진 출처 첫 쪽','/api/photo-credits'],
  ['photoCreditsNext','사진 출처 다음 쪽(커서)','/api/photo-credits?after='+sample[1]],
  ['google','Google 평점(설정 없음)','/api/hotels/'+sample[0]+'/google'],
  ['prices','요금(폐지)','/api/prices',{},410],
  ['collectionStatusPublic','수집 현황(키 없음)','/api/collection-status',{},403],
  ['crawlGet','수집 GET 집계(실행 끝)','/api/crawl?provider=jalan&kind=list&limit=1'],
  ['crawlClaim','수집 작업 선점(POST)','/api/crawl',{method:'POST',body:JSON.stringify({provider:'trip',phase:'detail',token:randomUUID()})}],
  // Every phase and lane a gentle run claims (scripts/crawler/update-site.py).
  // A claim reads the same rows whether or not the provider is already leased.
  ...[['jalan','detail'],['jalan','baths'],['trip','detail'],['jalan','refresh'],['trip','refresh'],['jalan','list'],['trip','list'],['trip','names']].flatMap(([provider,phase])=>['priority','national'].map(lane=>[`claim:${provider}:${phase}:${lane}`,`수집 작업 선점(POST, ${provider} ${phase} ${lane})`,'/api/crawl',{method:'POST',body:JSON.stringify({provider,phase,lane,token:randomUUID()})}])),
  ['crawlPut','수집 저장(PUT, 상세 1곳)','/api/crawl',{method:'PUT',body:puts[0]}],
  ['crawlPutList','수집 저장(PUT, 목록: 새 숙소 30·기존 15)','/api/crawl',{method:'PUT',body:listPut}],
  ['crawlPutCold','수집 저장(PUT, 새 isolate)','/api/crawl',{method:'PUT',body:puts[1]},200,true],
  ['exportManifest','catalog-export 목록','/api/catalog-export'],
  ['exportPage','catalog-export hotels 한 쪽(250행)','/api/catalog-export?table=hotels&limit=250'],
 ];
 const results=[];
 const warm=start();
 try{
  await call(warm,'/api/hotels/'+sample[0]);
  const byKey={};
  for(const [key,label,route,init={},expected=200,cold=false] of scenarios){
   let r;const path=typeof route==='function'?route(byKey):route;
   if(cold){const fresh=start();try{r=await call(fresh,path,init,expected)}finally{await fresh.dispose()}}
   else r=await call(warm,path,init,expected);
   const row={key,label,path:path.replace(/q=[^&]+/,'q=…'),ms:+r.ms.toFixed(1),...r.meter};
   if(key.startsWith('crawlPut'))row.coverageRecords=r.body.coverage?.records,row.accepted=r.body.accepted;
   if(r.body.total!==undefined)row.total=r.body.total;
   results.push(row);byKey[key]={...row,snapshot:r.body.snapshot?.token};console.log(JSON.stringify(row));
  }
 }finally{await warm.dispose()}
 const byKey=Object.fromEntries(results.map(r=>[r.key,r]));
 if(check){
  // Upper bounds as hotels-table multiples plus fixed per-request work (result
  // sessions, lifecycle and source-group lookups), so they hold at any scale.
  // A PUT reads its own rows, not the catalogue, even in a new isolate. A list
  // or name search scans the catalogue two or three times, not five to ten, and
  // a collector write does not make the next name search rebuild the index.
  const h=counts.hotels,bound=(k,c)=>k*h+c;
  // P02: a claim reads the first eligible job of each kind and status in its
  // lane's index order and the jobs verified links name, not the whole queue.
  const claims=Object.fromEntries(results.filter(r=>r.key==='crawlClaim'||r.key.startsWith('claim:')).map(r=>[r.key,bound(0.05,200)]));
  // Public routes (P03 PR C): fixed caps that hold at any catalogue size, and
  // no D1 write on a read. A favourite save writes its one row.
  const publicCaps={detailCold:50,detail:50,detailMissing:50,compare:120,compare4:160,favoritesPut:50,favoritesGet:50,photoCredits:60,photoCreditsNext:60,google:0,prices:0,collectionStatusPublic:0};
  const bounds={...claims,crawlPut:bound(0.02,200),crawlPutCold:bound(0.02,200),...publicCaps};
  const failures=Object.entries(bounds).filter(([k,max])=>byKey[k].rowsRead>max).map(([k,max])=>`${k}: rowsRead ${byKey[k].rowsRead} > ${Math.floor(max)}`);
  for(const k of Object.keys(publicCaps))if(k!=='favoritesPut'&&byKey[k].rowsWritten!==0)failures.push(`${k}: a public read wrote ${byKey[k].rowsWritten} rows`);
  console.log(failures.length?'D1 read bounds FAIL '+failures.length+': '+failures.join('; '):`D1 read bounds PASS (${Object.keys(bounds).length} requests, hotels=${h})`);
  if(failures.length)process.exitCode=1;
 }
 const report={measuredAt:new Date().toISOString(),schema:readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f.slice(0,4)<=schema).sort().at(-1),...(label?{build:label}:{gitHead:execSync('git rev-parse --short HEAD').toString().trim(),dirty:execSync('git status --porcelain -- lib app build').toString().trim()!==''}),environment:'Miniflare local D1 in the Claude Code cloud container. Not production D1; whether Miniflare counts rows_read like production D1 is unverified. Times are wall-clock including local SQLite, single run.',grown:grow,seedRequest:{rowsRead:seeding.meter.rowsRead,rowsWritten:seeding.meter.rowsWritten},tables:counts,results};
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 console.log('tables='+JSON.stringify(counts)+' scenarios='+results.length);
}finally{if(runtime)await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
