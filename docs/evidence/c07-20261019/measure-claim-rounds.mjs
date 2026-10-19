// C07 plan 1: one gentle run of 120 pages by the collector on main and by this branch,
// each against its own copy of one temporary D1 shaped like production on 2026-10-19
// (public snapshot b3d3b67da3da916a; list and names job counts are estimates). The
// built Worker (dist) is the same for both; only scripts/crawler/update-site.py differs.
// A fixed clock per request and claim tokens derived from the pages saved
// (drive-collector.py) make the stored rows comparable: the pages, every save
// response and every table must come out identical, and only the claims (and the
// rows they read) may differ. Never touches the production database.
// Usage (repository root, after a build): node docs/evidence/c07-20261019/measure-claim-rounds.mjs
//   [--old-ref origin/main] [--pages 120] [--lists 4100,1300] [--due 3,5] [--out report.json] [--control]
//  --lists    Jalan and Trip.com list jobs (done); 499,49 keeps only the checked-in ones
//  --due      Jalan and Trip.com detail pages due for refresh at the start of the run
//  --control  this branch's collector also skips the group it asks when 7 pages are done
//             (a group that just gave a page): the comparison must fail
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),arg=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
const oldRef=arg('--old-ref','origin/main'),PAGES=arg('--pages','120'),out=arg('--out',null),control=argv.includes('--control');
const [listsJalan,listsTrip]=arg('--lists','4100,1300').split(',').map(Number),[dueJalan,dueTrip]=arg('--due','3,5').split(',').map(Number);
const here=dirname(fileURLToPath(import.meta.url));
const KEY='c07-measure-only-key',START=Date.parse('2026-10-19T12:00:00Z'),DAY=86400e3;
// Production on 2026-10-19T11:32Z (public status.json of snapshot b3d3b67da3da916a): queue
// detail jobs by status and hotels. List and names jobs are not public: estimated from
// the ratio of the checked-in queue (data/crawl-jobs.json, 499 Jalan and 49 Trip.com
// list jobs for 2,876 and 81 detail jobs) and D07 (about 250 locale list pages a language).
const TARGET={jobs:{'jalan detail done':1907,'jalan detail pending':21679,'trip detail done':1707,'trip detail pending':456,'trip detail failed':1,
 'jalan list done':listsJalan,'trip list done':listsTrip,'jalan names done':250,'jalan names pending':250},hotels:25225};
// Due refresh pages. 3,5: the refresh groups give pages in the first rounds and then run
// empty, as in run 39242973283 (11:12Z); 20,20: they give a page every round, as in
// run 39234821810 (10:04Z).
const DUE={jalan:dueJalan,trip:dueTrip};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-c07-claims-'));
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
const report={measuredAt:new Date().toISOString(),oldRef,environment:'Miniflare local D1 in the Claude Code cloud container, fixed clock per request. Not production D1; row counts as Miniflare reports them.',target:TARGET,due:DUE};
let failures=[];
try{
 // The collectors: main's update-site.py beside this branch's other crawler files, and this branch's.
 const crawlers={old:join(temp,'old/scripts/crawler'),new:join(temp,'new/scripts/crawler')};
 for(const [name,dir] of Object.entries(crawlers)){cpSync('scripts/crawler',dir,{recursive:true});cpSync('data',join(dir,'../../data'),{recursive:true})}
 writeFileSync(join(crawlers.old,'update-site.py'),execFileSync('git',['show',`${oldRef}:scripts/crawler/update-site.py`],{encoding:'utf8'}));
 if(control){const p=join(crawlers.new,'update-site.py'),s=readFileSync(p,'utf8'),line='  if args.gentle and not batch:\n';assert.equal(s.split(line).length,2,'control line');writeFileSync(p,s.replace(line,'  if args.gentle and (not batch or completed==7):\n'))}
 report.collectors={old:oldRef,new:control?'this branch, with the control change':'this branch'};
 // The base D1: migrations, the checked-in catalogue and queue, then production's shape.
 const base=join(temp,'base');let mf=start(base);const db=await mf.getD1Database('DB');
 await migrate(db);
 for(let i=0;;i++){const r=await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY,'X-Compare-Now':String(START-DAY)}});assert.equal(r.status,200);if((await r.json()).done)break;assert(i<60)}
 report.seeded=await counts(db);
 // Lists are all done in production (no list pages in the 10-19 runs): finish the
 // checked-in ones; nothing below is due before the run except the DUE pages.
 const recent=iso(START-2*DAY);
 await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,next_at=0,error=NULL,fetched_at=? WHERE kind='list' OR status='done'").bind(recent).run();
 await db.prepare("UPDATE crawl_jobs SET status='done',attempts=1,next_at=0,error=NULL,fetched_at=? WHERE status IN ('retry','failed')").bind(recent).run();
 const have=await counts(db),need=k=>TARGET.jobs[k]-(have[k]??0);
 await addDetails(db,'jalan','done',need('jalan detail done')-DUE.jalan,2000000,recent);
 await addDetails(db,'jalan','done',DUE.jalan,2900000,iso(START-60*DAY));
 await addDetails(db,'jalan','pending',need('jalan detail pending'),3000000,null);
 await addDetails(db,'trip','done',need('trip detail done')-DUE.trip,4000000,recent);
 await addDetails(db,'trip','done',DUE.trip,4900000,iso(START-60*DAY));
 await addDetails(db,'trip','pending',need('trip detail pending'),5000000,null);
 await addDetails(db,'trip','failed',need('trip detail failed'),5900000,recent);
 if(need('jalan list done')>0)await db.prepare(`${numbers(need('jalan list done'))} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.jalan.net/990000/LRG_'||i||'/','jalan','list','pref-kanagawa',10+(i%9)*10,'done',1,0,? FROM n`).bind(recent).run();
 if(need('trip list done')>0)await db.prepare(`${numbers(need('trip list done'))} INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.trip.com/hotels/qa'||i||'-hotels-list-'||i||'/','trip','list','pref-kanagawa',10+(i%9)*10,'done',1,0,? FROM n`).bind(recent).run();
 // Locale list pages: kenCd 01-47 and page numbers, both languages; done ones fetched lately.
 for(const status of ['done','pending']){
  const n=need('jalan names '+status),offset=status==='done'?300:400;
  await db.prepare(`${numbers(n)} INSERT OR IGNORE INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,fetched_at) SELECT 'https://www.jalan.net/ui/uip1400/uiw1402.do?langCd='||l||'&kenCd='||printf('%02d',1+i%47)||'0000&stayCount=1&roomCount=1&distCd=01&crcyCd='||c||'&activeSort=1&screenId=UIW1402&idx='||(${offset}+1+i/94)||'&pageNum='||(${offset}+1+i/94),'jalan','names',NULL,95,?,?,0,? FROM n,(SELECT 'en_US' AS l,'USD' AS c UNION ALL SELECT 'ko_KR','KRW') WHERE (i/47)%2=(CASE l WHEN 'en_US' THEN 0 ELSE 1 END)`).bind(status,status==='done'?1:0,status==='done'?recent:null).run();
 }
 await db.prepare("INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,missing_count,missing_at) SELECT id,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z',0,NULL FROM hotels WHERE 1 ON CONFLICT DO NOTHING").run();
 report.shaped={jobs:await counts(db),hotels:(await db.prepare("SELECT substr(id,1,instr(id,'-')-1) AS p,COUNT(*) AS n FROM hotels GROUP BY 1").all()).results};
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all()).results.map(r=>r.name);
 await mf.dispose();
 const runs={};
 for(const name of ['old','new']){
  const dir=join(temp,'db-'+name);cpSync(base,dir,{recursive:true});
  mf=start(dir);const origin=(await mf.ready).origin,logFile=join(temp,name+'.json');
  try{
   execFileSync('python3',[join(here,'drive-collector.py'),crawlers[name],origin,PAGES,String(START),logFile],{stdio:['ignore','inherit','inherit']});
   const log=JSON.parse(readFileSync(logFile,'utf8')),meter=await (await fetch(origin+'/__meter')).json();
   const claimRows=meter.filter(r=>r.method==='POST'&&r.path==='/api/crawl');
   assert.equal(claimRows.length,log.claims.length,'every claim was metered');
   const d=await mf.getD1Database('DB'),dump={};
   for(const t of tables)dump[t]=(await d.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results;
   runs[name]={log,claims:log.claims.map((c,i)=>({...c,read:claimRows[i].read,written:claimRows[i].written,statements:claimRows[i].statements})),meter,dump};
  }finally{await mf.dispose()}
 }
 const [a,b]=[runs.old,runs.new];
 const pages=r=>r.log.saves.map(s=>s.url);
 if(!isDeepStrictEqual(pages(a),pages(b)))failures.push(`pages differ (${pages(a).length} / ${pages(b).length})`);
 if(!isDeepStrictEqual(a.log.saves.map(s=>s.response),b.log.saves.map(s=>s.response)))failures.push('save responses differ');
 const given=r=>r.claims.filter(c=>c.url).map(c=>[c.provider,c.phase,c.lane,c.url]);
 if(!isDeepStrictEqual(given(a),given(b)))failures.push('the claims that gave a page differ');
 for(const t of tables)if(!isDeepStrictEqual(a.dump[t],b.dump[t])){const i=a.dump[t].findIndex((r,k)=>!isDeepStrictEqual(r,b.dump[t][k]));failures.push(`${t}: stored rows differ (${a.dump[t].length} / ${b.dump[t].length}, first at ${i})`)}
 const sum=(rows,f='read')=>rows.reduce((n,r)=>n+r[f],0);
 const byGroup=r=>{const g={};for(const c of r.claims){const k=c.provider+'/'+c.phase,e=g[k]??={claims:0,pages:0,emptyClaims:0,read:0,emptyRead:0};e.claims++;e.read+=c.read;if(c.url)e.pages++;else{e.emptyClaims++;e.emptyRead+=c.read}}return g};
 const kinds=r=>{const k={};for(const m of r.meter){const key=m.method+' '+(m.path.startsWith('/api/hotels/')?'/api/hotels/<id>':m.path);const e=k[key]??={requests:0,read:0,written:0};e.requests++;e.read+=m.read;e.written+=m.written}return k};
 for(const [name,r] of Object.entries(runs))report[name]={pages:r.log.saves.length,claims:r.claims.length,rounds:r.log.lines.find(l=>'rounds' in l)?.rounds??null,claimRead:sum(r.claims),claimWritten:sum(r.claims,'written'),emptyClaimWritten:sum(r.claims.filter(c=>!c.url),'written'),requests:kinds(r),groups:byGroup(r),emptyGroups:r.log.lines.filter(l=>l.emptyGroup)};
 // One claim of each group and outcome on main's run, statement by statement: where the rows are read.
 report.statements={};for(const c of runs.old.claims){const k=`${c.provider}/${c.phase} ${c.lane} ${c.url?'page':'empty'}`;report.statements[k]??=c.statements}
 report.saved={claimRead:report.old.claimRead-report.new.claimRead,claims:report.old.claims-report.new.claims};
 report.failures=failures;
 for(const name of ['old','new']){const r=report[name];console.log(`${name}: ${r.pages} pages, ${r.claims} claims (${r.rounds??'-'} rounds), claims read ${r.claimRead} rows, wrote ${r.claimWritten} (empty claims wrote ${r.emptyClaimWritten})`);for(const [g,e] of Object.entries(r.groups))console.log(`  ${g.padEnd(17)} claims ${String(e.claims).padStart(3)} pages ${String(e.pages).padStart(3)} read ${String(e.read).padStart(7)} (empty ${e.emptyClaims} claims, ${e.emptyRead} rows)`)}
 console.log(`claims ${report.old.claims} -> ${report.new.claims}, rows read by claims ${report.old.claimRead} -> ${report.new.claimRead} (${report.saved.claimRead} fewer)`);
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 console.log(failures.length?`Claim rounds comparison FAIL ${failures.length}: ${failures.join('; ')}`:`Claim rounds comparison PASS: ${report.new.pages} pages, every save response and ${tables.length} tables identical`);
 if(failures.length)process.exitCode=1;
}finally{rmSync(temp,{recursive:true,force:true})}
