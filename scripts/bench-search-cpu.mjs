// JavaScript CPU time of the search code, outside the Worker: the lib/ modules
// compiled for Node, with env.DB replaced by node:sqlite on a copy of a
// temporary D1 grown to the 2026-10-08 row counts. SQLite time is measured
// separately and subtracted, since in production it is spent in D1, not in
// the Worker. Not Worker CPU: V8 versions, JIT state and isolate limits differ.
// Usage: node scripts/bench-search-cpu.mjs [--old <git commit>] [--runs 15] [--out evidence.json]
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync,mkdirSync,existsSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execSync,spawnSync} from 'node:child_process';
const argv=process.argv.slice(2),old=argv.includes('--old')?argv[argv.indexOf('--old')+1]:null,runs=Number(argv.includes('--runs')?argv[argv.indexOf('--runs')+1]:15),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null;
const TARGET={hotels:12271,hotel_names:13849,crawl_jobs:15417};
if(process.env.BENCH_CHILD){
 // Child: one version, one scenario. Prints JSON samples.
 const {DatabaseSync}=await import('node:sqlite');
 const req=createRequire(import.meta.url);
 const [libDir,dbFile,scenario,mode,count]=process.env.BENCH_CHILD.split('|');
 const sqlite=new DatabaseSync(dbFile);let sqliteMs=0;
 const exec=(sql,args,method)=>{const t=performance.now();try{const s=sqlite.prepare(sql);return method==='all'?s.all(...args):s.run(...args)}finally{sqliteMs+=performance.now()-t}};
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),all:async()=>({results:exec(sql,args,'all'),meta:{}}),first:async c=>{const r=exec(sql,args,'all')[0]??null;return c===undefined?r:r?r[c]??null:null},run:async()=>{const r=exec(sql,args,'run');return{results:[],meta:{changes:Number(r.changes)}}},__sql:sql,__args:args});
 const DB={prepare:sql=>statement(sql),batch:async list=>{const t=performance.now();sqlite.exec('BEGIN');sqliteMs+=performance.now()-t;try{const r=list.map(s=>({results:exec(s.__sql,s.__args,'all'),meta:{changes:0}}));sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 globalThis.__BENCH_ENV={DB};
 const filters=(f={})=>({region:'all',query:'',ratingProvider:'trip',features:[],minRating:0,minReviews:0,ryokanOnly:false,...f});
 const ja=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')).find(h=>h.names?.ja?.length>=4).names.ja.slice(0,3);
 const scenarios={
  list:r=>r.hotelRepository.search(filters(),'recommended',1,false,[],{stable:true,fresh:true}),
  listJalan:r=>r.hotelRepository.search(filters({ratingProvider:'jalan',minRating:4}),'rating',1,false,[],{stable:true,fresh:true}),
  listFilters:r=>r.hotelRepository.search(filters({features:['natural'],minRating:9,minReviews:50}),'recommended',1,false,[],{stable:true,fresh:true}),
  listPage2:r=>r.hotelRepository.search(filters(),'recommended',2,false,[],{fresh:true}),
  nameJa:r=>r.hotelRepository.search(filters({query:ja}),'recommended',1,false,[],{stable:true,fresh:true}),
  nameKo:r=>r.hotelRepository.search(filters({query:'노보리베츠'}),'recommended',1,false,[],{stable:true,fresh:true}),
  map:r=>r.hotelRepository.mapArea(filters(),{west:122,south:24,east:146,north:46}),
  mapName:r=>r.hotelRepository.mapArea(filters({query:ja}),{west:122,south:24,east:146,north:46}),
  // Parts: loading the snapshot (core, then with text) without a search.
  snapshotCore:()=>req(join(libDir,'lib/hotel-search-snapshot.js')).searchSnapshot(false),
  snapshotText:()=>req(join(libDir,'lib/hotel-search-snapshot.js')).searchSnapshot(true),
 };
 const load=()=>{for(const k of Object.keys(req.cache))if(k.startsWith(libDir))delete req.cache[k];return req(join(libDir,'lib/hotel-repository.js'))};
 const samples=[];
 let repo=load();await repo.hotelRepository.ready();
 if(mode==='warm')await scenarios[scenario](repo);
 for(let i=0;i<Number(count);i++){
  if(mode==='cold'){repo=load();await repo.hotelRepository.ready()}
  sqliteMs=0;const c=process.cpuUsage();await scenarios[scenario](repo);const d=process.cpuUsage(c);
  samples.push(+((d.user+d.system)/1000-sqliteMs).toFixed(2));
 }
 console.log(JSON.stringify(samples));
 process.exit(0);
}
const temp=mkdtempSync(join(tmpdir(),'yukemuri-cpu-'));
symlinkSync(resolve('node_modules'),join(temp,'node_modules'));
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const compile=(root,name)=>{
 // lib/ of a checkout compiled to CommonJS; cloudflare:workers is the bench env.
 const dir=join(temp,name);
 const r=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),join(root,'lib/hotel-repository.ts'),'--outDir',dir,'--rootDir',root,'--module','commonjs','--target','es2022','--esModuleInterop','--skipLibCheck','--resolveJsonModule','--moduleResolution','node'],{encoding:'utf8'});
 const db=join(dir,'lib/favorites-db.js');if(!existsSync(db))throw new Error(r.stdout+r.stderr);
 writeFileSync(db,readFileSync(db,'utf8').replace(/require\("cloudflare:workers"\)/,'({env:globalThis.__BENCH_ENV})'));
 return dir;
};
try{
 // A grown D1 file, made with the current build and migrations.
 const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
 const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'bench'},d1Persist:join(temp,'d1'),bindings:{CRAWL_ACCESS_KEY:'bench-only'}});
 const db=await mf.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 await mf.dispatchFetch('http://localhost/api/hotels');
 const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
 for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run()}
 for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotel_names').first()).n;if(have>=TARGET.hotel_names)break;const a=await db.prepare(`INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT h.id,n.name_key||'${n}',n.name FROM hotel_names n JOIN hotels h ON h.id LIKE n.hotel_id||'-copy%' WHERE n.hotel_id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotel_names-have).run();if(!a.meta.changes)break}
 await mf.dispatchFetch('http://localhost/api/hotels?fresh=1');
 await mf.dispose();
 const file=readdirSync(join(temp,'d1'),{recursive:true}).find(p=>p.endsWith('.sqlite'));
 const dbFile=join(temp,'bench.sqlite');cpSync(join(temp,'d1',file),dbFile);
 const versions={current:compile(resolve('.'),'current')};
 if(old){
  const src=join(temp,'old-src');mkdirSync(src);
  execSync(`git archive ${old} lib data | tar -x -C ${src}`);
  for(const f of ['lib/hotels.crawled.json','data/crawl-jobs.json'])cpSync(f,join(src,f));
  versions[old]=compile(src,'old');
 }
 const stat=a=>{const s=[...a].sort((x,y)=>x-y);return{median:s[Math.floor(s.length/2)],p95:s[Math.min(s.length-1,Math.ceil(s.length*0.95)-1)],max:s.at(-1)}};
 const report={measuredAt:new Date().toISOString(),runs,environment:`Node ${process.version} (V8 ${process.versions.v8}), node:sqlite on a copy of a grown temporary D1. JavaScript CPU = process CPU minus time inside SQLite. Not Worker CPU.`,results:[]};
 for(const [version,libDir] of Object.entries(versions))for(const scenario of (process.env.BENCH_SCENARIOS?.split(',')??['list','listJalan','listFilters','listPage2','nameJa','nameKo','map','mapName',...(version==='current'?['snapshotCore','snapshotText']:[])]))for(const mode of ['cold','warm']){
  const r=spawnSync(process.execPath,[resolve('scripts/bench-search-cpu.mjs')],{encoding:'utf8',env:{...process.env,BENCH_CHILD:[libDir,dbFile,scenario,mode,runs].join('|')},maxBuffer:1<<24});
  const line=r.stdout.trim().split('\n').at(-1);let samples;try{samples=JSON.parse(line)}catch{throw new Error(r.stdout+r.stderr)}
  const row={version,scenario,mode,...stat(samples)};report.results.push(row);console.log(JSON.stringify(row));
 }
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
}finally{if(!process.env.BENCH_KEEP)rmSync(temp,{recursive:true,force:true});else console.log('kept '+temp)}
