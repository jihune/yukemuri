// Post-deploy checks against the public Worker. Prints statuses and counts only;
// the maintenance key comes from YUKEMURI_CRAWL_ACCESS_KEY and is never printed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const origin=process.argv[2],key=process.env.YUKEMURI_CRAWL_ACCESS_KEY;
assert.match(origin??'',/^https:\/\/yukemuri\.[a-z0-9-]+\.workers\.dev$/,'Expected the public workers.dev origin');
assert(key,'YUKEMURI_CRAWL_ACCESS_KEY is required');
// The snapshot this run built: its id from the workflow and the manifest the
// build wrote (format from lib/search-snapshot.ts SNAPSHOT_FORMAT).
const expectedId=process.env.SNAPSHOT_ID;
assert.match(expectedId??'',/^[0-9a-f]{16}$/,'SNAPSHOT_ID of this run is required');
const built=JSON.parse(readFileSync(process.env.SNAPSHOT_MANIFEST||'dist/client/snapshot/manifest.json','utf8'));
assert.equal(built.id,expectedId,'the built manifest is not the snapshot of this run');
const get=async(path,headers={})=>{
 const response=await fetch(origin+path,{headers:{Accept:'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(60_000)});
 return {status:response.status,body:/json/.test(response.headers.get('Content-Type')??'')?await response.json():await response.text()};
};
// A new version can take a few seconds to reach every location: retry the
// static checks briefly (6 tries, 5 s apart) before failing.
const retry=async(label,read,ok)=>{for(let attempt=1;;attempt++){const value=await read();if(ok(value)||attempt>=6)return value;console.log(`${label}: not yet (try ${attempt}), retrying`);await new Promise(r=>setTimeout(r,5000))}};
// The search snapshot is a static asset: the manifest of this deploy and its files.
const manifest=await retry('/snapshot/manifest.json',()=>get('/snapshot/manifest.json'),m=>m.status===200&&m.body?.id===expectedId);
assert.equal(manifest.status,200,'/snapshot/manifest.json status '+manifest.status);
assert.equal(manifest.body?.id,expectedId,'served snapshot is not the one this run built');
assert.equal(manifest.body.format,built.format,'served snapshot format differs from the build');
assert(manifest.body.hotels>0&&manifest.body.hotels===built.hotels,'/snapshot/manifest.json has no catalogue or not this one');
for(const path of Object.values(manifest.body.files)){const file=await get(path);assert.equal(file.status,200,path+' status '+file.status)}
// The static page carries the first page of this snapshot as cards; the first
// hotel of the snapshot has a detail.
const page=await retry('/',()=>get('/',{Accept:'text/html'}),p=>p.status===200&&String(p.body).includes(`data-first-page="${manifest.body.id}"`));
assert.equal(page.status,200,'/ status '+page.status);
const cards=(String(page.body).match(/class="card-title"/g)??[]).length;
assert(String(page.body).includes(`data-first-page="${manifest.body.id}"`)&&cards>0,'/ has no first page of the served snapshot');
const core=await get(manifest.body.files.core);
const detail=await get('/api/hotels/'+encodeURIComponent(core.body.ids[0]));
assert.equal(detail.status,200,'/api/hotels/<id> status '+detail.status);
// The maintenance key, on a route that reads no D1: the collector release
// (built for this origin). /api/crawl?report=1 used to be checked here, but it
// prepares an unprepared catalogue (writes) and scans the queue and hotels on
// every deploy (docs/cloudflare-deploy.md).
const denied=await get('/api/collector-release');
assert.equal(denied.status,403,'/api/collector-release must reject a missing key');
const release=await get('/api/collector-release',{'X-Yukemuri-Crawl-Key':key});
assert.equal(release.status,200,'/api/collector-release with key status '+release.status);
assert.equal(release.body?.siteOrigin,origin,'the collector release is not built for this origin');
const robots=await get('/robots.txt');
assert.equal(robots.status,200);assert.match(String(robots.body),/^Disallow: \/api\/$/m);
console.log(`Smoke passed: first page with ${cards} cards, a detail 200, snapshot ${manifest.body.id} with ${manifest.body.hotels} hotels and ${Object.keys(manifest.body.files).length} files, collector release without key 403 and with key 200 for this origin, robots.txt blocks /api/.`);
