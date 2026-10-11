// Built Worker public-site protection: per-IP API limit, maintenance exemption,
// limiter absence, and the anonymous-only search cache. Temporary D1 only.
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
 // Another IP has its own counter, and non-API paths are never limited.
 const other=await call(limited,probe,{'CF-Connecting-IP':freshIp()});assert.equal(other.status,403);await other.body?.cancel();
 const page=await call(limited,'/no-such-page',{'CF-Connecting-IP':ip});assert.notEqual(page.status,429);await page.body?.cancel();

 // Shared cache: anonymous search is stored by URL; the browser still gets no-store.
 const search='/api/hotels?q=%EC%86%8C%EC%9E%94%EC%BF%84';
 const miss=await call(limited,search,{'CF-Connecting-IP':freshIp()});
 assert.equal(miss.status,200);assert.equal(miss.headers.get('X-Yukemuri-Cache'),'MISS');assert.equal(miss.headers.get('Cache-Control'),'no-store');
 const missBody=await miss.json();
 let hit;for(let i=0;i<20;i++){hit=await call(limited,search,{'CF-Connecting-IP':freshIp(),'X-Yukemuri-Visitor':'b'.repeat(64)});if(hit.headers.get('X-Yukemuri-Cache')==='HIT')break;await hit.body?.cancel();await new Promise(r=>setTimeout(r,50))}
 assert.equal(hit.headers.get('X-Yukemuri-Cache'),'HIT');assert.equal(hit.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await hit.json(),missBody);

 // Visitor-dependent and explicit-refresh responses never enter the shared cache.
 const visitorA='a'.repeat(64),visitorB='c'.repeat(64),hotel=missBody.hotels[0];
 const save=await call(limited,'/api/favorites',{'CF-Connecting-IP':freshIp(),'X-Yukemuri-Visitor':visitorA,'Content-Type':'application/json'},{method:'PUT',body:JSON.stringify({hotelId:hotel.id,saved:true})});assert.equal(save.status,200);await save.body?.cancel();
 for(let round=0;round<2;round++){
  for(const [visitor,total] of [[visitorA,1],[visitorB,0]]){
   const r=await call(limited,'/api/hotels?saved=1',{'CF-Connecting-IP':freshIp(),'X-Yukemuri-Visitor':visitor});
   assert.equal(r.status,200);assert.equal(r.headers.get('X-Yukemuri-Cache'),null);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).total,total);
  }
 }
 for(const path of [search+'&fresh=1',search+'&stable=1&fresh=1']){
  for(let round=0;round<2;round++){const r=await call(limited,path,{'CF-Connecting-IP':freshIp()});assert.equal(r.status,200);assert.equal(r.headers.get('X-Yukemuri-Cache'),null,path);await r.body?.cancel()}
 }
 const snapshot=missBody.snapshot?.token??'00000000-0000-4000-8000-000000000000';
 for(let round=0;round<2;round++){const r=await call(limited,'/api/hotels?snapshot='+snapshot,{'CF-Connecting-IP':freshIp()});assert.equal(r.headers.get('X-Yukemuri-Cache'),null);await r.body?.cancel()}
 // An error response on a shareable URL is not stored.
 for(let round=0;round<3;round++){const r=await call(limited,'/api/hotels?region=nowhere',{'CF-Connecting-IP':freshIp()});assert.equal(r.status,400);assert.equal(r.headers.get('X-Yukemuri-Cache'),null);await r.body?.cancel()}

 // Without the binding (local tools, or a plan without it) nothing is limited.
 await limited.dispose();
 unlimited=new Miniflare(options({}));
 const sameIp=freshIp();
 for(let i=0;i<LIMIT*3;i++){const r=await call(unlimited,probe,{'CF-Connecting-IP':sameIp});assert.equal(r.status,403);await r.body?.cancel()}
 console.log(`Edge guard passed: ${LIMIT}/IP then 429 with guidance, wrong key limited, valid key exempt, separate IPs, pages unlimited, anonymous search cached by URL with browser no-store, saved=1/fresh/snapshot/errors not shared, no binding means no limit.`);
}finally{await limited.dispose().catch(()=>{});if(unlimited)await unlimited.dispose();rmSync(temp,{recursive:true,force:true})}
