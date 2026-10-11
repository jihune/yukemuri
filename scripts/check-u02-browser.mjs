// U02 checks in real Chromium at 360px and 390px with touch and keyboard input:
// the notice for candidates excluded only by unknown facts, and the map's count of what it leaves out.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start) and the isolated Playwright install in docs/ui-u01-20261010.md.
// Since P03 the list comes from the static search snapshot: expected values come
// from that snapshot (scripts/site-search-node.mjs), loading and failure states
// from delaying or failing the snapshot files.
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
import {siteSearch} from './site-search-node.mjs';
const search=await siteSearch(base);
// URL predicates: in a Playwright glob '?' is not a literal.
const snapshotFiles=url=>url.pathname.startsWith('/snapshot/v/'),manifestFile=url=>url.pathname==='/snapshot/manifest.json';
const workerLists=[];

async function run(page){
 const overflow=()=>page.evaluate(()=>document.scrollingElement.scrollWidth-innerWidth);
 const focused=()=>page.evaluate(()=>{const e=document.activeElement;return e?.getAttribute('aria-label')||e?.innerText?.trim().split('\n')[0].slice(0,40)||e?.tagName});
 const box=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight}});
 const inView=b=>b.left>=-0.5&&b.top>=-0.5&&b.right<=b.vw+0.5&&b.bottom<=b.vh+0.5;
 const fullyReachable=locator=>locator.evaluate(e=>{const r=e.getBoundingClientRect();return [[.5,.5],[.1,.2],[.9,.2],[.1,.8],[.9,.8]].every(([x,y])=>{const hit=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);return !!hit&&(hit===e||e.contains(hit))})});
 // Expected values come from the API the page itself calls, with the same query.
 const api=query=>search.list(query);
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

 // The address without conditions shows the static page's first page before the
 // snapshot arrives, then the same cards from the snapshot.
 await page.route(snapshotFiles,async route=>{await new Promise(r=>setTimeout(r,3000));await route.continue()});
 await page.goto(base+'/',{waitUntil:'commit'});
 const titles=()=>page.locator('.hotel-list .card-title').allInnerTexts();
 await page.locator('.hotel-list .card-title').first().waitFor({timeout:2500}).catch(()=>{});
 const early=await titles(),expectedFirst=(await api('stable=1')).hotels.map(h=>h.names.ko);
 const earlyBanner=await page.locator('.demo-banner').innerText();
 check('스냅숏을 받기 전에 정적 첫 쪽 40곳이 기본 결과와 같은 순서로 보이고 로딩 안내 없음',early.length===40&&JSON.stringify(early)===JSON.stringify(expectedFirst.slice(0,40))&&await page.locator('.catalog-loading').count()===0&&!earlyBanner.includes('불러오는 중'),{early:early.length,earlyBanner});
 await page.waitForLoadState('networkidle');await page.unroute(snapshotFiles);
 check('스냅숏을 받은 뒤에도 같은 첫 쪽',JSON.stringify(await titles())===JSON.stringify(early));

 // Before any script runs: the static HTML shows the first page only for the
 // address without conditions; with conditions it stays hidden.
 const still=await browser.newContext({javaScriptEnabled:false,viewport:page.viewportSize()}),bare=await still.newPage();
 // The head script cannot run either; the mark it sets is checked with scripts on below.
 await bare.goto(base+'/');const bareCards=await bare.locator('.hotel-list .card-title').count(),bareVisible=await bare.locator('main.workspace').evaluate(e=>getComputedStyle(e).visibility);
 await still.close();
 check('스크립트 없이도 정적 HTML에 첫 쪽 카드 40곳',bareCards===40&&bareVisible==='visible',{bareCards,bareVisible});
 const appScripts=url=>url.pathname.startsWith('/_next/')&&url.pathname.endsWith('.js');
 await page.route(appScripts,route=>route.abort());
 await page.goto(base+'/?rating=8',{waitUntil:'load'});
 const hidden=await page.locator('main.workspace').evaluate(e=>({visibility:getComputedStyle(e).visibility,first:e.dataset.firstPage??null,mark:document.documentElement.hasAttribute('data-conditions')}));
 check('조건 있는 주소는 앱 스크립트 전에 정적 첫 쪽을 숨김',hidden.visibility==='hidden'&&!!hidden.first&&hidden.mark,hidden);
 await page.unroute(appScripts);
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 const shownAfter=await page.locator('main.workspace').evaluate(e=>({visibility:getComputedStyle(e).visibility,first:e.dataset.firstPage??null,mark:document.documentElement.hasAttribute('data-conditions')}));
 check('앱이 주소를 읽은 뒤에는 조건의 결과를 표시',shownAfter.visibility==='visible'&&shownAfter.first===null&&!shownAfter.mark,shownAfter);

 // Loading: until the snapshot arrives only the loading notice shows; no old count.
 await page.route(snapshotFiles,async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue()});
 await page.goto(base+'/?provider=trip&rating=9&reviews=50',{waitUntil:'commit'});
 await page.locator('.catalog-loading').waitFor();
 check('목록을 받는 중에는 로딩 안내만 보이고 미확인 안내는 숨김',await page.locator('.catalog-loading').isVisible()&&await notice.count()===0);
 await page.locator('.catalog-loading').waitFor({state:'detached',timeout:15000});
 await page.unroute(snapshotFiles);
 const verified=await api('provider=trip&rating=9&reviews=50');
 await notice.waitFor({timeout:5000}).catch(()=>{});
 const verifiedText=await notice.count()?await notice.innerText():'';
 check('목록을 받으면 그 조건의 수로 안내',verified.unknownExcluded>0&&verifiedText.includes(count(verified.unknownExcluded)),{expected:verified.unknownExcluded,verifiedText});
 // Changing conditions computes in the browser: no request to the Worker.
 const before=workerLists.length;
 await page.locator('.mobile-quick button').first().tap();
 await page.waitForTimeout(300);
 check('조건을 바꿔도 목록 요청이 Worker로 가지 않음',workerLists.length===before&&await page.locator('.catalog-loading').count()===0,{requests:workerLists.slice(before)});

 // Failure: the snapshot cannot be read; a keyboard retry restores the list.
 await page.route(manifestFile,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 const error=page.locator('.error-banner');await error.waitFor();
 check('목록을 받지 못하면 오류 안내와 다시 시도 버튼, 미확인 안내 숨김',await error.getByRole('button',{name:'다시 시도'}).isVisible()&&await notice.count()===0);
 await page.unroute(manifestFile);
 await error.getByRole('button',{name:'다시 시도'}).focus();await page.keyboard.press('Enter');
 await error.waitFor({state:'detached',timeout:15000});await page.waitForLoadState('networkidle');
 await page.locator('.hotel-list .card-title').first().waitFor({timeout:15000}).catch(()=>{});
 const cardsAfterRetry=await page.locator('.hotel-list .card-title').count();
 check('Enter로 다시 시도하면 목록과 그 조건의 안내가 돌아옴',cardsAfterRetry>0&&(await notice.innerText().catch(()=>'')).includes(count((await api('rating=8')).unknownExcluded)),{cardsAfterRetry});

 // A page older than the deployed snapshot format asks to be opened again.
 await page.route(manifestFile,async route=>{const r=await route.fetch();await route.fulfill({response:r,json:{...await r.json(),format:999}})});
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 await error.waitFor();
 check('스냅숏 형식이 다르면 새 버전 안내와 페이지 다시 열기 버튼',(await error.innerText()).includes('새 버전')&&await error.getByRole('button',{name:'페이지 다시 열기'}).isVisible()&&await page.locator('.hotel-list .card-title').count()===0,{text:await error.innerText()});
 await page.unroute(manifestFile);

 // A deploy replaced the version the page knows: its files answer 404 once, the
 // page reads the manifest again and shows the list from it.
 let gone404=0,manifestReads=0;const countRead=request=>{if(manifestFile(new URL(request.url())))manifestReads++};page.on('request',countRead);
 await page.route(snapshotFiles,async route=>{if(gone404<2&&/\/(core|cards)\.json$/.test(route.request().url())){gone404++;return route.fulfill({status:404,contentType:'text/plain',body:'gone'})}await route.continue()});
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 await page.locator('.hotel-list .card-title').first().waitFor({timeout:15000}).catch(()=>{});
 check('옛 버전 파일이 404면 manifest를 다시 받아 목록을 보임',gone404===2&&manifestReads===1&&await page.locator('.hotel-list .card-title').count()>0&&await page.locator('.error-banner').count()===0,{gone404,manifestReads});
 page.off('request',countRead);await page.unroute(snapshotFiles);

 // A hotel the snapshot still lists but the detail API no longer has: the sheet
 // closes with the API message and the page reads the manifest again.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const detailApi=url=>/^\/api\/hotels\/[^/]+$/.test(url.pathname);
 await page.route(detailApi,route=>route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'숙소를 찾을 수 없습니다.'})}));
 let manifests=0;const countManifest=request=>{if(manifestFile(new URL(request.url())))manifests++};page.on('request',countManifest);
 await page.locator('.hotel-list .card-title').first().tap();
 await page.locator('.toast-message',{hasText:'숙소를 찾을 수 없습니다.'}).waitFor({timeout:5000}).catch(()=>{});
 await page.waitForLoadState('networkidle');
 check('상세가 404면 안내 후 시트를 닫고 스냅숏 목록을 다시 확인',await page.locator('.toast-message',{hasText:'숙소를 찾을 수 없습니다.'}).count()>0&&manifests===1&&await page.locator('.hotel-list .card-title').count()>0&&!new URL(page.url()).hash.startsWith('#stay/'),{manifests,url:page.url()});
 page.off('request',countManifest);await page.unroute(detailApi);

 // Map view on a phone: the caption explains the gap between the result and the markers.
 // The unfiltered list has enough pages for loading, failure and retry.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const all=await api('');
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

 // Touch: the next page comes from the loaded snapshot at once, without a request.
 const sent=workerLists.length;
 await more.tap();
 const second=await api('page=2');
 text=await coverageText();
 const loadedTwo=firstPage.length+second.hotels.length,shownTwo=shown+second.hotels.filter(located).length;
 check('터치로 다음 페이지를 불러오면 요청 없이 지도 표시 수와 미로딩 수가 바뀜',workerLists.length===sent&&text.includes(`지도에 ${count(shownTwo)} 표시`)&&text.includes(`불러온 ${count(loadedTwo)} 중`)&&(all.total>loadedTwo?text.includes(`아직 불러오지 않음 ${count(all.total-loadedTwo)}`):!text.includes('아직 불러오지 않음')),{text});

 // Keyboard: Tab reaches the button; Space loads the next page.
 if(all.total>loadedTwo){
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})});
  let tabs=0;for(;tabs<120&&!(await more.evaluate(e=>e===document.activeElement));tabs++)await page.keyboard.press('Tab');
  check('Tab으로 더 불러오기 버튼에 도달',tabs<120,{tabs});
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  text=await coverageText();
  check('Space로 다음 페이지를 불러옴',text.includes(`불러온 ${count(Math.min(all.total,loadedTwo+40))} 중`),{text});
 }else check('세 번째 페이지 없음: 키보드 검사를 위한 결과가 부족함',false,{total:all.total});

 // A later page cannot come back empty or fail any more: pages are slices of
 // the loaded snapshot (P03), so the former shortened-list notice is gone.

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
 // Any list, search or map request that reaches the Worker (none should since P03).
 page.on('request',r=>{const u=new URL(r.url());if(/^\/api\/hotels(?:\/(?:map|suggestions|search-index))?$/.test(u.pathname)||u.searchParams.has('_rsc'))workerLists.push(u.pathname+u.search)});
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
