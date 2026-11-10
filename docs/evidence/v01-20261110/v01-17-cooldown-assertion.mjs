// V01-17: what scripts/check-crawl-queue-worker.mjs observes after a 429 ("Cooldown includes
// enrichment": the next claim is empty and not exhausted) is the same after a failure that sets no
// provider wait at all, because every saved page makes the provider wait 3 seconds. Only the stored
// crawl-provider-ready value tells a six-hour wait from none, and the check does not read it for
// 403, 429 or a bot challenge. Built Worker, throwaway D1 (Miniflare). Run from the repository root
// after a build: node docs/evidence/v01-20261110/v01-17-cooldown-assertion.mjs
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-v01-cooldown-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'cooldown-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'cooldown-test-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(path,method,data)=>{const r=await runtime.dispatchFetch('http://localhost'+path,{method,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'cooldown-test-only'},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,body:await r.json()}};
 await api('/api/crawl-prepare','POST');
 for(const [label,failure] of [['http_429 with a reported wait of 7200 s',{error:'http_429',retryAfterSeconds:7200,providerCooldownSeconds:7200}],['http_403',{error:'http_403',retryAfterSeconds:86400,providerCooldownSeconds:86400}],['http_503 without Retry-After (no provider wait)',{error:'http_503',retryAfterSeconds:60}]]){
  await db.prepare('DELETE FROM crawl_jobs').run();await db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'crawl-provider-ready:%'").run();
  for(const n of [1,2])await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail','pref-tokyo','pending',0,0)").bind(`https://www.jalan.net/yad39960${n}/`).run();
  const token=randomUUID(),claim=await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token});
  const put=await api('/api/crawl','PUT',{url:claim.body.jobs[0].url,status:'retry',observations:[],links:[],claimToken:token,...failure});
  const next=await api('/api/crawl','POST',{provider:'jalan',phase:'detail',token:randomUUID()});
  const ready=Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").first()).value)-Date.now()/1000;
  console.log(`${label}: PUT ${put.status}; the next claim at once: jobs=${next.body.jobs.length} exhausted=${next.body.exhausted} (what the check asserts); stored provider wait: ${Math.round(ready)} s`);
 }
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
