// U05 list (PR 3) in real Chromium (360·390px touch, 1280px mouse), design B ‘탕 체크리스트’
// (docs/U05-20261013.md 6.2 and 8.2, user decisions 2026-10-13):
// - the first card starts within 300px of the top on a phone (the PR's completion rule);
// - every card shows the six bath columns 천연온천·노천탕·전세탕·객실탕·카케나가시·니고리유 in
//   that order, each in the state computed here from the snapshot the site serves with the
//   rule written out below (any key confirmed = ✓, every base key confirmed absent = –, else ?),
//   drawn by shape as well as colour (filled ✓, struck –, dashed ?) and read out in words;
// - the card names are Korean and Japanese, no English name;
// - a chip on the chip bar and an onsen town from the place picker give the snapshot's own
//   count for those conditions, computed in the browser (no list request to the Worker);
// - the data status summary (coverage, refresh, the screen's footer button) is in the footer, not
//   above the list, and its link above the list opens the data status screen (U06) by keyboard
//   and touch, where the photo credits and the address dictionary's credit are reachable.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-list-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base);
// The onsen town with the most stays in the served snapshot (a town with none would compare 0 with 0).
const towns=JSON.parse(readFileSync(new URL('../data/collection-priorities.json',import.meta.url))).towns;
const town=towns.map(t=>({...t,total:search.list(new URLSearchParams({region:t.prefecture,q:t.query}).toString()).total})).sort((a,b)=>b.total-a.total)[0];
// The rule, written here apart from lib/bath-columns.ts.
const COLUMNS=[
 ['천연온천',['natural'],['natural']],
 ['노천탕',['outdoor','communalOutdoor','privateOutdoor'],['outdoor']],
 ['전세탕',['privateBath','privateOutdoor'],['privateBath']],
 ['객실탕',['roomOnsen','roomIndoorOnsen','roomOutdoorOnsen','roomOutdoor'],['roomOnsen','roomOutdoor']],
 ['카케나가시',['freeFlow'],['freeFlow']],
 ['니고리유',['nigori'],['nigori']],
];
const value=(h,k)=>h.features?.[k]?.value??null;
const expected=h=>COLUMNS.map(([label,keys,base])=>{
 const yes=keys.filter(k=>value(h,k)===true);
 const state=yes.length?'yes':base.every(k=>value(h,k)===false)?'no':'unknown';
 const scope=label==='객실탕'&&yes.length?yes.some(k=>h.features[k].scope==='allRooms')?'전 객실':yes.some(k=>h.features[k].scope==='someRooms')?'일부':'':'';
 return {label,state,scope};
});
const WORD={yes:'있음',no:'없음',unknown:'확인 전'};
const browser=await chromium.launch();
const workerList=url=>/^\/api\/hotels(?:\/(?:map|suggestions|search-index))?$/.test(url.pathname)||url.searchParams.has('_rsc');
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[],lists=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,200)));page.on('request',r=>{if(workerList(new URL(r.url())))lists.push(r.url())});
 const tap=l=>mobile?l.tap():l.click();
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(500);
 const top=await page.locator('.hotel-list .hotel-card').first().evaluate(e=>Math.round(e.getBoundingClientRect().top+scrollY));
 if(mobile)check(`첫 카드가 ${top}px에서 시작(300px 이하)`,top<=300,{top});
 // Cards against the snapshot.
 const first=search.list('').hotels;
 const cards=await page.locator('.hotel-list .hotel-card').evaluateAll(list=>list.map(card=>({
  id:card.id.replace(/^card-/,''),title:card.querySelector('.card-title')?.innerText.trim(),ja:card.querySelector('.name-ja')?.innerText.trim()??null,
  english:!!card.querySelector('.name-en,[lang=en]'),
  cells:[...card.querySelectorAll('.bath-cells .bath-cell')].map(c=>{const s=getComputedStyle(c),label=c.querySelector('.bath-label'),mark=c.querySelector('.bath-mark');return{
   label:label?.textContent.trim(),state:(c.className.match(/is-(yes|no|unknown)/)??[])[1],mark:mark?.textContent.trim(),markHidden:mark?.getAttribute('aria-hidden')==='true',
   scope:c.querySelector('small')?.textContent.trim()??'',text:c.textContent.replace(/\s+/g,' ').trim(),
   border:s.borderTopStyle,filled:s.backgroundColor!==getComputedStyle(card).backgroundColor,struck:label?getComputedStyle(label).textDecorationLine.includes('line-through'):false}}),
 })));
 const wrong=[];
 for(const [i,card] of cards.entries()){
  const h=first[i];
  if(!h||h.id!==card.id){wrong.push({i,id:card.id,expected:h?.id});continue}
  const want=expected(h);
  if(card.cells.length!==6)wrong.push({id:card.id,cells:card.cells.length});
  for(const [j,c] of card.cells.entries()){
   const e=want[j];
   const shape=c.state==='yes'?c.mark==='✓'&&c.filled&&c.border==='solid':c.state==='no'?c.mark==='–'&&c.struck&&!c.filled:c.mark==='?'&&c.border==='dashed'&&!c.filled;
   if(c.label!==e.label||c.state!==e.state||c.scope!==e.scope||!shape||!c.markHidden||!c.text.endsWith(WORD[e.state]))wrong.push({id:card.id,got:c,want:e,shape});
  }
  if(card.title!==h.names.ko||(h.names.ja!==h.names.ko&&card.ja!==h.names.ja)||card.english)wrong.push({id:card.id,title:card.title,ja:card.ja,english:card.english,names:h.names});
 }
 const states=cards.flatMap(c=>c.cells.map(x=>x.state)).reduce((m,s)=>(m[s]=(m[s]??0)+1,m),{});
 check(`카드 ${cards.length}곳의 탕 6칸이 스냅숏으로 따로 계산한 상태·순서·범위와 같고 모양(채움 ✓, 취소선 –, 점선 ?)과 읽는 글이 맞음, 이름은 한국어·일본어 두 줄`,cards.length===first.length&&wrong.length===0&&states.yes>0&&states.no>0&&states.unknown>0,{cards:cards.length,states,wrong:wrong.slice(0,5)});
 // The legend says what the marks mean.
 const legend=await page.locator('.bath-legend').innerText().catch(()=>'');
 check('6칸 설명(있음·없음·확인 전)이 목록 위에 있음',/있음/.test(legend)&&/없음/.test(legend)&&/확인 전/.test(legend),{legend});
 // A chip: the snapshot's count for that condition, computed in the browser.
 const before=lists.length;
 const chip=page.locator('.chip-bar button',{hasText:/^천연온천$/});
 await tap(chip);await page.waitForTimeout(500);
 const natural=search.list('features=natural').total,shownNatural=Number((await page.locator('.results-header h2 span').innerText()).replace(/[^0-9]/g,''));
 check(`칩 ‘천연온천’: 눌림 상태, 결과 ${natural}곳 = 스냅숏 값, Worker 목록 요청 없음`,await chip.getAttribute('aria-pressed')==='true'&&shownNatural===natural&&lists.length===before&&new URL(page.url()).searchParams.get('features')==='natural',{natural,shownNatural,requests:lists.slice(before),url:page.url()});
 await tap(chip);await page.waitForTimeout(400);
 // An onsen town from the place picker: its prefecture and its search word.
 await tap(page.getByRole('combobox',{name:'검색 지역 · 온천마을'}));
 const groups=await page.locator('[role=listbox] [role=group]').evaluateAll(list=>list.map(g=>g.querySelector('[data-slot=select-label],div')?.textContent.trim()));
 await tap(page.getByRole('option',{name:town.name,exact:true}));await page.waitForTimeout(600);
 const shownTown=Number((await page.locator('.results-header h2 span').innerText()).replace(/[^0-9]/g,''));
 const url=new URL(page.url()),picked=await page.getByRole('combobox',{name:'검색 지역 · 온천마을'}).innerText();
 check(`지역 선택의 첫 묶음이 온천마을이고, 온천마을 ‘${town.name}’ 선택: ${town.prefecture}·${town.query} 결과 ${town.total}곳 = 스냅숏 값`,groups[0]==='온천마을'&&town.total>0&&url.searchParams.get('region')===town.prefecture&&url.searchParams.get('q')===town.query&&shownTown===town.total&&picked.includes(town.name)&&lists.length===before,{groups,town:town.name,total:town.total,shownTown,url:url.search,picked});
 // The data status: its summary, ‘최신 자료 확인’ and ‘수집 현황 자세히 보기’ are in the footer, not
 // above the list (U06: the screen itself is check-u06-status-browser.mjs).
 const status=await page.evaluate(()=>{const s=document.querySelector('.site-footer .data-status');return{inFooter:!!s,heading:s?.querySelector('h2')?.textContent,refresh:!!s?.querySelector('.result-refresh'),open:!!s?.querySelector('.u06-open'),coverage:/도도부현/.test(s?.textContent??''),above:[...document.querySelectorAll('.demo-banner,.onsen-town-nav,.region-nav')].length,beforeList:s?s.getBoundingClientRect().top<document.querySelector('.hotel-list').getBoundingClientRect().top:true}});
 check('자료 현황(집계·최신 자료 확인·자세히 보기)은 바닥글에 있고 목록 위에는 없음',status.inFooter&&status.heading==='자료 현황'&&status.refresh&&status.open&&status.coverage&&status.above===0&&!status.beforeList,status);
 // ‘자료 현황’ above the list opens the data status screen with the keyboard and by touch (U06),
 // and the credits the footer carries (photo credits, the address dictionary's wording) are
 // reachable there: the footer is not while the list keeps loading. The list does not grow
 // behind the open screen. early: pressed before the search result is ready (the snapshot
 // arrives 2.5s late).
 const slow=url=>/\/snapshot\/v\/[^/]+\/(core|cards)\.json$/.test(url.pathname);
 const sheet=page.locator('[role="dialog"].u06-sheet');
 const jump=async how=>{
  let tabs=0;
  if(how==='early'){
   await page.route(slow,async route=>{await new Promise(done=>setTimeout(done,2500));await route.continue().catch(()=>{})});
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForTimeout(700);
   await tap(page.locator('.data-status-link'));
  }else{await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(400)}
  if(how==='keyboard'){
   await page.locator('.chip-bar button').last().focus();
   for(;tabs<80;tabs++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.classList.contains('data-status-link')))break}
   await page.keyboard.press('Enter');
  }else if(how==='touch')await page.locator('.data-status-link').tap();
  const opened=await sheet.locator('.u06-row').first().waitFor({timeout:8000}).then(()=>true,()=>false);
  if(how==='early'){await page.waitForTimeout(3000);await page.unroute(slow)}
  const cards=await page.locator('.hotel-list .hotel-card').count();
  const at={hash:await page.evaluate(()=>location.hash),focus:await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')??null)};
  const link=sheet.locator('.u06-credits a',{hasText:'사진 출처'});
  await link.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(300);
  const credits=await link.evaluate(a=>{const r=a.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{inView:r.top>=0&&r.bottom<=innerHeight,reachable:hit===a||a.contains(hit),geo:/jageocoder/.test(a.closest('section')?.textContent??'')}});
  await page.waitForTimeout(1200);
  const after=await page.locator('.hotel-list .hotel-card').count();
  if(how==='keyboard')await page.keyboard.press('Escape');else await tap(sheet.getByRole('button',{name:'자료 현황 닫기'}));
  await sheet.waitFor({state:'detached'});
  const back=await page.evaluate(()=>document.activeElement?.classList.contains('data-status-link'));
  return{tabs,opened,at,credits,cards,after,back,pass:(how!=='keyboard'||tabs<80)&&opened&&at.hash==='#status'&&at.focus==='자료 현황 닫기'&&credits.inView&&credits.reachable&&credits.geo&&after===cards&&back};
 };
 const keyboard=await jump('keyboard');
 check(`목록 위 ‘자료 현황’: Tab으로 닿고(${keyboard.tabs+1}번) Enter로 자료 현황 화면이 열려 초점이 닫기 버튼에 오고, 그 안의 사진 출처·주소 사전 출처 표기에 닿으며 뒤 목록은 늘지 않고, Esc로 닫으면 초점이 버튼으로 돌아감`,keyboard.pass,keyboard);
 if(mobile){const touch=await jump('touch');check('목록 위 ‘자료 현황’: 터치로 같은 동작',touch.pass,touch)}
 const early=await jump('early');
 check('목록 위 ‘자료 현황’: 스냅숏이 늦게 와서 결과가 나오기 전에 눌러도 화면이 열리고, 결과가 나온 뒤에도 뒤 목록이 늘지 않으며 출처 표기에 닿음',early.pass,early);
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
