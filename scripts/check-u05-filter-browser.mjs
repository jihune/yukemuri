// U05 filter (PR 4) in real Chromium (360·390px touch, 1280px mouse), docs/U05-20261013.md 8.3:
// - on a phone the filters come up from the bottom (vaul): anchored to the bottom of the screen,
//   a dialog named ‘숙소 필터’ that takes focus and keeps Tab inside, closed by its button,
//   by Escape and by dragging it down, focus back on the ‘필터’ chip;
// - every condition is one switch row of 44px or more, in groups; a group's explanation is
//   behind its ‘?’ (hidden until pressed);
// - a switch, the chip bar and the count agree: switching ‘노천탕’ on presses its chip and the
//   sheet's button reads the snapshot's own count for that condition (no list request to the
//   Worker); a chip pressed outside shows as switched on inside; ‘초기화’ clears both; the
//   rating pickers open inside the sheet and apply;
// - on a wide screen the left panel is the same switches and groups.
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
const GROUPS=['온천수와 사용 방식','공용·전세 목욕 시설','객실 목욕 시설','숙소 유형·등급','평점과 리뷰'];
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[],lists=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,200)));page.on('request',r=>{if(workerList(new URL(r.url())))lists.push(r.url())});
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(400);
 const panel=mobile?'.filter-drawer':'.desktop-filters';
 // The switches and groups of the panel, and the chip bar's state.
 const read=()=>page.evaluate(sel=>{const p=document.querySelector(sel);if(!p)return null;
  const switches=[...p.querySelectorAll('[role=switch]')].map(e=>{const r=e.getBoundingClientRect();return{name:e.querySelector('.filter-toggle-label')?.textContent.trim(),on:e.getAttribute('aria-checked')==='true',h:Math.round(r.height)}});
  const groups=[...p.querySelectorAll('.filter-group h3')].map(e=>e.textContent.trim());
  const helps=[...p.querySelectorAll('.filter-help')].map(b=>({expanded:b.getAttribute('aria-expanded'),hidden:document.getElementById(b.getAttribute('aria-controls'))?.hidden}));
  const chips=Object.fromEntries([...document.querySelectorAll('.chip-bar button[aria-pressed]')].map(b=>[b.textContent.trim(),b.getAttribute('aria-pressed')==='true']));
  return{switches,groups,helps,chips,apply:document.querySelector('.filter-drawer .apply-filters')?.textContent.trim()??null,heading:Number(document.querySelector('.results-header h2 span')?.textContent.replace(/[^0-9]/g,''))}},panel);
 const sw=name=>page.locator(`${panel} [role=switch]`,{has:page.locator('.filter-toggle-label',{hasText:new RegExp('^'+name)})}).first();
 const press=l=>mobile?l.tap():l.click();
 if(mobile){
  const opener=page.locator('.chip-bar .mobile-filter');
  await press(opener);await page.waitForTimeout(800);
  const sheet=await page.evaluate(()=>{const c=document.querySelector('.filter-drawer'),r=c?.getBoundingClientRect(),d=c?.closest('[role=dialog]')??(c?.getAttribute('role')==='dialog'?c:null);return c&&{bottom:Math.round(r.bottom),top:Math.round(r.top),vh:innerHeight,width:Math.round(r.width),vw:innerWidth,dialog:!!d,name:d?.getAttribute('aria-labelledby')?document.getElementById(d.getAttribute('aria-labelledby'))?.textContent:null,focusInside:!!c.contains(document.activeElement)}});
  check('필터는 아래에서 올라오는 시트(화면 아래에 붙고 폭 전체, 화면의 90% 이하)이고 ‘숙소 필터’ 대화상자로 열리며 초점이 안으로 감',!!sheet&&Math.abs(sheet.bottom-sheet.vh)<=1&&sheet.width===sheet.vw&&sheet.top>=sheet.vh*0.1&&sheet.dialog&&sheet.name==='숙소 필터'&&sheet.focusInside,sheet);
 }
 const start=await read();
 const small=start.switches.filter(s=>s.h<44);
 check(`조건 ${start.switches.length}개가 모두 줄 전체가 토글(44px 이상)이고 묶음 ${start.groups.length}개(${GROUPS.join('·')})에 있음`,start.switches.length===15&&small.length===0&&JSON.stringify(start.groups)===JSON.stringify(GROUPS),{switches:start.switches.length,small,groups:start.groups});
 // A group's explanation is behind its ‘?’.
 const help=page.locator(`${panel} .filter-help`).first();
 const hiddenBefore=start.helps[0];
 await press(help);await page.waitForTimeout(200);
 const shown=await help.evaluate(b=>({expanded:b.getAttribute('aria-expanded'),text:document.getElementById(b.getAttribute('aria-controls'))?.hidden?'':document.getElementById(b.getAttribute('aria-controls'))?.textContent}));
 const helpBox=await help.boundingBox();
 check('묶음 설명은 ‘?’(44px) 안에 있고, 누르면 펼쳐짐',hiddenBefore?.hidden===true&&hiddenBefore.expanded==='false'&&shown.expanded==='true'&&/대욕탕만 확인된 숙소/.test(shown.text)&&helpBox.width>=44&&helpBox.height>=44,{hiddenBefore,shown,helpBox});
 // A switch, the chip bar and the count agree.
 const before=lists.length,want=total('features=outdoor');
 await press(sw('노천탕'));await page.waitForTimeout(500);
 const on=await read();
 const outdoor=on.switches.find(s=>s.name==='노천탕');
 check(`‘노천탕’ 토글: 켜짐, 칩 막대의 ‘노천탕’도 눌림, 결과 ${want}곳 = 스냅숏 값${mobile?'(시트 버튼)':'(목록 머리)'}, Worker 목록 요청 없음`,outdoor?.on&&on.chips['노천탕']===true&&(mobile?on.apply===`${want.toLocaleString()}곳 보기`:on.heading===want)&&new URL(page.url()).searchParams.get('features')==='outdoor'&&lists.length===before,{outdoor,chip:on.chips['노천탕'],apply:on.apply,heading:on.heading,want,requests:lists.slice(before)});
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
  check('칩에서 켠 ‘천연온천’이 시트 안에서도 켜져 있고, Escape로 닫히면 초점은 ‘필터’ 칩으로',synced.switches.find(s=>s.name==='천연온천')?.on&&synced.chips['천연온천']===true&&!esc.open&&esc.focus,{natural:synced.switches.find(s=>s.name==='천연온천'),esc});
  // Dragging it down closes it.
  await press(page.locator('.chip-bar .mobile-filter'));await page.waitForTimeout(800);
  const head=await page.locator('.filter-drawer .mobile-sheet-title').boundingBox();
  const cdp=await context.newCDPSession(page),x=Math.round(head.x+head.width/2),y0=Math.round(head.y+10);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y0}]});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y0+i*40}]});await page.waitForTimeout(16)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(900);
  const dragged=await page.evaluate(()=>!!document.querySelector('.filter-drawer'));
  check('시트를 아래로 끌어내리면 닫힘',!dragged,{open:dragged});
  // ‘초기화’ clears the switches and the chips.
  await press(page.locator('.chip-bar .mobile-filter'));await page.waitForTimeout(800);
  await press(page.locator('.filter-drawer .filter-reset'));await page.waitForTimeout(400);
  const reset=await read();
  check('‘초기화’로 토글과 칩이 모두 꺼지고 결과는 전체',reset.switches.every(s=>!s.on)&&Object.values(reset.chips).every(v=>!v)&&reset.apply===`${total('').toLocaleString()}곳 보기`,{on:reset.switches.filter(s=>s.on),chips:reset.chips,apply:reset.apply});
  // The rating pickers (Radix Select) open inside the sheet and apply.
  const picker=page.locator('.filter-drawer').getByRole('combobox',{name:'최소 리뷰 수'});
  await picker.scrollIntoViewIfNeeded();await press(picker);await page.waitForTimeout(400);
  await press(page.getByRole('option',{name:'50개 이상'}));await page.waitForTimeout(500);
  const reviews=await read(),want50=total('reviews=50');
  check(`시트 안의 ‘최소 리뷰 수’ 선택 상자가 열리고 ‘50개 이상’이 적용됨(${want50}곳 = 스냅숏 값), 시트는 열린 채`,new URL(page.url()).searchParams.get('reviews')==='50'&&reviews.apply===`${want50.toLocaleString()}곳 보기`&&await page.locator('.filter-drawer').count()===1,{url:page.url(),apply:reviews.apply,want50});
 }else{
  // The wide screen: the left panel's ‘초기화’ clears the switches and the chips.
  await page.locator('.desktop-filters .filter-title button').click();await page.waitForTimeout(400);
  const reset=await read();
  check('데스크톱 왼쪽 패널도 같은 토글·묶음이고 ‘초기화’로 토글과 칩이 모두 꺼짐',reset.switches.every(s=>!s.on)&&Object.values(reset.chips).every(v=>!v)&&reset.heading===total(''),{on:reset.switches.filter(s=>s.on),chips:reset.chips,heading:reset.heading});
 }
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
