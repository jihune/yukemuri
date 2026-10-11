// Built Worker public-site protection: per-IP limit on every Worker request
// (pages and API), maintenance exemption, limiter absence. Temporary D1 only.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-edge-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const KEY='edge-test-only',LIMIT=3,MESSAGE='요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.';
const options=extra=>({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'edge-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY},...extra});
const limited=new Miniflare(options({ratelimits:{API_RATE_LIMITER:{simple:{limit:LIMIT,period:60}}}}));
let unlimited;
let ipCounter=0;const freshIp=()=>`198.51.100.${++ipCounter}`;
const call=(runtime,path,headers={},init={})=>runtime.dispatchFetch('http://localhost'+path,{...init,headers});
try{
 const db=await limited.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();

 // Limit: an IP gets LIMIT API responses per window, then 429 with guidance.
 const ip=freshIp(),probe='/api/collector-release';
 for(let i=0;i<LIMIT;i++){const r=await call(limited,probe,{'CF-Connecting-IP':ip});assert.equal(r.status,403);await r.body?.cancel()}
 const blocked=await call(limited,probe,{'CF-Connecting-IP':ip});
 assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');assert.equal(blocked.headers.get('Cache-Control'),'no-store');
 assert.match(blocked.headers.get('Content-Type')??'',/^application\/json/);assert.deepEqual(await blocked.json(),{error:MESSAGE});
 // A wrong maintenance key is still limited; a valid one is exempt.
 const wrong=await call(limited,probe,{'CF-Connecting-IP':ip,'X-Yukemuri-Crawl-Key':'edge-test-onlx'});assert.equal(wrong.status,429);await wrong.body?.cancel();
 for(let i=0;i<LIMIT+2;i++){const r=await call(limited,probe,{'CF-Connecting-IP':ip,'X-Yukemuri-Crawl-Key':KEY});assert.equal(r.status,200,'maintenance key is exempt');await r.body?.cancel()}
 // Another IP has its own counter.
 const other=await call(limited,probe,{'CF-Connecting-IP':freshIp()});assert.equal(other.status,403);await other.body?.cancel();
 // Pages share the same counter: the home page runs a D1 search per request.
 const page=await call(limited,'/?q=x',{'CF-Connecting-IP':ip});
 assert.equal(page.status,429);assert.match(page.headers.get('Content-Type')??'',/^text\/html/);assert.equal(page.headers.get('Retry-After'),'60');assert.equal(page.headers.get('Cache-Control'),'no-store');
 assert((await page.text()).includes(MESSAGE));
 const pageIp=freshIp();
 for(let i=0;i<LIMIT;i++){const r=await call(limited,`/?q=${i}`,{'CF-Connecting-IP':pageIp});assert.equal(r.status,200,'home page under the limit');await r.body?.cancel()}
 const pageBlocked=await call(limited,'/?q=again',{'CF-Connecting-IP':pageIp});assert.equal(pageBlocked.status,429,'varying page queries cannot bypass the limit');await pageBlocked.body?.cancel();
 // An anonymous search under the limit still reaches the app unchanged.
 const search=await call(limited,'/api/hotels?q=x',{'CF-Connecting-IP':freshIp()});
 assert.equal(search.status,200);assert.equal(search.headers.get('Cache-Control'),'no-store');await search.body?.cancel();

 // Without the binding (local tools, or a plan without it) nothing is limited.
 await limited.dispose();
 unlimited=new Miniflare(options({}));
 const sameIp=freshIp();
 for(let i=0;i<LIMIT*3;i++){const r=await call(unlimited,probe,{'CF-Connecting-IP':sameIp});assert.equal(r.status,403);await r.body?.cancel()}
 console.log(`Edge guard passed: ${LIMIT}/IP then 429 with guidance (JSON for API, HTML for pages), wrong key limited, valid key exempt, separate IPs, home page queries counted, no binding means no limit.`);
}finally{await limited.dispose().catch(()=>{});if(unlimited)await unlimited.dispose();rmSync(temp,{recursive:true,force:true})}
