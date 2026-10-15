// U05 7 (favorites) in real Chromium (360·390px touch, 1280px mouse), docs/U05-20261013.md 8.7:
// - nothing saved: the favorites screen shows a heart, where the hearts are and that saving stays
//   in this browser, without a ‘0 / 0곳’ list end, a phone map button or a separate note; the main
//   menu marks the current view; ‘숙소 찾기’ goes back to the search with focus on its menu item;
// - two stays saved with their hearts: the menu counts them, the screen lists exactly them under a
//   one-line browser note with its icon, and the list end counts 2 / 2;
// - a condition no saved stay meets: ‘저장한 2곳 중 …’ and ‘조건 모두 풀기’ brings both back;
// - the favorites cannot be read: the error and its retry, no note, no empty state, no list end.
// Saving goes to the local site's temporary database only (never the production site).
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-favorites-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base);
const blank=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axl8xkAAAAASUVORK5CYII=','base64');
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 // Outside pictures become a blank image; every other outside request is refused.
 await context.route(url=>!url.href.startsWith(base),route=>route.request().resourceType()==='image'?route.fulfill({contentType:'image/png',body:blank}):route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=l=>mobile?l.tap():l.click();
 const nav=name=>page.getByRole('navigation',{name:'주 메뉴'}).getByRole('button',{name});
 const read=()=>page.evaluate(()=>{const shown=s=>{const e=document.querySelector(s);return e&&e.checkVisibility()?e:null};
  const empty=shown('.empty-state'),note=shown('.saved-browser-note'),toggle=shown('.mobile-map-toggle'),button=empty?.querySelector('button');
  return{url:location.search,heading:document.querySelector('.results-header h2')?.textContent.trim(),
   current:[...document.querySelectorAll('nav[aria-label="주 메뉴"] button')].filter(b=>b.getAttribute('aria-current')==='page').map(b=>b.textContent.trim()),
   empty:empty?{saved:empty.classList.contains('is-saved'),heart:!!empty.querySelector('svg.lucide-heart'),title:empty.querySelector('h3')?.textContent,text:empty.querySelector('p')?.textContent,button:button?.textContent.trim()??null,buttonH:button?Math.round(button.getBoundingClientRect().height):0}:null,
   note:note?{text:note.textContent,icon:!!note.querySelector('svg'),top:Math.round(note.getBoundingClientRect().top)}:null,
   cards:[...document.querySelectorAll('.hotel-list:not(.alternative-results .hotel-list) .hotel-card')].map(c=>c.id.replace(/^card-/,'')),
   firstCardTop:Math.round(document.querySelector('.hotel-card')?.getBoundingClientRect().top??0),
   listEnd:shown('.list-end')?.textContent??null,toggle:!!toggle,
   banner:shown('.error-banner')?.textContent??null,menuCount:document.querySelector('nav[aria-label="주 메뉴"] button:last-child span')?.textContent,
   focus:document.activeElement?.closest('nav[aria-label="주 메뉴"]')?document.activeElement.textContent.trim():document.activeElement?.tagName}});
 try{
  // 1) Nothing saved yet.
  await page.goto(base+'/?saved=1',{waitUntil:'networkidle'});await page.waitForTimeout(600);
  const none=await read();
  check('저장한 숙소가 없으면 하트 안내(어디를 누르는지, 이 브라우저에만 저장)와 ‘숙소 찾기’(44px)를 보이고, ‘0 / 0곳’ 목록 끝·지도 버튼·따로 된 안내 줄이 없으며, 메뉴는 ‘즐겨찾기’가 현재 위치',
   none.heading==='즐겨찾기 0곳'&&none.empty?.saved&&none.empty.heart&&none.empty.title==='아직 저장한 숙소가 없어요'&&/하트/.test(none.empty.text)&&/이 브라우저에만/.test(none.empty.text)&&none.empty.button==='숙소 찾기'&&none.empty.buttonH>=44&&none.listEnd===null&&!none.toggle&&none.note===null&&none.current.length===1&&/^즐겨찾기/.test(none.current[0]),none);
  await press(page.locator('.empty-state').getByRole('button',{name:'숙소 찾기'}));await page.waitForTimeout(500);
  const back=await read();
  check('‘숙소 찾기’를 누르면 숙소 찾기 화면으로 돌아가고 초점은 메뉴의 ‘숙소 찾기’',back.heading!==undefined&&!/^즐겨찾기/.test(back.heading)&&!/saved=1/.test(back.url)&&back.current[0]==='숙소 찾기'&&back.focus==='숙소 찾기'&&back.cards.length>0,{heading:back.heading,url:back.url,current:back.current,focus:back.focus});

  // 2) Two stays saved with their hearts.
  const ids=back.cards.slice(0,2);
  for(const id of ids){await press(page.locator(`#card-${id}>.favorite-button`));await page.locator(`#card-${id}>.favorite-button.saved`).waitFor({timeout:5000})}
  await press(nav(/즐겨찾기/));await page.waitForTimeout(600);await page.evaluate(()=>scrollTo(0,0));
  const two=await read();
  check('하트 두 개를 누르면 메뉴에 2가 보이고, 즐겨찾기 화면에 그 두 곳만 나오며 그 위에 아이콘과 한 줄 안내(이 브라우저에만 저장), 목록 끝은 ‘2 / 2곳’',
   two.menuCount==='2'&&two.heading==='즐겨찾기 2곳'&&JSON.stringify([...two.cards].sort())===JSON.stringify([...ids].sort())&&two.note?.icon&&/이 브라우저에만/.test(two.note.text)&&two.note.top<two.firstCardTop&&two.empty===null&&/2 \/ 2곳/.test(two.listEnd??''),{menuCount:two.menuCount,heading:two.heading,cards:two.cards,ids,note:two.note,listEnd:two.listEnd});

  // 3) A condition neither saved stay meets.
  const key=['nigori','privateBath','freeFlow','roomOnsen','outdoor','natural'].find(k=>search.list('saved=1&features='+k,ids).total===0);
  if(!key)check('두 곳 모두 맞지 않는 탕 조건을 스냅숏에서 찾음',false,{ids});
  else{
   await page.goto(base+'/?saved=1&features='+key,{waitUntil:'networkidle'});await page.waitForTimeout(600);
   const out=await read();
   await press(page.locator('.empty-state').getByRole('button',{name:'조건 모두 풀기'}));await page.waitForTimeout(600);
   const cleared=await read();
   check(`저장한 숙소가 조건(${key})에 모두 빠지면 ‘저장한 2곳 중 조건에 맞는 숙소가 없어요’, ‘조건 모두 풀기’로 두 곳이 다시 나옴(즐겨찾기 화면 그대로)`,
    out.heading==='즐겨찾기 0곳'&&out.empty&&!out.empty.saved&&out.empty.title==='저장한 2곳 중 조건에 맞는 숙소가 없어요'&&out.empty.button==='조건 모두 풀기'&&out.listEnd===null&&out.note===null&&cleared.heading==='즐겨찾기 2곳'&&cleared.cards.length===2,{key,out:{heading:out.heading,empty:out.empty,listEnd:out.listEnd},cleared:{heading:cleared.heading,cards:cleared.cards}});
  }

  // 4) The favorites cannot be read.
  await page.route(url=>url.pathname==='/api/favorites',route=>route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"즐겨찾기를 불러오지 못했습니다."}'}):route.continue());
  await page.goto(base+'/?saved=1',{waitUntil:'networkidle'});await page.waitForTimeout(800);
  const failed=await read();
  check('즐겨찾기를 못 읽으면 오류와 ‘다시 시도’만 있고 안내 줄·빈 화면·목록 끝은 없음',/즐겨찾기를 불러오지 못했습니다/.test(failed.banner??'')&&/다시 시도/.test(failed.banner??'')&&failed.note===null&&failed.empty===null&&failed.listEnd===null,failed);
 }catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,browser:'Chromium',viewport:'360x800, 390x800 touch · 1280x800 mouse',externalRequests:'blocked (pictures blank)',results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
