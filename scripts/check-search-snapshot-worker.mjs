// The search snapshot (hotel_search_chunks, migration 0014) must equal a fresh
// build from hotels, hotel_names and hotel_lifecycle after any write, through
// the API or directly in SQL, and every isolate must read the current one.
// Disposable Miniflare D1 only.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-snapshot-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const start=()=>new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'snapshot-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'snapshot-test-only'}});
const runtimes=[];
try{
 const A=start();runtimes.push(A);
 const db=await A.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(m,path,init={})=>{const r=await m.dispatchFetch('http://localhost'+path,{...init,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'snapshot-test-only','X-Yukemuri-Visitor':'f'.repeat(64)}});const body=await r.json();assert.equal(r.status,200,path+' '+JSON.stringify(body).slice(0,200));return body};
 // Chunk rows as maintained, against the same rows built from the view now.
 const invariant=async label=>{
  const chunks=(await db.prepare('SELECT chunk,core,text FROM hotel_search_chunks ORDER BY chunk').all()).results;
  assert.equal(chunks.length,64,label+': 64 chunk rows');
  const fresh=new Map((await db.prepare('SELECT chunk,json_group_object(id,json(core)) AS core,json_group_object(id,json(text)) AS text FROM hotel_search_rows GROUP BY chunk').all()).results.map(r=>[r.chunk,r]));
  let records=0;
  for(const c of chunks){
   const f=fresh.get(c.chunk),core=JSON.parse(c.core),text=JSON.parse(c.text);records+=Object.keys(core).length;
   assert.deepEqual(core,f?JSON.parse(f.core):{},`${label}: core of chunk ${c.chunk}`);
   assert.deepEqual(text,f?JSON.parse(f.text):{},`${label}: text of chunk ${c.chunk}`);
  }
  assert.equal(records,(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n,label+': every hotel once');
 };
 const names=async(m,q)=>(await api(m,'/api/hotels?fresh=1&stable=1&q='+encodeURIComponent(q))).hotels.map(h=>h.id).sort();

 // A new D1: the first search builds the chunks, which then match the tables.
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotel_search_chunks').first()).n,0);
 await api(A,'/api/hotels?fresh=1');
 await invariant('first build');

 // Collector PUT: new properties, a known one, its aliases and lifecycle rows.
 const fixtures=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')).filter(h=>/^jalan-\d+$/.test(h.id));
 const listUrl='https://www.jalan.net/130000/LRG_130202/',at=new Date().toISOString();
 await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','list','pref-tokyo','pending',0,0)").bind(listUrl).run();
 const observe=(h,id,suffix)=>{const url='https://www.jalan.net/yad'+id.slice(6)+'/';return{...h,id,names:{...h.names,ja:h.names.ja+suffix},aliases:['スナップ確認'+suffix],links:h.links.map(l=>l.provider==='jalan'?{...l,url}:l),sources:[{...h.sources[0],sourceId:id,url:listUrl,label:'Jalan 목록',retrievedAt:at}],features:Object.fromEntries(Object.entries(h.features).map(([k,f])=>[k,f&&{...f,sourceId:id}])),ratings:h.ratings.map(r=>({...r,sourceId:id}))}};
 await api(A,'/api/crawl',{method:'PUT',body:JSON.stringify({url:listUrl,status:'done',links:[],observations:[observe(fixtures[0],'jalan-8700001','甲'),observe(fixtures[1],'jalan-8700002','乙')]})});
 await invariant('collector PUT');
 assert.ok((await names(A,'スナップ確認甲')).includes('jalan-8700001'),'a new alias is found at once in the writing isolate');
 // Another isolate on the same D1 reads the current snapshot.
 const B=start();runtimes.push(B);
 assert.ok((await names(B,'スナップ確認乙')).includes('jalan-8700002'),'a new isolate reads the written chunk');

 // Direct SQL on every search table, including paths no app code takes.
 const writes=[
  "UPDATE hotels SET trip_score=9.9,trip_reviews=999,name='ゑ更新',search_text=search_text||'すなっぷ更新' WHERE id='jalan-8700001'",
  "UPDATE hotels SET payload=json_set(payload,'$.location.latitude',36.1234567890123,'$.location.longitude',137.5) WHERE id IN (SELECT id FROM hotels ORDER BY id LIMIT 5)",
  "INSERT INTO hotel_names (hotel_id,name_key,name) VALUES ('jalan-8700002','すなっぷ別名','スナップ別名')",
  "UPDATE hotel_names SET hotel_id='jalan-8700001' WHERE name_key='すなっぷ別名'",
  "DELETE FROM hotel_names WHERE hotel_id='jalan-8700002'",
  "INSERT INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state) SELECT id,'2026-10-01','2026-10-01','closed' FROM hotels WHERE id NOT IN (SELECT hotel_id FROM hotel_lifecycle) ORDER BY id LIMIT 3",
  "UPDATE hotel_lifecycle SET state='temporarily_closed' WHERE hotel_id='jalan-8700002'",
  "UPDATE hotel_lifecycle SET last_seen_at='2026-10-11' WHERE hotel_id='jalan-8700001'",
  "DELETE FROM hotel_lifecycle WHERE hotel_id='jalan-8700001'",
  "INSERT OR REPLACE INTO hotels SELECT * FROM hotels WHERE id='jalan-8700002'",
  "DELETE FROM hotels WHERE id=(SELECT id FROM hotels ORDER BY id LIMIT 1 OFFSET 9)",
 ];
 for(const sql of writes){await db.prepare(sql).run();await invariant(sql.slice(0,60))}
 assert.ok((await names(A,'すなっぷ更新')).includes('jalan-8700001'),'search text change seen by the writing isolate');
 assert.ok((await names(B,'すなっぷ更新')).includes('jalan-8700001'),'search text change seen by another isolate');
 assert.ok(!(await names(B,'スナップ確認乙')).includes('jalan-8700002'),'temporarily closed records leave the list');

 // Lifecycle patch through the API (it also clears the fuzzy index).
 const target=(await db.prepare("SELECT id FROM hotels WHERE id NOT LIKE 'jalan-87%' ORDER BY id LIMIT 1 OFFSET 20").first()).id;
 await api(A,'/api/hotel-lifecycle',{method:'PUT',body:JSON.stringify({id:target,state:'closed',sourceUrl:'https://example.com/closed',sourceKind:'official_property',sourceLabel:'스냅숏 검사',evidence:'스냅숏 검사용 폐업 근거 문장',identityEvidence:'스냅숏 검사용 숙소 확인 문장',checkedAt:new Date(Date.now()-60000).toISOString(),effectiveDate:'2026-10-01'})});
 await invariant('lifecycle patch');

 // Removing a verified source link rewrites the linked hotels' search columns.
 const group=(await db.prepare('SELECT hotel_id FROM hotel_source_groups ORDER BY hotel_id LIMIT 1').first())?.hotel_id;
 assert.ok(group,'the seed has verified source groups');
 await api(A,'/api/hotel-source-groups?hotelId='+encodeURIComponent(group),{method:'DELETE'});
 await invariant('source group removed');

 // Random sequences of writes on the three search tables (seeded, replayable).
 let seed=Number(process.env.SNAPSHOT_SEED??11);
 const random=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};
 const pick=list=>list[Math.floor(random()*list.length)];
 const ids=(await db.prepare('SELECT id FROM hotels ORDER BY id').all()).results.map(r=>r.id);
 const operations=[
  ()=>[`INSERT OR IGNORE INTO hotels (id,region,prefecture,name,search_text,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,large_bath,outdoor,private_bath,room_onsen,room_outdoor,bath_features,bath_known,payload) SELECT id||'-r${Math.floor(random()*1e6)}',region,prefecture,name,search_text,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,large_bath,outdoor,private_bath,room_onsen,room_outdoor,bath_features,bath_known,payload FROM hotels WHERE id=?`,pick(ids)],
  ()=>['UPDATE hotels SET trip_score=?,trip_reviews=?,bath_features=?,natural=? WHERE id=?',pick([null,7.25,9.1,10]),pick([null,0,49,50,1200]),pick([null,0,1,5,255]),pick([null,0,1]),pick(ids)],
  ()=>["UPDATE hotels SET name=?,search_text=search_text||?,region=?,prefecture=? WHERE id=?",pick(['あ','𠮷野家','Ｚ','a']),pick(['ら','x']),pick(['pref-hokkaido','pref-oita','noboribetsu']),pick([null,'pref-kanagawa','pref-oita']),pick(ids)],
  ()=>["UPDATE hotels SET payload=json_set(payload,'$.location.latitude',?,'$.location.longitude',?,'$.names.ja',?) WHERE id=?",pick([null,35,35.123456789012345,'36']),pick([null,139.5,140]),pick(['乱数','らんすう']),pick(ids)],
  ()=>['DELETE FROM hotels WHERE id=?',pick(ids)],
  ()=>['INSERT OR REPLACE INTO hotel_names (hotel_id,name_key,name) VALUES (?,?,?)',pick(ids),pick(['らんだむ','rand','ゆ']),pick(['乱','Rand'])],
  ()=>['DELETE FROM hotel_names WHERE hotel_id=? AND rowid IN (SELECT rowid FROM hotel_names WHERE hotel_id=? LIMIT 1)',...(id=>[id,id])(pick(ids))],
  ()=>['UPDATE hotel_names SET hotel_id=? WHERE hotel_id=? AND name_key IN (SELECT name_key FROM hotel_names WHERE hotel_id=? LIMIT 1) AND NOT EXISTS (SELECT 1 FROM hotel_names n WHERE n.hotel_id=? AND n.name_key=hotel_names.name_key)',...(a=>(b=>[b,a,a,b])(pick(ids)))(pick(ids))],
  ()=>["INSERT INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state) VALUES (?,'2026-10-01','2026-10-01',?) ON CONFLICT(hotel_id) DO UPDATE SET state=excluded.state",pick(ids),pick(['closed','temporarily_closed','operating','unverified'])],
  ()=>["UPDATE hotel_lifecycle SET missing_count=missing_count+1 WHERE hotel_id=?",pick(ids)],
  ()=>['DELETE FROM hotel_lifecycle WHERE hotel_id=?',pick(ids)],
 ];
 for(let i=1;i<=120;i++){
  const [sql,...args]=pick(operations)();await db.prepare(sql).bind(...args).run();
  if(i%20===0)await invariant(`random sequence ${i} (seed ${process.env.SNAPSHOT_SEED??11})`);
 }

 // A missing or partial chunk table is rebuilt by the next search.
 await db.prepare('DELETE FROM hotel_search_chunks WHERE chunk<10').run();
 await api(B,'/api/hotels?fresh=1');
 await invariant('rebuild after a partial table');

 // Concurrent rebuilds on an empty chunk table: searches in the Worker and
 // the build statement itself (as other isolates would send it, read from
 // lib/hotel-search-snapshot.ts) end in one complete build. Separate Miniflare
 // processes are not used here: they lock one local SQLite file, which D1 does not.
 await db.prepare('DELETE FROM hotel_search_chunks').run();
 const buildSql=readFileSync('lib/hotel-search-snapshot.ts','utf8').match(/prepare\(`(WITH RECURSIVE[\s\S]*?)`\)/)[1].replace('${CHUNKS-1}','63');
 const bodies=await Promise.all([api(A,'/api/hotels?fresh=1&stable=1&sort=name'),db.prepare(buildSql).bind(1).run(),api(A,'/api/hotels?fresh=1&stable=1&sort=name'),db.prepare(buildSql).bind(2).run(),api(A,'/api/hotels?fresh=1&stable=1&sort=name')]);
 const lists=[bodies[0],bodies[2],bodies[4]].map(b=>b.hotels.map(h=>h.id));
 for(const l of lists.slice(1))assert.deepEqual(l,lists[0],'concurrent first searches agree');
 assert.equal((await db.prepare('SELECT COUNT(DISTINCT version) AS n FROM hotel_search_chunks').first()).n,1,'one build wrote every chunk');
 await invariant('concurrent rebuild');

 // While the chunk rows are absent (a newly loaded D1), writes add no chunk
 // writes: an insert writes the hotel row and its indexes only.
 await db.prepare('DELETE FROM hotel_search_chunks').run();
 const inserted=await db.prepare("INSERT INTO hotels (id,region,name,search_text,kind,payload) VALUES ('jalan-8700003','all','x','x','hotel',?)").bind(JSON.stringify({names:{ko:'x',ja:'x',en:'x'},location:{label:'',address:''}})).run();
 assert.equal(inserted.meta.rows_written,6,'hotel row, primary key and four indexes, no chunk row');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotel_search_chunks').first()).n,0);
 await api(A,'/api/hotels?fresh=1');
 await invariant('rebuild after load');
 console.log('Search snapshot checks passed: first build, collector PUT, 11 direct SQL writes, lifecycle patch, source link removal, 120 random writes on hotels/hotel_names/hotel_lifecycle, partial table, concurrent rebuilds and an empty table; chunks equal a fresh build after each, and another isolate reads the current snapshot.');
}finally{for(const r of runtimes)await r.dispose();rmSync(temp,{recursive:true,force:true})}
