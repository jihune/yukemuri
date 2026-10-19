// D1 rows the reviewed-group import writes when both records of all 47 pairs are stored, against the
// built Worker and a temporary Miniflare D1 (the meter of scripts/measure-d1-reads.mjs). Run from the
// repository root after the build: copy it to scripts/ (its paths are relative to the root), run, remove.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='measure-d1-only',dist='dist';
const temp=mkdtempSync(join(tmpdir(),'reviewed-writes-'));
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
const prep=async rt=>{const t={calls:0,rowsRead:0,rowsWritten:0};for(;;){await rt.dispatchFetch('http://localhost/__d1meter');const r=await rt.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});const body=await r.json();const m=await (await rt.dispatchFetch('http://localhost/__d1meter')).json();t.calls++;t.rowsRead+=m.rowsRead;t.rowsWritten+=m.rowsWritten;if(body.done||t.calls>40)return t}};
try{
 let rt=start(),db=await rt.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 console.log('settle',JSON.stringify(await prep(rt)));
 const patches=JSON.parse(readFileSync('data/source-groups-reviewed.json','utf8')).patches;
 const template=await db.prepare("SELECT * FROM hotels WHERE id='takinoya'").first(),cols=Object.keys(template),base=JSON.parse(template.payload);
 let added=0;
 for(const p of patches)for(const [id,prov] of [[p.hotelId,'jalan'],[p.tripHotelId,'trip']]){
  if(await db.prepare('SELECT 1 FROM hotels WHERE id=?').bind(id).first())continue;
  const h={...structuredClone(base),id,names:{ko:p.matchedName,ja:p.matchedName,en:p.matchedName},aliases:[],prefecture:'pref-osaka',regionId:'pref-osaka',ratings:[{...base.ratings[0],provider:prov,sourceId:id,isMock:false}],sources:[{...base.sources[0],sourceId:id}]};
  const row={...template,id,region:'pref-osaka',prefecture:'pref-osaka',name:p.matchedName,search_text:p.matchedName,payload:JSON.stringify(h)};
  await db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run();added++;
 }
 // Prefectures as stored for the seed's own pair records may differ from the fixture's; align the trip peer to its Jalan record.
 for(const p of patches)await db.prepare("UPDATE hotels SET prefecture=(SELECT prefecture FROM hotels WHERE id=?),payload=json_set(payload,'$.prefecture',(SELECT prefecture FROM hotels WHERE id=?)) WHERE id=?").bind(p.hotelId,p.hotelId,p.tripHotelId).run();
 await db.prepare("DELETE FROM hotel_source_groups WHERE hotel_id IN (SELECT json_extract(value,'$.hotelId') FROM json_each(?))").bind(JSON.stringify(patches)).run();
 await db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'reviewed-source-groups:%'").run();
 await rt.dispose();rt=start();
 const withImport=await prep(rt);
 const counts=(await (await rt.getD1Database('DB')).prepare("SELECT value FROM catalog_meta WHERE key LIKE 'reviewed-source-groups:%'").first()).value;
 await rt.dispose();rt=start();
 const without=await prep(rt);
 await rt.dispose();
 console.log(JSON.stringify({addedRows:added,counts:JSON.parse(counts),withImport,without,importRowsWritten:withImport.rowsWritten-without.rowsWritten,importRowsRead:withImport.rowsRead-without.rowsRead}));
}finally{rmSync(temp,{recursive:true,force:true})}
