// First view on a phone over a slow connection: real Chromium at 360px with the
// Lighthouse mobile profile (CPU 4x, RTT 150ms, 1.6 Mbps down, 750 Kbps up),
// through a local proxy that gzips text the way the edge compresses it.
// Measures, from navigation: the first card, the snapshot list (core and cards
// parsed) and the first name-search result, for the address without conditions
// (the static page's first page) and one with conditions (waits for the snapshot).
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start) and
// the isolated Playwright install in docs/ui-u01-20261010.md.
// --former measures a build before P03 (server-rendered list, server search) the
// same way, without the snapshot steps.
// Usage: node scripts/measure-first-view.mjs [base] [--out evidence.json] [--runs 3] [--former]
import {createRequire} from 'node:module';
import {createServer,request as httpRequest} from 'node:http';
import {gzipSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
const argv=process.argv.slice(2),base=argv[0]&&!argv[0].startsWith('--')?argv[0]:'http://127.0.0.1:8787',out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,runs=argv.includes('--runs')?+argv[argv.indexOf('--runs')+1]:3,former=argv.includes('--former');
const {chromium}=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url))('playwright');
const target=new URL(base),bytes={};
const proxy=createServer((req,res)=>{
 const upstream=httpRequest({host:target.hostname,port:target.port,path:req.url,method:req.method,headers:{...req.headers,host:target.host,'accept-encoding':'identity'}},up=>{
  const chunks=[];up.on('data',c=>chunks.push(c));up.on('end',()=>{
   let body=Buffer.concat(chunks);const headers={...up.headers};delete headers['content-length'];delete headers['transfer-encoding'];
   if(/gzip/.test(req.headers['accept-encoding']??'')&&/text|json|javascript|svg/.test(headers['content-type']??'')&&body.length>1024){body=gzipSync(body);headers['content-encoding']='gzip'}
   const path=req.url.split('?')[0];bytes[path]=body.length;
   res.writeHead(up.statusCode,{...headers,'content-length':body.length}).end(body);
  });
 });
 upstream.on('error',e=>res.writeHead(502).end(String(e)));req.pipe(upstream);
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${proxy.address().port}`;
const browser=await chromium.launch(),results=[];
const views=[{name:'조건 없는 주소',path:'/'},{name:'조건 있는 주소(Trip.com 8점 이상)',path:'/?rating=8'}];
try{
 for(const view of views)for(let run=0;run<runs;run++){
  const context=await browser.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  // External requests (map tiles) are blocked: only this site is measured.
  await context.route(url=>url.origin!==origin,route=>route.abort());
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6e6/8,uploadThroughput:750e3/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  let transferred=0;cdp.on('Network.loadingFinished',e=>{transferred+=e.encodedDataLength});
  const start=Date.now();
  await page.goto(origin+view.path,{waitUntil:'commit'});
  await page.locator('.hotel-list .card-title').first().waitFor({timeout:120000});
  const firstCard=Date.now()-start;
  // The snapshot list is in when the conditions' notice or the load-more control can appear: wait for the manifest's files.
  if(!former)await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(e=>/\/snapshot\/v\/[^/]+\/(core|cards)\.json$/.test(e.name)&&e.responseEnd>0).length===2,null,{timeout:120000});
  await page.waitForFunction(()=>!document.querySelector('.catalog-loading'),null,{timeout:120000});
  const snapshotList=Date.now()-start;
  // A name search: the name-search file is fetched on the first keystroke.
  const searchStart=Date.now();
  const box=page.locator('.search-form input').first();
  await box.tap();await box.fill('노보리베츠');await box.press('Enter');
  await page.waitForFunction(former=>!document.querySelector('.catalog-loading')&&(former?location.search.includes('q='):performance.getEntriesByType('resource').some(e=>/\/text\.json$/.test(e.name)&&e.responseEnd>0)),former,{timeout:120000});
  await page.locator('.hotel-list .card-title').first().waitFor({timeout:120000});
  const nameSearch=Date.now()-searchStart;
  results.push({view:view.name,path:view.path,run,firstCardMs:firstCard,snapshotListMs:snapshotList,nameSearchAfterTypingMs:nameSearch,transferredBytes:transferred});
  console.log(`${view.name} #${run+1}: first card ${firstCard}ms, snapshot list ${snapshotList}ms, name search ${nameSearch}ms after typing, ${(transferred/1024).toFixed(0)}KiB`);
  await context.close();
 }
}finally{await browser.close();proxy.close()}
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
const summary=Object.fromEntries(views.map(v=>{const rs=results.filter(r=>r.path===v.path);return [v.path,{firstCardMs:median(rs.map(r=>r.firstCardMs)),snapshotListMs:median(rs.map(r=>r.snapshotListMs)),nameSearchAfterTypingMs:median(rs.map(r=>r.nameSearchAfterTypingMs)),transferredKiB:Math.round(median(rs.map(r=>r.transferredBytes))/1024)}]}));
const gz=Object.fromEntries(Object.entries(bytes).filter(([p])=>p==='/'||p.startsWith('/snapshot/')||p.endsWith('.js')).map(([p,n])=>[p,n]));
console.log(JSON.stringify(summary));
if(out)writeFileSync(out,JSON.stringify({measuredAt:new Date().toISOString(),browser:'Chromium '+browser.version(),base,build:former?'before P03 (server-rendered list and search)':'P03 static snapshot',profile:'360x780 isMobile hasTouch, CDP CPU 4x, latency 150ms, 1.6 Mbps down, 750 Kbps up, cache disabled, gzip by a local proxy, external requests blocked',runs,summary,results,gzipBytes:gz,note:'Times in ms from navigation start (name search: from tapping the search box). The local catalogue is the checked-in one; production-size files take longer in proportion to their size (P03-20261012.md).'},null,1)+'\n');
