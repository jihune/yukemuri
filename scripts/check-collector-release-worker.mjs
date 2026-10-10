// Built Worker boundary check. The release must work without initializing D1.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-release-'));
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
let runtime;
try{
 const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(path=>path.endsWith('.js')&&path!=='index.js').map(path=>({type:'ESModule',path:resolve('dist/server',path)}))];
 runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'release-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'release-test-only'}});
 const db=await runtime.getD1Database('DB');
 // Miniflare can create its own metadata table asynchronously. Application
 // tables must remain absent; that platform table is not catalogue state.
 const snapshot=async()=>JSON.stringify((await db.prepare("SELECT name FROM sqlite_master WHERE name<>'_cf_METADATA' ORDER BY name").all()).results);
 const before=await snapshot();
 for(const key of [null,'wrong','release-test-onlx']){
  const response=await runtime.dispatchFetch('http://localhost/api/collector-release',{headers:key?{'X-Yukemuri-Crawl-Key':key}:{}});
  assert.equal(response.status,403);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{error:'Maintenance access required'});
 }
 const headers={'X-Yukemuri-Crawl-Key':'release-test-only'};
 for(const request of [{url:'/api/collector-release?token=private',headers},{url:'/api/collector-release',headers:{...headers,Origin:'https://other.example'}}]){
  const response=await runtime.dispatchFetch('http://localhost'+request.url,{headers:request.headers});assert.equal(response.status,400);
 }
 const response=await runtime.dispatchFetch('http://localhost/api/collector-release',{headers});
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 const release=await response.json();assert.deepEqual(release,JSON.parse(readFileSync('data/collector-release.generated.json','utf8')));
 assert(!JSON.stringify(release).includes('release-test-only'));
 assert.equal(await snapshot(),before,'Release access does not initialize catalogue, queue or favorites');
 console.log('Collector release passed: protected source, malformed request rejection, built release parity, no secrets, no D1 changes.');
}finally{if(runtime)await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
