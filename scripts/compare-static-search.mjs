// The browser search over the static snapshot against the Worker search it
// replaces: a main build before P03 answers the former endpoints on a
// temporary D1 grown to the 2026-10-08 row counts (with closed hotels, extra
// aliases and coordinates on about a quarter of the hotels), and
// scripts/former-search-api.mjs answers the same requests from a snapshot of
// that database. Lists compare totals, counts, the order of ids on each page,
// similar names, alternatives and the card fields of every hotel shown.
// Never touches the production database.
// Usage: node scripts/compare-static-search.mjs <main build dist> [--out evidence.json] [--checked-in]
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {isDeepStrictEqual} from 'node:util';
import {formerSearchApi} from './former-search-api.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),[oldDist]=argv,out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,grow=!argv.includes('--checked-in');
if(!oldDist)throw new Error('Usage: compare-static-search.mjs <main build dist> [--out file] [--checked-in]');
const TARGET={hotels:12271,hotel_names:13849,crawl_jobs:15417};
const VISITOR='e'.repeat(64);
const temp=mkdtempSync(join(tmpdir(),'yukemuri-static-compare-'));
const server=resolve(oldDist,'server');
const old=new Miniflare({modules:[{type:'ESModule',path:join(server,'index.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:join(server,p)}))],modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'compare'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'compare-only'}});
// The card fields of a full hotel (lib/search-snapshot.ts hotelSummary).
const summary=h=>{
 const features={};for(const [k,f] of Object.entries(h.features))if(f&&f.value!==null)features[k]=f.scope===undefined?{value:f.value}:{value:f.value,scope:f.scope};
 const life=h.lifecycle;
 return JSON.parse(JSON.stringify({id:h.id,names:h.names,kind:h.kind,location:{label:h.location.label,latitude:h.location.latitude,longitude:h.location.longitude},image:{url:h.image.url,alt:h.image.alt,sourceId:h.image.sourceId,alternatives:h.image.alternatives},photoCandidates:h.photoCandidates,features,ratings:h.ratings.filter(r=>!r.isMock).map(r=>({provider:r.provider,score:r.score,scale:r.scale,reviewCount:r.reviewCount})),lifecycle:life&&{state:life.state,reviewNeeded:life.reviewNeeded,evidence:life.evidence?.openedAt?{openedAt:life.evidence.openedAt}:undefined}}));
};
const list=(body,full)=>({total:body.total,unknownExcluded:body.unknownExcluded??0,page:body.page,pageSize:body.pageSize,featureCounts:body.featureCounts,ryokanCount:body.ryokanCount,coverage:body.coverage,similarCount:body.similarCount??0,similarHotelIds:body.similarHotelIds??[],
 hotels:body.hotels.map(h=>full?summary(h):h),alternatives:(body.alternatives??[]).map(a=>({hotel:full?summary(a.hotel):a.hotel,unmetConditions:a.unmetConditions,queryMatched:a.queryMatched}))});
let api;
try{
 const db=await old.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 await old.dispatchFetch('http://localhost/api/hotels');
 if(grow){
  const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run()}
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;const a=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();if(!a.meta.changes)break}
 }
 // Lifecycle states on every 7th record (closed ones leave the list except in
 // the saved view), extra aliases, and coordinates on about a quarter of the
 // hotels (integers, long decimals, one side only, a string) so that the whole
 // map turns into a grid.
 await db.prepare("INSERT INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state,missing_count,evidence) SELECT id,'2026-10-01','2026-10-01',CASE rowid%28 WHEN 0 THEN 'closed' WHEN 7 THEN 'temporarily_closed' WHEN 14 THEN 'operating' ELSE 'unverified' END,CASE WHEN rowid%21=0 THEN 1 ELSE 0 END,CASE WHEN rowid%14=0 THEN json_object('openedAt','2025-04-01') END FROM hotels WHERE rowid%7=0").run();
 await db.prepare("INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT id,'aliasx'||substr(id,1,6),'Alias '||id FROM hotels WHERE rowid%15=0").run();
 await db.prepare("INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT id,'あいう'||substr(id,-3),'あいう別名' FROM hotels WHERE prefecture='pref-kanagawa' AND rowid%3=0").run();
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.latitude',CASE rowid%5 WHEN 0 THEN 35 ELSE 30.5+(rowid%997)*0.0137123456789 END,'$.location.longitude',CASE rowid%5 WHEN 1 THEN NULL ELSE 129.25+(rowid%991)*0.0153987654321 END) WHERE rowid%4=0").run();
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.latitude','35.5') WHERE rowid%4=0 AND rowid%9=0").run();
 // The collector's end-of-run read (GET /api/crawl) recounts the records, as in
 // production, so the former list's record counter matches the grown table.
 if(!(await old.dispatchFetch('http://localhost/api/crawl?provider=jalan&kind=detail&limit=1',{headers:{'X-Yukemuri-Crawl-Key':'compare-only'}})).ok)throw new Error('collector read failed');
 // Saved hotels of one visitor, closed ones included.
 const saved=(await db.prepare('SELECT id FROM hotels WHERE rowid%61=0 OR rowid%28=0 LIMIT 40').all()).results.map(r=>r.id);
 for(const id of saved)await db.prepare('INSERT INTO visitor_favorites (visitor_key,hotel_id) VALUES (?,?)').bind(createRequire(import.meta.url)('node:crypto').createHash('sha256').update(VISITOR).digest('hex'),id).run();
 const counts={};for(const t of ['hotels','hotel_names','hotel_lifecycle','visitor_favorites'])counts[t]=(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
 api=await formerSearchApi({db,favorites:async visitor=>(await (await old.dispatchFetch('http://localhost/api/favorites',{headers:visitor?{'X-Yukemuri-Visitor':visitor}:{}})).json()).ids});

 const crawled=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')),real=JSON.parse(readFileSync('lib/hotels.real.json','utf8'));
 const ja=crawled.find(h=>h.names?.ja?.length>=4).names.ja,ko=real.find(h=>/[가-힣]{3}/.test(h.names?.ko??'')).names.ko,en=crawled.find(h=>/[A-Za-z]{5}/.test(h.names?.en??'')).names.en;
 const queries=['あいう','aliasx','Alias trip',ja.slice(0,3),ja,ko.slice(0,2),ko,en.split(' ')[0],en.toUpperCase(),en.slice(0,4)+'x'+en.slice(5),'온천','ホテル','hotel','箱根','하코네','유후인','由布院','noboribetsu','soznkyo','소잔쿄','zzzzqqq',"%' OR 1=1 --",'あ'.repeat(100)];
 const paths=[];
 for(const sort of ['recommended','rating','reviews','name'])for(const extra of ['','&features=natural','&features=natural,outdoor&rating=9&reviews=50','&ryokan=1','&region=pref-hokkaido','&region=pref-oita&features=natural','&provider=jalan&rating=4','&reviews=100','&rating=10&reviews=5000'])for(const page of [1,2,7])paths.push(`/api/hotels?stable=1&page=${page}&sort=${sort}${extra}`);
 for(const q of queries){const e=encodeURIComponent(q);paths.push(`/api/hotels?stable=1&q=${e}`,`/api/hotels?q=${e}&sort=rating&page=2`,`/api/hotels?stable=1&q=${e}&region=pref-kanagawa`,`/api/hotels?q=${e}&features=natural&rating=9`,`/api/hotels/suggestions?q=${e}`,`/api/hotels/suggestions?q=${e}&features=natural&provider=jalan&rating=4`,`/api/hotels/map?bbox=122,24,146,46&q=${e}`)}
 for(const extra of ['','&q=hotel','&features=natural','&sort=name&page=2'])paths.push(`/api/hotels?saved=1${extra}`,`/api/hotels/map?saved=1&bbox=122,24,146,46${extra}`);
 paths.push('/api/hotels/suggestions?saved=1&q=hotel','/api/hotels/search-index');
 for(const bbox of ['122,24,146,46','129,30,135,36','130.1,31.2,130.9,31.9','139,41,146,46','131.5,33,131.50001,33.00001','100,0,110,10'])for(const extra of ['','&features=natural','&rating=9','&provider=jalan&rating=4&sort=rating','&ryokan=1&region=pref-kumamoto'])paths.push(`/api/hotels/map?bbox=${bbox}${extra}`);
 const results=[];let different=0;
 // COMPARE_ONLY: a regular expression that limits the requests (while debugging).
 const selected=paths.filter(p=>!process.env.COMPARE_ONLY||new RegExp(process.env.COMPARE_ONLY).test(decodeURIComponent(p)));
 for(const p of selected){
  const response=await old.dispatchFetch('http://localhost'+p,{headers:{'X-Yukemuri-Visitor':VISITOR}}),a={status:response.status,body:await response.json()};
  const b=await api.request(p,{visitor:VISITOR});
  const path=new URL(p,'http://localhost').pathname;
  const left=path==='/api/hotels'&&a.status===200?list(a.body,true):a.body,right=path==='/api/hotels'&&b.status===200?list(b.body,false):b.body;
  // Without stable=1 the former response listed similar names in page order,
  // with it (the screen's requests) in match order; screens test membership only.
  if(path==='/api/hotels'&&a.status===200&&!p.includes('stable=1')){left.similarHotelIds=[...left.similarHotelIds].sort();right.similarHotelIds=[...right.similarHotelIds].sort()}
  const same=a.status===b.status&&isDeepStrictEqual(left,right);
  if(!same){different++;if(different<=5){const keys=[...new Set([...Object.keys(left??{}),...Object.keys(right??{})])].filter(k=>!isDeepStrictEqual(left?.[k],right?.[k]));console.log('DIFF '+decodeURIComponent(p)+' fields '+keys.join(',')+'\n'+keys.slice(0,2).map(k=>' old '+k+' '+JSON.stringify(left?.[k]).slice(0,600)+'\n new '+k+' '+JSON.stringify(right?.[k]).slice(0,600)).join('\n'))}}
  results.push({path:decodeURIComponent(p),status:a.status,count:a.body.total??a.body.suggestions?.length??a.body.hotels?.length??null,cells:a.body.cells?.length,points:a.body.points?.length,same});
 }
 const nonEmpty=results.filter(r=>r.count).length,grids=results.filter(r=>r.cells).length,alternatives=results.filter(r=>r.path.startsWith('/api/hotels?')&&r.count===0).length;
 if(out)writeFileSync(out,JSON.stringify({comparedAt:new Date().toISOString(),oldDist,tables:counts,compared:selected.length,different,nonEmpty,mapGrids:grids,emptyLists:alternatives,results},null,1)+'\n');
 console.log(`${different?'Static search comparison FAIL':'Static search comparison PASS'}: ${selected.length} requests, ${different} different, ${nonEmpty} non-empty, ${grids} map grids, ${alternatives} empty lists (alternatives), tables=${JSON.stringify(counts)}`);
 process.exitCode=different?1:0;
}finally{api?.close();await old.dispose();rmSync(temp,{recursive:true,force:true})}
