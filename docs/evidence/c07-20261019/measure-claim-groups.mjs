// C07 follow-up (eighteenth parent session, 2026-11-03T00:40Z): which claim group reads
// the rows of a gentle run now. One gentle run of 120 pages by this checkout's collector
// against a temporary D1 shaped like production on each date below; rows read per claim
// group as Miniflare reports them. Built from measure-claim-rounds.mjs (plan 1) with one
// collector and the shapes as arguments. Never touches the production database.
// Usage (repository root, after a build):
//   node docs/evidence/c07-20261019/measure-claim-groups.mjs [--out report.json]
// Shapes, detail jobs by provider and status, from the public snapshot e78482d0cc7ddfcf
// (status.json providers and its 30-day trend, fetched 2026-11-03T00:4xZ):
//   A 10-21  Jalan done 2,427, pending 21,241; Trip.com done 2,058, pending 108
//   B 10-28  Jalan done 5,516, pending 18,286; Trip.com done 2,232, pending 1
//   C 11-02  Jalan done 7,802, pending 16,194; Trip.com done 2,278, pending 0
//   B2       B with 25 done Jalan hotels whose bath data is not v3, spread evenly over
//            the claim order (11-02: 36 of 7,802 done Jalan pages had no bath data,
//            7,802 - 7,686 filled - 80 none).
// List and locale list jobs, due refresh pages (3 Jalan, 5 Trip.com) and the clock are
// plan 1's.
//
// Verdict rules, written and committed before the first run (counting-discipline,
// harness 067575b). The last line printed is "VERDICT <R0> <R1> <R2> <R3> <R4>".
// R0 calibration: in shape A, the Trip.com detail claims that gave a page read between
//    600 and 2,400 rows each on average (C04, 10-19: 1,199 at 25,256 hotels). Outside
//    that: ERROR, and R1-R4 are not read.
// R1 in shape B, the jalan/baths claims read at least half of the rows all claims read:
//    BATHS_DOMINANT; otherwise BATHS_MINOR.
// R2 rows per jalan/baths claim, shape C over shape A (done Jalan pages 3.2 times):
//    2.0 or more GROWS, 1.2 or less FLAT, otherwise PARTLY.
// R3 rows all claims read per page saved in shape B, against the 10-28 production span
//    (4,284.5 rows per page, day-measure.py): half or more MOSTLY, otherwise PARTLY.
// R4 rows per jalan/baths claim, shape B2 over shape B: 0.5 or less CANDIDATE_SENSITIVE
//    (the answer depends on where production's few candidates sit), otherwise
//    CANDIDATE_ROBUST.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
const PAGES='120',out=arg('--out',null);
const here=dirname(fileURLToPath(import.meta.url));
const KEY='c07-measure-only-key',START=Date.parse('2026-10-19T12:00:00Z'),DAY=86400e3;
// List and locale list jobs as plan 1 estimated them (not public).
const LISTS={'jalan list done':4100,'trip list done':1300,'jalan names done':250,'jalan names pending':250};
const SHAPES={
 A:{'jalan detail done':2427,'jalan detail pending':21241,'trip detail done':2058,'trip detail pending':108},
 B:{'jalan detail done':5516,'jalan detail pending':18286,'trip detail done':2232,'trip detail pending':1},
 C:{'jalan detail done':7802,'jalan detail pending':16194,'trip detail done':2278,'trip detail pending':0},
 B2:{'jalan detail done':5516,'jalan detail pending':18286,'trip detail done':2232,'trip detail pending':1,candidates:25},
};
const DUE={jalan:3,trip:5};
const PRODUCTION_SPAN=4284.5;
const temp=mkdtempSync(join(tmpdir(),'yukemuri-c07-groups-'));
const server=join(temp,'server');cpSync('dist/server',server,{recursive:true});
// Test-only entry: the clock the request names (X-Compare-Now) and the rows each request read and wrote.
writeFileSync(join(server,'__c07.js'),`import app from './index.js';
import {env} from 'cloudflare:workers';
const RealDate=Date;let clock=0;
class FixedDate extends RealDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}}
globalThis.Date=FixedDate;
let requests=[],current=null,wrapped=false;
const count=(meta,sql)=>{if(current){current.read+=meta?.rows_read??0;current.written+=meta?.rows_written??0;current.statements.push([sql.replace(/\\s+/g,' ').slice(0,60),meta?.rows_read??0])}};
const statement=(inner,sql)=>({__inner:inner,__sql:sql,bind:(...a)=>statement(inner.bind(...a),sql),all:async()=>{const r=await inner.all();count(r.meta,sql);return r},run:async()=>{const r=await inner.run();count(r.meta,sql);return r},first:async c=>{const r=await inner.all();count(r.meta,sql);const row=r.results[0]??null;return c===undefined?row:row?(row[c]??null):null},raw:async()=>{throw new Error('raw() is not counted')}});
function wrap(){if(wrapped)return;wrapped=true;const db=env.DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db);db.prepare=sql=>statement(prepare(sql),sql);db.batch=async list=>{const r=await batch(list.map(s=>s.__inner??s));r.forEach((x,i)=>count(x.meta,list[i].__sql??''));return r}}
export default {async fetch(request,env2,ctx){
 wrap();const url=new URL(request.url);
 if(url.pathname==='/__meter'){const body=JSON.stringify(requests);requests=[];return new Response(body)}
 clock=Number(request.headers.get('X-Compare-Now'))||RealDate.now();
 current={method:request.method,path:url.pathname,read:0,written:0,statements:[]};requests.push(current);
 return app.fetch(request,env2,ctx);
}};
`);
const modules=[{type:'ESModule',path:join(server,'__c07.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__c07.js').map(p=>({type:'ESModule',path:join(server,p)}))];
const start=dir=>new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'c07'},d1Persist:dir,bindings:{CRAWL_ACCESS_KEY:KEY},host:'127.0.0.1',port:0});
const migrate=async db=>{for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run()};
const iso=ms=>new Date(ms).toISOString().replace('.000Z','Z');
const numbers=n=>{assert(n>0,'a target below the checked-in rows');return `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<${n-1})`};
// Rows of one kind of synthetic detail job and its hotel (a list-only row for a pending
// page, a detail row for a done one), copied from a checked-in hotel of that provider.
async function addDetails(db,provider,status,count,first,fetched){
 if(count<=0)return;
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
// Done Jalan detail jobs whose hotel the baths claim would take (BATHS_CANDIDATE's hotel
// half; lib/crawl-queue.ts), to report how many candidates each shape holds.
const candidatesInDone=async db=>(await db.prepare("SELECT COUNT(*) AS n FROM crawl_jobs j JOIN hotels h ON h.id='jalan-'||substr(j.url,26,instr(substr(j.url,26),'/')-1) WHERE j.provider='jalan' AND j.kind='detail' AND j.status='done' AND json_extract(h.payload,'$.links[0].url')=j.url AND json_extract(h.payload,'$.sources[0].bathDataVersion') IS NOT 'v3'").first()).n;
const report={measuredAt:new Date().toISOString(),environment:'Miniflare local D1 in the Claude Code cloud container, fixed clock per request. Not production D1; row counts as Miniflare reports them.',lists:LISTS,due:DUE,shapes:SHAPES,runs:{}};
try{
 const crawler=join(temp,'crawler/scripts/crawler');
 cpSync('scripts/crawler',crawler,{recursive:true});cpSync('data',join(crawler,'../../data'),{recursive:true});
 for(const [name,shape] of Object.entries(SHAPES)){
  const mf=start(join(temp,'db-'+name)),db=await mf.getD1Database('DB');
  try{
   await migrate(db);
   for(let i=0;;i++){const r=await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY,'X-Compare-Now':String(START-DAY)}});assert.equal(r.status,200);if((await r.json()).done)break;assert(i<60)}
   const recent=iso(START-2*DAY);
   await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,next_at=0,error=NULL,fetched_at=? WHERE kind='list' OR status='done'").bind(recent).run();
   await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,next_at=0,error=NULL,fetched_at=? WHERE status IN ('retry','failed')").bind(recent).run();
   const target={...LISTS,...shape},have=await counts(db),need=k=>(target[k]??0)-(have[k]??0);
   await addDetails(db,'jalan','done',need('jalan detail done')-DUE.jalan,2000000,recent);
   await addDetails(db,'jalan','done',DUE.jalan,2900000,iso(START-60*DAY));
   await addDetails(db,'jalan','pending',need('jalan detail pending'),3000000,null);
   await addDetails(db,'trip','done',need('trip detail done')-DUE.trip,4000000,recent);
   await addDetails(db,'trip','done',DUE.trip,4900000,iso(START-60*DAY));
   await addDetails(db,'trip','pending',need('trip detail pending'),5000000,null);
 if(need('jalan list done')>0)await db.prepare(`${numbers(need('jalan list done'))} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.jalan.net/990000/LRG_'||i||'/','jalan','list','pref-kanagawa',10+(i%9)*10,'done',1,0,? FROM n`).bind(recent).run();
 if(need('trip list done')>0)await db.prepare(`${numbers(need('trip list done'))} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.trip.com/hotels/qa'||i||'-hotels-list-'||i||'/','trip','list','pref-kanagawa',10+(i%9)*10,'done',1,0,? FROM n`).bind(recent).run();
 // Locale list pages: kenCd 01-47 and page numbers, both languages; done ones fetched lately.
 for(const status of ['done','pending']){
  const n=need('jalan names '+status),offset=status==='done'?300:400;
  await db.prepare(`${numbers(n)} INSERT OR IGNORE INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.jalan.net/ui/uip1400/uiw1402.do?langCd='||l||'&kenCd='||printf('%02d',1+i%47)||'0000&stayCount=1&roomCount=1&distCd=01&crcyCd='||c||'&activeSort=1&screenId=UIW1402&idx='||(${offset}+1+i/94)||'&pageNum='||(${offset}+1+i/94),'jalan','names',NULL,95,?,?,0,? FROM n,(SELECT 'en_US' AS l,'USD' AS c UNION ALL SELECT 'ko_KR','KRW') WHERE (i/47)%2=(CASE l WHEN 'en_US' THEN 0 ELSE 1 END)`).bind(status,status==='done'?1:0,status==='done'?recent:null).run();
 }
 await db.prepare("INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,missing_count,missing_at) SELECT id,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',0,NULL FROM hotels WHERE 1 ON CONFLICT DO NOTHING").run();
   const run=report.runs[name]={candidatesBefore:await candidatesInDone(db)};
   if(shape.candidates){
    // Spread evenly over the order the priority lane reads done jobs in.
    const done=(await db.prepare("SELECT url FROM crawl_jobs WHERE provider='jalan' AND kind='detail' AND status='done' ORDER BY priority,COALESCE(unixepoch(fetched_at),0),attempts,url").all()).results.map(r=>r.url);
    const step=Math.floor(done.length/shape.candidates),pick=done.filter((_,i)=>i%step===Math.floor(step/2)).slice(0,shape.candidates);
    for(const url of pick)await db.prepare("UPDATE hotels SET payload=json_remove(payload,'$.sources[0].bathDataVersion') WHERE json_extract(payload,'$.links[0].url')=?").bind(url).run();
   }
   run.candidates=await candidatesInDone(db);
   run.shaped=await counts(db);
   run.hotels=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;
   const origin=(await mf.ready).origin,logFile=join(temp,name+'.json');
   await (await fetch(origin+'/__meter')).json();
   execFileSync('python3',[join(here,'drive-collector.py'),crawler,origin,PAGES,String(START),logFile],{stdio:['ignore','inherit','inherit']});
   const log=JSON.parse(readFileSync(logFile,'utf8')),meter=await (await fetch(origin+'/__meter')).json();
   const claimRows=meter.filter(r=>r.method==='POST'&&r.path==='/api/crawl');
   assert.equal(claimRows.length,log.claims.length,'every claim was metered');
   const claims=log.claims.map((c,i)=>({...c,read:claimRows[i].read,statements:claimRows[i].statements}));
   const groups={};
   for(const c of claims){const e=groups[c.provider+'/'+c.phase]??={claims:0,pages:0,emptyClaims:0,read:0,pageRead:0};e.claims++;e.read+=c.read;if(c.url){e.pages++;e.pageRead+=c.read}else e.emptyClaims++}
   for(const e of Object.values(groups)){e.perClaim=Math.round(e.read/e.claims);e.perPageClaim=e.pages?Math.round(e.pageRead/e.pages):null}
   const requests={};
   for(const m of meter){const k=m.method+' '+(m.path.startsWith('/api/hotels/')?'/api/hotels/<id>':m.path),e=requests[k]??={requests:0,read:0};e.requests++;e.read+=m.read}
   Object.assign(run,{pages:log.saves.length,claims:claims.length,rounds:log.lines.find(l=>'rounds' in l)?.rounds??null,claimRead:claims.reduce((n,c)=>n+c.read,0),groups,requests,
    bathsStatements:claims.find(c=>c.provider==='jalan'&&c.phase==='baths')?.statements??null});
   run.claimReadPerPage=Math.round(run.claimRead/run.pages);
   console.log(`${name}: ${run.pages} pages, ${run.claims} claims, claims read ${run.claimRead} rows (${run.claimReadPerPage} a page); done Jalan candidates ${run.candidates}; hotels ${run.hotels}`);
   for(const [g,e] of Object.entries(groups))console.log(`  ${g}: ${e.claims} claims (${e.pages} pages, ${e.emptyClaims} empty), ${e.read} rows, ${e.perClaim} a claim`);
  }finally{await mf.dispose()}
 }
 const {A,B,C,B2}=report.runs,baths=r=>r.groups['jalan/baths']?.perClaim??0;
 const trip=A.groups['trip/detail']?.perPageClaim;
 const v={R0:trip!=null&&trip>=600&&trip<=2400?'OK':'ERROR'};
 v.R1=(B.groups['jalan/baths']?.read??0)>=B.claimRead/2?'BATHS_DOMINANT':'BATHS_MINOR';
 const growth=baths(A)?baths(C)/baths(A):null;
 v.R2=growth==null?'NONE':growth>=2?'GROWS':growth<=1.2?'FLAT':'PARTLY';
 v.R3=B.claimReadPerPage>=PRODUCTION_SPAN/2?'MOSTLY':'PARTLY';
 const sensitivity=baths(B)?baths(B2)/baths(B):null;
 v.R4=sensitivity==null?'NONE':sensitivity<=0.5?'CANDIDATE_SENSITIVE':'CANDIDATE_ROBUST';
 report.verdicts={...v,tripDetailPageClaim:trip,bathsGrowthCoverA:growth,bathsB2overB:sensitivity,bathsShareB:(B.groups['jalan/baths']?.read??0)/B.claimRead,claimReadPerPageB:B.claimReadPerPage};
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 console.log(`VERDICT ${v.R0} ${v.R1} ${v.R2} ${v.R3} ${v.R4}`);
}finally{rmSync(temp,{recursive:true,force:true})}
