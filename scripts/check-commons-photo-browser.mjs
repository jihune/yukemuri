// D08 PR 2 Commons photo in real Chromium (360·390px touch, 1280px mouse and keyboard):
// - the detail's photos: the collected photo first with its source, then the Commons photo
//   with its credit beside it (Wikimedia Commons file page, author, licence linked to its
//   deed), stepping wraps back to the first; the credit stays inside the photo and clear of
//   the previous/next buttons; keyboard reaches the credit's links;
// - when the collected photo fails to load, the Commons photo shows with its credit;
// - ‘정보 출처’ lists the Commons photo with its author and licence, linked to the file page;
// - the list card shows the collected photo only, never the Commons one (no room for a credit);
// - no horizontal overflow, no page error.
// The seed stay trip-688230 is one the extract and the D07 link reach. Images get a blank
// stand-in (the collected one a 404 in the failure case), other external requests are blocked.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-commons-photo-browser.mjs [base] [evidence.json] [screenshot dir]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const ID='trip-688230';
const row=JSON.parse(readFileSync(new URL('../data/commons-trip-photos.json',import.meta.url),'utf8')).hotels.find(r=>'trip-'+r[0]===ID);
if(!row)throw new Error('The extract has no photo for '+ID);
const [,,url,page,author,licence,licenceUrl]=row;
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAMBAEBjgkz0wAAAABJRU5ErkJggg==','base64');
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?780:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 let failCollected=false;const images=[];
 await context.route(u=>!u.href.startsWith(base),route=>{
  const r=route.request();
  if(r.resourceType()==='image'){images.push(r.url());if(failCollected&&/tripcdn\.com/.test(r.url()))return route.fulfill({status:404,body:''}).catch(()=>{});return route.fulfill({status:200,contentType:'image/png',body:PNG}).catch(()=>{})}
  return route.abort().catch(()=>{});
 });
 const tab=await context.newPage(),errors=[];
 tab.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const shot=async name=>{if(shots)await tab.screenshot({path:`${shots}/${w}-${name}.png`})};
 const detail=tab.locator('.hotel-detail');
 const open=async()=>{await tab.goto(base+'/#stay/'+ID,{waitUntil:'networkidle'});await detail.locator('.detail-body').waitFor({timeout:20000});await tab.waitForTimeout(500)};
 const read=()=>tab.evaluate(()=>{
  const d=document.querySelector('.hotel-detail'),box=e=>{if(!e)return null;const b=e.getBoundingClientRect();return{top:Math.round(b.top),bottom:Math.round(b.bottom),left:Math.round(b.left),right:Math.round(b.right)}};
  const credit=d.querySelector('.detail-image .photo-source-credit');
  return{
   counter:d.querySelector('.photo-nav>span')?.textContent.replace('사진 ','')??null,
   src:d.querySelector('.detail-image img')?.getAttribute('src')??null,
   credit:credit?{text:credit.textContent,links:[...credit.querySelectorAll('a')].map(a=>({text:a.textContent,href:a.href,rel:a.rel,h:Math.round(a.getBoundingClientRect().height)})),box:box(credit)}:null,
   nav:box(d.querySelector('.photo-nav')),image:box(d.querySelector('.detail-image')),
   sources:[...d.querySelectorAll('.provenance b>a')].map(a=>({text:a.textContent,href:a.href})),
   overflow:[...d.querySelectorAll('.detail-scroll,.detail-actions')].map(e=>e.scrollWidth-e.clientWidth),
  }});
 const apart=(a,b)=>!!a&&!!b&&(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
 const inside=(a,b)=>!!a&&!!b&&a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;

 // 1. The list card: the collected photo only.
 await tab.goto(base+'/',{waitUntil:'networkidle'});
 await tab.getByRole('combobox',{name:'지역 또는 숙소 이름 검색'}).fill('UNIVERSAL PORT');await tab.keyboard.press('Enter');await tab.waitForTimeout(1500);
 const cardSrc=await tab.locator('.card-image[aria-label*="유니버설 포트"] img').first().getAttribute('src',{timeout:10000}).catch(()=>null);
 check('목록 카드는 수집한 사진만 보임(Commons 사진 없음)',cardSrc&&/tripcdn\.com/.test(cardSrc),{cardSrc});

 // 2. The detail: collected photo, then the Commons photo with its credit, then back.
 await open();let s=await read();await shot('first');
 const next=detail.getByRole('button',{name:'다음 사진'});
 if(mobile)await next.tap();else{await next.focus();await tab.keyboard.press('Enter')}
 await tab.waitForTimeout(400);const second=await read();await shot('commons');
 if(mobile)await next.tap();else await tab.keyboard.press('Enter');
 await tab.waitForTimeout(400);const third=await read();
 const want=[{text:'Wikimedia Commons',href:page},{text:licence,href:licenceUrl}];
 check(`사진 넘기기(${mobile?'터치':'키보드 Enter'}): 1/2 Trip.com → 2/2 Commons 사진과 표기(파일 쪽·작가·라이선스) → 처음으로`,s.counter==='1/2'&&s.credit?.text==='Trip.com'&&second.counter==='2/2'&&second.src===url&&second.credit?.text===`Wikimedia Commons · ${author} · ${licence}`&&JSON.stringify(second.credit.links.map(({text,href})=>({text,href})))===JSON.stringify(want)&&second.credit.links[1].rel.includes('license')&&third.counter==='1/2'&&third.credit?.text==='Trip.com',{first:s,second,third});
 check('Commons 표기가 사진 안에 있고 이전·다음 단추와 겹치지 않으며, 표기의 링크는 44px 이상',inside(second.credit?.box,second.image)&&apart(second.credit?.box,second.nav)&&second.credit.links.every(l=>l.h>=44),{credit:second.credit?.box,nav:second.nav,image:second.image});
 if(!mobile){
  // Keyboard: back to the Commons photo, then Tab from the image area reaches the credit links.
  await next.focus();await tab.keyboard.press('Enter');await tab.waitForTimeout(300);
  const reached=[];await detail.locator('.detail-image .photo-source-credit a').first().focus();
  for(let i=0;i<2;i++){reached.push(await tab.evaluate(()=>({text:document.activeElement?.textContent,inCredit:!!document.activeElement?.closest('.photo-source-credit')})));await tab.keyboard.press('Tab')}
  check('키보드로 표기의 두 링크(파일 쪽, 라이선스)에 초점이 감',reached.every(r=>r.inCredit)&&reached[0].text==='Wikimedia Commons'&&reached[1].text===licence,{reached});
 }
 const listed=s.sources.find(x=>x.href===page);
 check('정보 출처에 ‘Wikimedia Commons 사진(작가, 라이선스)’이 파일 쪽 링크로 있음',listed?.text===`Wikimedia Commons 사진(${author}, ${licence}) ↗`,{sources:s.sources});
 check('상세 가로 넘침 없음',[s,second].every(x=>x.overflow.every(v=>v<=0)),{overflow:[s.overflow,second.overflow]});

 // 3. The longest author in the extract wraps the credit inside the photo, clear of the buttons.
 const LONG=JSON.parse(readFileSync(new URL('../data/commons-trip-photos.json',import.meta.url),'utf8')).hotels.map(r=>r[4]).sort((a,b)=>b.length-a.length)[0];
 await tab.route(/\/api\/hotels\/trip-688230$/,async route=>{const response=await route.fetch();const h=await response.json();h.commonsPhoto.author=LONG;await route.fulfill({response,json:h})});
 await open();if(mobile)await next.tap();else{await next.focus();await tab.keyboard.press('Enter')}
 await tab.waitForTimeout(400);s=await read();await shot('long-author');await tab.unroute(/\/api\/hotels\/trip-688230$/);
 check(`가장 긴 작가 이름(${LONG.length}자)도 표기가 사진 안에서 줄을 바꾸고 단추와 겹치지 않음`,s.credit?.text.includes(LONG)&&inside(s.credit.box,s.image)&&apart(s.credit.box,s.nav)&&s.overflow.every(v=>v<=0),{credit:s.credit?.box,nav:s.nav,image:s.image});

 // 4. The collected photo fails: the Commons photo shows with its credit.
 failCollected=true;await open();await tab.waitForTimeout(800);s=await read();await shot('fallback');
 check('수집한 사진을 못 받으면 Commons 사진이 표기와 함께 보임',s.src===url&&s.credit?.text===`Wikimedia Commons · ${author} · ${licence}`&&s.counter==='2/2',{src:s.src,credit:s.credit?.text,counter:s.counter});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
const version=browser.version();
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,browser:'Chromium '+version,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
