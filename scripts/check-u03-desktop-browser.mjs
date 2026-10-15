// U03 desktop overlap checks in real Chromium at 1024, 1280 and 1440px with a mouse.
// At the end of a short result list the sticky filter panel stays wholly on screen above the
// footer, with and without the comparison dock, and its first and last controls can be reached
// (the visible ones: since U05 filter C the groups start closed).
// A map preview opened from a card leaves the Leaflet attribution links visible and clickable.
// Needs a running portable dev server and the isolated Playwright install in docs/ui-u01-20261010.md.
// External requests are blocked, so map tiles and screen readers are not covered.
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:5173',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];
let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const browser=await chromium.launch();
const sizes=[[1024,768],[1280,800],[1440,900]];

async function run(page,height){
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${width}-${name}.png`})};
 // The control itself is what a click at its centre reaches, inside the window.
 const reach=selector=>page.evaluate(selector=>{const e=document.querySelector(selector);if(!e)return {found:false};const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {found:true,top:Math.round(r.top),bottom:Math.round(r.bottom),inView:r.top>=-.5&&r.bottom<=innerHeight+.5,hit:String(hit?.className??hit?.tagName).slice(0,40),ok:r.top>=-.5&&r.bottom<=innerHeight+.5&&!!hit&&(hit===e||e.contains(hit))}},selector);
 const toEnd=async()=>{await page.evaluate(()=>window.scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'}));await page.waitForTimeout(400)};
 const panelAtEnd=async label=>{
  await toEnd();
  const atEnd=await page.evaluate(()=>Math.round(scrollY)===document.scrollingElement.scrollHeight-innerHeight);
  const box=await page.evaluate(()=>{const p=document.querySelector('.desktop-filters').getBoundingClientRect(),f=document.querySelector('.site-footer').getBoundingClientRect();return {top:Math.round(p.top),bottom:Math.round(p.bottom),footer:Math.round(f.top),vh:innerHeight}});
  // The panel scrolls inside itself: its first control at the top, its last at the bottom.
  await page.locator('.desktop-filters').evaluate(e=>{e.scrollTop=0});
  const first=await reach('.desktop-filters .filter-title button');
  await page.locator('.desktop-filters').evaluate(e=>{e.scrollTop=e.scrollHeight});await page.waitForTimeout(100);
  const last=await page.evaluate(()=>{const all=[...document.querySelectorAll('.desktop-filters button,.desktop-filters input')].filter(e=>e.checkVisibility());all.at(-1).dataset.u03Last='1';return all.length});
  const end=await reach('[data-u03-last]');
  check(`목록 끝에서 필터 패널 전체가 화면 안·푸터 위에 있고 첫·마지막 조작 요소를 누를 수 있음(${label})`,atEnd&&box.top>=0&&box.bottom<=box.footer&&first.ok&&end.ok,{atEnd,box,first,last:end,controls:last});
  await shot('panel-end-'+(label==='비교 막대 없음'?'nodock':'dock'));
 };

 // The default list loads more cards near its end, so a short result list reaches a real end.
 await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
 const listEnd=page.locator('.list-end');
 for(let i=0;i<10&&!(await listEnd.innerText()).includes('목록 끝');i++){await toEnd();await page.waitForTimeout(400)}
 await panelAtEnd('비교 막대 없음');
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.locator('.card-compare').first().click();
 await page.locator('.comparison-dock').waitFor();
 await panelAtEnd('비교 막대 있음');
 await page.getByRole('button',{name:'비교 후보 모두 비우기'}).click();

 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.getByRole('button',{name:/지도에서 보기/}).first().click();
 await page.locator('.map-preview').waitFor({timeout:8000});
 await page.locator('.stay-map').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(300);
 const map=await page.evaluate(()=>{
  const box=e=>{const r=e.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),right:Math.round(r.right),bottom:Math.round(r.bottom),height:Math.round(r.height)}};
  const attribution=document.querySelector('.leaflet-control-attribution'),preview=document.querySelector('.map-preview'),mapBox=document.querySelector('.stay-map');
  const a=box(attribution),p=box(preview),m=box(mapBox);
  const links=[...attribution.querySelectorAll('a')].map(l=>{const r=l.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {text:l.innerText.trim(),ok:r.width>0&&!!hit&&(hit===l||l.contains(hit)),hit:String(hit?.className??hit?.tagName).slice(0,30)}});
  return {attribution:a,preview:p,map:m,overlap:!(p.bottom<=a.top||p.top>=a.bottom||p.right<=a.left||p.left>=a.right),links,text:attribution.innerText.trim()};
 });
 check('지도 미리보기가 지도 출처 표시와 겹치지 않고 출처 링크(Leaflet·OpenStreetMap)를 모두 누를 수 있음',!map.overlap&&map.links.length>=2&&map.links.every(l=>l.ok)&&map.text.includes('OpenStreetMap'),map);
 if(shots)await page.locator('.stay-map').screenshot({path:`${shots}/${width}-map-preview.png`});
 // The preview stays a card on the map, not under it.
 check('지도 미리보기가 지도 안에 있음',map.preview.top>=map.map.top&&map.preview.bottom<=map.map.bottom&&map.preview.left>=map.map.left&&map.preview.right<=map.map.right,{preview:map.preview,map:map.map,height});
}

const chromiumVersion=browser.version();
for(const [w,height] of sizes){
 width=w;
 const context=await browser.newContext({viewport:{width,height},locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 try{await run(page,height)}catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 await context.close();
}
await browser.close();
const failed=results.filter(result=>!result.pass);
if(evidence){
 writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:sizes.map(([w,h])=>`${w}x${h}`).join(', ')+' · desktop mouse',externalRequests:'blocked',results,
  notCovered:['외부 지도 타일(검사는 외부 요청을 막음)','스크린리더 읽기 순서','운영 D1 자료(검사는 로컬 개발 DB와 체크인된 스냅샷 사용)']},null,1)+'\n');
}
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
