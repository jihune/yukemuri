// U02 map-bounds search in real Chromium at 360px and 390px with touch and keyboard:
// no request until the button is pressed, loading, failure and retry, counts that match
// the API, the reused map preview, grid counts, and the way back to the loaded list.
// Keyboard on markers: only markers wholly inside the map are Tab stops, and Enter and Space
// do what a tap does, with focus handed to the preview and back.
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
const count=n=>n.toLocaleString('ko-KR')+'곳';
const mapApi=url=>url.pathname==='/api/hotels/map';
// Every marker is a Tab stop exactly when its whole box is inside the map.
const tabStops=page=>page.evaluate(()=>{
 const c=document.querySelector('.map-canvas').getBoundingClientRect();let wrong=0,inside=0,outside=0;
 for(const m of document.querySelectorAll('.leaflet-marker-icon')){const r=m.getBoundingClientRect(),whole=r.left>=c.left-.5&&r.right<=c.right+.5&&r.top>=c.top-.5&&r.bottom<=c.bottom+.5;whole?inside++:outside++;if((m.tabIndex===0)!==whole)wrong++}
 return {wrong,inside,outside};
});
const focusedMarker=page=>page.evaluate(()=>{
 const e=document.activeElement,c=document.querySelector('.map-canvas').getBoundingClientRect();
 if(!e?.classList.contains('leaflet-marker-icon'))return {tag:e?.tagName??null,label:e?.getAttribute('aria-label')??null,text:e?.textContent?.slice(0,40)??null};
 const r=e.getBoundingClientRect(),ids=e.dataset.stayIds?.split(' ')??[];
 return {ids,cell:e.dataset.cell??null,cluster:!!e.querySelector('.is-cluster'),title:e.getAttribute('title'),card:!!document.getElementById('card-'+ids[0]),inside:r.left>=c.left-.5&&r.right<=c.right+.5&&r.top>=c.top-.5&&r.bottom<=c.bottom+.5};
});
// Tab from the map until a marker matching want has focus; null once focus leaves the markers.
const tabToMarker=async(page,want)=>{
 await page.locator('.map-canvas').focus();
 for(let i=0;i<40;i++){await page.keyboard.press('Tab');const m=await focusedMarker(page);if(!m.ids)return null;if(want(m))return m}
 return null;
};
const onPreviewName=page=>page.evaluate(()=>document.activeElement?.matches('.map-preview button:not(.icon-button)')??false);
const onMarkerWith=async(page,id)=>{const m=await focusedMarker(page);return !!m.ids?.includes(id)&&m.inside};
// The preview opened from a focused single marker: focus moves to the hotel name, and closing
// with the keyboard puts focus back on the marker holding the same hotel.
async function previewRoundTrip(page,marker,key){
 const id=marker.ids[0],scroll=await page.evaluate(()=>scrollY);
 await page.keyboard.press(key);
 await page.locator('.map-preview').waitFor({timeout:8000}).catch(()=>{});await page.waitForTimeout(300);
 const opened=await page.locator('.map-preview').count()===1&&(await page.locator('.map-preview').innerText()).includes(marker.title)&&await onPreviewName(page);
 await page.keyboard.press('Tab');
 const onClose=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')==='지도 숙소 선택 해제');
 await page.keyboard.press(key);await page.waitForTimeout(300);
 const back=await page.locator('.map-preview').count()===0&&await onMarkerWith(page,id);
 return {pass:opened&&onClose&&back,opened,onClose,back,scrolled:await page.evaluate(()=>scrollY)-scroll,focus:await focusedMarker(page)};
}

async function run(page,cdp){
 const overflow=()=>page.evaluate(()=>document.scrollingElement.scrollWidth-innerWidth);
 const box=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight}});
 const inView=b=>b.left>=-0.5&&b.top>=-0.5&&b.right<=b.vw+0.5&&b.bottom<=b.vh+0.5;
 const fullyReachable=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return [[.5,.5],[.1,.2],[.9,.2],[.1,.8],[.9,.8]].every(([x,y])=>{const hit=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);return !!hit&&(hit===e||e.contains(hit))})});
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${width}-${name}.png`})};
 const coverage=page.locator('.map-coverage'),areaButton=page.locator('.map-area-search'),canvas=page.locator('.map-canvas');
 const text=async()=>(await coverage.innerText()).replace(/\s+/g,' ');
 const requests=[];page.on('request',r=>{if(mapApi(new URL(r.url())))requests.push(r.url())});
 // Arrow keys on the focused map: a real input that always moves it.
 const nudge=async key=>{await canvas.focus();for(let i=0;i<2;i++)await page.keyboard.press(key);await page.waitForTimeout(600)};
 const drag=async(dx,dy)=>{
  const b=await box(canvas),x=Math.round(b.left+b.width/2),y=Math.round(Math.max(b.top,0)+Math.min(b.height,b.vh-Math.max(b.top,0))/2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=10;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/10,y:y+dy*step/10}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(400);
 };

 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.locator('.mobile-map-toggle').tap();
 await coverage.waitFor();
 // A user scrolls the map into view before moving it.
 await page.locator('.map-sticky').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.waitForTimeout(500);
 check('지도를 열기만 하면 이 지역 검색 버튼과 요청이 없음',await areaButton.count()===0&&requests.length===0,{buttons:await areaButton.count(),requests:requests.length});

 await drag(-60,0);
 await areaButton.waitFor({timeout:5000}).catch(()=>{});
 check('터치로 지도를 움직이면 이 지역에서 검색 버튼이 보이고 요청은 아직 없음',await areaButton.count()===1&&requests.length===0,{requests:requests.length});
 check('이 지역 검색 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않고 높이 44px 이상, 가로 넘침 없음',await areaButton.count()===1&&inView(await box(areaButton))&&await fullyReachable(areaButton)&&(await box(areaButton)).height>=44&&await overflow()<=0,{button:await areaButton.count()?await box(areaButton):null});
 await shot('moved');

 // Loading, then counts that match the API for the same bounds.
 const pane=()=>page.evaluate(()=>document.querySelector('.leaflet-map-pane')?.style.transform??'');
 const viewBefore=await pane();
 await page.route(mapApi,async route=>{await new Promise(r=>setTimeout(r,1200));await route.continue()});
 await areaButton.tap();
 await page.waitForTimeout(200);
 check('누르면 요청 1회와 찾는 중 안내',requests.length===1&&(await areaButton.innerText()).includes('찾는 중')&&await areaButton.getAttribute('aria-disabled')==='true',{requests:requests.length,button:await areaButton.innerText()});
 await page.waitForFunction(()=>!document.querySelector('.map-area-search')?.textContent.includes('찾는 중'),null,{timeout:15000});
 await page.unroute(mapApi);
 const firstUrl=new URL(requests[0]);
 const expected=await page.evaluate(path=>fetch(path).then(r=>r.json()),firstUrl.pathname+firstUrl.search);
 let t=await text();
 const caption=(await page.locator('.map-caption').innerText()).replace(/\s+/g,' ');
 check('이 지역 수·범위 밖·위치 미확인·전체 수가 같은 범위의 API 값과 같음',t.includes(`이 지역 ${count(expected.inBounds)}`)&&t.includes(`범위 밖 ${count(expected.outOfBounds)}`)&&t.includes(`위치 미확인 ${count(expected.withoutCoordinates)}`)&&t.includes(`조건에 맞는 전체 ${count(expected.total)}`)&&caption.includes(`이 지역 ${count(expected.points.length+expected.cells.reduce((a,c)=>a+c.count,0))}`),{text:t,caption,expected:{total:expected.total,inBounds:expected.inBounds,outOfBounds:expected.outOfBounds,withoutCoordinates:expected.withoutCoordinates}});
 const list=await page.evaluate(()=>fetch('/api/hotels?stable=1').then(r=>r.json()));
 check('지도 범위 결과는 목록을 바꾸지 않음',(await page.locator('.mobile-map-toggle').innerText()).includes(String(list.hotels.length))&&expected.total===list.total,{listTotal:list.total,mapTotal:expected.total});
 // The area belongs to the view the user chose: searching keeps that view, and pressing
 // again for the same view is answered from the 30-second memory without a request.
 const viewAfter=await pane();
 check('검색 뒤에도 지도가 사용자가 고른 범위에 그대로 있음',viewAfter===viewBefore,{viewBefore,viewAfter});
 const sentBeforeAgain=requests.length;
 await areaButton.tap();await page.waitForTimeout(500);
 check('같은 범위에서 다시 누르면 요청 없이 같은 결과',requests.length===sentBeforeAgain&&(await text())===t&&await pane()===viewBefore,{sent:requests.length-sentBeforeAgain,text:await text()});
 await shot('area');

 // Enter on a cluster zooms in like a tap; focus stays on the marker holding its first hotel.
 const cluster=await tabToMarker(page,m=>m.cluster);
 if(cluster){await page.keyboard.press('Enter');await page.waitForTimeout(900)}
 const zoomedIn=await focusedMarker(page);
 check('Enter로 겹친 지점을 열면 누를 때처럼 확대되고 포커스는 같은 숙소가 든 지점에 남아 지도 안에 보임',!!cluster&&!!zoomedIn.ids&&zoomedIn.ids.includes(cluster.ids[0])&&zoomedIn.ids.length<cluster.ids.length&&zoomedIn.inside,{before:cluster&&cluster.ids.length,after:zoomedIn});
 // A point outside the loaded list is fetched for the preview. While it loads, and when the
 // fetch fails, focus stays on the marker; when it arrives, focus moves to the preview.
 let single=await tabToMarker(page,m=>!m.cluster&&!m.card);
 if(single){
  const id=single.ids[0],detail=url=>url.pathname==='/api/hotels/'+id;
  await page.route(detail,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
  await page.keyboard.press('Enter');
  await page.locator('.toast-message').waitFor({timeout:8000}).catch(()=>{});
  check('목록에 없는 지점을 Enter로 열다 실패하면 안내가 나오고 포커스는 그 지점에 남음',await page.locator('.toast-message').count()===1&&await page.locator('.map-preview').count()===0&&await onMarkerWith(page,id),{focus:await focusedMarker(page)});
  await page.unroute(detail);
  await page.route(detail,async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue()});
  await page.keyboard.press('Enter');await page.waitForTimeout(400);
  const loading=await page.locator('.map-preview').count()===0&&await onMarkerWith(page,id);
  await page.locator('.map-preview').waitFor({timeout:8000}).catch(()=>{});await page.waitForTimeout(300);
  check('불러오는 동안 포커스는 지점에 있고 미리보기가 오면 숙소 이름으로 옮겨감',loading&&(await page.locator('.map-preview').innerText().catch(()=>'')).includes(single.title)&&await onPreviewName(page),{loading,focus:await focusedMarker(page)});
  await page.unroute(detail);
  // Close it from the keyboard, then the same marker again with Space.
  await page.keyboard.press('Tab');await page.keyboard.press('Enter');await page.waitForTimeout(300);
  const closed=await page.locator('.map-preview').count()===0&&await onMarkerWith(page,id);
  const space=await previewRoundTrip(page,single,'Space');
  check('미리보기를 키보드로 닫으면 포커스가 그 지점으로 돌아오고 Space로 다시 열고 닫아도 같음(페이지 스크롤 없음)',closed&&space.pass&&space.scrolled===0,{closed,space});
 }else check('목록에 없는 지점을 Enter로 열다 실패하면 안내가 나오고 포커스는 그 지점에 남음',false,{reason:'목록에 없는 단일 지점이 Tab 정지에 없음'});

 // The reused preview: tap a single marker from the area result.
 // Only markers inside the map can be tapped; the keyboard steps above may have zoomed in.
 const visible=async selector=>{const i=await page.evaluate(sel=>{const c=document.querySelector('.map-canvas').getBoundingClientRect();return [...document.querySelectorAll(sel)].findIndex(m=>{const r=m.getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom})},selector);return i<0?null:page.locator(selector).nth(i)};
 let tapSingle=await visible('.stay-marker:not(.is-cluster)');
 for(let i=0;i<6&&!tapSingle;i++){await (await visible('.stay-marker.is-cluster'))?.tap();await page.waitForTimeout(600);tapSingle=await visible('.stay-marker:not(.is-cluster)')}
 if(tapSingle){
  const title=await tapSingle.evaluate(e=>e.closest('.leaflet-marker-icon')?.getAttribute('title'));
  await tapSingle.tap();
  const preview=page.locator('.map-preview');await preview.waitFor({timeout:8000}).catch(()=>{});
  check('지점을 누르면 기존 지도 미리보기에 그 숙소가 보임',await preview.count()===1&&(await preview.innerText()).includes(title),{title,preview:await preview.count()?(await preview.innerText()).slice(0,80):''});
  if(await preview.count())await page.getByRole('button',{name:'지도 숙소 선택 해제'}).tap();
 }else check('지점을 누르면 기존 지도 미리보기에 그 숙소가 보임',false,{reason:'단일 지점 없음'});

 // Keyboard: arrows move the map; a failed search keeps focus and offers a retry.
 await canvas.focus();for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');
 await page.waitForTimeout(600);
 const before=requests.length;
 check('방향키로 지도를 움직이면 다시 검색 버튼이 보이고 요청은 없음',(await areaButton.innerText()).includes('다시 검색')&&requests.length===before,{button:await areaButton.innerText()});
 // Forward Tab from the map must reach the button, with markers off screen after zooming in:
 // a focused off-screen marker must not pan the map, redraw it and drop focus to the page.
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'지도 확대'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(400)}
 // Tab stops follow the view: zoomed in, moved, zoomed out, and zoomed in again.
 const zoomedStops=await tabStops(page);
 await nudge('ArrowUp');const pannedStops=await tabStops(page);
 await page.getByRole('button',{name:'지도 축소'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(600);
 const outStops=await tabStops(page);
 await page.getByRole('button',{name:'지도 확대'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(600);
 check('확대·이동·축소 때마다 지도 안에 다 보이는 지점만 Tab 정지',[zoomedStops,pannedStops,outStops].every(x=>x.wrong===0&&x.outside>0)&&zoomedStops.inside>0&&outStops.inside>zoomedStops.inside,{zoomedStops,pannedStops,outStops});
 // The cause itself: focusing a marker outside the map's visible box must not pan the map.
 const outside=await page.evaluate(()=>{const c=document.querySelector('.map-canvas').getBoundingClientRect();return [...document.querySelectorAll('.leaflet-marker-icon')].findIndex(m=>{const r=m.getBoundingClientRect();return r.right<c.left||r.left>c.right||r.bottom<c.top||r.top>c.bottom})});
 if(outside>=0){
  const marker=page.locator('.leaflet-marker-icon').nth(outside),panBefore=await pane();
  await marker.focus();await page.waitForTimeout(600);
  check('화면 밖 지점에 포커스가 가도 지도가 옮겨지지 않고 포커스가 그 지점에 남음',await pane()===panBefore&&await marker.evaluate(e=>e===document.activeElement),{panBefore,panAfter:await pane()});
 }else check('화면 밖 지점에 포커스가 가도 지도가 옮겨지지 않고 포커스가 그 지점에 남음',false,{reason:'확대 뒤 화면 밖 지점 없음'});
 await canvas.focus();
 let tabs=0,bodyFocus=0;
 const walkStops=await tabStops(page);let markerStops=0,hiddenStops=0;
 for(;tabs<100&&!(await areaButton.evaluate(e=>e===document.activeElement));tabs++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement===document.body))bodyFocus++;const m=await focusedMarker(page);if(m.ids){markerStops++;if(!m.inside)hiddenStops++}}
 check('확대해 지점이 화면 밖에 있어도 지도에서 앞으로 Tab하면 이 지역 검색 버튼에 도달',tabs<100&&bodyFocus===0,{tabs,bodyFocus});
 check('확대 뒤 Tab이 멈춘 지점은 모두 지도 안에 보임(화면 밖 지점은 Tab 순서에서 빠짐)',walkStops.outside>0&&markerStops>0&&hiddenStops===0,{walkStops,markerStops,hiddenStops});
 await page.route(mapApi,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
 await page.keyboard.press('Enter');
 await coverage.getByRole('alert').waitFor({timeout:10000}).catch(()=>{});
 check('검색 실패 시 오류 안내·다시 검색 버튼, 포커스는 이 지역 검색 버튼에 남음',await coverage.getByRole('alert').count()===1&&await coverage.getByRole('button',{name:'다시 검색'}).count()===1&&await areaButton.evaluate(e=>e===document.activeElement),{text:await text()});
 await page.unroute(mapApi);
 await page.keyboard.press('Space');
 await coverage.getByRole('alert').waitFor({state:'detached',timeout:10000}).catch(()=>{});
 t=await text();
 check('Space로 다시 검색 성공 후 오류 안내가 사라지고 이 지역 수 표시',await coverage.getByRole('alert').count()===0&&t.includes('이 지역'),{text:t});

 // Touch retry from the counts line.
 await page.route(mapApi,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
 const sentBefore=requests.length;
 await nudge('ArrowDown');await areaButton.tap();
 await coverage.getByRole('alert').waitFor({timeout:10000}).catch(()=>{});
 const sentAfter=requests.length,buttonText=await areaButton.innerText();
 await page.unroute(mapApi);
 const retry=coverage.getByRole('button',{name:'다시 검색'});
 const retryOk=await retry.count()===1&&(await box(retry)).height>=44;
 if(await retry.count())await retry.tap();
 await coverage.getByRole('alert').waitFor({state:'detached',timeout:10000}).catch(()=>{});
 check('터치로 안내 줄의 다시 검색 성공(버튼 높이 44px 이상)',retryOk&&await coverage.getByRole('alert').count()===0&&(await text()).includes('이 지역'),{text:await text(),sentBefore,sentAfter,buttonText});

 // More points than one answer holds: grid counts, and a tap zooms into the cell.
 // The made-up cell sits in the south-west of the requested bounds, away from the middle.
 await page.route(mapApi,route=>{
  const [w,so,e,n]=new URL(route.request().url()).searchParams.get('bbox').split(',').map(Number);
  const lat=so+(n-so)*0.2,lng=w+(e-w)*0.2,h=(n-so)*0.05,k=(e-w)*0.05;
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:1000,inBounds:600,outOfBounds:0,withoutCoordinates:400,limit:500,points:[],cells:[{lat,lng,count:600,south:lat-h,north:lat+h,west:lng-k,east:lng+k}]})});
 });
 await nudge('ArrowLeft');await areaButton.tap();
 const cell=page.locator('.stay-marker',{hasText:'600곳'});await cell.waitFor({timeout:8000}).catch(()=>{});
 t=await text();
 check('상한 초과 응답은 구역 개수 지점과 안내로 표시',await cell.count()===1&&t.includes('구역별 개수로 표시')&&(await page.locator('.map-caption').innerText()).includes('600곳'),{text:t});
 // Fitting the cell bounds brings the cell's marker to about the middle of the map.
 const offCentre=async()=>{const m=await box(cell),c=await box(canvas);return Math.hypot(m.left+m.width/2-(c.left+c.width/2),m.top+m.height/2-(c.top+c.height/2))};
 const cellBefore=await cell.count()?await offCentre():null;
 if(await cell.count())await cell.tap();
 await page.waitForTimeout(1000);
 const cellAfter=await cell.count()?await offCentre():null;
 check('구역 지점을 누르면 지도가 그 구역으로 이동(지점이 지도 가운데 근처로 옴)',cellBefore!==null&&cellAfter!==null&&cellAfter<cellBefore&&cellAfter<80,{cellBefore,cellAfter});
 // The same with Space from the keyboard, after moving the cell away from the middle
 // (up and down: the map is taller than it is wide, so the cell stays wholly inside it).
 await nudge('ArrowUp');await nudge('ArrowUp');
 const cellAway=await cell.count()?await offCentre():null,focusedCell=await tabToMarker(page,m=>!!m.cell);
 const cellScroll=await page.evaluate(()=>scrollY);
 if(focusedCell){await page.keyboard.press('Space');await page.waitForTimeout(1000)}
 const cellBack=await cell.count()?await offCentre():null,cellFocus=await focusedMarker(page);
 check('Space로 구역 지점을 열면 그 구역으로 이동하고 포커스는 그 구역 지점에 남음(페이지 스크롤 없음)',!!focusedCell&&cellAway!==null&&cellBack!==null&&cellAway>=80&&cellBack<80&&cellFocus.cell===focusedCell.cell&&cellFocus.inside&&await page.evaluate(()=>scrollY)===cellScroll,{cellAway,cellBack,cellFocus});
 await page.unroute(mapApi);
 await shot('grid');

 // Back to the loaded list positions with the keyboard.
 const back=coverage.getByRole('button',{name:'불러온 목록 위치로 돌아가기'});
 await back.focus();await page.keyboard.press('Enter');
 await page.waitForTimeout(300);
 check('Enter로 불러온 목록 위치로 돌아가면 기존 표시 수 안내로 돌아옴',(await text()).includes('검색 결과')&&(await text()).includes('중 지도에'),{text:await text()});

 // Where PR #13 and this PR meet. Opening the phone map scrolls its column to the top
 // (PR #13); the area button must then be on screen and clear without further scrolling.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.locator('.mobile-map-toggle').tap();
 await coverage.waitFor();await page.waitForTimeout(500);
 await canvas.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);
 await areaButton.waitFor({timeout:5000}).catch(()=>{});
 check('지도 화면을 연 위치 그대로 이 지역 검색 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음',await areaButton.count()===1&&inView(await box(areaButton))&&await fullyReachable(areaButton),{button:await areaButton.count()?await box(areaButton):null});
 // A shortened total (PR #13) and an area result (this PR) shown together.
 await page.route(url=>url.pathname==='/api/hotels',async route=>{
  if(new URL(route.request().url()).searchParams.get('page')==='1')return route.continue();
  const real=await (await route.fetch()).json();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...real,hotels:[]})});
 });
 await coverage.getByRole('button',{name:/더 불러와 지도에 표시/}).tap();
 await page.locator('.list-shortened').waitFor({timeout:10000}).catch(()=>{});
 await page.unroute(url=>url.pathname==='/api/hotels');
 await areaButton.tap();
 await coverage.getByText('이 지역').first().waitFor({timeout:10000}).catch(()=>{});
 const both=await text();
 check('줄어든 결과 수 안내와 범위 검색 결과가 지도 표시 줄에 함께 보이고 가로 넘침 없음',both.includes('이 지역')&&both.includes('결과 수를 불러온')&&await page.locator('.list-shortened').count()===1&&await overflow()<=0,{text:both});
 await shot('overlap');
}

// Desktop: hovering a list card re-renders the page; the moved map must stay where it is.
async function desktopHover(page){
 const box=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const canvas=page.locator('.map-canvas');await canvas.waitFor();await page.waitForTimeout(500);
 await canvas.focus();for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);
 const pane=()=>page.evaluate(()=>document.querySelector('.leaflet-map-pane')?.style.transform??'');
 const moved=await pane();
 await page.locator('.hotel-card').nth(2).hover();await page.waitForTimeout(600);
 const after=await pane();
 check('데스크톱에서 지도를 옮긴 뒤 목록 카드에 마우스를 올려도 지도가 그대로 있음',moved!==''&&after===moved,{moved,after});
 // Keyboard on markers at desktop width. The mouse leaves the list first: selecting a marker
 // scrolls its card into view, and a card that lands under a resting mouse takes the preview.
 await page.mouse.move(1279,795);
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'지도 확대'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(500)}
 const stops=await tabStops(page);
 check('데스크톱에서 확대하면 지도 안에 다 보이는 지점만 Tab 정지',stops.wrong===0&&stops.inside>0&&stops.outside>0,stops);
 // A narrower window resizes the map without the user moving it.
 const wideMap=(await box(canvas)).width;
 await page.setViewportSize({width:1100,height:640});await page.waitForTimeout(800);
 const resized=await tabStops(page),narrowMap=(await box(canvas)).width;
 check('창 크기가 바뀌어 지도가 줄어도 지도 안에 다 보이는 지점만 Tab 정지',narrowMap<wideMap&&resized.wrong===0&&resized.outside>0,{...resized,wideMap,narrowMap});
 await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(800);
 const single=await tabToMarker(page,m=>!m.cluster);
 const trip=single?await previewRoundTrip(page,single,'Enter'):null;
 check('데스크톱에서 Enter로 지점의 미리보기를 열면 포커스가 미리보기로 가고 닫으면 지점으로 돌아옴',!!trip?.pass,{trip});
}

const chromiumVersion=browser.version();
{
 width=1280;
 const context=await browser.newContext({viewport:{width:1280,height:800},locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 try{await desktopHover(page)}catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 await context.close();
}
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
 writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:'360x780, 390x780 · isMobile · hasTouch · deviceScaleFactor 2; 1280x800 desktop hover',externalRequests:'blocked',results,
  notCovered:['실제 모바일 기기·모바일 브라우저 주소창·안전 영역','스크린리더 읽기 순서','외부 지도 타일','운영 D1 자료(검사는 로컬 개발 DB와 체크인된 스냅샷 사용)','구역 개수 응답은 검사에서 만든 응답으로 화면만 확인(실제 상한 초과는 Worker 검사)']},null,1)+'\n');
}
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
