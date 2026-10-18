// C04: the same collector pages and reads against a build before the write
// reductions (its own migrations) and the current build (all migrations), on
// two copies of one temporary D1 grown to the 2026-10-17 production size. A
// fixed clock is given to both, so responses, every stored row and the search
// snapshot must come out identical; only the rows written (and read) may differ.
// Never touches the production database.
// Usage: node scripts/compare-write-builds.mjs <old build dist> <last migration of that build, e.g. 0013> [--out evidence.json] [--hotels n] [--control]
//  --control  change one stored row of the current copy before comparing: the comparison must fail
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
import {buildSnapshot} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),[oldDist,oldSchema]=argv,arg=k=>argv.includes(k)?argv[argv.indexOf(k)+1]:null;
if(!oldDist||!/^\d{4}$/.test(oldSchema??''))throw new Error('Usage: compare-write-builds.mjs <old build dist> <last migration, e.g. 0013> [--out file] [--hotels n]');
const out=arg('--out'),HOTELS=Number(arg('--hotels')??23032),control=argv.includes('--control');
// 2026-10-17 (H01 day 5): 23,032 hotels; names and queue in the ratio of the 2026-10-08 export.
const TARGET={hotels:HOTELS,hotel_names:Math.round(HOTELS*13849/12271),crawl_jobs:Math.round(HOTELS*1.3)};
const KEY='compare-only',VISITOR='c'.repeat(64),START=Date.parse('2026-10-18T03:00:00Z');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-write-compare-'));
// Each build gets a test-only entry module that serves the request at the
// clock the request names (X-Compare-Now) and counts rows written per request.
const serverOf=(dist,name)=>{
 const server=join(temp,name);cpSync(resolve(dist,'server'),server,{recursive:true});
 writeFileSync(join(server,'__compare.js'),`import app from './index.js';
import {env} from 'cloudflare:workers';
const RealDate=Date;let clock=0;
class FixedDate extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}}
globalThis.Date=FixedDate;
let written=0,read=0,wrapped=false;
const count=meta=>{written+=meta?.rows_written??0;read+=meta?.rows_read??0};
const statement=inner=>({__inner:inner,bind:(...a)=>statement(inner.bind(...a)),all:async()=>{const r=await inner.all();count(r.meta);return r},run:async()=>{const r=await inner.run();count(r.meta);return r},first:async c=>{const r=await inner.all();count(r.meta);const row=r.results[0]??null;return c===undefined?row:row?(row[c]??null):null},raw:async()=>{throw new Error('raw() is not counted')}});
function wrap(){if(wrapped)return;wrapped=true;const db=env.DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db);db.prepare=sql=>statement(prepare(sql));db.batch=async list=>{const r=await batch(list.map(s=>s.__inner??s));r.forEach(x=>count(x.meta));return r}}
export default {async fetch(request,env2,ctx){
 wrap();clock=Number(request.headers.get('X-Compare-Now'));
 if(new URL(request.url).pathname==='/__rows'){const body=JSON.stringify({written,read});written=0;read=0;return new Response(body)}
 return app.fetch(request,env2,ctx);
}};
`);
 return{modules:[{type:'ESModule',path:join(server,'__compare.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__compare.js').map(p=>({type:'ESModule',path:join(server,p)}))],modulesRoot:server};
};
const builds={old:serverOf(oldDist,'old'),current:serverOf('dist','current')};
const start=(name,dir)=>new Miniflare({...builds[name],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'compare'},d1Persist:dir,bindings:{CRAWL_ACCESS_KEY:KEY}});
const migrate=async(db,from,to)=>{for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f.slice(0,4)>from&&f.slice(0,4)<=to).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run()};
const call=async(runtime,at,path,init={})=>{
 const headers={'Content-Type':'application/json','X-Yukemuri-Visitor':VISITOR,'X-Yukemuri-Crawl-Key':KEY,'X-Compare-Now':String(at)};
 await runtime.dispatchFetch('http://localhost/__rows',{headers});
 const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers});
 const text=await r.text();
 return{status:r.status,body:text.startsWith('{')||text.startsWith('[')?JSON.parse(text):text,...await (await runtime.dispatchFetch('http://localhost/__rows',{headers})).json()};
};
// The collector's parser on the checked-in fixtures, as update-site.py builds a PUT body.
const parsed=at=>JSON.parse(execFileSync('python3',['-c',`
import json,sys
sys.path.insert(0,'scripts/crawler')
from collect import parse_source_page
at=sys.argv[1]
def body(fixture,provider,url,kind,pref=None):
    raw=open('scripts/crawler/fixtures/'+fixture,encoding='utf-8').read()
    observations,links,foreign,diagnostic=parse_source_page(raw,provider,url,at,pref,kind)
    assert observations and not diagnostic['reviewReason'],diagnostic
    return dict(url=url,status='done',error=None,observations=observations,links=[dict(url=u,kind=k,prefecture=p) for u,(k,p) in links.items()])
print(json.dumps(dict(
    jalanList=body('jalan-list.html','jalan','https://www.jalan.net/130000/LRG_137100/','list','pref-tokyo'),
    jalanDetail=body('jalan-detail.html','jalan','https://www.jalan.net/yad307416/','detail'),
    tripDetail=body('trip-detail-rooms.html','trip','https://www.trip.com/hotels/hakone-hotel-detail-704264/fujiya-hotel/','detail'))))
`,new Date(at).toISOString().replace('.000Z','Z')],{encoding:'utf8'}));
// A page under other ids (ids: old id -> new id), every id and property URL
// swapped, at another page URL: properties new to the catalogue.
const rename=(page,ids,url)=>{
 const detail=id=>'https://www.jalan.net/yad'+id.slice(6)+'/',swapUrl=v=>{const id='jalan-'+v.slice(25,-1);return ids.has(id)?detail(ids.get(id)):v};
 const swap=v=>typeof v==='string'?ids.get(v)??(/^https:\/\/www\.jalan\.net\/yad\d+\/$/.test(v)?swapUrl(v):v):Array.isArray(v)?v.map(swap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,swap(x)])):v;
 const target=url??swapUrl(page.url);
 return{...page,url:target,observations:swap(page.observations).map(h=>({...h,sources:h.sources.map(s=>({...s,url:target}))})),links:swap(page.links)};
};
const freshList=page=>rename(page,new Map(page.observations.map((h,i)=>[h.id,'jalan-'+(9000000+i)])),'https://www.jalan.net/130000/LRG_137100/page2.html');
const report={measuredAt:new Date().toISOString(),oldBuild:oldDist,oldSchema,environment:'Miniflare local D1 in the Claude Code cloud container, fixed clock per request. Not production D1.',steps:[]};
try{
 const base=join(temp,'base');
 let runtime=start('old',base);
 const db=await runtime.getD1Database('DB');
 await migrate(db,'',oldSchema);
 for(let i=0;;i++){const r=await call(runtime,START,'/api/crawl-prepare',{method:'POST'});assert.equal(r.status,200);if(r.body.done)break;assert(i<60)}
 // Copies of the checked-in rows under new ids, as measure-d1-reads.mjs grows them.
 const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
 for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run()}
 for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;const added=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();if(!added.meta.changes)break}
 for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=TARGET.crawl_jobs)break;await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(TARGET.crawl_jobs-have).run()}
 // Production holds a lifecycle row for every hotel the collector saw, a few under review.
 await db.prepare("INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,missing_count,missing_at) SELECT id,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',CASE WHEN rowid%97=0 THEN 1 ELSE 0 END,CASE WHEN rowid%97=0 THEN '2026-10-02T00:00:00Z' END FROM hotels WHERE 1 ON CONFLICT DO NOTHING").run();
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all()).results.map(r=>r.name);
 report.tables=Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n])));
 await call(runtime,START,'/api/crawl?provider=jalan&kind=list&limit=1');
 await runtime.dispose();
 const dirs={old:join(temp,'db-old'),current:join(temp,'db-current')};
 cpSync(base,dirs.old,{recursive:true});cpSync(base,dirs.current,{recursive:true});
 runtime=start('current',dirs.current);await migrate(await runtime.getD1Database('DB'),oldSchema,'9999');await runtime.dispose();
 // The steps: every collector page kind (claim, then save with the lease
 // token), failures, the run's end, public reads and keyed reads.
 const first=parsed(START+60e3),again=parsed(START+3600e3),fresh=freshList(first.jalanList),freshAgain=freshList(again.jalanList);
 const steps=[];let at=START+120e3;
 const tick=()=>(at+=7e3);
 const page=(name,body,provider,phase,lane='priority')=>{
  const token=`00000000-0000-4000-8000-${String(steps.length).padStart(12,'0')}`;
  steps.push({name:name+' (job)',job:{url:body.url,provider,kind:phase==='list'?'list':'detail',prefecture:body.observations[0]?.prefecture??null}});
  steps.push({name:name+' (claim)',at:tick(),path:'/api/crawl',init:{method:'POST',body:JSON.stringify({provider,phase,lane,url:body.url,token})}});
  steps.push({name:name+' (save)',at:tick(),path:'/api/crawl',init:{method:'PUT',body:JSON.stringify({...body,claimToken:token})}});
 };
 page('jalan list, new properties',fresh,'jalan','list');
 // Some of its detail jobs wait at a worse priority and without a prefecture,
 // so the save must still lower and fill them (the guarded upsert updates).
 const stale=first.jalanList.links.filter(l=>l.kind==='detail').slice(0,5).map(l=>l.url);
 steps.push({name:'stale detail jobs',sql:["UPDATE crawl_jobs SET priority=99,prefecture=NULL WHERE url IN (SELECT value FROM json_each(?))",JSON.stringify(stale)]});
 page('jalan list, known properties',first.jalanList,'jalan','list');
 page('jalan detail, listed before',first.jalanDetail,'jalan','detail');
 page('trip detail, new property',first.tripDetail,'trip','detail');
 page('jalan detail of a property listed just now',rename(first.jalanDetail,new Map([['jalan-307416','jalan-9000003']])),'jalan','detail');
 page('trip detail, retry',{url:first.tripDetail.url,status:'retry',error:'http_500',observations:[],links:[],retryAfterSeconds:600},'trip','detail');
 page('jalan detail, 404',{url:'https://www.jalan.net/yad9000001/',status:'retry',error:'http_404',observations:[],links:[]},'jalan','detail');
 page('jalan list seen again',again.jalanList,'jalan','list');
 page('jalan list of new properties seen again',freshAgain,'jalan','list');
 steps.push({name:'stale own priority',sql:['UPDATE crawl_jobs SET priority=99 WHERE url=?',again.jalanDetail.url]});
 page('jalan detail refreshed',again.jalanDetail,'jalan','detail');
 page('trip detail refreshed',again.tripDetail,'trip','detail');
 for(const [provider,phase] of [['jalan','detail'],['jalan','baths'],['trip','detail'],['jalan','refresh'],['trip','refresh'],['jalan','list'],['trip','list'],['trip','names']])for(const lane of ['priority','national'])steps.push({name:`claim ${provider} ${phase} ${lane}`,release:true,at:tick(),path:'/api/crawl',init:{method:'POST',body:JSON.stringify({provider,phase,lane,token:`00000000-0000-4000-9000-${String(steps.length).padStart(12,'0')}`})}});
 for(const [name,path] of [['run end (queue GET, full count)','/api/crawl?provider=jalan&kind=list&limit=1'],['queue GET trip detail','/api/crawl?provider=trip&kind=detail&limit=10'],['queue GET names','/api/crawl?provider=trip&kind=detail&limit=10&names=1'],['queue GET baths','/api/crawl?provider=jalan&kind=detail&limit=10&baths=1'],['health report','/api/crawl?report=1'],['collection status','/api/collection-status'],['detail','/api/hotels/jalan-307416'],['detail, new property','/api/hotels/jalan-9000000'],['comparison','/api/hotel-comparison?ids=jalan-307416,trip-704264,jalan-9000003'],['photo credits','/api/photo-credits'],['lifecycle review','/api/hotel-lifecycle'],['catalog export manifest','/api/catalog-export'],...['hotels','hotel_names','crawl_jobs','hotel_lifecycle','catalog_meta'].map(t=>['catalog export '+t,'/api/catalog-export?table='+t+'&limit=250'])])steps.push({name,at:tick(),path});
 const results={};
 for(const name of ['old','current']){
  const rt=start(name,dirs[name]),d=await rt.getD1Database('DB');results[name]=[];
  try{
   for(const s of steps){
    if(s.sql){await d.prepare(s.sql[0]).bind(...s.sql.slice(1)).run();continue}
    if(s.job){await d.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,?,?,?,'pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',next_at=0,lease_token=NULL,lease_until=0,last_token=NULL").bind(s.job.url,s.job.provider,s.job.kind,s.job.prefecture).run();continue}
    // Each claim below finds its provider free: no lease and no pacing wait.
    if(s.release||s.name.endsWith('(claim)')){await d.prepare('UPDATE crawl_jobs SET lease_until=0 WHERE lease_until>0 AND lease_token IS NOT NULL').run();await d.prepare("DELETE FROM catalog_meta WHERE key LIKE 'crawl-provider-ready:%'").run()}
    results[name].push({name:s.name,...await call(rt,s.at,s.path,s.init)});
   }
   if(control&&name==='current')await d.prepare('UPDATE crawl_jobs SET attempts=attempts+1 WHERE rowid=(SELECT MIN(rowid) FROM crawl_jobs)').run();
   const dump={};for(const t of tables)dump[t]=(await d.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results;
   results[name+'Tables']=dump;
   results[name+'Snapshot']=await buildSnapshot({db:d,out:join(temp,'snapshot-'+name),now:new Date(at)});
  }finally{await rt.dispose()}
 }
 const failures=[];
 results.old.forEach((a,i)=>{
  const b=results.current[i];
  if(a.status!==b.status||!isDeepStrictEqual(a.body,b.body))failures.push(`${a.name}: response differs (${a.status} ${JSON.stringify(a.body).slice(0,200)} / ${b.status} ${JSON.stringify(b.body).slice(0,200)})`);
  report.steps.push({step:a.name,status:a.status,writtenOld:a.written,writtenCurrent:b.written,readOld:a.read,readCurrent:b.read});
  console.log(`${a.name.padEnd(50)} ${String(a.status).padEnd(4)} written ${String(a.written).padStart(4)} -> ${String(b.written).padStart(4)}, read ${a.read} -> ${b.read}`);
 });
 // The steps did what they are meant to: saved pages, at the clock given,
 // and the guarded updates still changed the jobs that needed it.
 assert(results.old.filter(r=>r.name.endsWith('(save)')).every(r=>r.status===200),'every save answered 200');
 const jobs=new Map(results.oldTables.crawl_jobs.map(j=>[j.url,j])),saved=steps.find(s=>s.name==='jalan list of new properties seen again (save)');
 assert.equal(jobs.get(fresh.url).fetched_at,new Date(saved.at).toISOString(),'the fixed clock reached the Worker');
 for(const url of stale)assert(jobs.get(url).priority<99&&jobs.get(url).prefecture==='pref-tokyo',url+' was not lowered and filled');
 assert(jobs.get(again.jalanDetail.url).priority<99,'own priority was not restored');
 for(const t of tables){
  const a=results.oldTables[t],b=results.currentTables[t];
  if(!isDeepStrictEqual(a,b)){const i=a.findIndex((r,k)=>!isDeepStrictEqual(r,b[k]));failures.push(`${t}: stored rows differ (${a.length} / ${b.length} rows, first at ${i}: ${JSON.stringify(a[i]).slice(0,200)} / ${JSON.stringify(b[i]).slice(0,200)})`)}
 }
 if(results.oldSnapshot.manifest.id!==results.currentSnapshot.manifest.id)failures.push(`snapshot differs: ${results.oldSnapshot.manifest.id} / ${results.currentSnapshot.manifest.id}`);
 const sum=(k,f='written')=>results[k].reduce((n,r)=>n+r[f],0);
 report.tables=Object.fromEntries(tables.map(t=>[t,{start:report.tables[t],end:results.currentTables[t].length}]));
 report.snapshot={id:results.currentSnapshot.manifest.id,hotels:results.currentSnapshot.manifest.hotels,rowsReadOld:results.oldSnapshot.rowsRead,rowsReadCurrent:results.currentSnapshot.rowsRead};
 report.written={old:sum('old'),current:sum('current')};report.read={old:sum('old','read'),current:sum('current','read')};report.failures=failures;
 console.log(`rows written ${report.written.old} -> ${report.written.current}, read ${report.read.old} -> ${report.read.current}; snapshot ${report.snapshot.id} (${report.snapshot.hotels} hotels, rows read ${report.snapshot.rowsReadOld} -> ${report.snapshot.rowsReadCurrent})`);
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 console.log(failures.length?`Write build comparison FAIL ${failures.length}: ${failures.join('; ')}`:`Write build comparison PASS: ${steps.filter(s=>s.path).length} requests, ${tables.length} tables and the search snapshot identical`);
 if(failures.length)process.exitCode=1;
}finally{rmSync(temp,{recursive:true,force:true})}
