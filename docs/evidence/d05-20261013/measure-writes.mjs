// D05: rows written by one Jalan detail PUT with and without the D05 fields
// (rooms, features.viewBath, bathDataVersion v2), against the built Worker
// (dist/) and a temporary Miniflare D1. Never touches the production database.
// Run from the repo root after a build: node docs/evidence/d05-20261013/measure-writes.mjs
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='measure-d05-only';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-d05-writes-'));
const server=join(temp,'server');cpSync(resolve('dist/server'),server,{recursive:true});
// Same meter as scripts/measure-d1-reads.mjs.
writeFileSync(join(server,'__d1meter.js'),readFileSync('scripts/measure-d1-reads.mjs','utf8').match(/writeFileSync\(join\(server,'__d1meter\.js'\),`([\s\S]*?)`\);/)[1].replaceAll('\\\\','\\'));
const modules=[{type:'ESModule',path:join(server,'__d1meter.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='__d1meter.js').map(p=>({type:'ESModule',path:join(server,p)}))];
const runtime=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'d05'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const call=async(path,init={},expected=200)=>{
 await runtime.dispatchFetch('http://localhost/__d1meter');
 const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY}});
 const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body).slice(0,300));
 return{body,meter:await (await runtime.dispatchFetch('http://localhost/__d1meter')).json()};
};
const parse=(ident,at)=>JSON.parse(execFileSync('python3',['-c',`
import json,sys
sys.path.insert(0,'scripts/crawler')
from collect import parse_source_page
raw=open('scripts/crawler/fixtures/jalan-rooms-greenplaza.html',encoding='utf-8').read().replace('345284',sys.argv[1])
print(json.dumps(parse_source_page(raw,'jalan','https://www.jalan.net/yad'+sys.argv[1]+'/',sys.argv[2],'pref-kanagawa','detail')[0][0],ensure_ascii=False))`,ident,at],{encoding:'utf8'}));
const strip=h=>{const o=structuredClone(h);delete o.rooms;delete o.features.viewBath;o.sources[0].bathDataVersion='v1';return o};
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 for(let i=0;i<60;i++)if((await call('/api/crawl-prepare',{method:'POST'})).body.done)break;
 const put=async(h)=>{
  const url=h.sources[0].url;
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail','pref-kanagawa','pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',lease_token=NULL,lease_until=0,last_token=NULL").bind(url).run();
  const r=await call('/api/crawl',{method:'PUT',body:JSON.stringify({url,status:'done',observations:[h],links:[]})});
  assert.equal(r.body.accepted,1);return r.meter;
 };
 const t1='2026-10-13T12:00:00+00:00',t2='2026-10-13T13:00:00+00:00';
 const full=parse('345284',t1),fullLater=parse('345284',t2),old=strip(parse('345285',t1)),oldLater=strip(parse('345285',t2)),revisit=parse('345285','2026-10-13T14:00:00+00:00');
 assert.equal(full.rooms.total,123);assert.equal(full.features.viewBath.value,true);assert.equal(old.rooms,undefined);
 await put(strip(parse('345286',t1))); // warm-up: the first PUT of an isolate also fills its caches
 const rows=[
  ['new hotel, parser before D05 (no rooms, no viewBath, v1)',await put(old)],
  ['new hotel, D05 parser',await put(full)],
  ['update, parser before D05',await put(oldLater)],
  ['update, D05 parser',await put(fullLater)],
  ['revisit: v1 row updated by the D05 parser',await put(revisit)],
 ];
 const detail=(await call('/api/hotels/jalan-345285')).body;assert.equal(detail.rooms.total,123);
 const bytes=id=>db.prepare('SELECT length(payload) AS n FROM hotels WHERE id=?').bind(id).first();
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),environment:'Miniflare local D1 (not production D1), built dist/',rows:rows.map(([label,m])=>({label,statements:m.statements,rowsRead:m.rowsRead,rowsWritten:m.rowsWritten})),payloadBytes:{d05:(await bytes('jalan-345284')).n,beforeD05Fields:JSON.stringify(strip(full)).length,withD05Fields:JSON.stringify(full).length}},null,1));
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
