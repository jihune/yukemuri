// U05 map mode in real Chromium (390px touch, 1280px mouse): no stay of the
// search result goes missing from the map (user decision 2026-10-13).
// At every zoom step from the first view in and out again:
// - single markers + the numbers on group markers = "이 화면 N곳" = the list
//   beside the map = the stays of the result whose point is inside the drawn
//   view, counted here from the snapshot the site serves (scripts/site-search-node.mjs),
//   and no marker icon lies under another one (a hit test at each icon's centre);
// - "이 화면" + "화면 밖" + "위치 미확인" = the result count;
// - the location-unknown list holds that many stays;
// - a group marker zooms in or opens its stays as a list of the same count;
// - Enter on a focused stay marker opens its preview, on a group zooms in or lists it;
// - when geo.json fails the sum still holds (more stays unknown) and retry loads it;
// - an area search closes an open list of the result.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-map-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base),s=search.snapshot,geo=search.geo;
// The page's rule (lib/map-groups.ts resultPositions): the source's point, else a graded D06 point.
const point=i=>{let a=s.core.lat[i],b=s.core.lng[i];if((a===null||b===null)&&geo&&(geo.grade[i]??0)>0){a=geo.lat[i];b=geo.lng[i]}return a===null||b===null?null:[a,b]};
const num=t=>Number(String(t).replace(/[^0-9]/g,''));
const browser=await chromium.launch();
const cases=[['',''],['q=노보리베츠','이름 검색']];
for(const w of [390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const tap=l=>mobile?l.tap():l.click();
 for(const [params,label] of cases){
  const order=search.order(params),located=order.filter(i=>point(i));
  await page.goto(base+'/'+(params?'?'+params:''),{waitUntil:'networkidle'});
  if(mobile)await tap(page.locator('.mobile-map-toggle'));
  await page.locator('.stay-map').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.map-canvas')?.dataset.view,null,{timeout:15000}).catch(()=>{});
  const read=()=>page.evaluate(()=>{
   const markers=[...document.querySelectorAll('.map-canvas .stay-marker')].map(e=>e.textContent.trim());
   // Hit test: the centre of every marker icon is that icon, not another marker on top of it.
   const hidden=[...document.querySelectorAll('.map-canvas .leaflet-marker-icon')].filter(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.leaflet-marker-icon');return hit&&hit!==e}).length;
   const cov=document.querySelector('.map-coverage')?.innerText.replace(/\s+/g,' ')??'';
   const pick=re=>{const m=cov.match(re);return m?Number(m[1].replace(/,/g,'')):null};
   return{view:document.querySelector('.map-canvas')?.dataset.view,markers,hidden,cov,
    inView:pick(/이 화면 ([\d,]+)곳/),out:pick(/화면 밖 ([\d,]+)곳/),unknown:pick(/위치 미확인 ([\d,]+)곳/),total:pick(/(?:검색 결과|다른 후보) ([\d,]+)곳/),
    list:Number((document.querySelector('.map-stay-list h3 b')?.textContent??'-1').replace(/[^0-9-]/g,''))};
  });
  const steps=[];
  const audit=async step=>{
   await page.waitForTimeout(700);const r=await read();
   const [west,south,east,north,zoom]=(r.view??'').split(',').map(Number);
   const expected=located.filter(i=>{const [a,b]=point(i);return a>=south&&a<=north&&b>=west&&b<=east}).length;
   const shown=r.markers.reduce((n,t)=>n+(t.endsWith('곳')?num(t):1),0);
   steps.push({step,zoom,expected,shown,hidden:r.hidden,inView:r.inView,list:r.list,out:r.out,unknown:r.unknown,total:r.total});
   return r;
  };
  await audit('처음');
  const zoomIn=page.getByRole('button',{name:'지도 확대'}),zoomOut=page.getByRole('button',{name:'지도 축소'});
  const press=l=>l.evaluate(e=>e.click());
  for(let i=0;i<3;i++){await press(zoomIn);await audit('확대 '+(i+1))}
  for(let i=0;i<5;i++){await press(zoomOut);await audit('축소 '+(i+1))}
  const bad=steps.filter(x=>!(x.hidden===0&&x.shown===x.expected&&x.inView===x.expected&&x.list===x.expected&&x.inView+x.out+x.unknown===order.length&&x.total===order.length));
  check(`${label||'전국'}: 확대 단계마다 표지+묶음 합 = 이 화면 = 목록 = 스냅숏의 화면 안 수, 가려진 표지 0, 화면 안+밖+미확인 = 결과 ${order.length}곳`,steps.length===9&&bad.length===0,{steps,bad});
  // The stays without a point open as a list of that many.
  const unknownButton=page.locator('.map-coverage button',{hasText:'위치 미확인'});
  if(await unknownButton.count()){
   await press(unknownButton);await page.waitForTimeout(300);
   const r=await read();
   check(`${label||'전국'}: 위치 미확인 목록 수 = 결과 중 위치 없는 숙소 ${order.length-located.length}곳`,r.list===order.length-located.length&&(await page.locator('.map-stay-list h3').innerText()).includes('위치 미확인'),{list:r.list,expected:order.length-located.length});
   const back=page.locator('.map-stay-list-back');if(await back.count())await press(back);
  }
  // A group: zoom in to its stays, or open them as a list of the same count.
  const group=page.locator('.map-canvas .stay-marker.is-cluster').first();
  if(await group.count()){
   const before=await read(),count=num(await group.textContent());
   await group.evaluate(e=>e.closest('.leaflet-marker-icon').click());
   const after=await audit('묶음 누름');
   const listed=await page.locator('.map-stay-list h3').innerText();
   const zoomed=Number(after.view.split(',')[4])>Number(before.view.split(',')[4]);
   const x=steps.at(-1);
   check(`${label||'전국'}: 묶음(${count}곳)을 누르면 확대되고 합이 그대로 맞거나, 같은 수의 목록이 열림`,(zoomed&&x.shown===x.expected&&x.list===x.expected)||(listed.includes('이 묶음')&&after.list===count),{count,zoomed,listed,after:x});
  }
 }
 // Wide screen: '지도 크게' puts the map in the list's place and the stays in view beside it,
 // with the same counts.
 if(!mobile){
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'지도 크게'}).click();await page.waitForTimeout(1200);
  const layout=await page.evaluate(()=>{const m=document.querySelector('.stay-map')?.getBoundingClientRect(),l=document.querySelector('.map-stay-list')?.getBoundingClientRect(),r=document.querySelector('.results-section');return{map:m&&Math.round(m.width),list:l&&Math.round(l.left-m.right),results:r?getComputedStyle(r).display:null,pressed:document.querySelector('.view-switch [aria-pressed=true]')?.textContent}});
  const r=await page.evaluate(()=>{const cov=document.querySelector('.map-coverage')?.innerText.replace(/\s+/g,' ')??'';const m=cov.match(/이 화면 ([\d,]+)곳/);return{inView:m?Number(m[1].replace(/,/g,'')):null,list:Number((document.querySelector('.map-stay-list h3 b')?.textContent??'-1').replace(/[^0-9-]/g,'')),markers:[...document.querySelectorAll('.map-canvas .stay-marker')].map(e=>e.textContent.trim())}});
  const shown=r.markers.reduce((n,t)=>n+(t.endsWith('곳')?num(t):1),0);
  check('지도 크게: 목록 대신 넓은 지도, 옆에 이 화면 목록, 표지+묶음 합 = 이 화면 = 목록',layout.results==='none'&&layout.map>600&&layout.list>=0&&layout.pressed==='지도 크게'&&shown===r.inView&&r.list===r.inView,{layout,...r,shown});
 }
 // Phone: the list is a sheet over the map; its handle cycles peek, half and full.
 if(mobile){
  await page.goto(base+'/',{waitUntil:'networkidle'});await tap(page.locator('.mobile-map-toggle'));await page.waitForTimeout(800);
  const sheet=page.locator('.map-stay-list.is-sheet'),handle=page.locator('.map-sheet-handle');
  const state=async()=>({h:Math.round((await sheet.boundingBox())?.height??0),expanded:await handle.getAttribute('aria-expanded'),bottom:await sheet.evaluate(e=>Math.round(innerHeight-e.getBoundingClientRect().bottom))});
  const peek=await state();const hb=await handle.boundingBox();
  await tap(handle);await page.waitForTimeout(400);const half=await state();
  await tap(handle);await page.waitForTimeout(400);const full=await state();
  await tap(handle);await page.waitForTimeout(400);const back=await state();
  check('목록 시트: 손잡이(44px)로 엿보기 → 절반 → 전체 → 엿보기, 화면 아래에 붙음',!!hb&&hb.height>=44&&peek.bottom===0&&peek.h<half.h&&half.h<full.h&&back.h===peek.h&&peek.expanded==='false'&&half.expanded==='true',{peek,half,full,back,handle:hb});
  const unknownButton=page.locator('.map-coverage button',{hasText:'위치 미확인'});
  if(await unknownButton.count()){await unknownButton.evaluate(e=>e.click());await page.waitForTimeout(400);const opened=await state();
   check('목록 시트: 위치 미확인 목록을 열면 시트가 절반으로 올라옴',opened.h===half.h,{opened,half});}
 }
 // The note under the map names the approximate points too; an area search replaces the
 // markers, so a list of the result that was open closes.
 if(!mobile){
  await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(800);
  const note=await page.locator('.map-note').innerText(),approximate=!!geo&&search.order('').some(i=>s.core.lat[i]===null&&(geo.grade[i]??0)>=2);
  check('지도 안내: 대략 위치가 있으면 예약 사이트 위치와 대략 위치(점선)를 함께 씀을 알림',approximate?note.includes('대략 위치(점선)'):note.includes('확인된 위치'),{note,approximate});
  await page.locator('.map-coverage button',{hasText:'위치 미확인'}).evaluate(e=>e.click());await page.waitForTimeout(300);
  const opened=(await page.locator('.map-stay-list h3').innerText()).includes('위치 미확인');
  await page.locator('.map-canvas').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);
  await page.locator('.map-area-search').click();await page.waitForTimeout(1200);
  const after={bbox:await page.locator('.map-coverage').getAttribute('data-bbox'),lists:await page.locator('.map-stay-list').count()};
  await page.getByRole('button',{name:'검색 결과 지도로 돌아가기'}).click();await page.waitForTimeout(800);
  const back=await page.locator('.map-stay-list h3').innerText().catch(()=>'');
  check('이 지역에서 검색을 누르면 열려 있던 위치 미확인 목록이 닫히고, 돌아오면 이 화면 목록',opened&&!!after.bbox&&after.lists===0&&back.startsWith('이 화면'),{opened,...after,back});
 }
 // Keyboard: a marker is a Tab stop and Enter opens it (U02 kept).
 await page.goto(base+'/',{waitUntil:'networkidle'});
 if(mobile)await tap(page.locator('.mobile-map-toggle'));
 await page.waitForTimeout(800);
 // Enter on a stay opens its preview; on a group it zooms in or opens its stays as a list.
 const state=()=>page.evaluate(()=>({preview:!!document.querySelector('.map-preview'),zoom:Number(document.querySelector('.map-canvas')?.dataset.view?.split(',')[4]),list:document.querySelector('.map-stay-list h3')?.textContent??''}));
 for(const [kind,selector] of [['숙소','.leaflet-marker-icon:not(:has(.is-cluster))'],['묶음','.leaflet-marker-icon:has(.is-cluster)']]){
  const marker=page.locator(`.map-canvas ${selector}[tabindex="0"]`).first();
  // The first view is mostly groups; zoom in until a single stay is a Tab stop.
  for(let i=0;i<8&&!await marker.count();i++){await page.getByRole('button',{name:'지도 확대'}).evaluate(e=>e.click());await page.waitForTimeout(500)}
  const reachable=await marker.count(),before=await state();
  if(reachable){await marker.focus();await page.keyboard.press('Enter');await page.waitForTimeout(900)}
  const after=await state();
  const opened=kind==='숙소'?!before.preview&&after.preview:after.zoom>before.zoom||(!before.list.includes('이 묶음')&&after.list.includes('이 묶음'));
  check(`${kind} 표지에 Tab으로 가서 Enter로 열 수 있음(${kind==='숙소'?'미리보기':'확대 또는 묶음 목록'})`,reachable>0&&opened,{reachable,before,after});
  if(after.preview)await page.keyboard.press('Escape');
  if(kind==='숙소')await page.goto(base+'/',{waitUntil:'networkidle'}).then(()=>mobile&&tap(page.locator('.mobile-map-toggle'))).then(()=>page.waitForTimeout(800));
 }
 // geo.json failing: the stays it would place are counted as location unknown, nothing
 // goes missing, and the retry button loads it.
 if(geo&&!mobile){
  let fail=true;await page.route('**/geo.json',route=>fail?route.abort():route.continue());
  await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(800);
  const sourceOnly=order=>order.filter(i=>s.core.lat[i]!==null&&s.core.lng[i]!==null).length;
  const all=search.order('');
  const read=()=>page.evaluate(()=>{const cov=document.querySelector('.map-coverage')?.innerText.replace(/\s+/g,' ')??'';const pick=re=>{const m=cov.match(re);return m?Number(m[1].replace(/,/g,'')):null};return{cov,inView:pick(/이 화면 ([\d,]+)곳/),out:pick(/화면 밖 ([\d,]+)곳/),unknown:pick(/위치 미확인 ([\d,]+)곳/),total:pick(/검색 결과 ([\d,]+)곳/)}});
  const failed=await read();
  check('대략 위치(geo.json) 실패: 출처 좌표만 쓰고 나머지는 위치 미확인으로 셈, 합은 결과 수',failed.cov.includes('불러오지 못해')&&failed.unknown===all.length-sourceOnly(all)&&failed.inView+failed.out+failed.unknown===all.length&&failed.total===all.length,{failed,expectedUnknown:all.length-sourceOnly(all)});
  fail=false;await page.getByRole('button',{name:'대략 위치 다시 불러오기'}).click();await page.waitForTimeout(1200);
  const retried=await read(),located=all.filter(i=>point(i)).length;
  check('대략 위치 다시 불러오기: 실패 안내가 사라지고 위치 미확인이 줄어듦, 합은 결과 수',!retried.cov.includes('불러오지 못해')&&retried.unknown===all.length-located&&retried.inView+retried.out+retried.unknown===all.length,{retried,expectedUnknown:all.length-located});
  await page.unroute('**/geo.json');
 }
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,geo:!!geo,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
