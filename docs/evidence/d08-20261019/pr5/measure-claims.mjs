// D1 rows one priority-lane detail claim reads as hotel_source_groups grows with the reviewed pairs
// (D08 PR 5), against the built Worker and a temporary Miniflare D1 (meter of scripts/measure-d1-reads.mjs).
// States: the seed's curated groups only; plus the reviewed pairs whose records the seed holds; plus all
// 47 pairs with both records and pending detail jobs (as in production before the pairs' details are
// fetched); the same with those jobs done. Run from the repository root after the build: copy it to
// scripts/ (its paths are relative to the root), run, remove.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='measure-d1-only',dist='dist';
const temp=mkdtempSync(join(tmpdir(),'claim-groups-'));
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
const meter=async(rt,path,init)=>{await rt.dispatchFetch('http://localhost/__d1meter');const r=await rt.dispatchFetch('http://localhost'+path,{...init,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY}});await r.text();return (await (await rt.dispatchFetch('http://localhost/__d1meter')).json()).rowsRead};
const claim=(rt,provider,phase)=>meter(rt,'/api/crawl',{method:'POST',body:JSON.stringify({provider,phase,lane:'priority',token:randomUUID()})});
try{
 const rt=start(),db=await rt.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 for(let i=0;i<40;i++){const r=await rt.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});if((await r.json()).done)break}
 const patches=JSON.parse(readFileSync('data/source-groups-reviewed.json','utf8')).patches;
 const groups=async()=>(await db.prepare('SELECT COUNT(*) AS n FROM hotel_source_groups').first()).n;
 const state=async name=>{const out={state:name,groups:await groups()};for(const [p,ph] of [['jalan','detail'],['jalan','baths'],['trip','detail']])out[p+':'+ph]=await claim(rt,p,ph);console.log(JSON.stringify(out));return out};
 const reviewedIds=JSON.stringify(patches.map(p=>p.hotelId));
 const saved=(await db.prepare("SELECT * FROM hotel_source_groups WHERE hotel_id IN (SELECT value FROM json_each(?))").bind(reviewedIds).all()).results;
 await db.prepare("DELETE FROM hotel_source_groups WHERE hotel_id IN (SELECT value FROM json_each(?))").bind(reviewedIds).run();
 await state('curated groups only');
 for(const g of saved)await db.prepare('INSERT INTO hotel_source_groups (hotel_id,trip_hotel_id,jalan_hotel_id,google_place_id,payload,checked_at) VALUES (?,?,?,?,?,?)').bind(g.hotel_id,g.trip_hotel_id,g.jalan_hotel_id,g.google_place_id,g.payload,g.checked_at).run();
 await state('plus reviewed pairs the seed holds');
 // All 47 pairs: both records (list-page payloads, no detail) and pending detail jobs for both.
 const template=await db.prepare("SELECT * FROM hotels WHERE id='takinoya'").first(),cols=Object.keys(template),base=JSON.parse(template.payload);
 for(const p of patches)for(const id of [p.hotelId,p.tripHotelId]){
  if(!await db.prepare('SELECT 1 FROM hotels WHERE id=?').bind(id).first()){const h={...structuredClone(base),id,names:{ko:p.matchedName,ja:p.matchedName,en:p.matchedName},aliases:[],sources:[{...base.sources[0],sourceId:id,label:'목록'}]};const row={...template,id,payload:JSON.stringify(h)};await db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run()}
 }
 for(const p of patches){
  await db.prepare("INSERT INTO hotel_source_groups (hotel_id,trip_hotel_id,jalan_hotel_id,payload,checked_at) VALUES (?,?,?,'{}','2026-10-19T00:00:00Z') ON CONFLICT(hotel_id) DO NOTHING").bind(p.hotelId,p.tripHotelId,p.hotelId).run();
  for(const [url,prov] of [['https://www.jalan.net/yad'+p.hotelId.slice(6)+'/','jalan'],['https://www.trip.com/hotels/x-hotel-detail-'+p.tripHotelId.slice(5)+'/x/','trip']])
   await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,priority,status,attempts,next_at) VALUES (?,?,'detail','pref-osaka',50,'pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',next_at=0").bind(url,prov).run();
 }
 await state('all 47 pairs, detail jobs pending');
 await db.prepare("UPDATE crawl_jobs SET status='done',fetched_at='2026-10-19T00:00:00Z',lease_until=0 WHERE url IN (SELECT 'https://www.jalan.net/yad'||substr(value,7)||'/' FROM json_each(?))").bind(reviewedIds).run();
 await db.prepare("UPDATE crawl_jobs SET status='done',fetched_at='2026-10-19T00:00:00Z',lease_until=0 WHERE provider='trip' AND url LIKE 'https://www.trip.com/hotels/x-hotel-detail-%'").run();
 await state('all 47 pairs, detail jobs done');
 await rt.dispose();
}finally{rmSync(temp,{recursive:true,force:true})}
