// Post-deploy checks against the public Worker. Prints statuses and counts only;
// the maintenance key comes from YUKEMURI_CRAWL_ACCESS_KEY and is never printed.
import assert from 'node:assert/strict';

const origin=process.argv[2],key=process.env.YUKEMURI_CRAWL_ACCESS_KEY;
assert.match(origin??'',/^https:\/\/yukemuri\.[a-z0-9-]+\.workers\.dev$/,'Expected the public workers.dev origin');
assert(key,'YUKEMURI_CRAWL_ACCESS_KEY is required');
const get=async(path,headers={})=>{
 const response=await fetch(origin+path,{headers:{Accept:'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(60_000)});
 return {status:response.status,body:/json/.test(response.headers.get('Content-Type')??'')?await response.json():await response.text()};
};
// The search snapshot is a static asset: the manifest of this deploy and its files.
const manifest=await get('/snapshot/manifest.json');
assert.equal(manifest.status,200,'/snapshot/manifest.json status '+manifest.status);
assert(manifest.body?.format===1&&manifest.body.hotels>0,'/snapshot/manifest.json has no catalogue');
if(process.env.SNAPSHOT_ID)assert.equal(manifest.body.id,process.env.SNAPSHOT_ID,'served snapshot is not the one this run built');
for(const path of Object.values(manifest.body.files)){const file=await get(path);assert.equal(file.status,200,path+' status '+file.status)}
// The static page carries the first page of this snapshot; its first hotel has a detail.
const page=await get('/',{Accept:'text/html'});
assert.equal(page.status,200,'/ status '+page.status);
const first=JSON.parse(/<script id="yukemuri-first-page" type="application\/json">([^<]*)<\/script>/.exec(String(page.body))?.[1]??'null');
assert(first?.snapshot===manifest.body.id&&first.response.hotels.length>0&&first.response.total>0,'/ has no first page of the served snapshot');
const detail=await get('/api/hotels/'+encodeURIComponent(first.response.hotels[0].id));
assert.equal(detail.status,200,'/api/hotels/<id> status '+detail.status);
const denied=await get('/api/crawl?report=1');
assert.equal(denied.status,403,'/api/crawl?report=1 must reject a missing key');
const report=await get('/api/crawl?report=1',{'X-Yukemuri-Crawl-Key':key});
assert.equal(report.status,200,'/api/crawl?report=1 with key status '+report.status);
assert(report.body&&typeof report.body==='object'&&!Array.isArray(report.body),'/api/crawl?report=1 is not a report');
const robots=await get('/robots.txt');
assert.equal(robots.status,200);assert.match(String(robots.body),/^Disallow: \/api\/$/m);
console.log(`Smoke passed: first page total=${first.response.total}, a detail 200, snapshot ${manifest.body.id} with ${manifest.body.hotels} hotels and ${Object.keys(manifest.body.files).length} files, report without key 403, report with key 200, robots.txt blocks /api/.`);
