// cloudflare-smoke.mjs against a local stand-in for the public Worker: the
// keyed check uses the collector release (no D1), the static checks retry
// while a new version spreads, and a wrong or stale deploy fails. No network.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

const ORIGIN='https://yukemuri.smoke-check.workers.dev',KEY='smoke-check-key-0123456789',ID='snap-new';
let state,requests=[];
const reset=over=>{state={staleManifest:0,staleRelease:false,detail:200,robots:'User-agent: *\nDisallow: /api/\n',...over};requests=[]};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://x'),key=req.headers['x-yukemuri-crawl-key'];requests.push(url.pathname+url.search);
 const json=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))};
 if(url.pathname==='/snapshot/manifest.json'){const stale=state.staleManifest>0&&state.staleManifest--;return json(200,{format:1,hotels:2,id:stale?'snap-old':ID,files:{core:'/snapshot/core.json',cards:'/snapshot/cards.json'}})}
 if(url.pathname==='/snapshot/core.json')return json(200,{ids:['hotel-1','hotel-2']});
 if(url.pathname==='/snapshot/cards.json')return json(200,[]);
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(`<main data-first-page="${ID}"><h3 class="card-title">A</h3></main>`)}
 if(url.pathname==='/api/hotels/hotel-1')return json(state.detail,{id:'hotel-1'});
 if(url.pathname==='/api/collector-release')return key===KEY?json(200,{siteOrigin:state.staleRelease?'https://yukemuri.jihun7891.chatgpt.site':ORIGIN}):json(403,{error:'Maintenance access required'});
 if(url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end(state.robots)}
 json(404,{});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const folder=mkdtempSync(join(tmpdir(),'smoke-check-')),preload=join(folder,'preload.mjs');
// Route the Worker origin to the stand-in and keep the 5-second retry short.
writeFileSync(preload,`const real=globalThis.fetch;globalThis.fetch=(u,i)=>real(String(u).replace(${JSON.stringify(ORIGIN)},'http://127.0.0.1:${server.address().port}'),i);
const t=globalThis.setTimeout;globalThis.setTimeout=(f,ms,...a)=>t(f,Math.min(ms,10),...a);`);
const smoke=env=>new Promise(done=>{const child=spawn(process.execPath,['--import',preload,resolve('scripts/cloudflare-smoke.mjs'),ORIGIN],{env:{PATH:process.env.PATH,YUKEMURI_CRAWL_ACCESS_KEY:KEY,SNAPSHOT_ID:ID,...env}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>done({code,out}))});
try{
 reset();let r=await smoke();
 assert.equal(r.code,0,r.out);assert.match(r.out,/collector release without key 403 and with key 200 for this origin/);
 assert(!requests.some(p=>p.startsWith('/api/crawl')),'no /api/crawl?report=1 (D1 scan, prepares an unprepared catalogue)');
 assert(!r.out.includes(KEY),'key never printed');
 reset({staleManifest:3});r=await smoke();
 assert.equal(r.code,0,r.out);assert.equal(requests.filter(p=>p==='/snapshot/manifest.json').length,4,'retried until the new snapshot was served');
 reset({staleManifest:20});r=await smoke();assert.notEqual(r.code,0,'an old snapshot after 6 tries fails');
 reset({staleRelease:true});r=await smoke();assert.notEqual(r.code,0,'a release built for another origin fails');
 reset({detail:500});r=await smoke();assert.notEqual(r.code,0,'a failing detail fails');
 reset({robots:'User-agent: *\n'});r=await smoke();assert.notEqual(r.code,0,'robots.txt without /api/ fails');
 reset();r=await smoke({YUKEMURI_CRAWL_ACCESS_KEY:''});assert.notEqual(r.code,0,'no key fails');
}finally{server.close();rmSync(folder,{recursive:true,force:true})}
console.log('Smoke script passed: collector release as the keyed check (no /api/crawl), static retry until the new snapshot, failures for an old snapshot, a release for another origin, a failing detail, robots.txt and a missing key.');
