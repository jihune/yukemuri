// Parse time and memory of the static search snapshot in real Chromium with the
// CPU slowed down to phone level (CDP CPU throttling, 4x and 6x). Serves a built
// snapshot directory (measure-search-snapshot.mjs --keep) and runs the same
// library code the page runs: JSON parse, openSnapshot, the first list, the map,
// then the name-search file and a name search. Heap is read after a forced GC.
// Network time is not measured: files come from a local server.
// Needs the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/measure-snapshot-client.mjs <snapshot dir> [--out evidence.json] [--runs 3]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {join,resolve,normalize} from 'node:path';
const argv=process.argv.slice(2),dir=resolve(argv[0]??''),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:null,runs=argv.includes('--runs')?+argv[argv.indexOf('--runs')+1]:3;
if(!existsSync(join(dir,'snapshot/manifest.json')))throw new Error('Usage: measure-snapshot-client.mjs <dir with snapshot/manifest.json>');
const {chromium}=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url))('playwright');
const esbuild=createRequire(realpathSync('node_modules/vite/package.json'))('esbuild');
const entry=`
import {openSnapshot,addSnapshotText,searchSnapshot,resultPage,mapArea,suggestions} from './lib/static-search';
import {DEFAULT_FILTERS} from './lib/hotel-types';
const heap=async()=>{await window.__gc();return (await window.__heap())};
const time=async(f)=>{const t=performance.now();const v=await f();return [performance.now()-t,v]};
const read=async path=>{const r=await fetch(path,{cache:'no-store'});return r.text()};
window.measure=async()=>{
 const m=JSON.parse(await read('/snapshot/manifest.json')),out={hotels:m.hotels};
 out.heapBefore=await heap();
 let [coreText,cardsText]=await Promise.all([read(m.files.core),read(m.files.cards)]);
 const [parseCore,core]=await time(()=>JSON.parse(coreText));
 const [parseCards,cards]=await time(()=>JSON.parse(cardsText));
 const [open,s]=await time(()=>openSnapshot(m,core,cards));
 const [firstList,list]=await time(()=>resultPage(s,searchSnapshot(s,DEFAULT_FILTERS,'recommended'),1));
 const [ratingList]=await time(()=>resultPage(s,searchSnapshot(s,{...DEFAULT_FILTERS,minRating:4},'rating'),1));
 const [map,area]=await time(()=>mapArea(s,DEFAULT_FILTERS,{west:122,south:24,east:146,north:46}));
 Object.assign(out,{parseCore,parseCards,open,firstList,ratingList,map,listTotal:list.total,mapPoints:area.points.length,mapCells:area.cells.length});
 coreText=cardsText=null;window.__s=s;
 out.heapCore=await heap();
 let textText=await read(m.files.text);
 const [parseText,text]=await time(()=>JSON.parse(textText));
 const [index]=await time(()=>addSnapshotText(s,text));
 // A name with results, a second one, and one without (the alternatives are ranked).
 const [nameSearch,named]=await time(()=>resultPage(s,searchSnapshot(s,{...DEFAULT_FILTERS,query:'노보리베츠'},'recommended'),1));
 const [koreanSearch]=await time(()=>resultPage(s,searchSnapshot(s,{...DEFAULT_FILTERS,query:'登別'},'recommended'),1));
 const [noMatchSearch,none]=await time(()=>resultPage(s,searchSnapshot(s,{...DEFAULT_FILTERS,query:'箱根'},'recommended'),1));
 const [suggest]=await time(()=>suggestions(s,{...DEFAULT_FILTERS,query:'のぼり'}));
 Object.assign(out,{parseText,index,nameSearch,koreanSearch,noMatchSearch,suggest,nameTotal:named.total,noMatchTotal:none.total,noMatchAlternatives:none.alternatives.length});
 textText=null;
 out.heapText=await heap();
 return out;
};`;
const bundle=(await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',write:false,platform:'browser',target:'es2022',tsconfig:'tsconfig.json',minify:true,define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text;
const server=createServer((req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
 if(path==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset=utf-8><script src="/m.js"></script>');
 if(path==='/m.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(bundle);
 const file=normalize(join(dir,path));
 if(!file.startsWith(dir)||!existsSync(file))return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':'application/json'}).end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({args:['--js-flags=--expose-gc']});
const results=[];
try{
 for(const rate of [1,4,6])for(let run=0;run<runs;run++){
  // A fresh page each run: nothing cached, cold JIT.
  const context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Runtime.enable');await cdp.send('HeapProfiler.enable');
  await page.exposeFunction('__gc',async()=>{await cdp.send('HeapProfiler.collectGarbage')});
  await page.exposeFunction('__heap',async()=>(await cdp.send('Runtime.getHeapUsage')).usedSize);
  await page.goto(base+'/');
  await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  const r=await page.evaluate(()=>window.measure());
  results.push({rate,run,...r});
  await context.close();
 }
}finally{await browser.close();server.close()}
const ms=['parseCore','parseCards','open','firstList','ratingList','map','parseText','index','nameSearch','koreanSearch','noMatchSearch','suggest'];
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
const summary=Object.fromEntries([1,4,6].map(rate=>{const rs=results.filter(r=>r.rate===rate);return [rate+'x',{
 ...Object.fromEntries(ms.map(k=>[k+'Ms',Math.round(median(rs.map(r=>r[k])))])),
 untilFirstListMs:Math.round(median(rs.map(r=>r.parseCore+r.parseCards+r.open+r.firstList))),
 untilNameSearchMs:Math.round(median(rs.map(r=>r.parseText+r.index+r.nameSearch))),
 heapCoreMiB:+(median(rs.map(r=>r.heapCore-r.heapBefore))/2**20).toFixed(1),
 heapWithTextMiB:+(median(rs.map(r=>r.heapText-r.heapBefore))/2**20).toFixed(1)}]}));
const manifest=JSON.parse(readFileSync(join(dir,'snapshot/manifest.json'),'utf8'));
const report={measuredAt:new Date().toISOString(),browser:'Chromium '+browser.version(),snapshot:manifest.id,hotels:manifest.hotels,runs,summary,results,
 note:'CDP Emulation.setCPUThrottlingRate on desktop Chromium; 4x is the Lighthouse mobile setting, 6x a slower phone. Times are medians in ms of the library steps the page runs, network excluded. Heap: Runtime.getHeapUsage after HeapProfiler.collectGarbage, minus the empty page, with the opened snapshot alive and the downloaded JSON text released.'};
for(const [rate,v] of Object.entries(summary))console.log(`${rate}: first list ${v.untilFirstListMs}ms (core ${v.parseCoreMs}, cards ${v.parseCardsMs}, open ${v.openMs}, list ${v.firstListMs}), map ${v.mapMs}ms, name search +${v.untilNameSearchMs}ms (text ${v.parseTextMs}, index ${v.indexMs}, search ${v.nameSearchMs}, next search ${v.koreanSearchMs}, no match ${v.noMatchSearchMs}, suggest ${v.suggestMs}), heap ${v.heapCoreMiB}MiB / ${v.heapWithTextMiB}MiB`);
if(out)writeFileSync(out,JSON.stringify(report,null,1)+'\n');
