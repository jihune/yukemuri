// L01 PR 3: rows written when the collector refetches a Trip.com hotel whose
// stored label was the prefecture display name '가나가와 · 하코네' and now gets
// '가나가와', against a refetch that keeps its label. Built Worker (dist/) and a
// temporary Miniflare D1; never touches the production database. Run from the
// repo root after a build: node docs/evidence/l01-labels-20261015/measure-writes.mjs
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='measure-l01-only';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-l01-writes-'));
const server=join(temp,'server');cpSync(resolve('dist/server'),server,{recursive:true});
// Same meter as scripts/measure-d1-reads.mjs.
writeFileSync(join(server,'__d1meter.js'),readFileSync('scripts/measure-d1-reads.mjs','utf8').match(/writeFileSync\(join\(server,'__d1meter\.js'\),`([\s\S]*?)`\);/)[1].replaceAll('\\\\','\\'));
const modules=[{type:'ESModule',path:join(server,'__d1meter.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__d1meter.js').map(p=>({type:'ESModule',path:join(server,p)}))];
const runtime=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'l01'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const call=async(path,init={},expected=200)=>{
 await runtime.dispatchFetch('http://localhost/__d1meter');
 const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY}});
 const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body).slice(0,300));
 return{body,meter:await (await runtime.dispatchFetch('http://localhost/__d1meter')).json()};
};
const parse=(ident,at,label)=>{
 const h=JSON.parse(execFileSync('python3',['-c',`
import json,sys
sys.path.insert(0,'scripts/crawler')
from collect import parse_source_page
raw=open('scripts/crawler/fixtures/trip-detail-years.html',encoding='utf-8').read().replace('10019167',sys.argv[1])
print(json.dumps(parse_source_page(raw,'trip','https://www.trip.com/hotels/yokohama-hotel-detail-'+sys.argv[1]+'/x/',sys.argv[2],'pref-kanagawa','detail')[0][0],ensure_ascii=False))`,ident,at],{encoding:'utf8'}));
 h.location={...h.location,label,address:'Yokohama'};return h;
};
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 for(let i=0;i<60;i++)if((await call('/api/crawl-prepare',{method:'POST'})).body.done)break;
 const put=async(h)=>{
  const url=h.sources[0].url;
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'trip','detail','pref-kanagawa','pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',lease_token=NULL,lease_until=0,last_token=NULL").bind(url).run();
  const r=await call('/api/crawl',{method:'PUT',body:JSON.stringify({url,status:'done',observations:[h],links:[]})});
  assert.equal(r.body.accepted,1);return r.meter;
 };
 const t1='2026-10-15T01:00:00+00:00',t2='2026-10-15T02:00:00+00:00',OLD='가나가와 · 하코네',NEW='가나가와';
 const label=id=>db.prepare("SELECT json_extract(payload,'$.location.label') AS label FROM hotels WHERE id=?").bind(id).first().then(r=>r.label);
 await put(parse('999401',t1,OLD)); // warm-up: the first PUT of an isolate also fills its caches
 const rows=[['new hotel, old collector label',await put(parse('999402',t1,OLD))],['new hotel, new collector label',await put(parse('999403',t1,NEW))]];
 // The PUT stores formatHotelLocation's label: both are '요코하마 · 가나가와' now.
 assert.equal(await label('trip-999402'),'요코하마 · 가나가와');assert.equal(await label('trip-999403'),'요코하마 · 가나가와');
 rows.push(['refetch, stored label already current',await put(parse('999403',t2,NEW))]);
 // A production row stored before this change still holds the fallback label.
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.label',?) WHERE id='trip-999402'").bind(OLD).run();
 rows.push(['refetch, stored label was the old fallback',await put(parse('999402',t2,NEW))]);
 assert.equal(await label('trip-999402'),'요코하마 · 가나가와');
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),environment:'Miniflare local D1 (not production D1), built dist/',rows:rows.map(([label,m])=>({label,statements:m.statements,rowsRead:m.rowsRead,rowsWritten:m.rowsWritten}))},null,1));
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
