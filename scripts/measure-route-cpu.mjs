// JavaScript CPU of every public Worker route (P03 PR C), database wait
// excluded. The route modules are bundled for Node (esbuild, the same source
// the Worker builds from) and run over a D1 stand-in on node:sqlite holding a
// prepared catalogue grown to the 2026-10-08 row counts. CPU is
// process.cpuUsage() around the handler minus the CPU spent inside the
// stand-in's database calls. Cold: the first request in a new process (V8 has
// not compiled the code yet; Node's own Request/Response/crypto are used once
// before, as workerd has them built in); warm: the median of 200 requests after 200 more.
// Not measured: Worker isolate start and script parse, and workerd's own work.
// Never touches the production database.
// Usage: node scripts/measure-route-cpu.mjs [--out evidence.json] [--check] [--checked-in] [--only key] [--cold-runs 9]
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const VISITOR='c'.repeat(64),KEY='route-cpu-only',LIMIT_MS=5;
// [key, label, module, method, path, body]. Every public route (no maintenance key).
const ROUTES=ids=>[
 ['detail','상세','hotels/[id]','GET','/api/hotels/'+ids[0],null,{id:ids[0]}],
 ['detailMissing','상세(없는 숙소)','hotels/[id]','GET','/api/hotels/no-such-hotel',null,{id:'no-such-hotel'}],
 ['compare4','비교 4곳','hotel-comparison','GET','/api/hotel-comparison?ids='+ids.slice(0,4).join(',')],
 ['favoritesGet','즐겨찾기 목록','favorites','GET','/api/favorites'],
 ['favoritesPut','즐겨찾기 저장','favorites','PUT','/api/favorites',JSON.stringify({hotelId:ids[1],saved:true})],
 ['photoCredits','사진 출처 첫 쪽','photo-credits','GET','/api/photo-credits'],
 ['photoCreditsNext','사진 출처 다음 쪽','photo-credits','GET','/api/photo-credits?after='+ids[2]],
 ['google','Google 평점(설정 없음)','hotels/[id]/google','GET','/api/hotels/'+ids[0]+'/google',null,{id:ids[0]}],
 ['prices','요금(폐지)','prices','GET','/api/prices'],
 ['collectionStatus','수집 현황(키 없음)','collection-status','GET','/api/collection-status'],
];

// Child: one route, cold or warm, over the database file.
if(process.argv[2]==='--child'){
 const [, , , bundle, dbFile, key, mode]=process.argv;
 const {DatabaseSync}=await import('node:sqlite');
 const sqlite=new DatabaseSync(dbFile);
 let inDb=0;
 const timed=f=>{const t=process.cpuUsage();try{return f()}finally{const d=process.cpuUsage(t);inDb+=d.user+d.system}};
 const stmt=(sql,args=[])=>{
  const run=()=>timed(()=>{const p=sqlite.prepare(sql);return p.all(...args.map(a=>typeof a==='boolean'?Number(a):a))});
  return{bind:(...a)=>stmt(sql,a),
   all:async()=>({results:run(),meta:{}}),
   first:async col=>{const r=run()[0]??null;return col&&r?r[col]:r},
   run:async()=>{const r=run();return{results:r,meta:{changes:0}}},
   raw:async()=>run().map(r=>Object.values(r))};
 };
 globalThis.__ROUTE_ENV={DB:{prepare:sql=>stmt(sql),batch:async list=>{const out=[];timed(()=>sqlite.exec('BEGIN'));try{for(const s of list)out.push(await s.all());timed(()=>sqlite.exec('COMMIT'))}catch(e){timed(()=>sqlite.exec('ROLLBACK'));throw e}return out},exec:async sql=>timed(()=>sqlite.exec(sql))},CRAWL_ACCESS_KEY:KEY};
 const routes=await import(bundle);
 const spec=JSON.parse(key),[k,,mod,method,path,body,params]=spec;
 const handler=routes[mod][method];
 const call=async()=>{
  const request=new Request('http://localhost'+path,{method,headers:{'Content-Type':'application/json','X-Yukemuri-Visitor':VISITOR},body:body??undefined});
  inDb=0;const t=process.cpuUsage();if(process.env.PHASES){let last=process.cpuUsage(),lastDb=0;globalThis.__phase=n=>{const d=process.cpuUsage(last);console.error(n,((d.user+d.system-(inDb-lastDb))/1000).toFixed(2));last=process.cpuUsage();lastDb=inDb}}
  const response=await handler(request,{params:Promise.resolve(params??{})});await response.text();
  const d=process.cpuUsage(t);return{status:response.status,ms:(d.user+d.system-inDb)/1000,dbMs:inDb/1000};
 };
 // Node's Request, Response, JSON and Web Crypto load lazily on first use;
 // workerd has them built in. Use each once (not the route's code) first.
 {const r=new Request('http://localhost/warm',{method:'PUT',headers:{'Content-Type':'application/json','X-A':'b'},body:'{"a":1}'});await r.json();new URL(r.url).searchParams.get('a');await Response.json({a:[1]},{status:404,headers:{'Cache-Control':'no-store'}}).text();await crypto.subtle.digest('SHA-256',new TextEncoder().encode('warm'))}
 if(mode==='profile'){
  const {Session}=await import('node:inspector/promises'),session=new Session();session.connect();
  await session.post('Profiler.enable');await session.post('Profiler.setSamplingInterval',{interval:50});await session.post('Profiler.start');
  const r=await call();const {profile}=await session.post('Profiler.stop');
  const self=new Map(),dt=profile.timeDeltas;const byId=new Map(profile.nodes.map(n=>[n.id,n]));
  profile.samples.forEach((id,i)=>{const n=byId.get(id),k=(n.callFrame.functionName||'(anon)')+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber;self.set(k,(self.get(k)??0)+(dt[i]??0))});
  console.error([...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,v])=>(v/1000).toFixed(2)+'ms '+k).join('\n'));
  console.log(JSON.stringify(r));process.exit(0);
 }
 if(mode==='cold'){console.log(JSON.stringify(await call()));process.exit(0)}
 for(let i=0;i<200;i++)await call();
 const runs=[];for(let i=0;i<200;i++)runs.push(await call());
 const ms=runs.map(r=>r.ms).sort((a,b)=>a-b);
 console.log(JSON.stringify({status:runs[0].status,ms:ms[100],p95:ms[190],dbMs:runs.map(r=>r.dbMs).sort((a,b)=>a-b)[100]}));
 process.exit(0);
}

const argv=process.argv.slice(2),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,check=argv.includes('--check'),grow=!argv.includes('--checked-in');
const require=createRequire(realpathSync(join(ROOT,'node_modules/wrangler/package.json')));
const {Miniflare}=require('miniflare');
const esbuild=createRequire(realpathSync(join(ROOT,'node_modules/vite/package.json')))('esbuild');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-route-cpu-'));
try{
 // The database: migrations, the maintenance preparation, the collector's
 // count (record counter), then copies up to the production row counts.
 const server=join(ROOT,'dist/server'),persist=join(temp,'d1');
 const modules=[{type:'ESModule',path:join(server,'index.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:join(server,p)}))];
 const mf=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'route-cpu'},d1Persist:persist,bindings:{CRAWL_ACCESS_KEY:KEY}});
 let ids,counts={};
 try{
  const db=await mf.getD1Database('DB');
  for(const f of readdirSync(join(ROOT,'drizzle')).filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join(ROOT,'drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
  const keyed={headers:{'X-Yukemuri-Crawl-Key':KEY}};
  if(!(await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',...keyed})).ok)throw new Error('prepare failed');
  if(grow){
   const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
   for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=12271)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(12271-have).run()}
   for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=15417)break;await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(15417-have).run()}
  }
  if(!(await mf.dispatchFetch('http://localhost/api/crawl?provider=jalan&kind=list&limit=1',keyed)).ok)throw new Error('collector count failed');
  ids=(await db.prepare("SELECT id FROM hotels WHERE id NOT LIKE '%-copy%' ORDER BY id LIMIT 4").all()).results.map(r=>r.id);
  // The visitor already has one favourite.
  if(!(await mf.dispatchFetch('http://localhost/api/favorites',{method:'PUT',headers:{'Content-Type':'application/json','X-Yukemuri-Visitor':VISITOR},body:JSON.stringify({hotelId:ids[0],saved:true})})).ok)throw new Error('favourite failed');
  for(const t of ['hotels','crawl_jobs','visitor_favorites'])counts[t]=(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
 }finally{await mf.dispose()}
 const dbFile=readdirSync(persist,{recursive:true}).map(p=>join(persist,p)).find(p=>p.endsWith('.sqlite')&&!p.includes('metadata'));
 if(!dbFile||!existsSync(dbFile))throw new Error('Miniflare D1 file not found');

 // The routes, bundled for Node with cloudflare:workers standing in.
 const shim=join(temp,'workers-shim.mjs');writeFileSync(shim,'export const env=new Proxy({},{get:(_t,k)=>globalThis.__ROUTE_ENV?.[k]});\n');
 const modulesUsed=[...new Set(ROUTES(ids).map(r=>r[2]))];
 const entry=modulesUsed.map(m=>`export * as ${JSON.stringify(m)} from './app/api/${m}/route';`).join('\n');
 const bundle=join(temp,'routes.mjs');
 await esbuild.build({stdin:{contents:entry,resolveDir:ROOT,loader:'ts'},bundle:true,format:'esm',platform:'node',target:'es2022',outfile:bundle,tsconfig:join(ROOT,'tsconfig.json'),alias:{'cloudflare:workers':shim},logLevel:'error',banner:{js:"import {createRequire as __cr} from 'node:module';const require=__cr(import.meta.url);"}});
 if(argv.includes('--profile')){const only=argv[argv.indexOf('--profile')+1];for(const spec of ROUTES(ids).filter(r=>r[0]===only))for(let i=0;i<3;i++){const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',bundle,dbFile,JSON.stringify(spec),'cold'],{encoding:'utf8',cwd:ROOT,env:{...process.env,PHASES:'1'}});console.log(spec[0],r.stdout.trim(),'\n'+r.stderr)}process.exit(0)}
 const results=[],only=argv.includes('--only')?argv[argv.indexOf('--only')+1]:null,coldRuns=argv.includes('--cold-runs')?+argv[argv.indexOf('--cold-runs')+1]:9;
 for(const spec of ROUTES(ids).filter(r=>!only||r[0]===only)){
  const run=mode=>{const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',bundle,dbFile,JSON.stringify(spec),mode],{encoding:'utf8',cwd:ROOT});if(r.status!==0)throw new Error(spec[0]+' '+mode+': '+r.stderr.slice(-800));return JSON.parse(r.stdout.trim().split('\n').at(-1))};
  // Cold: the median of nine (--cold-runs) new processes.
  const colds=Array.from({length:coldRuns},()=>run('cold')).sort((a,b)=>a.ms-b.ms),mid=colds[colds.length>>1],cold=mid.ms,warm=run('warm');
  const row={key:spec[0],label:spec[1],method:spec[3],path:spec[4].replace(/after=[^&]+/,'after=…'),status:warm.status,coldMs:+cold.toFixed(2),warmMs:+warm.ms.toFixed(3),warmP95Ms:+warm.p95.toFixed(3),coldDbMs:+mid.dbMs.toFixed(2),coldMaxMs:+colds.at(-1).ms.toFixed(2)};
  results.push(row);console.log(JSON.stringify(row));
 }
 const over=results.filter(r=>r.coldMs>LIMIT_MS||r.warmMs>LIMIT_MS);
 const report={measuredAt:new Date().toISOString(),node:process.version,tables:counts,limitMs:LIMIT_MS,results,note:'JavaScript CPU (user+system) of the route handler in Node, minus CPU spent inside the node:sqlite D1 stand-in. cold = median (and max) of 9 first requests in new processes; warm = median (and p95) of 200 requests after 200 warm-up requests. Isolate start, script parse and workerd overhead are not included.'};
 if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
 console.log(`Route CPU ${over.length?'FAIL':'PASS'}: ${results.length} public routes, cold max ${Math.max(...results.map(r=>r.coldMs)).toFixed(2)}ms, warm max ${Math.max(...results.map(r=>r.warmMs)).toFixed(3)}ms (limit ${LIMIT_MS}ms)${over.length?': '+over.map(r=>r.key).join(', '):''}; tables=${JSON.stringify(counts)}`);
 if(check&&over.length)process.exitCode=1;
}finally{rmSync(temp,{recursive:true,force:true})}
