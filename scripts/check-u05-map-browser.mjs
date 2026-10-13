// U05 map mode in real Chromium (390px touch, 1280px mouse): no stay of the
// search result goes missing from the map (user decision 2026-10-13).
// At every zoom step from the first view in and out again:
// - single markers + the numbers on group markers = "이 화면 N곳" = the list
//   beside the map = the stays of the result whose point is inside the drawn
//   view, counted here from the snapshot the site serves (scripts/site-search-node.mjs);
// - "이 화면" + "화면 밖" + "위치 미확인" = the result count;
// - the location-unknown list holds that many stays;
// - a group marker zooms in or opens its stays as a list of the same count.
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
   const cov=document.querySelector('.map-coverage')?.innerText.replace(/\s+/g,' ')??'';
   const pick=re=>{const m=cov.match(re);return m?Number(m[1].replace(/,/g,'')):null};
   return{view:document.querySelector('.map-canvas')?.dataset.view,markers,cov,
    inView:pick(/이 화면 ([\d,]+)곳/),out:pick(/화면 밖 ([\d,]+)곳/),unknown:pick(/위치 미확인 ([\d,]+)곳/),total:pick(/(?:검색 결과|다른 후보) ([\d,]+)곳/),
    list:Number((document.querySelector('.map-stay-list h3 b')?.textContent??'-1').replace(/[^0-9-]/g,''))};
  });
  const steps=[];
  const audit=async step=>{
   await page.waitForTimeout(700);const r=await read();
   const [west,south,east,north,zoom]=(r.view??'').split(',').map(Number);
   const expected=located.filter(i=>{const [a,b]=point(i);return a>=south&&a<=north&&b>=west&&b<=east}).length;
   const shown=r.markers.reduce((n,t)=>n+(t.endsWith('곳')?num(t):1),0);
   steps.push({step,zoom,expected,shown,inView:r.inView,list:r.list,out:r.out,unknown:r.unknown,total:r.total});
   return r;
  };
  await audit('처음');
  const zoomIn=page.getByRole('button',{name:'지도 확대'}),zoomOut=page.getByRole('button',{name:'지도 축소'});
  const press=l=>l.evaluate(e=>e.click());
  for(let i=0;i<3;i++){await press(zoomIn);await audit('확대 '+(i+1))}
  for(let i=0;i<5;i++){await press(zoomOut);await audit('축소 '+(i+1))}
  const bad=steps.filter(x=>!(x.shown===x.expected&&x.inView===x.expected&&x.list===x.expected&&x.inView+x.out+x.unknown===order.length&&x.total===order.length));
  check(`${label||'전국'}: 확대 단계마다 표지+묶음 합 = 이 화면 = 목록 = 스냅숏의 화면 안 수, 화면 안+밖+미확인 = 결과 ${order.length}곳`,steps.length===9&&bad.length===0,{steps,bad});
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
 // Keyboard: a marker is a Tab stop and Enter opens it (U02 kept).
 await page.goto(base+'/',{waitUntil:'networkidle'});
 if(mobile)await tap(page.locator('.mobile-map-toggle'));
 await page.waitForTimeout(800);
 const marker=page.locator('.map-canvas .leaflet-marker-icon[tabindex="0"]').first();
 const reachable=await marker.count();
 if(reachable){await marker.focus();await page.keyboard.press('Enter');await page.waitForTimeout(800)}
 const opened=await page.evaluate(()=>!!document.querySelector('.map-preview')||Number(document.querySelector('.map-canvas')?.dataset.view?.split(',')[4])>0);
 check('표지에 Tab으로 가서 Enter로 열 수 있음',reachable>0&&opened,{reachable});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,geo:!!geo,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
