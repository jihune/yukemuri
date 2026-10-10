// U02 checks in real Chromium at 360px and 390px with touch and keyboard input:
// the notice for candidates excluded only by unknown facts, and the map's count of what it leaves out.
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
const located=h=>Number.isFinite(h.location?.latitude)&&Number.isFinite(h.location?.longitude);
const count=n=>n.toLocaleString('ko-KR')+'곳';
// A URL predicate: in a Playwright glob '?' is not a literal.
const hotelsApi=url=>url.pathname==='/api/hotels';

async function run(page){
 const overflow=()=>page.evaluate(()=>document.scrollingElement.scrollWidth-innerWidth);
 const focused=()=>page.evaluate(()=>{const e=document.activeElement;return e?.getAttribute('aria-label')||e?.innerText?.trim().split('\n')[0].slice(0,40)||e?.tagName});
 const box=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight}});
 const inView=b=>b.left>=-0.5&&b.top>=-0.5&&b.right<=b.vw+0.5&&b.bottom<=b.vh+0.5;
 const fullyReachable=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return [[.5,.5],[.1,.2],[.9,.2],[.1,.8],[.9,.8]].every(([x,y])=>{const hit=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);return !!hit&&(hit===e||e.contains(hit))})});
 // Expected values come from the API the page itself calls, with the same query.
 const api=query=>page.evaluate(q=>fetch('/api/hotels?'+q).then(r=>r.json()),query);
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${width}-${name}.png`})};
 const notice=page.locator('.unknown-excluded'),coverage=page.locator('.map-coverage');

 // Trip.com 8.0+: many records have no Trip.com score, and the result spans several pages.
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 const rated=await api('rating=8&stable=1');
 await notice.waitFor({timeout:5000}).catch(()=>{});
 const noticeText=await notice.count()?await notice.innerText():'';
 check('미확인 때문에 제외된 후보 수를 안내',rated.unknownExcluded>0&&noticeText.includes(count(rated.unknownExcluded))&&noticeText.includes('추정하지 않습니다'),{expected:rated.unknownExcluded,noticeText});
 check('안내가 화면 너비 안에 있고 가로 넘침 없음',await notice.count()>0&&inView({...await box(notice),top:0,bottom:0,vh:1})&&await overflow()<=0,{overflow:await overflow()});
 await shot('notice');

 await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
 const plain=await api('q='+encodeURIComponent('노보리베츠'));
 check('시설·평점 조건이 없으면 안내 없음',plain.unknownExcluded===0&&await notice.count()===0,{unknownExcluded:plain.unknownExcluded});

 // Loading: the old count must not stay on screen while the new search runs.
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 await page.route(hotelsApi,async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue()});
 await page.locator('.mobile-quick button').first().tap();
 await page.locator('.catalog-loading').waitFor();
 check('검색 중에는 로딩 안내만 보이고 이전 안내는 숨김',await page.locator('.catalog-loading').isVisible()&&await notice.count()===0);
 await page.locator('.catalog-loading').waitFor({state:'detached',timeout:15000});
 await page.unroute(hotelsApi);
 const verified=await api('provider=trip&rating=9&reviews=50&stable=1');
 const verifiedText=await notice.count()?await notice.innerText():'';
 check('검색이 끝나면 새 조건의 수로 안내',verified.unknownExcluded>0&&verifiedText.includes(count(verified.unknownExcluded)),{expected:verified.unknownExcluded,verifiedText});

 // Failure: an error replaces the notice; a keyboard retry restores the matching state.
 await page.route(hotelsApi,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
 await page.locator('.mobile-quick button').first().tap();
 const error=page.locator('.error-banner');await error.waitFor();
 check('검색 실패 시 오류 안내와 다시 시도 버튼, 미확인 안내 숨김',await error.getByRole('button',{name:'다시 시도'}).isVisible()&&await notice.count()===0);
 await page.unroute(hotelsApi);
 await error.getByRole('button',{name:'다시 시도'}).focus();await page.keyboard.press('Enter');
 await error.waitFor({state:'detached',timeout:15000});await page.waitForLoadState('networkidle');
 await page.locator('.hotel-list .card-title').first().waitFor({timeout:15000}).catch(()=>{});
 const cardsAfterRetry=await page.locator('.hotel-list .card-title').count();
 check('Enter로 다시 시도 성공 후 조건 없는 검색은 목록이 돌아오고 안내 없음',await notice.count()===0&&cardsAfterRetry>0,{cardsAfterRetry,notice:await notice.count()});

 // Map view on a phone: the caption explains the gap between the result and the markers.
 // The unfiltered list has enough pages for loading, failure and retry.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const all=await api('stable=1');
 await page.locator('.mobile-map-toggle').tap();
 await coverage.waitFor();
 const firstPage=all.hotels,shown=firstPage.filter(located).length;
 const coverageText=async()=>(await coverage.innerText()).replace(/\s+/g,' ');
 let text=await coverageText();
 check('지도 화면에 결과 전체 수·지도 표시 수·위치 미확인·미로딩 수 표시',shown<all.total&&text.includes(`검색 결과 ${count(all.total)} 중 지도에 ${count(shown)} 표시`)&&text.includes(`위치 미확인 ${count(firstPage.length-shown)}`)&&text.includes(`아직 불러오지 않음 ${count(all.total-firstPage.length)}`),{text,total:all.total,shown,loaded:firstPage.length});
 const caption=await page.locator('.map-caption').innerText();
 check('지도 표시 수와 지도 캡션의 수가 같음',caption.replace(/\s+/g,' ').includes(`지도 표시 ${count(shown)}`),{caption});
 const more=coverage.getByRole('button');
 // Opening the map puts its counts and button at the top, clear of the floating list button.
 const initial={box:await box(more),reachable:await fullyReachable(more)};
 check('‘지도 보기’ 버튼으로 연 처음 위치에서 더 불러오기 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음',inView(initial.box)&&initial.reachable,{initiallyCovered:!initial.reachable,button:initial.box});
 await more.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 check('지도 화면 가로 넘침 없음, 스크롤해 화면 가운데에 둔 더 불러오기 버튼도 다섯 점 모두 가려지지 않고 높이 44px 이상',await overflow()<=0&&inView(await box(more))&&await fullyReachable(more)&&(await box(more)).height>=44,{overflow:await overflow(),button:await box(more)});
 await shot('map');

 // Touch: load the next page from the map, with a visible loading state.
 await page.route(hotelsApi,async route=>{await new Promise(r=>setTimeout(r,1200));await route.continue()});
 await more.tap();
 await coverage.getByText('숙소를 더 불러오는 중').waitFor();
 check('더 불러오는 중 안내가 지도 화면에 보임',await coverage.getByText('숙소를 더 불러오는 중').isVisible());
 await coverage.getByText('숙소를 더 불러오는 중').waitFor({state:'detached',timeout:15000});
 await page.unroute(hotelsApi);
 const second=await api('stable=1&page=2&snapshot='+encodeURIComponent((await api('stable=1')).snapshot?.token??''));
 text=await coverageText();
 const loadedTwo=firstPage.length+second.hotels.length,shownTwo=shown+second.hotels.filter(located).length;
 check('터치로 다음 페이지를 불러오면 지도 표시 수와 미로딩 수가 바뀜',text.includes(`지도에 ${count(shownTwo)} 표시`)&&text.includes(`불러온 ${count(loadedTwo)} 중`)&&(all.total>loadedTwo?text.includes(`아직 불러오지 않음 ${count(all.total-loadedTwo)}`):!text.includes('아직 불러오지 않음')),{text,loadedTwo,shownTwo});

 // Keyboard: Tab reaches the button; a failed load keeps focus and offers a retry.
 if(all.total>loadedTwo){
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})});
  let tabs=0;for(;tabs<120&&!(await more.evaluate(e=>e===document.activeElement));tabs++)await page.keyboard.press('Tab');
  check('Tab으로 더 불러오기 버튼에 도달',tabs<120,{tabs});
  await page.route(hotelsApi,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
  await page.keyboard.press('Space');
  await coverage.getByRole('alert').waitFor();
  check('추가 로딩 실패 시 오류 안내와 다시 불러오기, 포커스 유지',(await more.innerText()).includes('다시 불러오기')&&await more.evaluate(e=>e===document.activeElement),{button:await more.innerText(),focused:await focused()});
  await page.unroute(hotelsApi);
  await page.keyboard.press('Enter');
  await coverage.getByRole('alert').waitFor({state:'detached',timeout:15000});
  await page.waitForFunction(()=>!document.querySelector('.map-coverage')?.innerText.includes('불러오는 중'));
  text=await coverageText();
  check('Enter로 다시 불러오기 성공 후 오류 안내 제거',!text.includes('test')&&text.includes(`불러온 ${count(Math.min(all.total,loadedTwo+40))} 중`),{text});
 }else check('세 번째 페이지 없음: 키보드 실패 검사를 위한 결과가 부족함',false,{total:all.total});

 // A later page that comes back empty: the total is cut to what loaded, and the page says so.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.route(hotelsApi,async route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('page')==='1')return route.continue();
  const real=await (await route.fetch()).json();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...real,hotels:[]})});
 });
 await page.locator('.mobile-map-toggle').tap();
 await coverage.waitFor();
 await coverage.getByRole('button').tap();
 const cut=page.locator('.list-shortened');
 await cut.waitFor({timeout:15000}).catch(()=>{});
 await page.unroute(hotelsApi);
 const cutText=await cut.count()?(await cut.innerText()).replace(/\s+/g,' '):'';
 const mapCut=(await coverageText());
 check('빈 다음 쪽을 받으면 원래 결과 수와 줄어든 수를 목록과 지도에 안내',cutText.includes(`검색 결과는 ${count(all.total)}이었지만`)&&cutText.includes(`불러온 ${count(all.hotels.length)}까지만`)&&mapCut.includes(`결과 수를 불러온 ${count(all.hotels.length)}으로 줄였습니다(원래 ${count(all.total)})`),{cutText,mapCut});
 await cut.getByRole('button').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 check('안내의 목록 새로고침 버튼이 가려지지 않고 높이 44px 이상',await fullyReachable(cut.getByRole('button'))&&(await box(cut.getByRole('button'))).height>=44,{button:await box(cut.getByRole('button'))});
 await cut.getByRole('button').focus();await page.keyboard.press('Enter');
 await cut.waitFor({state:'detached',timeout:15000}).catch(()=>{});
 await page.waitForLoadState('networkidle');
 check('Enter로 목록 새로고침 뒤 안내가 사라지고 원래 결과 수로 돌아옴',await cut.count()===0&&(await coverageText()).includes(`검색 결과 ${count(all.total)}`),{text:await coverageText()});

 // The other two ways into the phone map: an address with view=map, and a card's map button.
 const firstView=async name=>{
  await coverage.waitFor();await page.waitForTimeout(400);
  const button=coverage.getByRole('button'),b=await box(button);
  check(name,inView(b)&&await fullyReachable(button),{button:b});
 };
 await page.goto(base+'/?view=map',{waitUntil:'networkidle'});
 await firstView('주소의 view=map으로 연 처음 위치에서 더 불러오기 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음');
 await page.goto(base+'/',{waitUntil:'networkidle'});
 // A card below the first screen: the page is already scrolled when the map opens.
 await page.locator('.card-bottom button',{hasText:'지도에서 보기'}).nth(2).tap();
 await firstView('카드의 ‘지도에서 보기’로 연 처음 위치에서 더 불러오기 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음');
}

const chromiumVersion=browser.version();
for(width of [360,390]){
 const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 try{await run(page)}catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 await context.close();
}
await browser.close();
const failed=results.filter(result=>!result.pass);
if(evidence){
 writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:'360x780, 390x780 · isMobile · hasTouch · deviceScaleFactor 2',externalRequests:'blocked',results,
  notCovered:['실제 모바일 기기·모바일 브라우저 주소창·안전 영역','스크린리더 읽기 순서','외부 지도 타일','운영 D1 자료(검사는 로컬 개발 DB와 체크인된 스냅샷 사용)']},null,1)+'\n');
}
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
