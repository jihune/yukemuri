// Public routes against the built Worker and a temporary D1 (P03 PR C): a read
// never writes D1, and before the catalogue is prepared (an empty database, or
// a release with a new seed) every public route answers with an empty result,
// a 404 or a notice, never a 5xx. The search snapshot reports the unprepared
// steps until /api/crawl-prepare has run. Never touches the production database.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSnapshot,compileLib} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='public-reads-only',VISITOR='e'.repeat(64);
const temp=mkdtempSync(join(tmpdir(),'yukemuri-public-reads-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'public-reads'},d1Persist:join(temp,'d1'),bindings:{CRAWL_ACCESS_KEY:KEY}});
try{
 const db=await mf.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name").all()).results.map(r=>r.name);
 const fingerprint=async()=>{const out={};for(const t of tables)out[t]=JSON.stringify((await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results);return out};
 const request=async(path,init={})=>{const r=await mf.dispatchFetch('http://localhost'+path,{...init,headers:{'X-Yukemuri-Visitor':VISITOR,...init.headers}});const text=await r.text();return{status:r.status,body:/json/.test(r.headers.get('Content-Type')??'')?JSON.parse(text):text}};
 // Every public route (no maintenance key) a visitor or an old link can call.
 const reads=id=>[
  ['/',200],[`/api/hotels/${id}`,null],[`/api/hotel-comparison?ids=${id}`,200],['/api/favorites',200],['/api/photo-credits',200],
  [`/api/photo-credits?after=${id}`,200],[`/api/hotels/${id}/google`,200],['/api/prices',410],['/api/collection-status',403],
  ['/api/hotels',404],['/api/hotels/map?bbox=120,20,150,46',404],['/api/hotels/search-index',404],['/api/hotels/suggestions?q=a',404],
 ];
 const readAll=async id=>{const out={};for(const [path,expected] of reads(id)){const r=await request(path);assert(r.status<500,`${path} ${r.status} ${JSON.stringify(r.body).slice(0,200)}`);if(expected!==null)assert.equal(r.status,expected,path);out[path]=r}return out};

 // Unprepared: nothing to find, nothing written, no server error.
 const empty=await fingerprint();
 const before=await readAll('takinoya');
 assert.equal(before['/api/hotels/takinoya'].status,404);
 assert.deepEqual(before['/api/hotel-comparison?ids=takinoya'].body.missingIds,['takinoya']);
 assert.deepEqual(before['/api/favorites'].body.ids,[]);
 assert.deepEqual(before['/api/photo-credits'].body,{total:null,next:null,items:[]});
 // A favourite of an unknown hotel is refused, not stored.
 assert.equal((await request('/api/favorites',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotelId:'takinoya',saved:true})})).status,400);
 assert.deepEqual(await fingerprint(),empty,'a public request wrote D1 before preparation');
 const unprepared=await buildSnapshot({db,out:join(temp,'unprepared')});
 assert.deepEqual(unprepared.unprepared,['snapshot','multilingual-index-v1','bath-facts-backfill-v1','korean-names-20261004','verified-source-groups-v1'],'the snapshot reports every unprepared step');
 assert.equal(unprepared.manifest.hotels,0);

 // Prepared through the maintenance path: reads find the catalogue and still write nothing.
 const prepared=await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});assert.equal(prepared.status,200);
 // The collector's GET sets the record counter the photo credits read.
 assert.equal((await mf.dispatchFetch('http://localhost/api/crawl?provider=jalan&kind=list&limit=1',{headers:{'X-Yukemuri-Crawl-Key':KEY}})).status,200);
 // A Jalan list name (D07 PR 2) for a Jalan hotel with no Hangul name, as the collector stores one.
 const jalan=(await db.prepare("SELECT id FROM hotels WHERE id LIKE 'jalan-%' AND json_extract(payload,'$.names') NOT GLOB '*[가-힣]*' ORDER BY id LIMIT 1").first()).id;
 await db.prepare("INSERT INTO hotel_locale_names (hotel_id,name_ko,ko_url,ko_checked_at) VALUES (?,'시험 료칸','https://www.jalan.net/kr/japan_hotels_ryokan/Hotels/Oita_Hotels/Beppu_Hotels/test/','2026-10-18T00:00:00Z')").bind(jalan).run();
 const ready=await fingerprint();
 const after=await readAll('takinoya');
 assert.equal(after['/api/hotels/takinoya'].status,200);assert.equal(after['/api/hotels/takinoya'].body.id,'takinoya');
 assert.deepEqual(after['/api/hotel-comparison?ids=takinoya'].body.hotels.map(h=>h.id),['takinoya']);
 const records=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n,credits=after['/api/photo-credits'].body;
 assert.equal(credits.total,records);assert.equal(credits.items.length,40);
 // Following `next` visits every hotel once, in id order.
 const listed=[...credits.items];for(let next=credits.next;next;){const page=(await request(next)).body;listed.push(...page.items);next=page.next}
 const seen=listed.map(i=>i.hotelId);
 const ids=(await db.prepare('SELECT id FROM hotels ORDER BY id').all()).results.map(r=>r.id);assert.deepEqual(seen,ids);
 for(const bad of ['?page=2','?after=%27x','?after=a&after=b','?limit=5'])assert.equal((await request('/api/photo-credits'+bad)).status,400,bad);
 assert.deepEqual((await request('/api/photo-credits?page=1')).body,credits);
 // Detail reads write no translation request any more (P03, approved 2026-10-11T16:25Z).
 // Hotels whose description has letters and no Hangul (needsKoreanDescription) and no translation.
 const untranslated=(await db.prepare("SELECT h.id FROM hotels h WHERE json_extract(h.payload,'$.description') GLOB '*[A-Za-zぁ-んァ-ヶ一-龯]*' AND json_extract(h.payload,'$.description') NOT GLOB '*[가-힣]*' AND NOT EXISTS (SELECT 1 FROM hotel_description_translations t WHERE t.hotel_id=h.id) ORDER BY h.id LIMIT 5").all()).results.map(r=>r.id);
 assert.equal(untranslated.length,5,'hotels whose description needs a translation');
 for(const id of untranslated)assert.equal((await request('/api/hotels/'+id)).status,200);
 assert.deepEqual(await fingerprint(),ready,'a public read wrote D1');
 const built=await buildSnapshot({db,out:join(temp,'prepared')});
 assert.deepEqual(built.unprepared,[],'the snapshot finds the catalogue prepared');
 // Photo sources name every hotel as its card does (U07 task 8), Wikidata and Jalan list names (D07)
 // included: the seed gives some hotels a Korean Wikidata name, and one hotel a Jalan one above.
 const {displayNames}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'names-')),'lib/hotel-names.ts'));
 const {ids:cardIds}=built.data.core,cards=new Map(built.data.cards.map((c,i)=>[cardIds[i],c]));
 assert(built.data.cards.some(c=>c.wikidataNames?.was.ko!==undefined),'the seed has a hotel with a Wikidata Korean name');
 assert.equal(displayNames(cards.get(jalan).names).title,'시험 료칸','the Jalan Korean name titles its card');
 assert.deepEqual(listed.filter(i=>i.name!==displayNames(cards.get(i.hotelId).names).title).map(i=>[i.hotelId,i.name]),[],'photo sources name hotels as their cards do');
 console.log(`Public reads passed: ${reads('x').length} public routes answer without a 5xx before preparation, no D1 write before or after (detail of ${untranslated.length} untranslated hotels included), photo credits by cursor over ${seen.length} hotels with the counter total and the card names, snapshot reports the 5 unprepared steps until crawl-prepare.`);
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
