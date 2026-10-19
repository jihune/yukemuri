// D08 PR 5: the reviewed Jalan and Trip.com pairs (data/source-groups-reviewed.json) against
// the built Worker and a temporary Miniflare D1, through crawl-prepare as the collector calls it:
// - every pair is a valid sourceGroupPatch: the Jalan record is the group's own hotel, one Trip.com
//   id per pair, and the evidence says how the sales scope was judged;
// - a pair whose records are stored is saved; a Trip.com id already in another group is a
//   conflict, a Jalan record without the matched name an identity refusal, a missing record
//   unknown and tried again on the next crawl-prepare; once none is unknown, catalog_meta keeps
//   the count of each outcome under a key of the file's content;
// - a saved pair composes both providers on the Jalan record's detail; a second crawl-prepare
//   in a new isolate imports nothing again.
// Usage: node scripts/check-reviewed-groups-worker.mjs   (after the build)
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {compileLib} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='reviewed-groups-only',temp=mkdtempSync(join(tmpdir(),'yukemuri-reviewed-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
// One isolate per crawl-prepare: ensureCatalog keeps its promise per isolate.
const isolate=()=>new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'reviewed-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const prepare=async runtime=>{const r=await runtime.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});assert.equal(r.status,200,await r.text())};
const reviewed=JSON.parse(readFileSync('data/source-groups-reviewed.json','utf8')).patches;
try{
 // The file: valid patches, Jalan record as the group's hotel, one pair per Trip.com id.
 const {sourceGroupPatch}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'lib-')),'lib/source-group-contract.ts'));
 assert(reviewed.length>0&&reviewed.every(p=>sourceGroupPatch.safeParse(p).success),'every reviewed pair is a valid sourceGroupPatch');
 assert(reviewed.every(p=>/^jalan-\d+$/.test(p.hotelId)&&p.jalanHotelId===p.hotelId&&/^trip-\d+$/.test(p.tripHotelId)&&p.sourceUrl==='https://www.jalan.net/yad'+p.hotelId.slice(6)+'/'),'Jalan record as the group hotel, its Jalan page as the source');
 assert.equal(new Set(reviewed.map(p=>p.tripHotelId)).size,reviewed.length,'one pair per Trip.com id');
 assert(reviewed.every(p=>p.identityEvidence.includes('판매 범위는 객실 단위로 맞춰 보지 못해')),'the evidence says how the sales scope was judged');

 let runtime=isolate(),db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 await prepare(runtime);
 const keys=async()=>(await db.prepare("SELECT key,value FROM catalog_meta WHERE key LIKE 'reviewed-source-groups:%'").all()).results;
 const stored=async ids=>new Set((await db.prepare('SELECT id FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all()).results.map(r=>r.id));
 // The seed holds some reviewed Jalan records already: those pairs are saved now. The rest are
 // unknown, so the content is not marked done (Codex P2 on PR #204).
 let rows=await keys();const present=await stored(reviewed.map(p=>p.hotelId));
 const grouped=async()=>(await db.prepare("SELECT COUNT(*) AS n FROM hotel_source_groups g JOIN json_each(?) r ON json_extract(r.value,'$.hotelId')=g.hotel_id AND json_extract(r.value,'$.tripHotelId')=g.trip_hotel_id").bind(JSON.stringify(reviewed)).first()).n;
 assert(present.size>0&&present.size<reviewed.length,'the seed holds some, not all, reviewed Jalan records');
 assert.equal(rows.length,0,'not marked done while a pair is unknown');
 assert.equal(await grouped(),present.size,'every pair whose Jalan record is stored is saved');

 // Every other Jalan record stored: one pair whose Trip.com id another group holds, one whose
 // Jalan record lacks the matched name, the rest to save. The next crawl-prepare (a new
 // isolate) tries the unknown pairs again, settles every pair and marks the content done.
 const template=await db.prepare("SELECT * FROM hotels WHERE id='takinoya'").first(),cols=Object.keys(template),base=JSON.parse(template.payload);
 const insert=async(id,name,rating,pref='pref-osaka')=>{const h={...structuredClone(base),id,names:{ko:name,ja:name,en:name},aliases:[],prefecture:pref,regionId:pref,ratings:[{...base.ratings[0],provider:rating.provider,sourceId:id,score:rating.score,scale:rating.scale,reviewCount:77,isMock:false}],sources:[{...base.sources[0],sourceId:id}]};
  const row={...template,id,region:pref,prefecture:pref,name,search_text:name,payload:JSON.stringify(h)};await db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run()};
 const [save,taken,renamed,...rest]=reviewed.filter(p=>!present.has(p.hotelId));
 await insert(save.hotelId,save.matchedName,{provider:'jalan',score:4.4,scale:5});await insert(save.tripHotelId,save.matchedName,{provider:'trip',score:9.1,scale:10});
 await insert(taken.hotelId,taken.matchedName,{provider:'jalan',score:4.0,scale:5});
 await db.prepare("INSERT INTO hotel_source_groups (hotel_id,trip_hotel_id,payload,checked_at) VALUES ('qa-other',?,'{}','2026-01-01T00:00:00Z')").bind(taken.tripHotelId).run();
 await insert(renamed.hotelId,'別の宿',{provider:'jalan',score:3.9,scale:5});
 // In the prefecture of its Trip.com record when the seed holds that.
 for(const p of rest)await insert(p.hotelId,p.matchedName,{provider:'jalan',score:4.1,scale:5},(await db.prepare('SELECT prefecture FROM hotels WHERE id=?').bind(p.tripHotelId).first())?.prefecture??undefined);
 await runtime.dispose();runtime=isolate();db=await runtime.getD1Database('DB');
 await prepare(runtime);
 // The pairs saved the first time are replayed: the same evidence, nothing written.
 rows=await keys();const counts=JSON.parse(rows[0]?.value??'{}'),m=k=>counts[k]??0;
 assert.equal(rows.length,1,'one key for the file content once every pair is settled');
 assert.deepEqual([m('saved'),m('conflict'),m('identity'),m('unknown'),m('replayed')],[1+rest.length,1,1,0,present.size],JSON.stringify(counts));
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),reviewed.length,'every pair counted once');
 assert.equal(await grouped(),present.size+1+rest.length);
 const group=await db.prepare('SELECT hotel_id,trip_hotel_id,jalan_hotel_id,payload FROM hotel_source_groups WHERE hotel_id=?').bind(save.hotelId).first();
 assert.deepEqual([group.trip_hotel_id,group.jalan_hotel_id,JSON.parse(group.payload).identityEvidence],[save.tripHotelId,save.hotelId,save.identityEvidence]);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM hotel_source_groups WHERE hotel_id IN (?,?)").bind(taken.hotelId,renamed.hotelId).first()).n,0,'conflict and identity refusals save nothing');
 const detail=await (await runtime.dispatchFetch('http://localhost/api/hotels/'+save.hotelId)).json();
 assert.deepEqual(detail.ratings.map(r=>r.provider).sort(),['jalan','trip'],'the Jalan record shows both providers');
 assert.equal((await db.prepare('SELECT trip_score FROM hotels WHERE id=?').bind(save.hotelId).first()).trip_score,9.1,'and its search columns carry the Trip.com rating');

 // The same content again in a new isolate: nothing more is imported.
 const before=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_source_groups').first()).n;
 await runtime.dispose();runtime=isolate();db=await runtime.getD1Database('DB');
 await db.prepare("DELETE FROM hotel_source_groups WHERE hotel_id='qa-other'").run();
 await prepare(runtime);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotel_source_groups').first()).n,before-1,'the content is imported once: the freed Trip.com id is not retried');
 assert.deepEqual(await keys(),rows);
 await runtime.dispose();
 console.log(`Reviewed source groups passed: ${reviewed.length} valid pairs; with ${reviewed.length-present.size} Jalan records missing, ${present.size} pairs saved and nothing marked done; with all stored, the unknown pairs tried again and one key with the outcome counts ${JSON.stringify(counts)}; both providers on the saved pair, imported once.`);
}finally{rmSync(temp,{recursive:true,force:true})}
