// Reviewer's probe (not part of the repository): what the built Worker in the current
// directory does with three inputs the added assertions do not send. Run it with a clone
// (or a copy holding a rebuilt Worker) as the working directory. It prints values and
// asserts nothing.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-probe-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'probe-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'probe-test-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(path,method,data)=>{const r=await runtime.dispatchFetch('http://localhost'+path,{method,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'probe-test-only'},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,body:await r.json()}};
 console.log('prepare:',(await api('/api/crawl-prepare','POST')).status);
 await db.prepare('DELETE FROM crawl_jobs').run();
 const wait=async from=>Math.round(Number((await db.prepare("SELECT value FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").first()).value)-from);
 const reset=()=>db.prepare("INSERT INTO catalog_meta(key,value) VALUES ('crawl-provider-ready:jalan','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
 const queue=(url,provider)=>db.prepare("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at) VALUES (?,?,'detail','pending',0,0)").bind(url,provider).run();
 // 1. The updater reports a page's third failure as status failed (retry_policy.py); here it is a 403.
 let page='https://www.jalan.net/yad999901/';await reset();await queue(page,'jalan');let from=Date.now()/1000;
 let r=await api('/api/crawl','PUT',{url:page,status:'failed',error:'http_403',retryAfterSeconds:86400,providerCooldownSeconds:86400});
 console.log(`1. status failed + http_403 (reported 86400 s): HTTP ${r.status}, stored provider wait ${await wait(from)} s`);
 // 2. A 403 whose reported provider wait is longer than both the floor and the page wait.
 page='https://www.jalan.net/yad999902/';await reset();await queue(page,'jalan');from=Date.now()/1000;
 r=await api('/api/crawl','PUT',{url:page,status:'retry',error:'http_403',retryAfterSeconds:3600,providerCooldownSeconds:200000});
 console.log(`2. status retry + http_403, page wait 3600 s, provider wait 200000 s: HTTP ${r.status}, stored provider wait ${await wait(from)} s`);
 // 3. A Trip.com record whose own property link names another property.
 const old=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8')).find(h=>h.id.startsWith('trip-')),id='trip-999903';
 const h=JSON.parse(JSON.stringify(old).replaceAll(old.id,id)),url='https://www.trip.com/hotels/tokyo-hotel-detail-999903/probe/';
 h.sources=[{sourceId:id,sourceType:'web',label:'Trip.com 숙소 상세',retrievedAt:'2026-10-05T05:00:00Z',verifiedAt:'2026-10-05',url,isMock:false}];
 h.names={ko:'Probe Hotel',ja:'Probe Hotel',en:'Probe Hotel'};h.aliases=[];
 await queue(url,'trip');
 h.links=h.links.map(l=>l.provider==='trip'?{...l,url:'https://www.trip.com/hotels/tokyo-hotel-detail-999904/probe/'}:l);
 r=await api('/api/crawl','PUT',{url,status:'done',observations:[h],links:[]});
 console.log(`3. Trip.com record trip-999903 whose own link is ...hotel-detail-999904/: HTTP ${r.status}, ${r.status===200?'accepted '+r.body.accepted:'error "'+r.body.error+'"'}`);
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
