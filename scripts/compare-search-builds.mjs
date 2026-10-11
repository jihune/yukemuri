// Compare the search responses of two Worker builds on copies of one temporary
// D1 grown to the 2026-10-08 row counts, with closed/temporarily closed records
// and extra aliases. Never touches the production database.
// Usage: node scripts/compare-search-builds.mjs <old build dir> <new build dir> [--out evidence.json]
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
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
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
 // Result-session tokens and times differ by construction; everything else must match.
 const clean=v=>JSON.parse(JSON.stringify(v,(k,x)=>['token','createdAt','expiresAt','measuredAt'].includes(k)?undefined:x));
 const results=[];let different=0;
 for(const p of paths){
  const [a,b]=await Promise.all([A,B].map(async m=>{const r=await m.dispatchFetch('http://localhost'+p,{headers:{'X-Yukemuri-Visitor':'e'.repeat(64)}});return{status:r.status,body:clean(await r.json())}}));
  const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,16),same=hash(a)===hash(b);
  if(!same){different++;console.log('DIFF '+p)}
  results.push({path:decodeURIComponent(p),status:a.status,count:a.body.total??a.body.suggestions?.length??a.body.hotels?.length??null,same,hash:hash(a)});
 }
 const nonEmpty=results.filter(r=>r.count).length;
 if(out)writeFileSync(out,JSON.stringify({comparedAt:new Date().toISOString(),oldDist,newDist,tables:counts,compared:paths.length,different,nonEmpty,results},null,1)+'\n');
 console.log(`${different?'Search comparison FAIL':'Search comparison PASS'}: ${paths.length} requests, ${different} different, ${nonEmpty} non-empty, tables=${JSON.stringify(counts)}`);
 process.exitCode=different?1:0;
}finally{for(const r of runtimes)await r.dispose();rmSync(temp,{recursive:true,force:true})}
