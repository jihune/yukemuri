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
 await bare.goto(base+'/');const bareCards=await bare.locator('.hotel-list .card-title').count(),bareVisible=await bare.locator('main.workspace').evaluate(e=>getComputedStyle(e).visibility),barePending=await bare.locator('.conditions-pending').isVisible();
 await still.close();
 check('스크립트 없이도 정적 HTML에 첫 쪽 카드 40곳, 조건 적용 안내 없음',bareCards===40&&bareVisible==='visible'&&!barePending,{bareCards,bareVisible,barePending});
 const appScripts=url=>url.pathname.startsWith('/_next/')&&url.pathname.endsWith('.js');
 // The address the app writes for the view without conditions (every default
 // spelled out) is that view: reloaded, its first page shows before the app.
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForFunction(()=>location.search.includes('sort='));
 const spelled=new URL(page.url());spelled.hash='';
 // A parameter the app does not read (a mail campaign tag) changes nothing either.
 spelled.searchParams.set('utm_source','mail');
 await page.route(appScripts,route=>route.abort());
 await page.goto(spelled.href,{waitUntil:'load'});
 const defaults={visibility:await page.locator('main.workspace').evaluate(e=>getComputedStyle(e).visibility),mark:await page.evaluate(()=>document.documentElement.hasAttribute('data-conditions')),pending:await page.locator('.conditions-pending').isVisible(),search:spelled.search};
 check('기본 조건을 적은 주소는 정적 첫 쪽을 그대로 보임',defaults.visibility==='visible'&&!defaults.mark&&!defaults.pending&&spelled.search.length>1,defaults);
 await page.unroute(appScripts);
 await page.route(appScripts,route=>route.abort());
 await page.goto(base+'/?rating=8',{waitUntil:'load'});
 const hidden={...await page.locator('main.workspace').evaluate(e=>({visibility:getComputedStyle(e).visibility,first:e.dataset.firstPage??null,mark:document.documentElement.hasAttribute('data-conditions')})),cardsVisible:await page.locator('.hotel-list .card-title').first().isVisible(),pending:await page.locator('.conditions-pending').isVisible(),mapCount:await page.locator('.mobile-map-toggle span').isVisible()};
 await shot('conditions-pending');
 check('조건 있는 주소는 앱 스크립트 전에 정적 첫 쪽 대신 조건 적용 안내를 보임',hidden.visibility==='hidden'&&!!hidden.first&&hidden.mark&&!hidden.cardsVisible&&hidden.pending&&!hidden.mapCount,hidden);
 await page.unroute(appScripts);
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 const shownAfter=await page.locator('main.workspace').evaluate(e=>({visibility:getComputedStyle(e).visibility,first:e.dataset.firstPage??null,mark:document.documentElement.hasAttribute('data-conditions')}));
 shownAfter.pending=await page.locator('.conditions-pending').count();
 check('앱이 주소를 읽은 뒤에는 조건의 결과를 표시하고 안내를 지움',shownAfter.visibility==='visible'&&shownAfter.first===null&&!shownAfter.mark&&shownAfter.pending===0,shownAfter);

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

 // Failure: the snapshot files cannot be read (the page carries its manifest, so
 // the first load asks for the files only); a keyboard retry restores the list.
 const failing=url=>snapshotFiles(url)||manifestFile(url);
 await page.route(failing,route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}));
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 const error=page.locator('.error-banner');await error.waitFor();
 check('목록을 받지 못하면 오류 안내와 다시 시도 버튼, 미확인 안내 숨김',await error.getByRole('button',{name:'다시 시도'}).isVisible()&&await notice.count()===0);
 await page.unroute(failing);
 await error.getByRole('button',{name:'다시 시도'}).focus();await page.keyboard.press('Enter');
 await error.waitFor({state:'detached',timeout:15000});await page.waitForLoadState('networkidle');
 await page.locator('.hotel-list .card-title').first().waitFor({timeout:15000}).catch(()=>{});
 const cardsAfterRetry=await page.locator('.hotel-list .card-title').count();
 check('Enter로 다시 시도하면 목록과 그 조건의 안내가 돌아옴',cardsAfterRetry>0&&(await notice.innerText().catch(()=>'')).includes(count((await api('rating=8')).unknownExcluded)),{cardsAfterRetry});

 // A page older than the deployed snapshot format asks to be opened again: the
 // page's version is gone (404), and the deployed manifest has a newer format.
 await page.route(manifestFile,async route=>{const r=await route.fetch();await route.fulfill({response:r,json:{...await r.json(),format:999}})});
 await page.route(snapshotFiles,route=>route.fulfill({status:404,contentType:'text/plain',body:'gone'}));
 await page.goto(base+'/?rating=8',{waitUntil:'networkidle'});
 await error.waitFor();
 check('스냅숏 형식이 다르면 새 버전 안내와 페이지 다시 열기 버튼',(await error.innerText()).includes('새 버전')&&await error.getByRole('button',{name:'페이지 다시 열기'}).isVisible()&&await page.locator('.hotel-list .card-title').count()===0,{text:await error.innerText()});
 await page.unroute(manifestFile);await page.unroute(snapshotFiles);

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

 // Map view on a phone (U05, which replaced the loaded-pages map of PR #13): the whole result
 // is on the map, and the line above it says how many stays are in view, outside it and
 // without a point; they add up to the result. Stays without a point open as a list.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const all=await api(''),order=search.order(''),core=search.snapshot.core,geo=search.geo;
 const point=i=>core.lat[i]!==null&&core.lng[i]!==null||!!geo&&(geo.grade[i]??0)>0&&geo.lat[i]!==null;
 const noPoint=order.filter(i=>!point(i)).length;
 await page.locator('.mobile-map-toggle').tap();
 await coverage.waitFor();
 await page.waitForFunction(()=>document.querySelector('.map-canvas')?.dataset.view,null,{timeout:10000}).catch(()=>{});
 const coverageText=async()=>(await coverage.innerText()).replace(/\s+/g,' ');
 let text=await coverageText();
 const pick=re=>{const m=text.match(re);return m?Number(m[1].replace(/,/g,'')):NaN};
 const inViewCount=pick(/이 화면 ([\d,]+)곳/),out=pick(/화면 밖 ([\d,]+)곳/),unknown=pick(/위치 미확인 ([\d,]+)곳/);
 check('지도 화면에 결과 전체 수·이 화면·화면 밖·위치 미확인 수 표시(합 = 결과 수)',order.length===all.total&&text.includes(`검색 결과 ${count(all.total)}`)&&unknown===noPoint&&inViewCount+out+unknown===all.total,{text,total:all.total,noPoint});
 const listHead=(await page.locator('.map-stay-list h3').innerText()).replace(/\s+/g,' ');
 check('이 화면 수와 지도 옆 목록 머리의 수가 같음',listHead.includes(`이 화면 ${count(inViewCount)}`),{listHead,inViewCount});
 const more=coverage.getByRole('button',{name:/위치 미확인/});
 // Opening the map puts its counts and button at the top, clear of the floating list button.
 const initial={box:await box(more),reachable:await fullyReachable(more)};
 check('‘지도 보기’ 버튼으로 연 처음 위치에서 위치 미확인 목록 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음',inView(initial.box)&&initial.reachable,{initiallyCovered:!initial.reachable,button:initial.box});
 await more.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 check('지도 화면 가로 넘침 없음, 스크롤해 화면 가운데에 둔 위치 미확인 목록 버튼도 다섯 점 모두 가려지지 않고 높이 44px 이상',await overflow()<=0&&inView(await box(more))&&await fullyReachable(more)&&(await box(more)).height>=44,{overflow:await overflow(),button:await box(more)});
 await shot('map');

 // Touch: the list opens at once, without a request, with that many stays.
 const sent=workerLists.length;
 await more.tap();await page.waitForTimeout(300);
 let head=(await page.locator('.map-stay-list h3').innerText()).replace(/\s+/g,' ');
 check('터치로 위치 미확인 목록을 열면 요청 없이 그 수의 목록',workerLists.length===sent&&head.includes('위치 미확인')&&head.includes(count(unknown)),{head,requests:workerLists.slice(sent)});
 await page.locator('.map-stay-list-back').tap();await page.waitForTimeout(200);

 // Keyboard: Tab reaches the button; Space opens the list.
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})});
 let tabs=0;for(;tabs<120&&!(await more.evaluate(e=>e===document.activeElement));tabs++)await page.keyboard.press('Tab');
 check('Tab으로 위치 미확인 목록 버튼에 도달',tabs<120,{tabs});
 await page.keyboard.press('Space');await page.waitForTimeout(200);
 head=(await page.locator('.map-stay-list h3').innerText()).replace(/\s+/g,' ');
 check('Space로 위치 미확인 목록을 엶',head.includes('위치 미확인')&&head.includes(count(unknown)),{head});
 await page.locator('.map-stay-list-back').tap();

 // A later page cannot come back empty or fail any more: pages are slices of
 // the loaded snapshot (P03), so the former shortened-list notice is gone.

 // The other two ways into the phone map: an address with view=map, and a card's map button.
 const firstView=async name=>{
  await coverage.waitFor();await page.waitForTimeout(400);
  const button=coverage.getByRole('button',{name:/위치 미확인/}),b=await box(button);
  check(name,inView(b)&&await fullyReachable(button),{button:b});
 };
 await page.goto(base+'/?view=map',{waitUntil:'networkidle'});
 await firstView('주소의 view=map으로 연 처음 위치에서 위치 미확인 목록 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음');
 await page.goto(base+'/',{waitUntil:'networkidle'});
 // A card below the first screen: the page is already scrolled when the map opens.
 await page.locator('.card-bottom button',{hasText:'지도에서 보기'}).nth(2).tap();
 await firstView('카드의 ‘지도에서 보기’로 연 처음 위치에서 위치 미확인 목록 버튼이 화면 안에 있고 다섯 점 모두 가려지지 않음');
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
