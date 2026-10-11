// Size and D1 reads of one search snapshot build, on a temporary D1 at the
// checked-in size or (--grow) grown to the 2026-10-08 production row counts
// the way measure-d1-reads.mjs grows it. Copies compress better than real rows,
// so the grown sizes also carry an estimate: checked-in compressed size times
// the row ratio. Never touches the production database.
// Usage: node scripts/measure-search-snapshot.mjs [--grow] [--out evidence.json] [--keep dir]
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildSnapshot} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),grow=argv.includes('--grow'),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,keep=argv.includes('--keep')?argv[argv.indexOf('--keep')+1]:null;
const TARGET={hotels:12271,hotel_names:13849,crawl_jobs:15417,hotel_lifecycle:1621};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-snapshot-measure-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'measure'},d1Persist:join(temp,'d1'),bindings:{CRAWL_ACCESS_KEY:'measure-only'}});
try{
 const db=await mf.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const prepared=await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':'measure-only'}});if(!prepared.ok)throw new Error('prepare '+prepared.status);
 const checkedIn=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;
 // A checked-in-size build first: its compressed sizes scale the grown estimate.
 const base=await buildSnapshot({db,out:join(temp,'base')});
 if(grow){
  const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run()}
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;const a=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();if(!a.meta.changes)break}
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=TARGET.crawl_jobs)break;await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(TARGET.crawl_jobs-have).run()}
  await db.prepare("INSERT OR IGNORE INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state) SELECT id,'2026-10-01','2026-10-01',CASE rowid%28 WHEN 0 THEN 'closed' WHEN 7 THEN 'temporarily_closed' ELSE 'unverified' END FROM hotels WHERE rowid%7=0 LIMIT ?").bind(TARGET.hotel_lifecycle).run();
 }
 const counts={};for(const t of Object.keys(TARGET))counts[t]=(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
 const result=grow?await buildSnapshot({db,out:join(temp,'grown')}):base,ratio=counts.hotels/checkedIn;
 const estimate=Object.fromEntries(Object.entries(base.sizes).map(([k,v])=>[k,{raw:Math.round(v.raw*ratio),gzip:Math.round(v.gzip*ratio),brotli:Math.round(v.brotli*ratio)}]));
 const report={measuredAt:new Date().toISOString(),tables:counts,rowsRead:result.rowsRead,queries:result.queries,ms:result.ms,snapshot:result.manifest.id,sizes:result.sizes,...(grow?{estimateFromCheckedIn:{ratio:+ratio.toFixed(3),sizes:estimate}}:{}),note:'rowsRead: Miniflare D1 meta.rows_read summed over the build; sizes in bytes (gzip level 9, brotli quality 11).'};
 if(keep)cpSync(join(temp,grow?'grown':'base'),keep,{recursive:true});
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 const kb=n=>(n/1024).toFixed(0)+'KiB';
 console.log(`Snapshot measure: tables=${JSON.stringify(counts)} rows read ${result.rowsRead} in ${result.queries} queries, ${result.ms}ms`);
 for(const [k,v] of Object.entries(result.sizes))console.log(`  ${k}: ${kb(v.raw)} raw, ${kb(v.gzip)} gzip, ${kb(v.brotli)} brotli${grow?` (estimate ${kb(estimate[k].raw)}/${kb(estimate[k].gzip)}/${kb(estimate[k].brotli)})`:''}`);
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
