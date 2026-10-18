// U07 task 8 in real Chromium (390px touch, 1280px mouse), docs/U07-20261019.md: every place
// that shows a stay's name follows the name rule (lib/hotel-names.ts displayNames: Korean, else
// English, else the original), as the cards and the detail do. No stay in the checked-in data
// has a title other than its names.ko yet, so one stay is served here as a stay with no Korean
// name and an English one (names.ko holding the original, the shape the sources give): the
// snapshot's cards and the comparison response are rewritten for it in the browser. Expected:
// - the map: its marker's title, the preview's name and the stay list's name are the English one;
// - the comparison: its name is the English one with the original under it, and so are its
//   remove button's label and, on a phone, an evidence row (a wide screen has none: the cells
//   show everything);
// - the page's agent tool read_visible_stays gives the English name.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u07-names-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {siteSearch} from './site-search-node.mjs';
import {compileLib} from './build-search-snapshot.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-u07-names-'));
let displayNames;
try{({displayNames}=createRequire(import.meta.url)(compileLib(temp,'lib/hotel-names.ts')))}finally{rmSync(temp,{recursive:true,force:true})}
const search=await siteSearch(base);
// The stay: the first of the default list with a point on the map and a Korean name to search by,
// and a second one for the comparison.
const [stay,other]=search.list('').hotels.filter(h=>h.location.latitude!==null&&/[가-힣]/.test(h.names.ko));
const korean=stay.names.ko,original=stay.names.ja,english='Kawabata Riverside Onsen Inn';
const names={ko:original,ja:original,en:english},want=displayNames(names);
if(want.title!==english||want.ja!==null&&want.ja!==original)throw new Error('The rule no longer gives the English name: '+JSON.stringify(want));
const rename=h=>{if(h?.id===stay.id)h.names=names;return h};
const browser=await chromium.launch();
for(const [w,mobile] of [[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 await context.route(/\/snapshot\/v\/[^/]+\/cards\.json$/,async route=>{const response=await route.fetch();const cards=await response.json();cards.forEach(rename);await route.fulfill({response,json:cards})});
 await context.route(/\/api\/hotel-comparison/,async route=>{const response=await route.fetch();const data=await response.json();data.hotels?.forEach(rename);await route.fulfill({response,json:data})});
 await context.addInitScript(()=>{document.modelContext={registerTool(tool){(window.__tools??={})[tool.name]=tool}}});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=l=>mobile?l.tap():l.click();
 // The map, searched by the stay's Korean name (the search text is not rewritten).
 await page.goto(base+'/?'+new URLSearchParams({q:korean}),{waitUntil:'networkidle'});await page.waitForTimeout(800);
 if(mobile){await press(page.locator('.mobile-map-toggle'));await page.waitForTimeout(800)}
 const marker=page.locator(`.leaflet-marker-icon[data-stay-ids~="${stay.id}"]`).first();
 const markerTitle=await marker.getAttribute('title',{timeout:15000}).catch(()=>null);
 const listNames=await page.locator('.map-stay-list .map-stay-name').allTextContents();
 if(await marker.count())await marker.evaluate(e=>e.click());
 await page.waitForTimeout(600);
 const preview=await page.locator('.map-preview button').first().textContent().catch(()=>null);
 check(`지도: 표지 제목·미리보기 이름·숙소 목록 이름이 ‘${english}’`,markerTitle?.startsWith(english)&&preview?.trim()===english&&listNames.map(s=>s.trim()).includes(english)&&!listNames.map(s=>s.trim()).includes(original),{markerTitle,preview,listNames});
 // The page's agent tool.
 const visible=await page.evaluate(()=>window.__tools?.read_visible_stays?.execute({})).catch(e=>({error:String(e)}));
 const row=visible?.hotels?.find(h=>h.id===stay.id);
 check(`에이전트 도구 read_visible_stays가 ‘${english}’를 돌려줌`,row?.name===english,{row,error:visible?.error});
 // The comparison of the stay and another one.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.evaluate(ids=>localStorage.setItem('yukemuri-comparison-v1',JSON.stringify(ids)),[stay.id,other.id]);
 await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(500);
 await press(page.getByRole('button',{name:/^숙소 비교 열기/})).catch(()=>{});
 const sheet=page.locator('.hotel-comparison');
 await sheet.locator('.comparison-table tbody tr').first().waitFor({timeout:15000}).catch(()=>{});await page.waitForTimeout(500);
 const head=await sheet.locator('.comparison-table thead th').evaluateAll((ths,id)=>ths.map(th=>({name:th.querySelector('.comparison-hotel-name')?.textContent.trim()??null,original:th.querySelector('.comparison-hotel-name+span[lang=ja]')?.textContent.trim()??null,remove:th.querySelector('.comparison-remove')?.getAttribute('aria-label')??null})).filter(h=>h.name),stay.id);
 const expand=sheet.locator('.comparison-expand:visible').first();
 if(await expand.count()){await press(expand);await page.waitForTimeout(300)}
 const evidence=await sheet.locator('.comparison-evidence li b:visible').allTextContents();
 const mine=head.find(h=>h.name===english);
 check(`비교 표: 이름이 ‘${english}’이고 그 아래 원어, 빼기 단추 이름${mobile?'과 근거 줄':''}도 같은 이름`,!!mine&&mine.original===original&&mine.remove===english+' 비교에서 빼기'&&(!mobile||evidence.includes(english))&&!head.some(h=>h.name===original),{head,evidence});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,stay:stay.id,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
