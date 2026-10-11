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

 // A missing or partial chunk table is rebuilt by the next search.
 await db.prepare('DELETE FROM hotel_search_chunks WHERE chunk<10').run();
 await api(B,'/api/hotels?fresh=1');
 await invariant('rebuild after a partial table');

 // While the chunk rows are absent (a newly loaded D1), writes add no chunk
 // writes: an insert writes the hotel row and its indexes only.
 await db.prepare('DELETE FROM hotel_search_chunks').run();
 const inserted=await db.prepare("INSERT INTO hotels (id,region,name,search_text,kind,payload) VALUES ('jalan-8700003','all','x','x','hotel',?)").bind(JSON.stringify({names:{ko:'x',ja:'x',en:'x'},location:{label:'',address:''}})).run();
 assert.equal(inserted.meta.rows_written,6,'hotel row, primary key and four indexes, no chunk row');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotel_search_chunks').first()).n,0);
 await api(A,'/api/hotels?fresh=1');
 await invariant('rebuild after load');
 console.log('Search snapshot checks passed: first build, collector PUT, 11 direct SQL writes on hotels/hotel_names/hotel_lifecycle, lifecycle patch, partial and empty chunk tables; chunks equal a fresh build after each, and a second isolate reads the current snapshot.');
}finally{for(const r of runtimes)await r.dispose();rmSync(temp,{recursive:true,force:true})}
