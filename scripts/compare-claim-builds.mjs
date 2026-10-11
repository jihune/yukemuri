// Successive crawl claims of two Worker builds on copies of one temporary D1:
// for every phase and lane a gentle run uses, the claimed jobs in order and
// their lease fields must be the same. The old build's DB keeps only the
// migrations it was built with. Never touches the production database.
// Usage: node scripts/compare-claim-builds.mjs <old build dir> <new build dir> [--old-schema 0012] [--grow] [--out evidence.json]
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const argv=process.argv.slice(2),[oldDist,newDist]=argv,grow=argv.includes('--grow'),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,oldSchema=argv.includes('--old-schema')?argv[argv.indexOf('--old-schema')+1]:'9999';
if(!oldDist||!newDist)throw new Error('Usage: compare-claim-builds.mjs <old build dir> <new build dir> [--old-schema 0012] [--grow] [--out file]');
const TARGET={hotels:12271,hotel_names:13849,crawl_jobs:15417};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-claims-'));
const start=(dist,db)=>{
 const server=resolve(dist,'server');
 const modules=[{type:'ESModule',path:join(server,'index.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:join(server,p)}))];
 return new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'claims'},d1Persist:db,bindings:{CRAWL_ACCESS_KEY:'claims-only'}});
};
const migrate=async(db,from,to)=>{for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f.slice(0,4)>from&&f.slice(0,4)<=to).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run()};
const runtimes=[];
try{
 const seed=start(oldDist,join(temp,'seed'));runtimes.push(seed);
 const db=await seed.getD1Database('DB');
 await migrate(db,'',oldSchema);
 await seed.dispatchFetch('http://localhost/api/hotels');
 if(grow){
  const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET.hotels)break;await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}') FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET.hotels-have).run()}
  for(let n=1;;n++){const have=(await db.prepare('SELECT COUNT(*) AS n FROM crawl_jobs').first()).n;if(have>=TARGET.crawl_jobs)break;await db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at) SELECT url||'copy${n}/',provider,kind,prefecture,priority,status,attempts,next_at,error,fetched_at FROM crawl_jobs WHERE url NOT LIKE '%copy%' LIMIT ?`).bind(TARGET.crawl_jobs-have).run()}
 }
 // Varied queue facts, so retries, refresh dates and attempts take part in the order.
 await db.prepare("UPDATE crawl_jobs SET status='retry',attempts=1+rowid%3,next_at=0 WHERE rowid%13=0 AND status='pending'").run();
 await db.prepare("UPDATE crawl_jobs SET fetched_at=strftime('%Y-%m-%dT%H:%M:%SZ','2026-07-01','+'||(rowid%90)||' days') WHERE status IN ('done','failed') OR rowid%17=0").run();
 await db.prepare("UPDATE crawl_jobs SET status='failed',next_at=1 WHERE rowid%29=0 AND status='done'").run();
 await seed.dispose();runtimes.length=0;
 cpSync(join(temp,'seed'),join(temp,'old'),{recursive:true});cpSync(join(temp,'seed'),join(temp,'new'),{recursive:true});
 const A=start(oldDist,join(temp,'old')),B=start(newDist,join(temp,'new'));runtimes.push(A,B);
 await migrate(await B.getD1Database('DB'),oldSchema,'9999');
 const groups=[['jalan','detail'],['jalan','baths'],['trip','detail'],['jalan','refresh'],['trip','refresh'],['jalan','list'],['trip','list'],['trip','names']];
 const sequence=async m=>{
  const mdb=await m.getD1Database('DB'),seen=[];
  for(const [provider,phase] of groups)for(const lane of ['priority','national'])for(let i=0;i<6;i++){
   const token=randomUUID(),r=await m.dispatchFetch('http://localhost/api/crawl',{method:'POST',headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'claims-only'},body:JSON.stringify({provider,phase,lane,token})});
   assert.equal(r.status,200);const job=(await r.json()).jobs[0],now=Date.now()/1000;
   seen.push({provider,phase,lane,url:job?.url??null,status:job?.status??null,ownLease:job?job.lease_token===token:null,leaseSeconds:job?Math.round(job.lease_until-now):null});
   // Done with this one: out of every lane, the provider free again.
   if(job)await mdb.prepare('UPDATE crawl_jobs SET lease_token=NULL,lease_until=0,next_at=9e9 WHERE url=?').bind(job.url).run();
  }
  return seen;
 };
 const [before,after]=[await sequence(A),await sequence(B)];
 const different=before.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(after[i])).length,claimed=before.filter(c=>c.url).length;
 if(out)writeFileSync(out,JSON.stringify({comparedAt:new Date().toISOString(),oldBuild:'see P02-20261011.md',grown:grow,claims:before.length,claimed,different,before,after},null,1)+'\n');
 console.log(`${different?'Claim comparison FAIL':'Claim comparison PASS'}: ${before.length} successive claims (${claimed} with a job), ${different} different, grown=${grow}`);
 process.exitCode=different?1:0;
}finally{for(const r of runtimes)await r.dispose();rmSync(temp,{recursive:true,force:true})}
