// U07 in real Chromium (360·390px touch, 1280px mouse), docs/U07-20261019.md:
// - the filter's bath buttons keep every letter in place when pressed: the label's text box, the
//   count's line and the button's height are the same before and after, the check mark has its
//   own place from the start, and no button cuts its text, even with a 5-digit count;
// - every filter option has a help, read with it (aria-describedby); a mouse sees it as a tooltip
//   past the panel's right edge (covering no other option) on hover and on keyboard focus, and
//   Escape hides it; a touch screen has a 44px ‘?’ in the option that opens the same text under
//   the option, inside the screen, and a press elsewhere closes it; a tap on an option opens no
//   tooltip;
// - names: Korean, else English, else the original name (lib/hotel-names.ts displayNames, user
//   decision 2026-10-17), the original beside it; the detail shows Korean, English, original in
//   that order; each English or original name has a 44px copy button that puts the name on the
//   clipboard and says ‘복사됨’, and selects the name where the clipboard cannot be written.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u07-browser.mjs [base] [evidence.json] [screenshot folder]
import {createRequire} from 'node:module';
import {writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {siteSearch} from './site-search-node.mjs';
import {compileLib} from './build-search-snapshot.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base);
// The expected names: the rule itself, compiled from lib/hotel-names.ts for Node.
const temp=mkdtempSync(join(tmpdir(),'yukemuri-u07-'));
let displayNames;
try{({displayNames}=createRequire(import.meta.url)(compileLib(temp,'lib/hotel-names.ts')))}finally{rmSync(temp,{recursive:true,force:true})}
const QUICK=['내 기준','천연온천','노천탕','전세탕','객실 온천','카케나가시','니고리유'];
// A stay with Korean, English and original names, for the detail's order.
const first=search.list('').hotels,full=first.find(h=>{const n=displayNames(h.names);return n.titleLang==='ko'&&n.en&&n.ja});
const browser=await chromium.launch();
for(const [w,mobile] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR',permissions:['clipboard-read','clipboard-write']});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=l=>mobile?l.tap():l.click();
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(500);
 const shot=async(locator,name)=>{if(shots)await locator.screenshot({path:join(shots,`${name}-${w}.png`)})};

 // Names on the cards of the first page.
 const cards=await page.locator('.hotel-list .hotel-card').evaluateAll(list=>list.map(card=>{
  const box=e=>{const r=e.getBoundingClientRect();return{w:Math.round(r.width),h:Math.round(r.height)}};
  const rows=[...card.querySelectorAll('.card-name')].map(row=>({text:(row.querySelector('h3,.name-ja')?.textContent??'').trim(),copy:row.querySelector('.copy-name')?{label:row.querySelector('.copy-name').getAttribute('aria-label'),...box(row.querySelector('.copy-name'))}:null}));
  return{id:card.id.replace(/^card-/,''),title:card.querySelector('.card-title h3')?.textContent.trim(),ja:card.querySelector('.name-ja')?.textContent.trim()??null,rows};
 }));
 const wrongNames=[];
 for(const [i,card] of cards.entries()){
  const h=first[i],n=displayNames(h.names),copies=card.rows.filter(r=>r.copy);
  const want=[n.titleLang!=='ko'&&{text:n.title,label:(n.titleLang==='en'?'영어':'원어')+' 이름 복사'},n.ja&&{text:n.ja,label:'원어 이름 복사'}].filter(Boolean);
  const ok=card.id===h.id&&card.title===n.title&&card.ja===n.ja&&copies.length===want.length&&want.every((x,j)=>copies[j].text===x.text&&copies[j].copy.label===x.label&&copies[j].copy.w>=44&&copies[j].copy.h>=44);
  if(!ok)wrongNames.push({card,names:h.names,want});
 }
 const kinds=first.reduce((m,h)=>(m[displayNames(h.names).titleLang]++,m),{ko:0,en:0,ja:0});
 check(`카드 ${cards.length}곳: 이름이 한국어 → 영어 → 원어 순으로 정해지고 원어가 다르면 둘째 줄, 영어·원어 이름마다 44px 복사 단추(제목 ${JSON.stringify(kinds)})`,cards.length===first.length&&cards.length>0&&wrongNames.length===0,{cards:cards.length,kinds,wrong:wrongNames.slice(0,3)});

 // Copying: the clipboard gets the name and the button says so.
 const card=page.locator('.hotel-list .hotel-card').first(),copy=card.locator('.card-name .copy-name').last(),name=(await card.locator('.card-name').last().locator('h3,.name-ja').textContent()).trim();
 await press(copy);await page.waitForTimeout(250);
 const copied={clip:await page.evaluate(()=>navigator.clipboard.readText()),status:(await copy.locator('[role=status]').textContent()).trim(),shown:await copy.locator('[role=status]').evaluate(e=>getComputedStyle(e).opacity==='1')};
 await shot(card,'card-copied');
 check(`첫 카드의 원어 이름 복사 단추를 누르면 클립보드에 ‘${name}’이 들어가고 ‘복사됨’이 보임`,copied.clip===name&&copied.status==='복사됨'&&copied.shown,{name,...copied});

 // The detail: Korean, English, original, each English or original name with a copy button.
 await page.goto(base+'/?'+new URLSearchParams({q:full.names.ko}),{waitUntil:'networkidle'});await page.waitForTimeout(500);
 await press(page.locator(`#card-${full.id} .card-title`));await page.waitForTimeout(1200);
 const detail=await page.evaluate(()=>{const d=document.querySelector('.detail-name');if(!d)return null;
  return{rows:[...d.querySelectorAll('.name-row')].map(r=>({text:(r.querySelector('h2,p')?.textContent??'').trim(),lang:r.querySelector('h2,p')?.getAttribute('lang')??null,copy:r.querySelector('.copy-name')?.getAttribute('aria-label')??null,copyBox:(b=>b&&{w:Math.round(b.width),h:Math.round(b.height)})(r.querySelector('.copy-name')?.getBoundingClientRect())})),other:document.querySelector('.other-names')?.textContent??''}});
 const n=displayNames(full.names);
 const order=detail&&detail.rows.length===3&&detail.rows[0].text===n.title&&!detail.rows[0].copy&&detail.rows[1].text===n.en&&detail.rows[1].copy==='영어 이름 복사'&&detail.rows[1].lang==='en'&&detail.rows[2].text===n.ja&&detail.rows[2].copy==='원어 이름 복사'&&detail.rows.slice(1).every(r=>r.copyBox.w>=44&&r.copyBox.h>=44);
 await shot(page.locator('.detail-summary'),'detail-names');
 check(`상세 ‘${n.title}’: 이름이 한국어 → 영어 → 원어 순서이고 영어·원어 옆에 44px 복사 단추, ‘다른 이름’에 같은 이름을 다시 쓰지 않음`,order&&!detail.other.includes(n.en)&&!detail.other.includes(n.ja),{detail,want:n});
 if(!mobile){
  // The keyboard reaches the detail's copy button and Enter copies.
  const button=page.locator('.detail-name .copy-name').last();await button.focus();await page.keyboard.press('Enter');await page.waitForTimeout(250);
  const clip=await page.evaluate(()=>navigator.clipboard.readText());
  check('상세의 원어 이름 복사 단추는 키보드 초점과 Enter로도 복사됨',clip===n.ja&&await button.evaluate(b=>b===document.activeElement),{clip});
 }
 await page.keyboard.press('Escape');await page.waitForTimeout(400);

 // The filter: the panel on a wide screen, the bottom sheet on a phone.
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(400);
 if(mobile){await press(page.locator('.chip-bar .mobile-filter'));await page.waitForTimeout(800)}
 const panel=page.locator(mobile?'.filter-drawer':'.desktop-filters');
 // Each quick button: its label's own text box (a Range, so a mark drawn before it counts),
 // the count's line, the button's size and whether it cuts anything; then the same with a
 // 5-digit count, the most the whole country gives.
 const measure=()=>panel.evaluate(p=>[...p.querySelectorAll('.filter-quick .filter-chip')].map(b=>{
  const label=[...b.querySelectorAll('span')].find(s=>s.textContent.trim()&&!s.querySelector('span')),range=document.createRange();range.selectNodeContents(label);
  const t=range.getBoundingClientRect(),c=b.querySelector('small').getBoundingClientRect(),r=b.getBoundingClientRect();
  const slot=b.querySelector('.filter-check')?.getBoundingClientRect();
  return{name:label.textContent.trim(),on:b.getAttribute('aria-pressed')==='true',x:+(t.left-r.left).toFixed(1),y:+(t.top-r.top).toFixed(1),lines:Math.round(t.height),count:+(c.top-r.top).toFixed(1),w:Math.round(r.width),h:Math.round(r.height),cut:b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1||t.right>r.right-1||c.right>r.right-1,slot:slot?Math.round(slot.width):0};
 }));
 const before=await measure();
 await shot(panel,'filter-before');
 const quick=panel.locator('.filter-quick .filter-chip');
 for(let i=0;i<await quick.count();i++){await press(quick.nth(i));await page.waitForTimeout(150)}
 await page.waitForTimeout(300);
 const after=await measure();
 await shot(panel,'filter-pressed');
 const moved=before.map((b,i)=>({b,a:after[i]})).filter(({b,a})=>!a||a.x!==b.x||a.y!==b.y||a.lines!==b.lines||a.count!==b.count||a.h!==b.h||a.w!==b.w);
 check(`빠른 조건 ${before.length}개(${QUICK.join('·')})를 누르기 전후에 이름 글자 위치·줄 수·숫자 줄·버튼 크기가 같고, 체크 표시 자리(${before[1]?.slot}px)가 처음부터 있음`,JSON.stringify(before.map(b=>b.name))===JSON.stringify(QUICK)&&before.every(b=>!b.on&&b.slot>=12)&&after.every(a=>a.on)&&moved.length===0,{moved,before,after});
 const big=async()=>{await panel.evaluate(p=>p.querySelectorAll('.filter-quick .filter-chip:not(.is-verified) small').forEach(s=>{s.textContent='12,345'}));return measure()};
 const bigOn=await big();
 for(let i=0;i<await quick.count();i++){await press(quick.nth(i));await page.waitForTimeout(150)}
 await page.waitForTimeout(300);
 const bigOff=await big();
 const cut=[...before,...after,...bigOn,...bigOff].filter(b=>b.cut);
 check('어느 버튼도 글자를 자르지 않음(누르기 전후, 숫자가 다섯 자리여도)',cut.length===0,{cut});

 // Every option has its help, read with it.
 const toggleAll=async state=>{const closed=panel.locator(`.filter-group-toggle[aria-expanded=${state}]`);for(let n=await closed.count();n>0;n--){await press(closed.first());await page.waitForTimeout(150)}};
 await toggleAll(false);await page.waitForTimeout(300);
 const helps=await panel.evaluate(p=>[...p.querySelectorAll('.filter-chip,[role=switch]')].map(b=>{const id=b.getAttribute('aria-describedby'),d=id&&document.getElementById(id);return{name:(b.querySelector('span:not(:empty)')??b).textContent.trim(),text:d?.textContent.trim()??''}}));
 check(`필터 옵션 ${helps.length}개마다 도움말이 있고 옵션과 함께 읽힘(aria-describedby), 문구가 서로 다름`,helps.length>=15&&helps.every(h=>h.text.length>=10)&&new Set(helps.map(h=>h.text)).size===helps.length&&/대욕탕만 확인된 숙소/.test(helps.find(h=>h.name==='천연온천')?.text??''),{helps});
 if(mobile){
  await toggleAll(true);
  await page.waitForTimeout(300);
  // A touch screen: a 44px ‘?’ in each option; it opens the help under the option.
  const buttons=await panel.locator('.filter-quick .option-help').evaluateAll(list=>list.map(b=>{const r=b.getBoundingClientRect();return{visible:b.checkVisibility(),w:Math.round(r.width),h:Math.round(r.height),label:b.getAttribute('aria-label')}}));
  const help=panel.locator('.filter-quick .option-help',{hasText:'?'}).nth(5);
  await press(help);await page.waitForTimeout(300);
  const open=await help.evaluate(b=>{const t=document.getElementById(b.getAttribute('aria-controls')),r=t.getBoundingClientRect(),own=b.closest('.filter-option').getBoundingClientRect(),list=b.closest('.filter-quick').getBoundingClientRect();return{expanded:b.getAttribute('aria-expanded'),text:t.checkVisibility()?t.textContent:'',top:Math.round(r.top-own.bottom),left:Math.round(r.left-list.left),right:Math.round(list.right-r.right),inScreen:r.left>=0&&r.right<=innerWidth}});
  await shot(panel,'filter-help');
  await press(page.locator('.filter-drawer .mobile-sheet-title h2,.filter-drawer [data-slot=drawer-title]').first());await page.waitForTimeout(300);
  const closed=await help.getAttribute('aria-expanded');
  await press(quick.nth(2));await page.waitForTimeout(600);
  const tooltips=await page.locator('[data-slot=tooltip-content]').count();
  check('휴대폰: 옵션마다 44px ‘?’가 있고, 누르면 그 옵션 바로 아래에 목록 폭으로 도움말이 화면 안에 열리며, 다른 곳을 누르면 닫힘. 옵션을 눌러도 툴팁은 뜨지 않음',buttons.length===7&&buttons.every(b=>b.visible&&b.w>=44&&b.h>=44&&/도움말$/.test(b.label))&&open.expanded==='true'&&/원천을 흘려보내는/.test(open.text)&&open.top>=0&&open.top<=8&&open.left===0&&open.right===0&&open.inScreen&&closed==='false'&&tooltips===0,{buttons,open,closed,tooltips});
 }else{
  await toggleAll(true);
  await page.waitForTimeout(300);
  // A mouse: no ‘?’ in the options; hovering shows the tooltip past the panel's right edge.
  const visibleHelp=await panel.locator('.option-help').evaluateAll(list=>list.filter(b=>b.checkVisibility()).length);
  await page.mouse.move(5,5);await page.waitForTimeout(200);
  const chip=quick.nth(5);await chip.hover();await page.waitForTimeout(800);
  const tip=()=>page.evaluate(()=>{const t=[...document.querySelectorAll('[data-slot=tooltip-content]')].find(e=>e.checkVisibility());if(!t)return null;const r=t.getBoundingClientRect(),p=document.querySelector('.desktop-filters').getBoundingClientRect();return{text:t.textContent,left:Math.round(r.left),panelRight:Math.round(p.right),right:Math.round(r.right),vw:innerWidth}});
  const hovered=await tip();
  await shot(page.locator('.workspace'),'filter-hover');
  await page.mouse.move(5,5);await page.waitForTimeout(500);
  const gone=await tip();
  check('마우스: 옵션에 ‘?’ 단추 없이, 올리면 도움말 툴팁이 패널 오른쪽 바깥(다른 옵션을 가리지 않음)에 화면 안으로 뜨고, 벗어나면 사라짐',visibleHelp===0&&hovered&&/원천을 흘려보내는/.test(hovered.text)&&hovered.left>=hovered.panelRight&&hovered.right<=hovered.vw&&!gone,{visibleHelp,hovered,gone});
  // A keyboard: focus shows it, Escape hides it and the focus stays.
  await quick.nth(4).focus();await page.keyboard.press('Tab');await page.waitForTimeout(600);
  const focused=await tip(),onChip=await quick.nth(5).evaluate(b=>b===document.activeElement);
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  const escaped=await tip(),still=await quick.nth(5).evaluate(b=>b===document.activeElement);
  check('키보드: Tab으로 옵션에 가면 같은 툴팁이 뜨고, Escape로 닫히며 초점은 옵션에 남음',onChip&&focused&&/원천을 흘려보내는/.test(focused.text)&&!escaped&&still,{onChip,focused,escaped,still});
 }
 check('가로 넘침 없음',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
// Where the clipboard cannot be written, the copy button selects the name instead.
width=390;
{
 const context=await browser.newContext({viewport:{width:390,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 await context.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'clipboard',{get:()=>undefined,configurable:true})});
 const page=await context.newPage();
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(500);
 const card=page.locator('.hotel-list .hotel-card').first(),copy=card.locator('.card-name .copy-name').last(),name=(await card.locator('.card-name').last().locator('h3,.name-ja').textContent()).trim();
 await copy.tap();await page.waitForTimeout(250);
 const result={selected:await page.evaluate(()=>getSelection().toString()),status:(await copy.locator('[role=status]').textContent()).trim(),clipboard:await page.evaluate(()=>typeof navigator.clipboard)};
 check(`클립보드를 쓸 수 없는 브라우저: 복사 단추가 이름 ‘${name}’을 선택해 두고 ‘이름을 선택했어요’라고 알림`,result.clipboard==='undefined'&&result.selected.trim()===name&&result.status==='이름을 선택했어요',result);
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
