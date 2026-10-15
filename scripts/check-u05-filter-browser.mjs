// U05 filter (PR 4) in real Chromium (360·390px touch, 1280·1440px mouse), docs/U05-20261013.md 8.3:
// - on a phone the filters come up from the bottom (vaul): anchored to the bottom of the screen,
//   a dialog named ‘숙소 필터’ that takes focus and keeps Tab inside, closed by its button,
//   by Escape and by dragging it down, focus back on the ‘필터’ chip;
// - (U05 filter C, the user's choice 2026-10-15) ‘내 기준’ and the six bath conditions first, as
//   2-column pressed buttons of 44px or more in the cards' order; the other conditions are switch
//   rows in groups that start closed and count what is on; an explanation is behind its ‘?’;
// - a button, the chip bar and the count agree: pressing ‘노천탕’ presses its chip and the
//   sheet's button reads the snapshot's own count for that condition (no list request to the
//   Worker); a chip pressed outside shows as switched on inside; ‘초기화’ clears both; the
//   rating pickers open inside the sheet and apply;
// - on a wide screen the left panel is the same, the chip bar is gone and the panel fits
//   1280x800 and 1440x900 without scrolling inside; the static first page names the chosen place;
// - at 945, 960, 1280 and 1440px the page is no wider than the screen, the list and the map keep their
//   minimums beside each other, and ‘목록만’ and ‘지도 크게’ keep two columns.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-filter-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base);
const total=params=>search.list(params).total;
const workerList=url=>/^\/api\/hotels(?:\/(?:map|suggestions|search-index))?$/.test(url.pathname)||url.searchParams.has('_rsc');
// U05 filter C (the user's choice, 2026-10-15): ‘내 기준’ and the six bath conditions first, in the
// cards' order, then the remaining conditions in groups that start closed.
const QUICK=['내 기준','천연온천','노천탕','전세탕','객실 온천','카케나가시','니고리유'];
const GROUPS=['공용·전세 목욕 시설 세부','객실 목욕 시설 세부','숙소 유형·등급','평점과 리뷰'];
// The workspace's columns in each view (‘목록 + 지도’, ‘목록만’, ‘지도 크게’): no page wider than the
// screen, the list and the map at their minimums beside each other, and two columns in the other
// views with the shown part reaching the right edge and the panel as wide as beside the list.
const layout=page=>page.evaluate(()=>{const w=document.querySelector('.workspace'),s=getComputedStyle(w),r=e=>e?.checkVisibility()?e.getBoundingClientRect():null,list=r(document.querySelector('.results-section')),map=r(document.querySelector('.map-column'));
 return{columns:s.gridTemplateColumns.split(' ').map(v=>Math.round(parseFloat(v))),panel:Math.round(document.querySelector('.desktop-filters').getBoundingClientRect().width),right:Math.round((list&&map?Math.max(list.right,map.right):(list??map)?.right)??0),inner:Math.round(w.getBoundingClientRect().right-parseFloat(s.paddingRight)),overflow:document.documentElement.scrollWidth-innerWidth,chipsCut:[...document.querySelectorAll('.desktop-filters .filter-chip')].filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().height<44).map(e=>e.textContent)}});
async function views(page){
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(300);
 const split=await layout(page);
 check('‘목록 + 지도’는 세 열(목록 370px·지도 310px 이상)이고 작업 영역 안(화면보다 넓지 않음)에 들어가며, 패널 버튼이 잘리지 않음',split.columns.length===3&&split.columns[1]>=370&&split.columns[2]>=310&&split.right<=split.inner+1&&split.overflow<=0&&split.chipsCut.length===0,split);
 for(const [view,label] of [['list','목록만'],['map','지도 크게']]){
  await page.goto(base+'/?view='+view,{waitUntil:'networkidle'});await page.waitForTimeout(300);
  const one=await layout(page);
  check(`‘${label}’은 두 열(패널과 ${view==='list'?'목록':'지도'})이고 오른쪽 끝까지 차며, 패널 폭이 ‘목록 + 지도’ 때와 같음(${split.panel}px 이상)`,one.columns.length===2&&Math.abs(one.right-one.inner)<=1&&one.panel>=split.panel&&one.overflow<=0,one);
 }
}
const browser=await chromium.launch();
// A narrow desktop: the panel gives way before the list or the map does (Codex, PR #113).
for(const w of [945,960]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:800},deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 await views(page);
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
for(const w of [360,390,1280,1440]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile||w===1280?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[],lists=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,200)));page.on('request',r=>{if(workerList(new URL(r.url())))lists.push(r.url())});
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(400);
 const panel=mobile?'.filter-drawer':'.desktop-filters';
 // The quick buttons, the groups, the visible switches of the panel, and the chip bar's state.
 const read=()=>page.evaluate(sel=>{const p=document.querySelector(sel);if(!p)return null;
  const box=e=>{const r=e.getBoundingClientRect();return{left:Math.round(r.left),top:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}};
  const quick=[...p.querySelectorAll('.filter-quick .filter-chip')].map(b=>({name:b.querySelector('span').textContent.trim(),on:b.getAttribute('aria-pressed')==='true',...box(b)}));
  const groups=[...p.querySelectorAll('.filter-group')].map(g=>{const t=g.querySelector('.filter-group-toggle'),items=g.querySelector('.filter-group-items');return{name:[...t.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),expanded:t.getAttribute('aria-expanded'),controls:t.getAttribute('aria-controls')===items.id,hidden:items.hidden,count:g.querySelector('.filter-group-count')?.textContent??'',h:Math.round(t.getBoundingClientRect().height)}});
  const switches=[...p.querySelectorAll('[role=switch]')].filter(e=>e.checkVisibility()).map(e=>({name:e.querySelector('.filter-toggle-label')?.textContent.trim(),on:e.getAttribute('aria-checked')==='true',h:Math.round(e.getBoundingClientRect().height)}));
  const allOn=[...p.querySelectorAll('[role=switch][aria-checked=true],.filter-chip[aria-pressed=true]')].length;
  const helps=[...p.querySelectorAll('.filter-help')].map(b=>({expanded:b.getAttribute('aria-expanded'),hidden:document.getElementById(b.getAttribute('aria-controls'))?.hidden}));
  const chips=Object.fromEntries([...document.querySelectorAll('.chip-bar button[aria-pressed]')].map(b=>[b.textContent.trim(),b.getAttribute('aria-pressed')==='true']));
  const bar=document.querySelector('.chip-bar');
  return{quick,groups,switches,allOn,helps,chips,bar:!!bar&&bar.checkVisibility(),fit:{scroll:p.scrollHeight,client:p.clientHeight},apply:document.querySelector('.filter-drawer .apply-filters')?.textContent.trim()??null,heading:Number(document.querySelector('.results-header h2 span')?.textContent.replace(/[^0-9]/g,''))}},panel);
 const sw=name=>page.locator(`${panel} [role=switch]`,{has:page.locator('.filter-toggle-label',{hasText:new RegExp('^'+name)})}).first();
 const quickChip=name=>page.locator(`${panel} .filter-quick .filter-chip`,{has:page.locator('span',{hasText:new RegExp('^'+name+'$')})}).first();
 const groupToggle=name=>page.locator(`${panel} .filter-group-toggle`,{hasText:name}).first();
 const press=l=>mobile?l.tap():l.click();
 // Opens a group only if it is closed, so a page that opens them all fails the checks, not the run.
 const openGroup=async name=>{const t=groupToggle(name);if(await t.getAttribute('aria-expanded')!=='true')await press(t);await page.waitForTimeout(300)};
 if(mobile){
  const opener=page.locator('.chip-bar .mobile-filter');
  await press(opener);await page.waitForTimeout(800);
  const sheet=await page.evaluate(()=>{const c=document.querySelector('.filter-drawer'),r=c?.getBoundingClientRect(),d=c?.closest('[role=dialog]')??(c?.getAttribute('role')==='dialog'?c:null);return c&&{bottom:Math.round(r.bottom),top:Math.round(r.top),vh:innerHeight,width:Math.round(r.width),vw:innerWidth,dialog:!!d,name:d?.getAttribute('aria-labelledby')?document.getElementById(d.getAttribute('aria-labelledby'))?.textContent:null,focusInside:!!c.contains(document.activeElement)}});
  check('필터는 아래에서 올라오는 시트(화면 아래에 붙고 폭 전체, 화면의 90% 이하)이고 ‘숙소 필터’ 대화상자로 열리며 초점이 안으로 감',!!sheet&&Math.abs(sheet.bottom-sheet.vh)<=1&&sheet.width===sheet.vw&&sheet.top>=sheet.vh*0.1&&sheet.dialog&&sheet.name==='숙소 필터'&&sheet.focusInside,sheet);
 }
 const start=await read();
 const pairs=[[1,2],[3,4],[5,6]].every(([a,b])=>start.quick[a]?.top===start.quick[b]?.top&&start.quick[a].left<start.quick[b].left);
 check(`먼저 ‘내 기준’과 탕 조건 6개(카드와 같은 순서)가 2열 버튼(44px 이상, 눌림 상태)이고, 나머지는 묶음 ${GROUPS.length}개(${GROUPS.join('·')})에 닫힌 채 있음`,JSON.stringify(start.quick.map(q=>q.name))===JSON.stringify(QUICK)&&start.quick.every(q=>q.h>=44&&!q.on)&&pairs&&JSON.stringify(start.groups.map(g=>g.name))===JSON.stringify(GROUPS)&&start.groups.every(g=>g.expanded==='false'&&g.hidden&&g.controls&&g.h>=44)&&start.switches.length===0,{quick:start.quick,groups:start.groups,visibleSwitches:start.switches.length});
 // The bath conditions' explanation is behind the first ‘?’.
 const help=page.locator(`${panel} .filter-help`).first();
 const hiddenBefore=start.helps[0];
 await press(help);await page.waitForTimeout(200);
 const shown=await help.evaluate(b=>({expanded:b.getAttribute('aria-expanded'),text:document.getElementById(b.getAttribute('aria-controls'))?.hidden?'':document.getElementById(b.getAttribute('aria-controls'))?.textContent}));
 const helpBox=await help.boundingBox();
 check('탕 조건 설명은 ‘?’(44px) 안에 있고, 누르면 펼쳐짐',hiddenBefore?.hidden===true&&hiddenBefore.expanded==='false'&&shown.expanded==='true'&&/대욕탕만 확인된 숙소/.test(shown.text)&&helpBox.width>=44&&helpBox.height>=44,{hiddenBefore,shown,helpBox});
 await press(help);await page.waitForTimeout(200);
 // A quick button, the chip bar and the count agree.
 const before=lists.length,want=total('features=outdoor');
 await press(quickChip('노천탕'));await page.waitForTimeout(500);
 const on=await read();
 check(`‘노천탕’ 버튼: 눌림${mobile?', 칩 막대의 ‘노천탕’도 눌림':''}, 결과 ${want}곳 = 스냅숏 값${mobile?'(시트 버튼)':'(목록 머리)'}, Worker 목록 요청 없음`,on.quick.find(q=>q.name==='노천탕')?.on&&(!mobile||on.chips['노천탕']===true)&&(mobile?on.apply===`${want.toLocaleString()}곳 보기`:on.heading===want)&&new URL(page.url()).searchParams.get('features')==='outdoor'&&lists.length===before,{quick:on.quick.find(q=>q.name==='노천탕'),chip:on.chips['노천탕'],apply:on.apply,heading:on.heading,want,requests:lists.slice(before)});
 // A group opens with its switches; a switch inside it counts on the group's heading.
 await openGroup('공용·전세 목욕 시설 세부');
 const opened=await read(),sub=['대욕장','공용 대욕장 노천탕','전세·가족 노천탕'];
 await press(sw('공용 대욕장 노천탕'));await page.waitForTimeout(500);
 const counted=await read(),wantBoth=total('features=outdoor,communalOutdoor');
 check(`묶음 ‘공용·전세 목욕 시설 세부’를 열면 토글 3개(44px 이상)가 보이고, ‘공용 대욕장 노천탕’을 켜면 묶음 머리에 ‘1개 켜짐’, 결과 ${wantBoth}곳`,opened.groups[0].expanded==='true'&&!opened.groups[0].hidden&&JSON.stringify(opened.switches.map(s=>s.name))===JSON.stringify(sub)&&opened.switches.every(s=>s.h>=44)&&counted.groups[0].count==='1개 켜짐'&&(mobile?counted.apply===`${wantBoth.toLocaleString()}곳 보기`:counted.heading===wantBoth),{opened:opened.groups[0],switches:opened.switches,count:counted.groups[0].count,apply:counted.apply,heading:counted.heading,wantBoth});
 await press(sw('공용 대욕장 노천탕'));await page.waitForTimeout(300);
 if(mobile){
  // Keyboard: Tab stays inside the sheet.
  let escaped=-1;
  for(let i=0;i<40;i++){await page.keyboard.press('Tab');if(!await page.evaluate(()=>!!document.activeElement?.closest('.filter-drawer'))){escaped=i;break}}
  check('Tab 초점이 시트 안에서만 돎(40번)',escaped===-1,{escaped});
  // Its button closes it and focus goes back to the ‘필터’ chip.
  await press(page.locator('.filter-drawer .apply-filters'));await page.waitForTimeout(700);
  const closed=await page.evaluate(()=>({open:!!document.querySelector('.filter-drawer'),focus:document.activeElement?.classList.contains('mobile-filter')}));
  check('‘N곳 보기’로 닫히고 초점은 ‘필터’ 칩으로 돌아옴',!closed.open&&closed.focus,closed);
  // A chip pressed outside shows inside; Escape closes.
  await press(page.locator('.chip-bar button',{hasText:/^천연온천$/}));await page.waitForTimeout(400);
  await press(page.locator('.chip-bar .mobile-filter'));await page.waitForTimeout(800);
  const synced=await read();
  await page.keyboard.press('Escape');await page.waitForTimeout(700);
  const esc=await page.evaluate(()=>({open:!!document.querySelector('.filter-drawer'),focus:document.activeElement?.classList.contains('mobile-filter')}));
  check('칩에서 켠 ‘천연온천’이 시트 안에서도 눌려 있고, Escape로 닫히면 초점은 ‘필터’ 칩으로',synced.quick.find(q=>q.name==='천연온천')?.on&&synced.chips['천연온천']===true&&!esc.open&&esc.focus,{natural:synced.quick.find(q=>q.name==='천연온천'),esc});
  // Dragging it down closes it.
  await press(page.locator('.chip-bar .mobile-filter'));await page.waitForTimeout(800);
  const head=await page.locator('.filter-drawer .mobile-sheet-title').boundingBox();
  const cdp=await context.newCDPSession(page),x=Math.round(head.x+head.width/2),y0=Math.round(head.y+10);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y0}]});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y0+i*40}]});await page.waitForTimeout(16)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(900);
  const dragged=await page.evaluate(()=>!!document.querySelector('.filter-drawer'));
  check('시트를 아래로 끌어내리면 닫힘',!dragged,{open:dragged});
  // ‘초기화’ clears the buttons, the switches and the chips.
  await press(page.locator('.chip-bar .mobile-filter'));await page.waitForTimeout(800);
  await press(page.locator('.filter-drawer .filter-reset'));await page.waitForTimeout(400);
  const reset=await read();
  check('‘초기화’로 버튼·토글·칩이 모두 꺼지고 결과는 전체',reset.allOn===0&&Object.values(reset.chips).every(v=>!v)&&reset.apply===`${total('').toLocaleString()}곳 보기`,{allOn:reset.allOn,chips:reset.chips,apply:reset.apply});
  // The rating pickers (Radix Select) sit in the closed ‘평점과 리뷰’ group; opened, they apply.
  await openGroup('평점과 리뷰');
  const picker=page.locator('.filter-drawer').getByRole('combobox',{name:'최소 리뷰 수'});
  await picker.scrollIntoViewIfNeeded();await press(picker);await page.waitForTimeout(400);
  await press(page.getByRole('option',{name:'50개 이상'}));await page.waitForTimeout(500);
  const reviews=await read(),want50=total('reviews=50');
  check(`‘평점과 리뷰’를 열면 ‘최소 리뷰 수’ 선택 상자가 시트 안에서 열리고 ‘50개 이상’이 적용됨(${want50}곳 = 스냅숏 값), 시트는 열린 채, 묶음 머리에 ‘1개 켜짐’`,new URL(page.url()).searchParams.get('reviews')==='50'&&reviews.apply===`${want50.toLocaleString()}곳 보기`&&await page.locator('.filter-drawer').count()===1&&reviews.groups.find(g=>g.name==='평점과 리뷰')?.count==='1개 켜짐',{url:page.url(),apply:reviews.apply,want50,group:reviews.groups.find(g=>g.name==='평점과 리뷰')});
 }else{
  // The wide screen: no chip bar repeating the conditions; the panel fits without scrolling inside.
  check(`넓은 화면에는 칩 막대가 없고(조건이 패널에만 한 번), 패널이 안쪽 스크롤 없이 들어감(${w}×${w===1280?800:900})`,!start.bar&&start.fit.scroll<=start.fit.client+1,{bar:start.bar,fit:start.fit});
  // The static first page names the chosen place before the page runs (Radix fills it only later).
  if(w===1280){const html=await (await fetch(base+'/')).text(),place=html.match(/aria-label="검색 지역 · 온천마을"><span data-slot="select-value"[^>]*>([^<]*)</)?.[1]??null;
   check('정적 첫 화면의 장소 선택 상자에 ‘일본 전국’이 있음(페이지가 돌기 전에도)',place==='일본 전국',{place})}
  // ‘초기화’ clears the buttons and the switches.
  await page.locator('.desktop-filters').getByRole('button',{name:'초기화'}).click();await page.waitForTimeout(400);
  const reset=await read();
  check('데스크톱 왼쪽 패널도 같은 버튼·묶음이고 ‘초기화’로 모두 꺼짐',reset.allOn===0&&reset.heading===total(''),{allOn:reset.allOn,heading:reset.heading});
  await views(page);
 }
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
