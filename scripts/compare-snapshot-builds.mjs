// P04: the search snapshot built by an earlier commit's lib/ and by this
// checkout's, from one temporary D1 grown to the 2026-10-17 production size,
// with varied queue states, errors, leases, lifecycle rows and hotel columns.
// Every snapshot file must be byte-identical; only the rows read may differ.
// Both builds run twice: with the D1 binding's own parameters, and with every
// parameter sent as a string, as --remote sends them (remoteSource).
// Never touches the production database.
// Usage: node scripts/compare-snapshot-builds.mjs <base commit> [--out evidence.json] [--hotels n] [--control]
//  --control  change one queue row between the two builds: the comparison must fail
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,execSync} from 'node:child_process';
import {buildSnapshot,compileLib} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),[base]=argv,arg=k=>argv.includes(k)?argv[argv.indexOf(k)+1]:null;
if(!base||base.startsWith('--'))throw new Error('Usage: compare-snapshot-builds.mjs <base commit> [--out file] [--hotels n] [--control]');
const out=arg('--out'),HOTELS=Number(arg('--hotels')??23032),control=argv.includes('--control');
const TARGET={hotels:HOTELS,hotel_names:Math.round(HOTELS*13849/12271),crawl_jobs:Math.round(HOTELS*1.3)};
const NOW=new Date('2026-10-18T04:00:00Z'),now=NOW.getTime()/1000;
const temp=mkdtempSync(join(tmpdir(),'yukemuri-snapshot-compare-'));
try{
 // The base commit's lib/ and data/, compiled the way its own builder compiles them.
 const old=join(temp,'base');mkdirSync(old);
 execSync(`git archive ${base} lib data scripts/build-search-snapshot.mjs scripts/build-static-page.mjs scripts/snapshot-geo.mjs scripts/cloudflare-usage.mjs tsconfig.json | tar -x -C ${old}`);
 symlinkSync(resolve('node_modules'),join(old,'node_modules'));
 const builders={};
 for(const [name,compile] of [['base',(await import(join(old,'scripts/build-search-snapshot.mjs'))).compileLib],['current',compileLib]]){const dir=join(temp,'compiled-'+name);mkdirSync(dir);builders[name]=createRequire(import.meta.url)(compile(dir))}
 builders.currentFeatures=createRequire(import.meta.url)(join(temp,'compiled-current','lib','hotel-bath-facts.js')).FEATURE_KEYS;
 const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
 const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'compare'},d1Persist:join(temp,'d1'),bindings:{CRAWL_ACCESS_KEY:'compare-only'}});
 // The lib/ each build compiled: its commit and a digest of its files (the
 // current one may hold uncommitted changes, which the digest shows).
 const libDigest=dir=>{const h=createHash('sha256');for(const f of readdirSync(join(dir,'lib'),{recursive:true}).filter(f=>/\.(ts|json)$/.test(f)).sort())h.update(f+'\n').update(readFileSync(join(dir,'lib',f))).update('\n');return h.digest('hex').slice(0,16)};
 const head=execSync('git rev-parse --short HEAD').toString().trim(),dirty=execSync('git status --porcelain -- lib').toString().trim()!=='';
 const report={measuredAt:new Date().toISOString(),base:{commit:execSync(`git rev-parse --short ${base}`).toString().trim(),lib:libDigest(old)},current:{head,libChangedFromHead:dirty,lib:libDigest('.')},environment:'Miniflare local D1 in the Claude Code cloud container. Not production D1.',builds:{}};
 try{
  const db=await mf.getD1Database('DB');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
  for(let i=0;;i++){const r=await (await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':'compare-only'}})).json();if(r.done)break;if(i>60)throw new Error('crawl-prepare did not finish')}
  // Copies of the checked-in rows under new ids, as measure-d1-reads.mjs grows them.
  const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run()}
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;const a=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();if(!a.meta.changes)break}
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=TARGET.crawl_jobs)break;await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(TARGET.crawl_jobs-have).run()}
  // Varied states the snapshot counts: every queue status, each error class,
  // recent and old fetches, active leases, a provider of another name, provider
  // pauses; lifecycle rows of every kind (some hotels without one, some rows
  // without a hotel); hotels without a prefecture and with each bath column.
  const errors=['http_404','http_410','http_403','robots_http_429','source_access_bot_challenge','URLError','http_503','robots_http_500','ValueError','source_data_requires_review','source_redirect_page_review','unsupported_source','something_else'];
  await db.prepare(`UPDATE crawl_jobs SET status=CASE rowid%9 WHEN 0 THEN 'retry' WHEN 1 THEN 'failed' WHEN 2 THEN 'running' WHEN 3 THEN 'skipped' ELSE status END,
   error=CASE WHEN rowid%7=0 THEN json_extract(?,'$['||(rowid%${errors.length})||']') ELSE error END,
   fetched_at=CASE rowid%5 WHEN 0 THEN strftime('%Y-%m-%dT%H:%M:%SZ',?-rowid%80000,'unixepoch') WHEN 1 THEN NULL ELSE fetched_at END,
   lease_until=CASE WHEN rowid%211=0 THEN ?+60 WHEN rowid%223=0 THEN ?-60 ELSE lease_until END`).bind(JSON.stringify(errors),now,now,now).run();
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,status,attempts,next_at,fetched_at) VALUES ('https://example.com/other-1/','other','detail','done',1,0,'2026-10-17T00:00:00Z'),('https://example.com/other-2/','other','list','pending',0,0,NULL)").run();
  await db.prepare("INSERT INTO catalog_meta (key,value) VALUES ('crawl-provider-ready:jalan',?),('crawl-provider-ready:trip',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now+3600),String(now+5)).run();
  await db.prepare(`INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,last_detail_at,missing_count,missing_at,state,checked_at,evidence)
   SELECT id,'2026-10-01T00:00:00Z','2026-10-1'||(rowid%8)||'T00:00:00Z',CASE WHEN rowid%3=0 THEN '2026-10-15T00:00:00Z' END,CASE WHEN rowid%41=0 THEN 2 ELSE 0 END,CASE WHEN rowid%41=0 THEN '2026-10-16T00:00:00Z' END,
    CASE rowid%97 WHEN 0 THEN 'temporarily_closed' WHEN 1 THEN 'closed' WHEN 2 THEN 'open' ELSE 'unverified' END,CASE WHEN rowid%97<3 THEN '2026-10-12T00:00:00Z' END,
    CASE WHEN rowid%97<3 THEN json_object('id',id,'state','x','sourceUrl','https://example.jp/notice','evidence','Official notice.') END
   FROM hotels WHERE rowid%13!=0 ON CONFLICT DO NOTHING`).run();
  await db.prepare("INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at) VALUES ('jalan-0000001','2026-10-01T00:00:00Z','2026-10-02T00:00:00Z'),('zzzz-orphan','2026-10-01T00:00:00Z','2026-10-02T00:00:00Z') ON CONFLICT DO NOTHING").run();
  await db.prepare("UPDATE hotels SET prefecture=CASE WHEN rowid%101=0 THEN NULL ELSE prefecture END,room_onsen=CASE rowid%4 WHEN 0 THEN 1 WHEN 1 THEN 0 ELSE room_onsen END,natural=CASE rowid%6 WHEN 0 THEN 1 ELSE natural END").run();
  // Cases a count can get wrong without changing any other output: a bath fact
  // only outside the bath mask (jalanHighClass), lifecycle evidence the cards
  // carry (openedAt), the queue's latest fetch outside a provider's first
  // group, and a detail label on a hotel's second source only.
  const highClass=1<<builders.currentFeatures.indexOf('jalanHighClass');
  await db.prepare('UPDATE hotels SET bath_known=? WHERE rowid%37=0').bind(highClass).run();
  await db.prepare("UPDATE hotel_lifecycle SET evidence=json_object('id',hotel_id,'state','open','openedAt','2026-09-0'||(rowid%9+1)) WHERE rowid%17=0").run();
  await db.prepare("UPDATE crawl_jobs SET fetched_at='2026-10-18T03:59:59Z' WHERE rowid=(SELECT MAX(rowid) FROM crawl_jobs WHERE provider='trip' AND kind='list' AND status NOT IN ('skipped','done'))").run();
  await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.sources[1].label','상세 페이지') WHERE rowid%23=0 AND json_array_length(payload,'$.sources')>1 AND json_extract(payload,'$.sources[0].label') NOT LIKE '%상세%'").run();
  report.tables=Object.fromEntries(await Promise.all(['hotels','hotel_names','crawl_jobs','hotel_lifecycle'].map(async t=>[t,(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n])));
  // --remote sends every parameter as a string (remoteSource: params:args.map(String)).
  const asStrings={prepare:sql=>{const wrap=st=>({bind:(...a)=>wrap(st.bind(...a.map(String))),all:()=>st.all()});return wrap(db.prepare(sql))}};
  for(const [mode,source] of [['numbers',db],['strings',asStrings]])for(const name of ['base','current']){
   if(control&&mode==='numbers'&&name==='current')await db.prepare("UPDATE crawl_jobs SET error='http_404' WHERE rowid=(SELECT MIN(rowid) FROM crawl_jobs WHERE error IS NULL AND status!='skipped' AND provider='jalan')").run();
   const dir=join(temp,`out-${mode}-${name}`),key=`${mode}:${name}`;
   const r=await buildSnapshot({db:source,out:dir,now:NOW,builder:builders[name],skipReason:'compare-snapshot-builds',wikidata:new Map()});
   const files={};for(const f of readdirSync(dir,{recursive:true}).filter(f=>!f.endsWith('/')).sort()){try{files[f]=readFileSync(join(dir,f))}catch{}}
   report.builds[key]={id:r.manifest.id,hotels:r.manifest.hotels,queries:r.queries,rowsRead:r.rowsRead,files:Object.keys(files).length};builders[key+'Files']=files;
   console.log(`${key}: snapshot ${r.manifest.id}, ${r.manifest.hotels} hotels, ${r.queries} queries, ${r.rowsRead} rows read, ${Object.keys(files).length} files`);
  }
 }finally{await mf.dispose()}
 const failures=[];
 for(const mode of ['numbers','strings']){
  const a=builders[mode+':baseFiles'],b=builders[mode+':currentFiles'],x=report.builds[mode+':base'],y=report.builds[mode+':current'];
  if(x.id!==y.id)failures.push(`${mode}: manifest id ${x.id} / ${y.id}`);
  for(const f of new Set([...Object.keys(a),...Object.keys(b)]))if(!a[f]||!b[f]||!a[f].equals(b[f]))failures.push(mode+': '+f);
 }
 report.failures=failures;
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 console.log(failures.length?`Snapshot build comparison FAIL ${failures.length}: ${failures.slice(0,10).join('; ')}`:`Snapshot build comparison PASS: ${report.builds['numbers:current'].files} files identical with numeric and string parameters, rows read ${report.builds['numbers:base'].rowsRead} -> ${report.builds['numbers:current'].rowsRead}`);
 if(failures.length)process.exitCode=1;
}finally{rmSync(temp,{recursive:true,force:true})}
