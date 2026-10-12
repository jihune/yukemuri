// Follow-ups to P03 (static snapshot) in real Chromium at 390px with touch:
// the suggestion status while the name-search file loads or fails, the saved
// list when favourites cannot be read, a name-search error after another path
// loaded that file, the collection status of the snapshot the page holds, the
// WebMCP search tool with no match, lower-casing in a Turkish browser, and the
// refresh control's wording.
// Needs the local site (node scripts/prepare-local-site.mjs, then wrangler dev)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-p03-followups-browser.mjs [base] [evidence.json]
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence]=process.argv.slice(2);
const results=[],check=(name,pass,detail={})=>{results.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`)};
const search=await siteSearch(base);
const browser=await chromium.launch();
const textFile=url=>/\/snapshot\/v\/[^/]+\/text\.json$/.test(url.pathname),listFiles=url=>/\/snapshot\/v\/[^/]+\/(core|cards)\.json$/.test(url.pathname);
// WebMCP: a stand-in registry keeps the page's tools so the check can call them.
const tools=()=>{document.modelContext={registerTool(tool){(window.__tools??={})[tool.name]=tool}}};
const open=async(options={})=>{
 const context=await browser.newContext({viewport:{width:390,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,...options});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort());
 const page=await context.newPage();await page.addInitScript(tools);return{context,page};
};
try{
 // 1) Suggestions wait for the name-search file like the search itself: no
 //    promise that Enter searches meanwhile, and a failure says so.
 {
  const {context,page}=await open();
  await page.route(textFile,async route=>{await new Promise(r=>setTimeout(r,2500));await route.continue()});
  await page.goto(base+'/',{waitUntil:'networkidle'});
  const box=page.locator('.search-form input').first();await box.tap();await box.fill('のぼ');
  const status=page.locator('.autocomplete-status');await status.waitFor();
  const loadingText=await status.innerText();
  await context.close();
  const second=await open();
  await second.page.route(textFile,route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"test"}'}));
  await second.page.goto(base+'/',{waitUntil:'networkidle'});
  const box2=second.page.locator('.search-form input').first();await box2.tap();await box2.fill('のぼ');
  const failed=second.page.locator('.autocomplete-status');await second.page.waitForFunction(()=>/못/.test(document.querySelector('.autocomplete-status')?.textContent??''),null,{timeout:10000}).catch(()=>{});
  const failedText=await failed.innerText().catch(()=>'');
  check('예상 숙소 정보를 받는 중·실패일 때 Enter 검색을 약속하지 않음',!/Enter/.test(loadingText)&&!/Enter/.test(failedText)&&/불러오는 중/.test(loadingText)&&/못했/.test(failedText),{loadingText,failedText});
  // Its retry reads the name-search file again; the suggestions follow.
  await second.page.unroute(textFile);
  await second.page.locator('.autocomplete-retry').tap().catch(()=>{});
  await second.page.locator('.hotel-suggestion').first().waitFor({timeout:10000}).catch(()=>{});
  check('예상 숙소 다시 시도로 이름 검색 정보를 다시 받아 후보를 보임',await second.page.locator('.hotel-suggestion').count()>0,{suggestions:await second.page.locator('.hotel-suggestion').count()});
  await second.context.close();
 }
 // 2) Saved list when the favourites cannot be read: no endless search, the
 //    error with a retry, no "nothing saved yet" and no count of 0 in the
//    heading, the result count or the map; the retry restores it.
 {
  const {context,page}=await open();
  let fail=true;await page.route(url=>url.pathname==='/api/favorites',route=>fail&&route.request().method()==='GET'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"즐겨찾기를 불러오지 못했습니다."}'}):route.continue());
  await page.goto(base+'/?saved=1',{waitUntil:'networkidle'});await page.waitForTimeout(800);
  const state={loading:await page.locator('.catalog-loading').count(),retry:await page.locator('.error-banner',{hasText:'즐겨찾기'}).getByRole('button',{name:'다시 시도'}).count(),empty:await page.locator('.empty-state').count(),subtitle:await page.locator('.result-subtitle').innerText(),
   heading:await page.locator('.results-header h2').innerText(),count:await page.locator('.result-count').textContent(),map:await page.locator('.map-coverage').count()};
  fail=false;await page.locator('.error-banner',{hasText:'즐겨찾기'}).getByRole('button',{name:'다시 시도'}).tap().catch(()=>{});
  await page.waitForLoadState('networkidle');await page.waitForTimeout(500);
  const after={loading:await page.locator('.catalog-loading').count(),banner:await page.locator('.error-banner',{hasText:'즐겨찾기'}).count(),empty:await page.locator('.empty-state').count()};
  check('즐겨찾기를 못 읽으면 저장 목록이 찾는 중에 머물지 않고 오류와 다시 시도를 보임',state.loading===0&&state.retry===1&&state.empty===0&&!/검색하는 중/.test(state.subtitle)&&!/[0-9]/.test(state.heading+state.count)&&state.map===0,state);
  check('다시 시도하면 저장 목록으로 돌아옴',after.loading===0&&after.banner===0&&after.empty===1,after);
  await context.close();
 }
 // 3) A name-search error goes away on retry when another path (here the WebMCP
 //    search) already loaded the name-search file.
 {
  const {context,page}=await open();
  let fail=true;await page.route(textFile,route=>fail?route.fulfill({status:503,contentType:'application/json',body:'{"error":"test"}'}):route.continue());
  await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
  const banner=page.locator('.error-banner').first();await banner.waitFor({timeout:10000}).catch(()=>{});
  const shown=await banner.count();
  fail=false;await page.evaluate(()=>window.__tools.search_stays.execute({query:'노보리베츠'}));
  await banner.getByRole('button',{name:'다시 시도'}).tap().catch(()=>{});
  await page.waitForLoadState('networkidle');await page.waitForTimeout(500);
  const left=await banner.count(),cards=await page.locator('.hotel-list .card-title').count(),expected=search.list('q='+encodeURIComponent('노보리베츠')).total;
  check('다른 경로로 이름 검색 파일을 받은 뒤 다시 시도하면 이름 검색 오류가 사라짐',shown===1&&left===0&&cards===Math.min(40,expected),{shown,left,cards,expected});
  await context.close();
 }
 // 4) The collection status of the snapshot the page holds: opened before the
 //    list files arrive, it reads that snapshot's status.json and no second
 //    copy of core and cards.
 {
  const {context,page}=await open();
  const seen=[];page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/snapshot/'))seen.push(u.pathname)});
  await page.route(listFiles,async route=>{await new Promise(r=>setTimeout(r,3000));await route.continue()});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const first=await page.locator('main.workspace').getAttribute('data-first-page');
  await page.locator('.coverage-panel summary').tap();
  await page.locator('.coverage-panel .collection-table-region').waitFor({timeout:15000}).catch(()=>{});
  await page.waitForLoadState('networkidle');
  const count=re=>seen.filter(p=>re.test(p)).length,statusPath=seen.find(p=>p.endsWith('/status.json'));
  check('수집 현황은 화면이 쥔 스냅숏의 status.json만 받고 core·cards를 다시 받지 않음',count(/\/core\.json$/)===1&&count(/\/cards\.json$/)===1&&!!first&&statusPath===`/snapshot/v/${first}/status.json`&&count(/manifest\.json$/)===0,{seen,first});
  await context.close();
 }
 // 5) WebMCP search_stays with conditions and no query that match nothing:
 //    a count of 0, as the former server search answered.
 {
  const regions=search.snapshot.core.region.concat(search.snapshot.core.prefecture).filter(Boolean),empty=[...new Set(regions)].find(r=>{try{return search.list(`region=${r}&rating=9&reviews=50`).total===0}catch{return false}});
  const {context,page}=await open();
  await page.goto(base+'/',{waitUntil:'networkidle'});
  const outcome=empty?await page.evaluate(region=>window.__tools.search_stays.execute({region,verifiedOnly:true}).then(r=>({ok:true,r}),e=>({ok:false,error:String(e)})),empty):null;
  check('WebMCP search_stays: 검색어 없는 조건이 0건이면 오류 대신 count 0',!!empty&&outcome?.ok&&outcome.r.count===0,{empty,outcome});
  await context.close();
 }
 // 6) Lower-casing does not follow the browser's language: in Turkish, "INN"
 //    still finds what "inn" finds (the stored search text is lower-cased in
 //    English). Headless Chromium lower-cases with root rules whatever its
 //    language, so the page runs as a browser whose default locale is Turkish
 //    does: toLocaleLowerCase() without a locale uses Turkish rules.
 {
  const {context,page}=await open({locale:'tr-TR'});
  await page.addInitScript(()=>{const lower=String.prototype.toLocaleLowerCase;String.prototype.toLocaleLowerCase=function(...a){return lower.apply(this,a.length?a:['tr'])}});
  const total=async q=>{await page.goto(base+'/?q='+encodeURIComponent(q),{waitUntil:'networkidle'});await page.locator('.catalog-loading').waitFor({state:'detached',timeout:15000}).catch(()=>{});return Number((await page.locator('.results-header h2 span').innerText()).replace(/[^0-9]/g,''))};
  const upper=await total('INN'),lower=await page.evaluate(()=>'INN'.toLocaleLowerCase()),plain=await total('inn'),expected=search.list('q=inn').total;
  check('터키어 브라우저에서도 대문자 I 검색이 소문자와 같은 결과',lower==='ınn'&&expected>0&&upper===expected&&plain===expected,{browserLower:lower,upper,plain,expected});
  await context.close();
 }
 // 7) The refresh control reads the deployed snapshot again; it says so.
 {
  const {context,page}=await open();
  await page.goto(base+'/',{waitUntil:'networkidle'});
  const label=await page.locator('.result-refresh').getAttribute('aria-label'),text=await page.locator('.result-refresh').innerText();
  const description=await page.evaluate(()=>window.__tools.search_stays.description);
  check('새로고침 단추와 WebMCP 설명이 지금 동작(배포된 숙소 자료 다시 확인, 브라우저 계산)과 맞음',!/server/.test(description)&&/새로|최신/.test(text)&&/배포/.test(label??''),{label,text,description});
  await context.close();
 }
}finally{await browser.close()}
const failed=results.filter(r=>!r.pass).length;
console.log(`checks=${results.length} failed=${failed} ${failed?'FAIL':'PASS'}`);
if(evidence)writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium',viewport:'390x780 · isMobile · hasTouch · deviceScaleFactor 2',externalRequests:'blocked',results},null,1)+'\n');
if(failed)process.exitCode=1;
