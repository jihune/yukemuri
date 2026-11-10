// V01 scratch: PUT the payloads the Python parser made to the built Worker on a throwaway D1 (Miniflare).
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-v01-contract-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'contract-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'contract-test-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(path,method,data)=>{const r=await runtime.dispatchFetch('http://localhost'+path,{method,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'contract-test-only'},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,body:await r.json()}};
 await api('/api/crawl-prepare','POST');
 const cases=JSON.parse(readFileSync(process.argv[2],'utf8'));
 let refused=0;
 for(const [label,c] of Object.entries(cases)){
  await db.prepare('DELETE FROM crawl_jobs').run();await db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'crawl-provider-ready:%'").run();
  await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan',?,'pref-tokyo','pending',0,0)").bind(c.url,c.kind).run();
  const token=randomUUID(),claim=await api('/api/crawl','POST',{provider:'jalan',phase:c.kind,token});
  const put=await api('/api/crawl','PUT',{...c.payload,claimToken:token});
  const job=await db.prepare('SELECT status,attempts,lease_until>0 AS leased FROM crawl_jobs WHERE url=?').bind(c.url).first();
  if(put.status!==200)refused++;
  console.log(`${label}: claim jobs=${claim.body.jobs?.length} PUT ${put.status} ${put.status===200?'accepted='+put.body.accepted:JSON.stringify(put.body)} | job after: status=${job.status} attempts=${job.attempts} leased=${job.leased}`);
 }
 console.log(`refused=${refused} of ${Object.keys(cases).length}`);
 // The next run: the refused page's claim has expired (the checks' way, lease_until=0), two other pages wait.
 const again=cases['name of 401 characters'];
 await db.prepare('DELETE FROM crawl_jobs').run();await db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'crawl-provider-ready:%'").run();
 for(const url of [again.url,'https://www.jalan.net/yad399500/','https://www.jalan.net/yad399501/'])await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail','pref-tokyo','pending',0,0)").bind(url).run();
 for(const run of [1,2,3]){
  const token=randomUUID(),claim=await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token,lane:run===1?'national':'priority'});
  const put=await api('/api/crawl','PUT',{...again.payload,claimToken:token});
  console.log(`run ${run}: claimed ${claim.body.jobs[0]?.url} (the refused page: ${claim.body.jobs[0]?.url===again.url}), PUT ${put.status}`);
  await db.prepare('UPDATE crawl_jobs SET lease_until=0').run();await db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'crawl-provider-ready:%'").run();
 }
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
