// Count the D1 rows one collector page writes, statement by statement (C04),
// against the built Worker and a temporary Miniflare D1. Never touches the
// production database. A page is what a gentle run does for one URL: the claim
// (POST /api/crawl) and the save (PUT /api/crawl) with its lease token. The
// pages are the collector's own parser output for the checked-in fixtures:
// a Jalan list page (30 properties, new to the catalogue), a Jalan detail page
// for one of them, and a Trip.com detail page; then the same three pages again
// with a newer retrieval time (a refresh, or a list seen again).
// Usage: node scripts/measure-d1-writes.mjs [--check] [--out evidence.json] [--dist dir --label commit]
//  --check  fail when a page writes more rows than its C04 upper bound
// Row counts come from the meta that Miniflare's D1 returns per statement.
// Whether Miniflare counts rows exactly like production D1 is unverified;
// docs/C04-20261019.md compares them with the production runs of 2026-10-17.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,execSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),arg=k=>argv.includes(k)?argv[argv.indexOf(k)+1]:null;
const out=arg('--out'),dist=arg('--dist')??'dist',label=arg('--label'),check=argv.includes('--check');
const KEY='measure-d1-only';
// The collector's parser on the fixtures, as update-site.py builds a PUT body.
const pages=at=>JSON.parse(execFileSync('python3',['-c',`
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
`,at],{encoding:'utf8'}));
const temp=mkdtempSync(join(tmpdir(),'yukemuri-d1-writes-'));
// The same test-only wrapper as measure-d1-reads.mjs, keeping each statement.
const server=join(temp,'server');cpSync(resolve(dist,'server'),server,{recursive:true});
writeFileSync(join(server,'__d1meter.js'),`import app from './index.js';
import {env} from 'cloudflare:workers';
let statements=[],wrapped=false;
const count=(meta,sql)=>statements.push({sql:sql.replace(/\\s+/g,' ').trim(),rowsRead:meta?.rows_read??0,rowsWritten:meta?.rows_written??0});
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
 if(new URL(request.url).pathname==='/__d1meter'){const body=JSON.stringify(statements);statements=[];return new Response(body)}
 return app.fetch(request,env2,ctx);
}};
`);
const modules=[{type:'ESModule',path:join(server,'__d1meter.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__d1meter.js').map(p=>({type:'ESModule',path:join(server,p)}))];
const runtime=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'d1-writes'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const call=async(path,init={})=>{
 await runtime.dispatchFetch('http://localhost/__d1meter');
 const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY}});
 const body=await r.json();
 assert.equal(r.status,200,path+' '+JSON.stringify(body).slice(0,300));
 return{body,statements:await (await runtime.dispatchFetch('http://localhost/__d1meter')).json()};
};
// The statement's own words, without the values, so equal statements add up.
const shape=sql=>sql.replace(/'[^']*'/g,"'…'").slice(0,140);
const report={measuredAt:new Date().toISOString(),...(label?{build:label}:{gitHead:execSync('git rev-parse --short HEAD').toString().trim(),dirty:execSync('git status --porcelain -- lib app build').toString().trim()!==''}),environment:'Miniflare local D1 in the Claude Code cloud container. Not production D1; whether Miniflare counts rows_written like production D1 is unverified.',pages:[]};
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 for(let i=0;;i++){const r=await call('/api/crawl-prepare',{method:'POST'});if(r.body.done)break;assert(i<60,'crawl-prepare did not finish')}
 const page=async(name,body,provider,phase)=>{
  // The job as the queue holds it before the run: pending, never leased.
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,?,?,?,'pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',next_at=0,lease_token=NULL,lease_until=0,last_token=NULL").bind(body.url,provider,phase,body.observations[0].prefecture??null).run();
  await db.prepare("UPDATE catalog_meta SET value='0' WHERE key=?").bind('crawl-provider-ready:'+provider).run();
  const token=crypto.randomUUID(),claim=await call('/api/crawl',{method:'POST',body:JSON.stringify({provider,phase,url:body.url,token})});
  assert.equal(claim.body.jobs[0]?.url,body.url,name+': claimed another job');
  const save=await call('/api/crawl',{method:'PUT',body:JSON.stringify({...body,claimToken:claim.body.jobs[0].lease_token})});
  const steps=[...claim.statements.map(s=>({request:'claim',...s})),...save.statements.map(s=>({request:'save',...s}))];
  const byStatement=new Map();
  for(const s of steps){const k=s.request+' '+shape(s.sql),t=byStatement.get(k)??{statement:k,calls:0,rowsWritten:0,rowsRead:0};t.calls++;t.rowsWritten+=s.rowsWritten;t.rowsRead+=s.rowsRead;byStatement.set(k,t)}
  const row={page:name,url:body.url,observations:body.observations.length,links:body.links.length,accepted:save.body.accepted,rowsWritten:steps.reduce((n,s)=>n+s.rowsWritten,0),rowsRead:steps.reduce((n,s)=>n+s.rowsRead,0),statements:[...byStatement.values()].filter(s=>s.rowsWritten).sort((a,b)=>b.rowsWritten-a.rowsWritten)};
  report.pages.push(row);
  console.log(`${name}: ${row.rowsWritten} rows written, ${row.rowsRead} read (${row.observations} observations, ${row.links} links, ${row.accepted} accepted)`);
  for(const s of row.statements)console.log(`  ${String(s.rowsWritten).padStart(5)} ${String(s.calls).padStart(3)}x ${s.statement}`);
 };
 const first=pages(new Date().toISOString());
 // The fixture's properties are in the checked-in catalogue, so the first list
 // page here is one of known properties. Production list pages mostly find new
 // ones (2026-10-17: about 23 of 26 a page); the same page under unused ids
 // measures that, its detail links new to the queue too.
 const fresh=(()=>{
  const ids=new Map(first.jalanList.observations.map((h,i)=>[h.id,'jalan-'+(9000000+i)])),url=id=>'https://www.jalan.net/yad'+id.slice(6)+'/';
  const swap=v=>typeof v==='string'?ids.get(v)??(v.startsWith('https://www.jalan.net/yad')&&ids.has('jalan-'+v.slice(25,-1))?url(ids.get('jalan-'+v.slice(25,-1))):v):Array.isArray(v)?v.map(swap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,swap(x)])):v;
  return{...first.jalanList,url:'https://www.jalan.net/130000/LRG_137100/page2.html',observations:swap(first.jalanList.observations).map(h=>({...h,sources:h.sources.map(s=>({...s,url:'https://www.jalan.net/130000/LRG_137100/page2.html'}))})),links:swap(first.jalanList.links)};
 })();
 await page('jalan list (new properties)',fresh,'jalan','list');
 await page('jalan list (known properties)',first.jalanList,'jalan','list');
 await page('jalan detail (listed before)',first.jalanDetail,'jalan','detail');
 await page('trip detail (new property)',first.tripDetail,'trip','detail');
 const again=pages(new Date(Date.now()+60e3).toISOString());
 await page('jalan list (seen again)',again.jalanList,'jalan','list');
 await page('jalan detail (refresh)',again.jalanDetail,'jalan','detail');
 await page('trip detail (refresh)',again.tripDetail,'trip','detail');
 if(check){
  // C04 (2026-10-18): a new property costs its hotel row, name rows, lifecycle
  // row and detail job with their remaining indexes (11 rows); a property seen
  // again its row updates; a detail page about 11 rows. Before C04 these pages
  // wrote 598, 315, 21, 36, 285, 21 and 21 rows.
  const caps={'jalan list (new properties)':12,'jalan list (known properties)':4,'jalan list (seen again)':3};
  const failures=report.pages.flatMap(p=>{const max=caps[p.page]?caps[p.page]*p.observations:p.page.startsWith('trip detail (new')?30:12;return p.rowsWritten>max?[`${p.page}: ${p.rowsWritten} rows written > ${max}`]:[]});
  console.log(failures.length?'D1 write bounds FAIL '+failures.length+': '+failures.join('; '):`D1 write bounds PASS (${report.pages.length} pages)`);
  if(failures.length)process.exitCode=1;
 }
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
