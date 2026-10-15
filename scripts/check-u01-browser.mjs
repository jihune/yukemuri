// U01 checks in real Chromium at 360px and 390px with touch and keyboard input.
// Needs a running portable dev server and the isolated Playwright install in docs/ui-u01-20261010.md.
// External requests are blocked, so photos, map tiles and screen readers are not covered.
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

async function run(page,cdp){
 const overflow=()=>page.evaluate(()=>document.scrollingElement.scrollWidth-innerWidth);
 const focused=()=>page.evaluate(()=>{const e=document.activeElement;return e?.getAttribute('aria-label')||e?.innerText?.trim().split('\n')[0].slice(0,40)||e?.tagName});
 const box=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight}});
 const inView=b=>b.left>=-0.5&&b.top>=-0.5&&b.right<=b.vw+0.5&&b.bottom<=b.vh+0.5;
 // The element itself is what a tap at its centre reaches.
 const reachable=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(hit===e||e.contains(hit))});
 // Input.synthesizeScrollGesture did not scroll in headless Chromium 141; raw touch events did.
 const swipe=async(locator,distance)=>{
  await locator.scrollIntoViewIfNeeded();
  const b=await box(locator),y=Math.round((Math.max(b.top,0)+Math.min(b.bottom,b.vh))/2),x=Math.round(Math.min(b.right,b.vw)-20);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=10;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-distance*step/10,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 };
 const scrollLeft=locator=>locator.evaluate(e=>e.scrollLeft);
 const settled=locator=>locator.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${width}-${name}.png`})};

 // The default list loads 40 more cards near its end, so use a short result list to reach a real end.
 await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
 await page.locator('.card-compare').first().tap();
 const listEnd=page.locator('.list-end');
 for(let i=0;i<10&&!(await listEnd.innerText()).includes('목록 끝');i++){await page.evaluate(()=>window.scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'}));await page.waitForTimeout(800)}
 await page.evaluate(()=>window.scrollTo({top:document.scrollingElement.scrollHeight,behavior:'instant'}));await page.waitForTimeout(300);
 // html uses smooth scrolling; the check scrolls instantly and confirms the end was reached.
 const atEnd=await page.evaluate(()=>Math.round(scrollY)===document.scrollingElement.scrollHeight-innerHeight);
 // At the real end the content cannot move further up, so a covered control stays covered.
 const covered=await page.evaluate(()=>[...document.querySelectorAll('main a,main button,footer a,footer button')].filter(e=>{
  if(e.closest('.comparison-dock,.mobile-map-toggle'))return false;
  // A control inside a closed <details> (the collection status panel in the footer, U05) is not shown.
  if(!e.checkVisibility())return false;
  const r=e.getBoundingClientRect();if(!r.width||r.top<0||r.bottom>innerHeight)return false;
  const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !hit||!(hit===e||e.contains(hit));
 }).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {control:e.getAttribute('aria-label')||e.innerText.trim().slice(0,30),top:Math.round(r.top),coveredBy:String(hit?.closest('[class]')?.className).slice(0,40)}}));
 check('목록 끝의 버튼·링크를 비교 막대·지도 보기 버튼이 가리지 않음',atEnd&&(await listEnd.innerText()).includes('목록 끝')&&await page.locator('.comparison-dock').isVisible()&&covered.length===0,{atEnd,listEnd:(await listEnd.innerText()).split('\n')[0],covered});
 await shot('list-end');
 await page.getByRole('button',{name:'비교 후보 모두 비우기'}).tap();
 await page.goto(base+'/',{waitUntil:'networkidle'});
 check('목록 화면 가로 넘침 없음',await overflow()<=0,{overflow:await overflow()});
 const cards=page.locator('.card-compare');
 await cards.nth(0).tap();await cards.nth(1).tap();
 await cards.nth(2).focus();await page.keyboard.press('Space');
 await cards.nth(3).focus();await page.keyboard.press('Enter');
 const pressed=await Promise.all([0,1,2,3].map(i=>cards.nth(i).getAttribute('aria-pressed')));
 check('비교 담기: 터치 2곳·Space·Enter로 4곳 선택',pressed.every(value=>value==='true'),{pressed});
 await cards.nth(4).tap();
 const toast=page.getByText('최대 4곳까지 비교할 수 있습니다',{exact:false});
 check('다섯 번째 후보는 안내 후 거절',await toast.isVisible()&&await cards.nth(4).getAttribute('aria-pressed')==='false');
 await toast.waitFor({state:'detached',timeout:15000});
 const dock=page.locator('.comparison-dock'),mapToggle=page.locator('.mobile-map-toggle');
 const dockBox=await box(dock),mapBox=await box(mapToggle);
 const overlap=Math.max(0,Math.min(dockBox.right,mapBox.right)-Math.max(dockBox.left,mapBox.left))*Math.max(0,Math.min(dockBox.bottom,mapBox.bottom)-Math.max(dockBox.top,mapBox.top));
 check('비교 막대와 지도 보기 버튼이 겹치지 않음',overlap===0,{dock:dockBox,mapToggle:mapBox});

 await dock.getByRole('button',{name:/곳 비교$/}).tap();
 const sheet=page.getByRole('dialog',{name:/숙소 비교/});
 await sheet.locator('.comparison-table').waitFor();await settled(sheet);
 const sheetBox=await box(sheet),close=page.getByRole('button',{name:'숙소 비교 닫기'});
 check('비교 시트가 화면 안에 있고 가로 넘침 없음',inView(sheetBox)&&await overflow()<=0,{sheet:sheetBox});
 check('비교를 열면 닫기 버튼에 포커스',await focused()==='숙소 비교 닫기');
 check('닫기 버튼이 보이고 가려지지 않음',inView(await box(close))&&await reachable(close),{close:await box(close)});
 const toolbar=sheet.locator('.comparison-toolbar button');
 const toolbarBoxes=await Promise.all([0,1].map(i=>box(toolbar.nth(i))));
 check('비교 도구 버튼이 화면 안에 있음',toolbarBoxes.every(inView),{toolbar:toolbarBoxes});
 check('바깥 영역 닫기: 시트가 화면 전체 너비라 바깥 영역 없음',sheetBox.width>=sheetBox.vw-0.5,{sheetWidth:sheetBox.width});
 await shot('compare');

 const order=[],before=results.length;
 for(let i=0;i<300;i++){
  await page.keyboard.press('Tab');
  const state=await page.evaluate(()=>({inside:!!document.activeElement?.closest('[role=dialog]'),label:document.activeElement?.getAttribute('aria-label')}));
  order.push(await focused());
  if(!state.inside){check('Tab 포커스가 비교 시트 안에 머묾',false,{escapedAt:i,order});break}
  if(state.label==='숙소 비교 닫기'){check('Tab 포커스가 비교 시트 안에서 순환',i>0,{steps:i+1,first:order.slice(0,12)});break}
 }
 if(results.length===before)check('Tab 포커스가 300회 안에 닫기 버튼으로 돌아옴',false,{last:order.slice(-5)});
 await page.keyboard.press('Shift+Tab');
 check('닫기 버튼에서 Shift+Tab은 시트 마지막 요소로 이동',await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]'))&&await focused()===order.at(-2),{focused:await focused(),expected:order.at(-2)});

 // U05 PR 6: on a phone the four candidates fit side by side (one mark or short value per cell),
 // so the table no longer moves sideways; arrow keys and a swipe leave it where it is.
 const region=sheet.locator('.comparison-table-region');
 await region.evaluate(e=>{e.scrollLeft=0});await region.focus();
 const start=await scrollLeft(region),fit=await region.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));
 await page.keyboard.press('ArrowRight');const right=await scrollLeft(region);
 check('비교표 4곳이 가로 이동 없이 한 화면에 들어감(방향키에도 그대로)',fit.scroll<=fit.client&&right===start,{fit,start,right});
 const headerBefore=await box(region.locator('th').first());
 await swipe(region,200);await page.waitForTimeout(500);
 const swiped=await scrollLeft(region),regionBox=await box(region),headerAfter=await box(region.locator('th').first());
 check('비교표 터치로 밀어도 가로로 움직이지 않음',swiped===start,{start,swiped});
 check('비교표 첫 열 고정',Math.abs(headerAfter.left-regionBox.left)<=1&&Math.abs(headerAfter.left-headerBefore.left)<=1,{regionLeft:regionBox.left,headerBefore:headerBefore.left,headerAfter:headerAfter.left});
 await shot('compare-swiped');
 await region.evaluate(e=>{e.scrollLeft=0});

 let requests=0;page.on('request',request=>{if(request.url().includes('/api/hotel-comparison'))requests++});
 const recheck=sheet.getByRole('button',{name:'다시 확인'});
 await recheck.focus();await page.keyboard.press('Enter');await page.waitForTimeout(800);
 await recheck.focus();await page.keyboard.press('Space');await page.waitForTimeout(800);
 check('다시 확인을 Enter·Space로 실행',requests===2,{requests});

 const nameButton=sheet.locator('.comparison-hotel-name').first(),hotelName=(await nameButton.innerText()).trim();
 for(const how of ['닫기 버튼','Escape','뒤로 가기']){
  await nameButton.tap();
  const detailClose=page.getByRole('button',{name:'숙소 상세 닫기'});
  await detailClose.waitFor();await settled(page.getByRole('dialog').filter({has:detailClose}));
  const visible=inView(await box(detailClose))&&await reachable(detailClose);
  if(how==='닫기 버튼')await detailClose.tap();else if(how==='Escape')await page.keyboard.press('Escape');else await page.goBack();
  // Focus returns after the closing animation and one frame, about 0.5s in Chromium 141.
  const closedAt=Date.now();
  const restoredMs=await page.waitForFunction(name=>document.activeElement?.innerText?.trim().startsWith(name),hotelName,{timeout:2000}).then(()=>Date.now()-closedAt,()=>null);
  check(`비교→상세→${how}로 비교 복귀`,visible&&await sheet.isVisible()&&restoredMs!==null,{detailCloseReachable:visible,focused:await focused(),expected:hotelName,restoredMs});
 }

 const removes=sheet.locator('.comparison-remove');
 await removes.first().tap();await page.waitForTimeout(300);
 check('후보 제거 후 다음 제거 버튼으로 포커스',await removes.count()===3&&(await focused()).endsWith('비교에서 빼기'),{remaining:await removes.count(),focused:await focused()});
 await sheet.getByRole('button',{name:'모두 비우기'}).focus();await page.keyboard.press('Enter');
 check('모두 비우기 후 닫기 버튼 포커스와 빈 안내',await focused()==='숙소 비교 닫기'&&await sheet.getByText('2~4곳을 선택하세요',{exact:false}).isVisible());
 await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});
 check('Escape로 닫으면 비교 열기 버튼으로 포커스 복귀',(await focused()).startsWith('숙소 비교 열기'),{focused:await focused()});
 await cards.nth(0).tap();
 await page.locator('.compare-open').tap();await sheet.locator('.comparison-table').waitFor();
 await sheet.locator('.comparison-remove').first().tap();await page.waitForTimeout(300);
 check('마지막 후보 제거 후 닫기 버튼 포커스',await focused()==='숙소 비교 닫기');
 await close.tap();await sheet.waitFor({state:'detached'});

 // Collection status: loading, failure, retry, empty and the table on a narrow screen.
 // U05 moved it to the footer. With all 1,655 stays the list keeps loading pages as the footer
 // comes near, so the footer is reached on a short result (handoff U05 3번: 7번 PR에서 진입점).
 await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
 const panel=page.locator('.coverage-panel'),summary=panel.locator('summary');
 await page.route('**/snapshot/v/*/status.json',async route=>{await new Promise(done=>setTimeout(done,1200));await route.continue()});
 // The panel is in the footer (U05): bring it to the middle, clear of the floating buttons.
 await summary.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await summary.tap();
 const loading=panel.getByText('저장된 수집 기록을 확인하고 있습니다');
 check('수집 현황 로딩 안내',await loading.isVisible().catch(()=>false)||await loading.waitFor({timeout:1000}).then(()=>true,()=>false));
 const statusRegion=panel.locator('.collection-table-region');
 await statusRegion.waitFor();await page.unroute('**/snapshot/v/*/status.json');
 check('수집 현황을 연 화면 가로 넘침 없음',await overflow()<=0,{overflow:await overflow()});
 const statusStart=await scrollLeft(statusRegion);
 await statusRegion.focus();await page.keyboard.press('ArrowRight');
 const statusArrow=await scrollLeft(statusRegion);
 await statusRegion.evaluate(e=>{e.scrollLeft=0});await swipe(statusRegion,150);await page.waitForTimeout(500);
 check('수집 현황 표 방향키·터치 가로 이동',statusArrow>statusStart&&await scrollLeft(statusRegion)>0,{statusStart,statusArrow,swiped:await scrollLeft(statusRegion)});
 const refresh=panel.getByRole('button',{name:'출처별 수집 현황 새로고침'});
 // The table swipe can leave the button above the viewport; bring it in before measuring.
 await refresh.scrollIntoViewIfNeeded();
 const refreshBox=await box(refresh);
 check('현황 새로고침 버튼이 화면 안에 보이고 가려지지 않으며 높이 44px 이상',inView(refreshBox)&&await reachable(refresh)&&refreshBox.height>=44,{refresh:refreshBox});
 await shot('status');
 await page.route('**/snapshot/v/*/status.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"test"}'}));
 await refresh.focus();await page.keyboard.press('Enter');
 const alert=panel.getByRole('alert');await alert.waitFor();
 check('새로고침 실패 시 오류 안내와 마지막 결과 유지',(await alert.innerText()).includes('마지막 조회 결과')&&await statusRegion.isVisible()&&await focused()==='출처별 수집 현황 새로고침');
 await page.unroute('**/snapshot/v/*/status.json');
 await page.keyboard.press('Space');await alert.waitFor({state:'detached'});
 check('Space로 재시도 성공 후 오류 안내 제거와 포커스 유지',await focused()==='출처별 수집 현황 새로고침');

 await page.route('**/snapshot/v/*/status.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"test"}'}));
 await page.reload({waitUntil:'networkidle'});
 await summary.focus();await page.keyboard.press('Enter');
 await alert.waitFor();
 check('Enter로 열고 첫 조회 실패 시 오류 안내',!(await alert.innerText()).includes('마지막 조회 결과'));
 await page.unroute('**/snapshot/v/*/status.json');
 const empty={measuredAt:new Date().toISOString(),quality:{records:0,detailRecords:0,bathKnownRecords:0,naturalOnsenRecords:0,roomOnsenRecords:0},providers:[],google:{connected:false,mode:'on_demand'}};
 await page.route('**/snapshot/v/*/status.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(empty)}));
 await refresh.focus();await page.keyboard.press('Enter');
 await panel.getByText('아직 저장된 수집 기록이 없습니다',{exact:false}).waitFor();
 check('빈 기록 안내와 오류 안내 제거',await alert.count()===0);
 await page.unroute('**/snapshot/v/*/status.json');
 await summary.focus();await page.keyboard.press('Space');
 check('Space로 수집 현황 닫기',await panel.evaluate(e=>!e.open));
}

const chromiumVersion=browser.version();
for(width of [360,390]){
 const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 try{await run(page,await context.newCDPSession(page))}catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 await context.close();
}
await browser.close();
const failed=results.filter(result=>!result.pass);
if(evidence){
 writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:'360x780, 390x780 · isMobile · hasTouch · deviceScaleFactor 2',externalRequests:'blocked',results,
  notCovered:['실제 모바일 기기·모바일 브라우저 주소창·안전 영역','스크린리더 읽기 순서','외부 사진·지도 타일','운영 D1 자료(검사는 로컬 개발 DB와 체크인된 스냅샷 사용)']},null,1)+'\n');
}
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
