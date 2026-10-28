// C07 plan 2, parent condition 1 (10-19T13:28Z): the count the collector's queue GET made
// at the end of a run, against the count the snapshot deploy after the run makes now. On two
// copies of one temporary D1 shaped like production on 2026-10-19 (the shape of
// measure-claim-rounds.mjs, with reviewed pairs merged as D08 PR 6 shows them), the old flow
// (the old build's GET at the end of the run, then the old snapshot build) and the new one
// (this branch's build with the day the collection finished, then its record-coverage POST)
// must leave every table, the trend row, the stored aggregate and the record counter, and
// the snapshot identical. Fixed clocks: the run ends at --end, the build reads at --build.
// Never touches the production database.
// Usage (repository root, after a build of this branch):
//   node docs/evidence/c07-20261019/compare-progress.mjs <old build dist> <old ref> [--end iso] [--build iso] [--out file] [--control date|kept]
//  --control date  the new flow dates the count by the build's clock (as if collect.yml passed no day)
//  --control kept  the new build counts only the records a card shows (merged records left out)
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync,symlinkSync,existsSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
import {buildSnapshot} from '../../../scripts/build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),[oldDist,oldRef]=argv,arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
if(!oldDist||!oldRef)throw new Error('Usage: compare-progress.mjs <old build dist> <old ref> [--end iso] [--build iso] [--out file] [--control date|kept]');
const END=Date.parse(arg('--end','2026-10-19T21:20:00Z')),BUILD=Date.parse(arg('--build',new Date(END+9*60e3).toISOString())),out=arg('--out',null),control=arg('--control',null);
assert(Number.isFinite(END)&&Number.isFinite(BUILD)&&BUILD>END,'--build after --end');
assert([null,'date','kept'].includes(control),'--control date|kept');
const KEY='c07-progress-only',DAY=86400e3,START=END-20*60e3,day=ms=>new Date(ms).toISOString().slice(0,10);
// Production on 2026-10-19T11:32Z (as measure-claim-rounds.mjs): detail jobs by status and hotels;
// list and names jobs estimated. 47 reviewed pairs were merged (D08 PR 6, 10-19T19:43Z), so the
// run ends after it by default.
const TARGET={jobs:{'jalan detail done':1907,'jalan detail pending':21679,'trip detail done':1707,'trip detail pending':456,'trip detail failed':1,
 'jalan list done':4100,'trip list done':1300,'jalan names done':250,'jalan names pending':250},hotels:25225,merged:47};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-c07-progress-'));
// Test-only entry per build: the clock the request names (X-Compare-Now) and the rows each request read and wrote.
const serverOf=(dist,name)=>{
 const server=join(temp,name);cpSync(resolve(dist,'server'),server,{recursive:true});
 writeFileSync(join(server,'__c07.js'),`import app from './index.js';
import {env} from 'cloudflare:workers';
const RealDate=Date;let clock=0;
class FixedDate extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}}
globalThis.Date=FixedDate;
let requests=[],current=null,wrapped=false;
const count=(meta)=>{if(current){current.read+=meta?.rows_read??0;current.written+=meta?.rows_written??0}};
const statement=(inner)=>({__inner:inner,bind:(...a)=>statement(inner.bind(...a)),all:async()=>{const r=await inner.all();count(r.meta);return r},run:async()=>{const r=await inner.run();count(r.meta);return r},first:async c=>{const r=await inner.all();count(r.meta);const row=r.results[0]??null;return c===undefined?row:row?(row[c]??null):null},raw:async()=>{throw new Error('raw() is not counted')}});
function wrap(){if(wrapped)return;wrapped=true;const db=env.DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db);db.prepare=sql=>statement(prepare(sql));db.batch=async list=>{const r=await batch(list.map(s=>s.__inner??s));r.forEach(x=>count(x.meta));return r}}
export default {async fetch(request,env2,ctx){
 wrap();const url=new URL(request.url);
 if(url.pathname==='/__meter'){const body=JSON.stringify(requests);requests=[];return new Response(body)}
 clock=Number(request.headers.get('X-Compare-Now'))||RealDate.now();
 current={method:request.method,path:url.pathname,read:0,written:0};requests.push(current);
 return app.fetch(request,env2,ctx);
}};
`);
 const modules=[{type:'ESModule',path:join(server,'__c07.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__c07.js').map(p=>({type:'ESModule',path:join(server,p)}))];
 return dir=>new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'c07'},d1Persist:dir,bindings:{CRAWL_ACCESS_KEY:KEY}});
};
const call=async(mf,path,at,method='GET',body)=>{
 const r=await mf.dispatchFetch('http://localhost'+path,{method,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY,'X-Compare-Now':String(at)},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();assert.equal(r.status,200,path+' '+text.slice(0,300));return JSON.parse(text);
};
const meter=async mf=>JSON.parse(await (await mf.dispatchFetch('http://localhost/__meter')).text());
// A snapshot builder compiled from a source tree (scripts/build-search-snapshot.mjs compileLib, rooted there).
const builderFrom=src=>{
 const outDir=mkdtempSync(join(temp,'lib-'));symlinkSync(realpathSync('node_modules'),join(outDir,'node_modules'));
 const r=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),join(src,'lib/search-snapshot-build.ts'),'--outDir',outDir,'--rootDir',src,'--module','commonjs','--target','es2022','--esModuleInterop','--skipLibCheck','--resolveJsonModule','--moduleResolution','node','--noCheck'],{encoding:'utf8'});
 const compiled=join(outDir,'lib/search-snapshot-build.js');
 if(!existsSync(compiled))throw new Error('compile failed\n'+r.stdout+r.stderr);
 for(const f of readdirSync(join(outDir,'lib'),{recursive:true}).filter(f=>f.endsWith('.js'))){const p=join(outDir,'lib',f),s=readFileSync(p,'utf8');if(s.includes('require("cloudflare:workers")'))writeFileSync(p,s.replaceAll('require("cloudflare:workers")','({get env(){return globalThis.__SNAPSHOT_ENV}})'))}
 return createRequire(import.meta.url)(compiled);
};
// A source tree: this checkout's lib, data and public (with the files cloud-setup.sh restores),
// with every tracked file that differs at ref taken from ref.
const sourceAt=(ref,name)=>{
 const src=join(temp,name);for(const d of ['lib','data','public'])cpSync(d,join(src,d),{recursive:true});
 if(ref)for(const f of execFileSync('git',['diff','--name-only',ref,'--','lib','data','public'],{encoding:'utf8'}).split('\n').filter(Boolean)){
  const there=spawnSync('git',['show',`${ref}:${f}`],{maxBuffer:1<<28});
  if(there.status===0){mkdirSync(dirname(join(src,f)),{recursive:true});writeFileSync(join(src,f),there.stdout)}else rmSync(join(src,f),{force:true});
 }
 return src;
};
const migrate=async db=>{for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run()};
const iso=ms=>new Date(ms).toISOString().replace('.000Z','Z');
const numbers=n=>{assert(n>0,'a target below the checked-in rows');return `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<${n-1})`};
// As measure-claim-rounds.mjs addDetails: a list-only hotel row for a pending page, a detail one for a done page.
async function addDetails(db,provider,status,count,first,fetched){
 const url=provider==='jalan'?`'https://www.jalan.net/yad'||(${first}+i)||'/'`:`'https://www.trip.com/hotels/hakone-hotel-detail-'||(${first}+i)||'/fujiya-hotel/'`;
 const id=`'${provider}-'||(${first}+i)`,done=status==='done';
 const template=(await db.prepare(`SELECT id FROM hotels WHERE id GLOB '${provider}-[0-9]*' ORDER BY id LIMIT 1`).first()).id;
 const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
 const source=provider==='jalan'
  ?(done?`json_set(json_remove(t.payload,'$.sources[0].nameLocaleUrl'),'$.sources[0].label','Jalan 숙소 상세','$.sources[0].url',${url},'$.sources[0].bathDataVersion','v3')`:`json_set(json_remove(t.payload,'$.sources[0].bathDataVersion'),'$.sources[0].label','Jalan 숙소 목록','$.sources[0].url','https://www.jalan.net/990000/LRG_1/')`)
  :(done?`json_set(t.payload,'$.sources[0].label','Trip.com 숙소 상세','$.sources[0].url',${url},'$.sources[0].nameLocaleUrl',replace(${url},'https://www.trip.com/','https://kr.trip.com/'))`:`json_set(json_remove(t.payload,'$.sources[0].nameLocaleUrl'),'$.sources[0].label','Trip.com 숙소 목록','$.sources[0].url','https://www.trip.com/hotels/qa1-hotels-list-1/')`);
 await db.prepare(`${numbers(count)} INSERT INTO hotels (id,${cols.join(',')},payload) SELECT ${id},${cols.map(c=>'t.'+c).join(',')},json_set(${source},'$.id',${id},'$.links[0].url',${url}) FROM n,(SELECT * FROM hotels WHERE id=?) t`).bind(template).run();
 await db.prepare(`${numbers(count)} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT ${url},'${provider}','detail','pref-kanagawa',10+(i%9)*10,'${status}',${status==='failed'?3:done?1:0},${status==='failed'?`${(START+7*DAY)/1000}`:'0'},${status==='failed'?"'http_404'":'NULL'},${done?`'${fetched}'`:'NULL'} FROM n`).run();
}
const counts=async db=>Object.fromEntries((await db.prepare("SELECT provider||' '||kind||' '||status AS k,COUNT(*) AS n FROM crawl_jobs GROUP BY 1 ORDER BY 1").all()).results.map(r=>[r.k,r.n]));
const report={measuredAt:new Date().toISOString(),oldRef,control,end:iso(END),build:iso(BUILD),environment:'Miniflare local D1 in the Claude Code cloud container, fixed clock per request. Not production D1; row counts as Miniflare reports them.',target:TARGET};
const failures=[];
try{
 const startOld=serverOf(oldDist,'old-server'),startNew=serverOf('dist','new-server');
 // The base D1: migrations, the checked-in catalogue and queue, then production's shape.
 const base=join(temp,'base');let mf=startNew(base);const db=await mf.getD1Database('DB');
 await migrate(db);
 for(let i=0;;i++){if((await call(mf,'/api/crawl-prepare',START-DAY,'POST')).done)break;assert(i<60)}
 const recent=iso(START-2*DAY);
 await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,next_at=0,error=NULL,fetched_at=? WHERE kind='list' OR status='done'").bind(recent).run();
 await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,next_at=0,error=NULL,fetched_at=? WHERE status IN ('retry','failed')").bind(recent).run();
 const have=await counts(db),need=k=>TARGET.jobs[k]-(have[k]??0);
 await addDetails(db,'jalan','done',need('jalan detail done'),2000000,recent);
 await addDetails(db,'jalan','pending',need('jalan detail pending'),3000000,null);
 await addDetails(db,'trip','done',need('trip detail done'),4000000,recent);
 await addDetails(db,'trip','pending',need('trip detail pending'),5000000,null);
 await addDetails(db,'trip','failed',need('trip detail failed'),5900000,recent);
 await db.prepare(`${numbers(need('jalan list done'))} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.jalan.net/990000/LRG_'||i||'/','jalan','list','pref-kanagawa',10+(i%9)*10,'done',1,0,? FROM n`).bind(recent).run();
 await db.prepare(`${numbers(need('trip list done'))} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.trip.com/hotels/qa'||i||'-hotels-list-'||i||'/','trip','list','pref-kanagawa',10+(i%9)*10,'done',1,0,? FROM n`).bind(recent).run();
 for(const status of ['done','pending']){
  const n=need('jalan names '+status),offset=status==='done'?300:400;
  await db.prepare(`${numbers(n)} INSERT OR IGNORE INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.jalan.net/ui/uip1400/uiw1402.do?langCd='||l||'&kenCd='||printf('%02d',1+i%47)||'0000&stayCount=1&roomCount=1&distCd=01&crcyCd='||c||'&activeSort=1&screenId=UIW1402&idx='||(${offset}+1+i/94)||'&pageNum='||(${offset}+1+i/94),'jalan','names',NULL,95,?,?,0,? FROM n,(SELECT 'en_US' AS l,'USD' AS c UNION ALL SELECT 'ko_KR','KRW') WHERE (i/47)%2=(CASE l WHEN 'en_US' THEN 0 ELSE 1 END)`).bind(status,status==='done'?1:0,status==='done'?recent:null).run();
 }
 await db.prepare("INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,missing_count,missing_at) SELECT id,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',0,NULL FROM hotels WHERE 1 ON CONFLICT DO NOTHING").run();
 // The 47 reviewed pairs (data/source-groups-reviewed.json): store both records where missing,
 // named and placed as the pair says, and save each pair again through the maintenance API, as a
 // pair is saved once both records are stored (check-search-snapshot-worker.mjs does it with one).
 const templates={jalan:await db.prepare("SELECT * FROM hotels WHERE id GLOB 'jalan-[0-9]*' ORDER BY id LIMIT 1").first(),trip:await db.prepare("SELECT * FROM hotels WHERE id GLOB 'trip-[0-9]*' AND trip_score IS NOT NULL ORDER BY id LIMIT 1").first()};
 const store=async(id,provider,name,place)=>{
  if(await db.prepare('SELECT 1 FROM hotels WHERE id=?').bind(id).first())return;
  const t=templates[provider],h={...JSON.parse(t.payload),id,names:{ko:name,ja:name,en:'Pair '+id},aliases:[],prefecture:place.prefecture,regionId:place.regionId};
  h.ratings=h.ratings.map(r=>({...r,sourceId:id}));h.sources=h.sources.map((s,i)=>i?s:{...s,sourceId:id});
  const row={...t,id,region:place.regionId,prefecture:place.prefecture,name,payload:JSON.stringify(h)},cols=Object.keys(row);
  await db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run();
 };
 const pairs=JSON.parse(readFileSync('data/source-groups-reviewed.json','utf8')).patches.slice(0,TARGET.merged);
 const saves={};
 for(const p of pairs){
  const stored=await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(p.jalanHotelId).first(),place=stored?JSON.parse(stored.payload):{prefecture:templates.jalan.prefecture,regionId:templates.jalan.region};
  await store(p.jalanHotelId,'jalan',p.matchedName,place);await store(p.tripHotelId,'trip',p.matchedName,place);
  // A pair may not be dated after the Worker's clock: saved a minute after it was checked. One
  // the checked-in catalogue contradicts (a record placed elsewhere) is refused and left out.
  const r=await mf.dispatchFetch('http://localhost/api/hotel-source-groups',{method:'PUT',headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY,'X-Compare-Now':String(Date.parse(p.checkedAt)+60e3)},body:JSON.stringify({...p,checkedAt:new Date(Date.parse(p.checkedAt)+1000).toISOString()})});
  saves[r.status]=(saves[r.status]??0)+1;await r.text();
 }
 report.pairSaves=saves;
 report.merged=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_source_groups g WHERE g.hotel_id=g.jalan_hotel_id AND g.trip_hotel_id IN (SELECT id FROM hotels) AND g.hotel_id IN (SELECT id FROM hotels)').first()).n;
 // Earlier runs: the day before and earlier the same day, each ending with the GET.
 await call(mf,'/api/crawl?provider=jalan&kind=list&limit=1',END-DAY);
 await call(mf,'/api/crawl?provider=jalan&kind=list&limit=1',END-60*60e3);
 // This run: saves change the queue and add records; SQL inserts leave the counter behind, so
 // both flows also reset it.
 await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,fetched_at=? WHERE url IN (SELECT url FROM crawl_jobs WHERE provider='jalan' AND kind='detail' AND status='pending' ORDER BY url LIMIT 90)").bind(iso(END-5*60e3)).run();
 await addDetails(db,'trip','pending',30,5800000,null);
 report.shaped={jobs:await counts(db),hotels:(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n,counter:(await db.prepare("SELECT value FROM catalog_meta WHERE key='hotel-records'").first()).value};
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all()).results.map(r=>r.name);
 await mf.dispose();
 const dump=async d=>{const o={};for(const t of tables)o[t]=(await d.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results;return o};
 const runs={};
 // Old: the old build's GET at the end of the run, then the old snapshot build.
 {
  const dir=join(temp,'db-old');cpSync(base,dir,{recursive:true});mf=startOld(dir);
  try{
   await meter(mf);await call(mf,'/api/crawl?provider=jalan&kind=list&limit=1',END);const [get]=await meter(mf);
   const d=await mf.getD1Database('DB'),built=await buildSnapshot({db:d,out:join(temp,'out-old'),now:new Date(BUILD),builder:builderFrom(sourceAt(oldRef,'src-old')),skipReason:'not in this comparison'});
   runs.old={get:{read:get.read,written:get.written},build:{rowsRead:built.rowsRead,queries:built.queries},manifest:built.manifest,dump:await dump(d)};
  }finally{await mf.dispose()}
 }
 // New: this branch's build with the collection day, then its record through the Worker.
 {
  const dir=join(temp,'db-new');cpSync(base,dir,{recursive:true});mf=startNew(dir);
  try{
   const d=await mf.getD1Database('DB'),progressDay=day(control==='date'?BUILD:END);
   let builder;if(control==='kept'){const src=sourceAt(null,'src-kept'),p=join(src,'lib/search-snapshot-build.ts'),s=readFileSync(p,'utf8'),line='  all.records+=rows.length;';assert.equal(s.split(line).length,2,'control line');writeFileSync(p,s.replace(line,'  all.records+=rows.filter(r=>!mergedInto.has(r.id)).length;'));builder=builderFrom(src)}
   const built=await buildSnapshot({db:d,out:join(temp,'out-new'),now:new Date(BUILD),builder,progressDay,skipReason:'not in this comparison'});
   await meter(mf);const stored=await call(mf,'/api/crawl',BUILD+4*60e3,'POST',{action:'record-coverage',...built.progress});const [post]=await meter(mf);
   assert.equal(stored.recorded,true);
   runs.new={record:{read:post.read,written:post.written},build:{rowsRead:built.rowsRead,queries:built.queries},progress:{...built.progress,jobs:built.progress.jobs.length},manifest:built.manifest,dump:await dump(d)};
  }finally{await mf.dispose()}
 }
 const [a,b]=[runs.old,runs.new];
 for(const t of tables)if(!isDeepStrictEqual(a.dump[t],b.dump[t])){
  if(t!=='catalog_meta'){failures.push(`table ${t} differs`);continue}
  const keyed=rows=>new Map(rows.map(r=>[r.key,r.value])),[x,y]=[keyed(a.dump[t]),keyed(b.dump[t])];
  for(const k of new Set([...x.keys(),...y.keys()]))if(x.get(k)!==y.get(k))failures.push(`catalog_meta ${k}: old ${String(x.get(k)).slice(0,160)} / new ${String(y.get(k)).slice(0,160)}`);
 }
 if(a.manifest.id!==b.manifest.id)failures.push(`snapshot ${a.manifest.id} / ${b.manifest.id}`);
 const meta=(r,k)=>r.dump.catalog_meta.find(m=>m.key===k)?.value;
 report.result={
  stored:Object.fromEntries(['hotel-records','coverage-sequence','daily-progress:'+day(END)].map(k=>[k,{old:meta(a,k)??null,new:meta(b,k)??null}])),
  snapshot:{old:a.manifest.id,new:b.manifest.id,hotels:b.manifest.hotels},
  rowsRead:{oldGet:a.get.read,oldBuild:a.build.rowsRead,newBuild:b.build.rowsRead,newRecord:b.record.read,saved:a.get.read+a.build.rowsRead-b.build.rowsRead-b.record.read},
  rowsWritten:{oldGet:a.get.written,newRecord:b.record.written},
  progress:b.progress,failures};
}finally{rmSync(temp,{recursive:true,force:true})}
if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
console.log(JSON.stringify(report.result.rowsRead));
console.log(`${failures.length?'FAIL':'PASS'} ${failures.length} difference(s)${control?' (control '+control+')':''}: tables, trend row, aggregate, counter and snapshot ${report.result.snapshot.old}/${report.result.snapshot.new}, ${report.merged} merged pairs (saves ${JSON.stringify(report.pairSaves)})`);
for(const f of failures.slice(0,8))console.log('  '+f);
process.exitCode=failures.length?1:0;
