// Compare the search responses of two Worker builds on copies of one temporary
// D1 grown to the 2026-10-08 row counts, with closed/temporarily closed records
// and extra aliases. Never touches the production database.
// Usage: node scripts/compare-search-builds.mjs <old build dir> <new build dir> [--out evidence.json]
// The requests run twice: on the seeded copies, and again after the same writes
// (SQL on every search table, a collector PUT and a lifecycle patch) on both.
// The new build answers each request twice (computed, then reused).
// COMPARE_DUMP=<path prefix> writes the first three differing responses.
// Build the old commit with `node scripts/run-framework.mjs build` and copy dist/ first.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),[oldDist,newDist]=argv,out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null;
if(!oldDist||!newDist)throw new Error('Usage: compare-search-builds.mjs <old build dir> <new build dir> [--out file]');
const TARGET={hotels:12271,hotel_names:13849,crawl_jobs:15417};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-compare-'));
const start=(dist,db)=>{
 const server=resolve(dist,'server');
 const modules=[{type:'ESModule',path:join(server,'index.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:join(server,p)}))];
 return new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'compare'},d1Persist:db,bindings:{CRAWL_ACCESS_KEY:'compare-only'}});
};
const runtimes=[];
try{
 // One database, seeded by the old build and grown like measure-d1-reads.mjs.
 const seed=start(oldDist,join(temp,'seed'));runtimes.push(seed);
 const db=await seed.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 await seed.dispatchFetch('http://localhost/api/hotels');
 const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
 for(let n=1;;n++){
  const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;
  await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run();
 }
 for(let n=1;;n++){
  const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;
  const added=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();
  if(!added.meta.changes)break;
 }
 for(let n=1;;n++){
  const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=TARGET.crawl_jobs)break;
  await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(TARGET.crawl_jobs-have).run();
 }
 // Lifecycle states on every 7th record (about 1,750; 2026-10-08 had 1,621 rows)
 // and extra aliases, so exclusion and alias paths are exercised.
 await db.prepare("INSERT INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state) SELECT id,'2026-10-01','2026-10-01',CASE rowid%28 WHEN 0 THEN 'closed' WHEN 7 THEN 'temporarily_closed' WHEN 14 THEN 'active' ELSE 'unverified' END FROM hotels WHERE rowid%7=0").run();
 await db.prepare("INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT id,'aliasx'||substr(id,1,6),'Alias '||id FROM hotels WHERE rowid%15=0").run();
 await db.prepare("INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT id,'あいう'||substr(id,-3),'あいう別名' FROM hotels WHERE prefecture='pref-kanagawa' AND rowid%3=0").run();
 // Coordinates on about a quarter of the records, so a Japan-wide map is a
 // 16 x 16 grid (more than 500 points). Some are integers, some long decimals,
 // some only one number or a string, which do not count as coordinates.
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.latitude',CASE WHEN rowid%40=1 THEN 35 ELSE 31+((rowid*7919)%150000)/10000.0+rowid/3e7 END,'$.location.longitude',CASE WHEN rowid%40=5 THEN '135.5' WHEN rowid%40=9 THEN NULL ELSE 129+((rowid*104729)%170000)/10000.0 END) WHERE rowid%4=1").run();
 const counts={};for(const t of ['hotels','hotel_names','crawl_jobs','hotel_lifecycle'])counts[t]=(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
 await seed.dispose();runtimes.length=0;
 cpSync(join(temp,'seed'),join(temp,'old'),{recursive:true});cpSync(join(temp,'seed'),join(temp,'new'),{recursive:true});
 const A=start(oldDist,join(temp,'old')),B=start(newDist,join(temp,'new'));runtimes.push(A,B);

 const crawled=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')),real=JSON.parse(readFileSync('lib/hotels.real.json','utf8'));
 const ja=crawled.find(h=>h.names?.ja?.length>=4).names.ja,ko=real.find(h=>/[가-힣]{3}/.test(h.names?.ko??'')).names.ko,en=crawled.find(h=>/[A-Za-z]{5}/.test(h.names?.en??'')).names.en;
 const queries=['あいう','aliasx','Alias trip',ja.slice(0,3),ja,ko.slice(0,2),ko,en.split(' ')[0],en.toUpperCase(),en.slice(0,4)+'x'+en.slice(5),'온천','ホテル','hotel','箱根','하코네','유후인','由布院','noboribetsu','soznkyo','소잔쿄','zzzzqqq'];
 const paths=[];
 for(const sort of ['recommended','rating','reviews','name'])for(const extra of ['','&features=natural','&features=natural,outdoor&rating=9&reviews=50','&ryokan=1','&region=pref-hokkaido','&region=pref-oita&features=natural','&provider=jalan&rating=4','&reviews=100'])paths.push(`/api/hotels?fresh=1&stable=1&sort=${sort}${extra}`,`/api/hotels?fresh=1&page=2&sort=${sort}${extra}`);
 for(const q of queries){const e=encodeURIComponent(q);paths.push(`/api/hotels?fresh=1&stable=1&q=${e}`,`/api/hotels?fresh=1&q=${e}&sort=rating`,`/api/hotels?fresh=1&stable=1&q=${e}&region=pref-kanagawa`,`/api/hotels?fresh=1&q=${e}&features=natural&rating=9`,`/api/hotels/suggestions?q=${e}`,`/api/hotels/map?bbox=122,24,146,46&q=${e}`)}
 paths.push('/api/hotels/search-index','/api/hotels/map?bbox=122,24,146,46','/api/hotels/map?bbox=139,41,146,46&features=natural');
 for(const extra of ['','&features=natural','&provider=jalan&rating=4','&region=pref-hokkaido','&q=hotel','&ryokan=1'])paths.push(`/api/hotels/map?bbox=122,24,146,46${extra}`,`/api/hotels/map?bbox=133.5,33.25,140.75,37.5${extra}`,`/api/hotels/map?bbox=135,35,135.0001,35.0001${extra}`);
 // Result-session tokens and times differ by construction; everything else must match.
 const clean=v=>JSON.parse(JSON.stringify(v,(k,x)=>['token','createdAt','expiresAt','measuredAt'].includes(k)?undefined:x));
 const results=[];let different=0;
 const compareAll=async round=>{for(const p of paths){
  // After the writes, coverage.updatedAt is each copy's own PUT time.
  const get=async m=>{const r=await m.dispatchFetch('http://localhost'+p,{headers:{'X-Yukemuri-Visitor':'e'.repeat(64)}}),body=clean(await r.json());if(round===2&&body.coverage)delete body.coverage.updatedAt;return{status:r.status,body}};
  // The new build answers twice: the second time from the result it stored.
  const [a,b]=await Promise.all([get(A),get(B)]),again=await get(B);
  const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16),same=hash(a)===hash(b)&&hash(a)===hash(again);
  if(!same){different++;console.log(`DIFF round ${round} ${p}`);if(process.env.COMPARE_DUMP&&different<=3)writeFileSync(`${process.env.COMPARE_DUMP}-${different}.json`,JSON.stringify({p,a,b,again},null,1))}
  results.push({round,path:decodeURIComponent(p),status:a.status,count:a.body.total??a.body.inBounds??a.body.suggestions?.length??a.body.hotels?.length??null,cells:a.body.cells?.length,same,hash:hash(a)});
 }};
 await compareAll(1);
 // The same writes on both copies: every search table directly, then the API
 // paths that write (collector PUT of a list page, lifecycle patch).
 const writes=["INSERT INTO hotels (id,region,prefecture,name,search_text,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,large_bath,outdoor,private_bath,room_onsen,room_outdoor,bath_features,bath_known,payload) SELECT id||'-w',region,prefecture,name||' 新館',search_text||'新館',kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,large_bath,outdoor,private_bath,room_onsen,room_outdoor,bath_features,bath_known,json_set(payload,'$.id',id||'-w') FROM hotels WHERE rowid%97=3",
  "UPDATE hotels SET trip_score=9.6,trip_reviews=400,natural=1,bath_features=COALESCE(bath_features,0)|1,name='ゑ'||name WHERE rowid%89=5",
  "UPDATE hotels SET payload=json_set(payload,'$.location.latitude',43.0,'$.location.longitude',141.3) WHERE rowid%83=7",
  "INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT id,'writekey'||(rowid%5),'Write Alias' FROM hotels WHERE rowid%71=2",
  "DELETE FROM hotel_names WHERE name_key LIKE 'aliasx%' AND rowid%2=0",
  "UPDATE hotel_lifecycle SET state=CASE state WHEN 'closed' THEN 'operating' ELSE 'closed' END WHERE rowid%5=0",
  "DELETE FROM hotel_lifecycle WHERE rowid%11=0",
  "INSERT OR IGNORE INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state) SELECT id,'2026-10-02','2026-10-02','temporarily_closed' FROM hotels WHERE rowid%61=1",
  "DELETE FROM hotels WHERE rowid%101=50"];
 const listUrl='https://www.jalan.net/130000/LRG_130201/',at='2026-10-11T00:00:00Z';
 const put=JSON.stringify({url:listUrl,status:'done',links:[],observations:crawled.filter(h=>/^jalan-\d+$/.test(h.id)).slice(100,110).map((h,i)=>{const id='jalan-'+(8800000+i),url='https://www.jalan.net/yad'+id.slice(6)+'/';return{...h,id,names:{...h.names,ja:h.names.ja+' 別館'},links:h.links.map(l=>l.provider==='jalan'?{...l,url}:l),sources:[{...h.sources[0],sourceId:id,url:listUrl,label:'Jalan 목록',retrievedAt:at}],features:Object.fromEntries(Object.entries(h.features).map(([k,f])=>[k,f&&{...f,sourceId:id}])),ratings:h.ratings.map(r=>({...r,sourceId:id}))}})});
 const target=(await (await B.getD1Database('DB')).prepare("SELECT id FROM hotels WHERE id NOT LIKE '%-copy%' ORDER BY id LIMIT 1 OFFSET 7").first()).id;
 const patch=JSON.stringify({id:target,state:'closed',sourceUrl:'https://example.com/closed',sourceKind:'official_property',sourceLabel:'비교 검사',evidence:'비교 검사용 폐업 근거 문장',identityEvidence:'비교 검사용 숙소 확인 문장',checkedAt:new Date(Date.now()-60000).toISOString(),effectiveDate:'2026-10-01'});
 for(const m of [A,B]){
  const mdb=await m.getD1Database('DB');
  for(const sql of writes)await mdb.prepare(sql).run();
  await mdb.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','list','pref-tokyo','pending',0,0) ON CONFLICT(url) DO NOTHING").bind(listUrl).run();
  const headers={'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'compare-only'};
  for(const [path,method,body] of [['/api/crawl','PUT',put],['/api/hotel-lifecycle','PUT',patch]]){const r=await m.dispatchFetch('http://localhost'+path,{method,headers,body});if(r.status!==200)throw new Error(path+' '+r.status+' '+await r.text())}
 }
 await compareAll(2);
 const nonEmpty=results.filter(r=>r.count).length;
 if(out)writeFileSync(out,JSON.stringify({comparedAt:new Date().toISOString(),oldDist,newDist,tables:counts,compared:results.length,different,nonEmpty,results},null,1)+'\n');
 console.log(`${different?'Search comparison FAIL':'Search comparison PASS'}: ${paths.length} requests twice (before and after writes), ${different} different, ${nonEmpty} non-empty, ${results.filter(r=>r.cells).length} map grids, tables=${JSON.stringify(counts)}`);
 process.exitCode=different?1:0;
}finally{for(const r of runtimes)await r.dispose();rmSync(temp,{recursive:true,force:true})}
