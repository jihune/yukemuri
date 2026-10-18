// U07 task 7 in real Chromium (360·390px touch, 1280px mouse), docs/U07-20261019.md: an address
// that names a region or an onsen town opens on it. The region, the town's search word, the
// heading (region name and the snapshot's count) and the place picker all stay as the address
// says; the region picker inside the search form used to hand back an empty value right after the
// first render, which emptied the region (‘일본 전국 0곳’). Choosing another place still works.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u07-region-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-u07-region-'));
let REGIONS;
try{({REGIONS}=createRequire(import.meta.url)(compileLib(temp,'lib/hotel-types.ts')))}finally{rmSync(temp,{recursive:true,force:true})}
const search=await siteSearch(base),regionName=id=>REGIONS.find(r=>r.id===id).name;
const town=JSON.parse(readFileSync(new URL('../data/collection-priorities.json',import.meta.url),'utf8')).towns.find(t=>search.list(`region=${t.prefecture}&q=${encodeURIComponent(t.query)}`).total>0);
// A prefecture, the northern one with the most stays, a resort area, and an onsen town.
const cases=[['pref-okinawa',''],['pref-hokkaido',''],['sapporo',''],[town.prefecture,town.query,town.name]];
const browser=await chromium.launch();
for(const [w,mobile] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const picker=page.getByRole('combobox',{name:'검색 지역 · 온천마을'});
 const shown=()=>page.evaluate(()=>({h2:document.querySelector('.results-header h2')?.textContent.trim()??null,place:document.querySelector('[aria-label="검색 지역 · 온천마을"]')?.textContent.trim()??null,search:location.search}));
 for(const [region,query,townName] of cases){
  const params=`region=${region}`+(query?`&q=${encodeURIComponent(query)}`:''),total=search.list(params).total;
  await page.goto(base+'/?'+params,{waitUntil:'networkidle'});await page.waitForTimeout(1000);
  const r=await shown(),url=new URLSearchParams(r.search);
  const want=`${regionName(region)} ${total.toLocaleString('ko-KR')}곳`;
  check(`주소 ?${decodeURIComponent(params)}로 열면 지역·검색어가 그대로이고 제목이 ‘${want}’, 지역 선택 상자가 ‘${townName??regionName(region)}’`,total>0&&url.get('region')===region&&(url.get('q')??'')===query&&r.h2===want&&r.place===(townName??regionName(region)),{...r,want});
 }
 // From the last address, a person chooses another place with the picker: it is applied.
 await (mobile?picker.tap():picker.click());
 const option=page.getByRole('option',{name:'오키나와',exact:true});
 await (mobile?option.tap():option.click());await page.waitForTimeout(800);
 const r=await shown(),url=new URLSearchParams(r.search),want=`오키나와 ${search.list('region=pref-okinawa').total.toLocaleString('ko-KR')}곳`;
 check(`지역 선택 상자로 ‘오키나와’를 고르면 주소·제목·상자가 그 지역으로 바뀜(제목 ‘${want}’)`,url.get('region')==='pref-okinawa'&&!url.get('q')&&r.h2===want&&r.place==='오키나와',{...r,want});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
