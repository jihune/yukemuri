// U02 map-bounds search in real Chromium at 360px and 390px with touch and keyboard:
// the area result is computed in the browser from the static snapshot (P03), with no
// request to the Worker; counts that match the snapshot, the reused map preview, grid
// counts (from a snapshot with an added cluster), and the way back to the loaded list.
// Keyboard on markers: only markers wholly inside the map are Tab stops, and Enter and Space
// do what a tap does, with focus handed to the preview and back.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start) and the isolated Playwright install in docs/ui-u01-20261010.md.
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
import {siteSearch} from './site-search-node.mjs';
const search=await siteSearch(base);
// Any list, search or map request that reaches the Worker (none should since P03).
const workerSearch=url=>/^\/api\/hotels(?:\/(?:map|suggestions|search-index))?$/.test(url.pathname)||url.searchParams.has('_rsc');
const bboxOf=async page=>(await page.locator('.map-coverage').getAttribute('data-bbox')).split(',').map(Number);
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
// U05 draws only the stays inside the view, so a marker over the map's edge needs a move:
// pan with the arrow keys (each pan redraws) until some drawn marker sticks out of the map.
// A direction that finds none pans back, so the map keeps its markers in view.
const markerToEdge=async page=>{
 const back={ArrowRight:'ArrowLeft',ArrowLeft:'ArrowRight',ArrowDown:'ArrowUp',ArrowUp:'ArrowDown'};
 for(const key of ['ArrowRight','ArrowLeft','ArrowDown','ArrowUp']){
  let steps=0;
  for(;steps<12;steps++){
   const stops=await tabStops(page);if(stops.outside>0)return true;if(stops.inside===0)break;
   await page.locator('.map-canvas').focus();await page.keyboard.press(key);await page.waitForTimeout(450);
  }
  for(;steps>0;steps--){await page.locator('.map-canvas').focus();await page.keyboard.press(back[key]);await page.waitForTimeout(450)}
 }
 return (await tabStops(page)).outside>0;
};
// Tab from the map until a marker matching want has focus; null once focus leaves the markers.
const tabToMarker=async(page,want)=>{
 await page.locator('.map-canvas').focus();
 for(let i=0;i<40;i++){await page.keyboard.press('Tab');const m=await focusedMarker(page);if(!m.ids)return null;if(want(m))return m}
 return null;
};
// U05 merges groups whose icons would overlap, so a view can hold only groups: zoom in
// (the zoom button, not a pan) until a single stay is a Tab stop.
const tabToSingle=async page=>{
 for(let i=0;i<6;i++){
  const m=await tabToMarker(page,m=>!m.cluster);if(m)return m;
  await page.getByRole('button',{name:'지도 확대'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(600);
 }
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
 const requests=[];page.on('request',r=>{if(workerSearch(new URL(r.url())))requests.push(r.url())});
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

 // The area result at once, without a request, with counts of the same bounds.
 const pane=()=>page.evaluate(()=>document.querySelector('.leaflet-map-pane')?.style.transform??'');
 const viewBefore=await pane();
 await areaButton.tap();
 await coverage.getByText('이 지역').first().waitFor({timeout:5000}).catch(()=>{});
 check('누르면 요청 없이 이 지역 결과',requests.length===0&&!(await areaButton.innerText()).includes('찾는 중')&&(await text()).includes('이 지역'),{requests:requests.length,button:await areaButton.innerText()});
 const [west,south,east,north]=await bboxOf(page),expected=search.map('',{west,south,east,north});
 let t=await text();
 const caption=(await page.locator('.map-caption').innerText()).replace(/\s+/g,' ');
 check('이 지역 수·범위 밖·위치 미확인·전체 수가 같은 범위의 스냅숏 값과 같음',t.includes(`이 지역 ${count(expected.inBounds)}`)&&t.includes(`범위 밖 ${count(expected.outOfBounds)}`)&&t.includes(`위치 미확인 ${count(expected.withoutCoordinates)}`)&&t.includes(`조건에 맞는 전체 ${count(expected.total)}`)&&caption.includes(count(expected.inBounds)),{text:t,caption,expected:{...expected,points:expected.points.length}});
 const list=search.list('');
 // U05: the floating button counts the whole result (the map shows all of it), not the loaded page.
 check('지도 범위 결과는 목록을 바꾸지 않음',(await page.locator('.mobile-map-toggle').innerText()).includes(list.total.toLocaleString('ko-KR'))&&expected.total===list.total,{listTotal:list.total,mapTotal:expected.total});
 // The area belongs to the view the user chose: searching keeps that view, and pressing
 // again for the same view gives the same result.
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
 // A point outside the loaded list: its card is in the snapshot, so the preview opens
 // at once and takes focus, with no request.
 let single=await tabToMarker(page,m=>!m.cluster&&!m.card);
 if(single){
  const id=single.ids[0],sent=requests.length,details=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/hotels/'+id)details.push(r.url())});
  await page.keyboard.press('Enter');
  await page.locator('.map-preview').waitFor({timeout:8000}).catch(()=>{});await page.waitForTimeout(300);
  check('목록에 없는 지점을 Enter로 열면 요청 없이 미리보기가 열리고 포커스가 숙소 이름으로 감',requests.length===sent&&details.length===0&&(await page.locator('.map-preview').innerText().catch(()=>'')).includes(single.title)&&await onPreviewName(page),{details,focus:await focusedMarker(page)});
  // Close it from the keyboard, then the same marker again with Space.
  await page.keyboard.press('Tab');await page.keyboard.press('Enter');await page.waitForTimeout(300);
  const closed=await page.locator('.map-preview').count()===0&&await onMarkerWith(page,id);
  const space=await previewRoundTrip(page,single,'Space');
  check('미리보기를 키보드로 닫으면 포커스가 그 지점으로 돌아오고 Space로 다시 열고 닫아도 같음(페이지 스크롤 없음)',closed&&space.pass&&space.scrolled===0,{closed,space});
 }else check('목록에 없는 지점을 Enter로 열면 요청 없이 미리보기가 열리고 포커스가 숙소 이름으로 감',false,{reason:'목록에 없는 단일 지점이 Tab 정지에 없음'});

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

 // Keyboard: arrows move the map; Enter and Space on the button search again.
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
 await page.keyboard.press('Enter');await page.waitForTimeout(300);
 t=await text();
 check('Enter로 다시 검색하면 포커스는 이 지역 검색 버튼에 남고 이 지역 수 표시',t.includes('이 지역')&&await areaButton.evaluate(e=>e===document.activeElement)&&requests.length===0,{text:t});
 // The area result has no failure of its own any more: it is computed from the loaded
 // snapshot. A snapshot that cannot be read fails the list (check-u02-browser.mjs).

 // More points than one answer holds: grid counts, and a tap zooms into the cell.
 // A snapshot whose only located hotels are 600 in one cell of the last area search
 // (the checked-in catalogue has too few coordinates for a grid), loaded by the list
 // refresh as a newer deploy would be.
  await nudge('ArrowLeft');await areaButton.tap();await page.waitForTimeout(300);
 // At the centre of grid cell (row 4, col 4), so that fitting the cell centres its marker.
 const [w,so,e,n]=await bboxOf(page),lat=so+(n-so)/16*4.5,lng=w+(e-w)/16*4.5;
 const manifest=await (await page.request.get(base+'/snapshot/manifest.json')).json(),core=await (await page.request.get(base+manifest.files.core)).json();
 // Only these 600 are located, so they make the one cell of the grid.
 let added=0;for(let i=0;i<core.ids.length;i++){if(added<600&&!['closed','temporarily_closed'].includes(core.state[i])){core.lat[i]=lat+(added%30-15)*0.00001;core.lng[i]=lng+(Math.floor(added/30)-10)*0.00001;added++}else{core.lat[i]=null;core.lng[i]=null}}
 await page.route(url=>url.pathname==='/snapshot/manifest.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...manifest,id:'grid-check',files:{...manifest.files,core:'/snapshot/v/grid-check/core.json'}})}));
 await page.route(url=>url.pathname==='/snapshot/v/grid-check/core.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(core)}));
 await page.locator('.result-refresh').evaluate(e=>e.click());await page.waitForTimeout(800);
 await page.locator('.map-sticky').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
 // Back to the same view (right, then left) so the cluster is in the searched bounds.
 await nudge('ArrowRight');await nudge('ArrowLeft');await areaButton.tap();
 // The added cluster is the largest cell (a few real hotels may share it).
 await page.locator('.stay-marker.is-cluster').first().waitFor({timeout:8000}).catch(()=>{});
 const sizes=await page.locator('.stay-marker.is-cluster').evaluateAll(list=>list.map(e=>Number(e.textContent.replace(/[^0-9]/g,''))));
 const biggest=Math.max(0,...sizes),cell=page.locator('.stay-marker.is-cluster',{hasText:new RegExp('^'+count(biggest)+'$')});
 t=await text();
 check('상한 초과 결과는 구역 개수 지점과 안내로 표시',biggest>=600&&t.includes('구역별 개수로 표시'),{text:t,biggest});
 // Fitting the cell bounds brings the cell's marker to about the middle of the map.
 const offCentre=async()=>{const m=await box(cell),c=await box(canvas);return Math.hypot(m.left+m.width/2-(c.left+c.width/2),m.top+m.height/2-(c.top+c.height/2))};
 // The zoom of the tile layer (tile URLs are /z/x/y even though tiles are blocked here).
 const zoom=()=>page.evaluate(()=>Math.max(...[...document.querySelectorAll('img.leaflet-tile')].map(i=>Number(new URL(i.src).pathname.split('/')[1]))));
 const cellBefore=await cell.count()?await offCentre():null,zoomBefore=await zoom();
 if(await cell.count())await cell.tap();
 await page.waitForTimeout(1000);
 const cellAfter=await cell.count()?await offCentre():null,zoomAfter=await zoom(),cellBox=await cell.count()?await box(cell):null,canvasBox=await box(canvas);
 // The cell is a sixteenth of the searched bounds: fitting it zooms in about four levels.
 // Its marker sits at the hotels' average position, not the cell's centre.
 check('구역 지점을 누르면 지도가 그 구역으로 이동(3단계 이상 확대되고 지점이 지도 안에 보임)',cellBefore!==null&&cellAfter!==null&&zoomAfter>=zoomBefore+3&&!!cellBox&&cellBox.left>=canvasBox.left&&cellBox.right<=canvasBox.right&&cellBox.top>=canvasBox.top&&cellBox.bottom<=canvasBox.bottom,{cellBefore,cellAfter,zoomBefore,zoomAfter});
 // The same with Space from the keyboard, after moving the cell away from the middle
 // (up and down: the map is taller than it is wide, so the cell stays wholly inside it).
 await nudge('ArrowUp');
 // Tab to the cell measured above (the first cell in Tab order depends on the map's size).
 const cellAway=await cell.count()?await offCentre():null,focusedCell=await tabToMarker(page,m=>!!m.cell&&!!m.title?.includes(`${biggest}개`));
 const cellScroll=await page.evaluate(()=>scrollY);
 if(focusedCell){await page.keyboard.press('Space');await page.waitForTimeout(1000)}
 const cellBack=await cell.count()?await offCentre():null,cellFocus=await focusedMarker(page);
 check('Space로 구역 지점을 열면 그 구역으로 이동하고 포커스는 그 구역 지점에 남음(페이지 스크롤 없음)',!!focusedCell&&cellAway!==null&&cellBack!==null&&cellBack<cellAway&&cellFocus.cell===focusedCell.cell&&cellFocus.inside&&await page.evaluate(()=>scrollY)===cellScroll,{cellAway,cellBack,cellFocus});
 await page.unroute(url=>url.pathname==='/snapshot/manifest.json');await page.unroute(url=>url.pathname==='/snapshot/v/grid-check/core.json');
 // U05: cells keep the approximate grade. The same 600 with geo.json grade 4 (as a seed point
 // is), and 20 more in cell (row 4, col 10) of which half are grade 1; no other stay located.
 // The new snapshot fits the map to them; an area search there gives a dashed cell of the
 // 600, a solid mixed cell of the 20, and a note naming approximate points.
 const geo={grade:[],lat:[],lng:[]},lngB=w+(e-w)/16*10.5;let b=0;
 for(let i=0;i<core.ids.length;i++){
  if(core.lat[i]!==null){geo.grade.push(4)}
  else if(b<20&&!['closed','temporarily_closed'].includes(core.state[i])){core.lat[i]=lat+(b%5)*0.00001;core.lng[i]=lngB+(b%4)*0.00001;geo.grade.push(b%2?4:1);b++}
  else geo.grade.push(0);
  geo.lat.push(core.lat[i]);geo.lng.push(core.lng[i]);
 }
 let geoServed=false;
 await page.route(url=>url.pathname==='/snapshot/manifest.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...manifest,id:'grid-geo-check',files:{...manifest.files,core:'/snapshot/v/grid-geo-check/core.json',geo:'/snapshot/v/grid-geo-check/geo.json'}})}));
 await page.route(url=>url.pathname==='/snapshot/v/grid-geo-check/core.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(core)}));
 await page.route(url=>url.pathname==='/snapshot/v/grid-geo-check/geo.json',route=>{geoServed=true;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(geo)})});
 await coverage.getByRole('button',{name:'검색 결과 지도로 돌아가기'}).evaluate(e=>e.click());
 await page.locator('.result-refresh').evaluate(e=>e.click());
 for(let i=0;i<20&&!geoServed;i++)await page.waitForTimeout(250);
 await page.waitForTimeout(800);
 await nudge('ArrowRight');await nudge('ArrowLeft');await areaButton.tap();
 await page.locator('.stay-marker.is-cluster').first().waitFor({timeout:8000}).catch(()=>{});
 const graded=await page.locator('.stay-marker.is-cluster').evaluateAll(list=>list.map(e=>({n:Number(e.textContent.replace(/[^0-9]/g,'')),dashed:e.classList.contains('is-approximate')})));
 const note=await page.locator('.map-note').innerText(),all=graded.find(x=>x.n===600),mixed=graded.find(x=>x.n===20);
 check('구역도 대략 위치만 든 구역은 점선, 섞인 구역은 실선, 지도 안내는 대략 위치(점선)',geoServed&&(await text()).includes('구역별 개수로 표시')&&all?.dashed===true&&mixed?.dashed===false&&note.includes('대략 위치(점선)'),{geoServed,graded,note});
 await page.unroute(url=>url.pathname==='/snapshot/manifest.json');await page.unroute(url=>url.pathname==='/snapshot/v/grid-geo-check/core.json');await page.unroute(url=>url.pathname==='/snapshot/v/grid-geo-check/geo.json');
 await shot('grid');

 // Back to the loaded list positions with the keyboard.
 const back=coverage.getByRole('button',{name:'검색 결과 지도로 돌아가기'});
 await back.focus();await page.keyboard.press('Enter');
 await page.waitForTimeout(300);
 // U05: the map shows the whole result, so leaving the area result returns to the in-view counts.
 check('Enter로 검색 결과 지도로 돌아가면 이 화면·검색 결과 안내로 돌아옴',(await text()).includes('검색 결과')&&(await text()).includes('이 화면'),{text:await text()});

 // Where PR #13 and this PR meet. Opening the phone map scrolls its column to the top
 // (PR #13); the area button must then be on screen and clear without further scrolling.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.locator('.mobile-map-toggle').tap();
 await coverage.waitFor();await page.waitForTimeout(500);
 await canvas.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);
 await areaButton.waitFor({timeout:5000}).catch(()=>{});
 check('지도 화면을 연 위치 그대로 이 지역 검색 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음',await areaButton.count()===1&&inView(await box(areaButton))&&await fullyReachable(areaButton),{button:await areaButton.count()?await box(areaButton):null});
 // The whole-result counts (U05, which replaced PR #13's loaded-list counts) and an area result shown together.
 await areaButton.tap();
 await coverage.getByText('이 지역').first().waitFor({timeout:10000}).catch(()=>{});
 const both=await text();
 check('범위 검색 결과가 지도 표시 줄에 보이고 가로 넘침 없음',both.includes('이 지역')&&await overflow()<=0,{text:both});
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
 await markerToEdge(page);
 const stops=await tabStops(page);
 check('데스크톱에서 확대하면 지도 안에 다 보이는 지점만 Tab 정지(가장자리에 걸친 지점 포함)',stops.wrong===0&&stops.inside>0&&stops.outside>0,stops);
 // A narrower window resizes the map without the user moving it. Start again from the
 // stays at the centre (the edge search above leaves a marker at the map's edge, which a
 // narrower map would push out of view).
 await page.goto(base+'/',{waitUntil:'networkidle'});await canvas.waitFor();await page.waitForTimeout(500);
 await page.mouse.move(1279,795);
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'지도 확대'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(500)}
 const wideMap=(await box(canvas)).width;
 await page.setViewportSize({width:1100,height:640});await page.waitForTimeout(800);
 const narrowMap=(await box(canvas)).width,afterResize=await tabStops(page);
 // U05 redraws the stays in view after the resize; then pan toward an edge marker as above
 // (80px key steps can step over the ~30px band where a drawn marker sticks out).
 const edge=await markerToEdge(page),resized=await tabStops(page);
 check('창 크기가 바뀌어 지도가 줄어든 뒤에도 지도 안에 다 보이는 지점만 Tab 정지',narrowMap<wideMap&&afterResize.wrong===0&&afterResize.inside+afterResize.outside>0&&resized.wrong===0,{afterResize,edge,...resized,wideMap,narrowMap});
 await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(800);
 const single=await tabToSingle(page);
 const trip=single?await previewRoundTrip(page,single,'Enter'):null;
 check('데스크톱에서 Enter로 지점의 미리보기를 열면 포커스가 미리보기로 가고 닫으면 지점으로 돌아옴',!!trip?.pass,{trip});
 // The opener may leave the map while its preview is open: closing must not focus it unseen.
 let away=null;
 if(single){
  const again=await tabToMarker(page,m=>m.ids?.[0]===single.ids[0]);
  if(again){await page.keyboard.press('Enter');await page.locator('.map-preview').waitFor({timeout:8000}).catch(()=>{})}
  // Pan until that stay is off the map (U05 draws whole-result markers, so how far depends on the view).
  await canvas.focus();
  for(let i=0;i<20;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(250);if(await page.evaluate(id=>{const c=document.querySelector('.map-canvas').getBoundingClientRect(),m=[...document.querySelectorAll('.leaflet-marker-icon')].find(e=>e.dataset.stayIds?.split(' ').includes(id));if(!m)return true;const r=m.getBoundingClientRect();return r.right<c.left||r.left>c.right},single.ids[0]))break}
  await page.waitForTimeout(800);
  const gone=await page.evaluate(id=>{const c=document.querySelector('.map-canvas').getBoundingClientRect(),m=[...document.querySelectorAll('.leaflet-marker-icon')].find(e=>e.dataset.stayIds?.split(' ').includes(id));if(!m)return null;const r=m.getBoundingClientRect();return !(r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom)},single.ids[0]);
  await page.getByRole('button',{name:'지도 숙소 선택 해제'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);
  away={again:!!again,gone,preview:await page.locator('.map-preview').count(),focus:await focusedMarker(page),onMap:await page.evaluate(()=>document.activeElement===document.querySelector('.map-canvas'))};
 }
 // U05 draws only the stays in view: a stay moved out of the map has no marker at all (gone null).
 check('미리보기를 연 지점이 지도 밖으로 나간 뒤 닫으면 포커스는 그 지점이 아니라 지도로 감',!!away&&away.again&&away.gone!==false&&away.preview===0&&(away.onMap||(!!away.focus.ids&&away.focus.inside)),{away});
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
