// U04 dated booking links in real Chromium: 360px and 390px with touch and keyboard,
// 1280px with a mouse and keyboard. The check-in, check-out and adults chosen in the
// stay detail go into the Jalan and Trip.com links (no price lookup), survive a reload
// through the page URL, and missing or invalid dates leave every link as stored.
// The untranslated description caption no longer promises automatic translation.
// Needs a running portable dev server and the isolated Playwright install in docs/ui-u01-20261010.md.
// Uses the checked-in snapshot: daiichi-takimotokan (Trip.com, Jalan, official and map links)
// and jalan-300001 (Japanese description, no translation). Booking sites get a stub page;
// every other external request is blocked.
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
const ID='daiichi-takimotokan';
const STORED={jalan:'https://www.jalan.net/yad364904/',trip:'https://www.trip.com/hotels/noboribetsu-hotel-detail-842622/dai-ichi-takimotokan/',official:'https://takimotokan.co.jp/en/'};
// Dates a month ahead in Japan time, so the check does not expire.
const day=offset=>{const [y,m,d]=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date()).split('-').map(Number);return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10)};
const IN=day(30),OUT=day(32),LONG=day(39);

async function run(page,context,touch){
 const press=async locator=>touch?locator.tap():locator.click();
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${width}-${name}.png`})};
 const focused=()=>page.evaluate(()=>{const e=document.activeElement;return e?.id||e?.getAttribute('aria-label')||e?.innerText?.trim().split('\n')[0].slice(0,40)||e?.tagName});
 const detail=page.locator('.hotel-detail'),checkIn=page.locator('#detail-'+ID+'-in'),checkOut=page.locator('#detail-'+ID+'-out'),adults=detail.getByRole('combobox',{name:'성인 인원'}),help=detail.locator('.booking-link-fields .booking-help');
 const links=async()=>Object.fromEntries(await detail.locator('.external-links a').evaluateAll(as=>as.map(a=>[a.querySelector('b').textContent,{href:a.href,note:a.querySelector('small').textContent}])));
 const params=href=>Object.fromEntries(new URL(href).searchParams);
 const open=async url=>{await page.goto(base+url,{waitUntil:'networkidle'});await detail.locator('.booking-link-fields').waitFor({timeout:15000});await page.waitForTimeout(400)};
 // Type a date the way a keyboard user does. This headless Chromium lays the date field out
 // as month/day/year whatever the locale, and each part moves on once it is full; the value
 // read back is asserted, so a different layout fails rather than passing quietly.
 const typeDate=async (locator,value,click=false)=>{if(click){const box=await locator.boundingBox();await page.mouse.click(box.x+14,box.y+box.height/2)}else await locator.focus();const [y,m,d]=value.split('-');await page.keyboard.type(m+d+y);await page.waitForTimeout(200)};
 const undated=l=>l['Jalan']?.href===STORED.jalan&&l['Trip.com']?.href===STORED.trip&&l['공식 홈페이지']?.href===STORED.official;

 await open('/#stay/'+ID);
 let l=await links();
 check('처음에는 날짜가 없고 모든 링크가 저장된 주소 그대로',undated(l)&&await checkIn.inputValue()===''&&await checkOut.inputValue()===''&&(await help.innerText()).includes('요금 조회는 하지 않습니다'),{links:l,help:await help.innerText()});
 // Layout of the new fields.
 const boxes=[];
 for(const [name,locator] of [['체크인',checkIn],['체크아웃',checkOut],['성인 인원',adults]]){
  await locator.scrollIntoViewIfNeeded();
  boxes.push({name,...await locator.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,vw:innerWidth,vh:innerHeight,reachable:!!hit&&(hit===e||e.contains(hit))}})});
 }
 check('날짜·인원 칸이 화면 안에 있고 가려지지 않으며 높이 44px 이상',boxes.every(b=>b.left>=0&&b.right<=b.vw&&b.top>=0&&b.bottom<=b.vh&&b.reachable&&b.height>=44),{boxes});
 const overflow=await detail.locator('.detail-scroll').evaluate(e=>e.scrollWidth-e.clientWidth);
 check('상세 가로 넘침 없음',overflow<=0,{overflow});

 // Check-in: touch widths tap the field and set it (the native picker cannot be driven
 // headless); the desktop types it. Check-out is typed on the keyboard at every width.
 if(touch){await checkIn.tap();await checkIn.fill(IN)}else{await checkIn.scrollIntoViewIfNeeded();await typeDate(checkIn,IN,true)}
 await typeDate(checkOut,OUT);
 check(`${touch?'터치':'마우스'}·키보드로 체크인 ${IN}, 체크아웃 ${OUT} 입력`,await checkIn.inputValue()===IN&&await checkOut.inputValue()===OUT,{in:await checkIn.inputValue(),out:await checkOut.inputValue()});
 // Adults: touch picks from the list; keyboard opens the list with Enter and moves down one.
 if(touch){await adults.tap();await page.getByRole('option',{name:'3명'}).tap()}
 else{await adults.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')}
 await page.waitForTimeout(300);
 check(`${touch?'터치':'키보드'}로 성인 3명을 고르면 포커스가 인원 칸으로 돌아옴`,(await adults.innerText()).trim()==='3명'&&await focused()==='성인 인원',{adults:await adults.innerText(),focus:await focused()});
 l=await links();
 const [y,m,d]=IN.split('-');
 const jalan=params(l['Jalan'].href),trip=params(l['Trip.com'].href);
 check('Jalan 링크: 숙소 plan 페이지에 날짜·박수·성인·객실 1개',new URL(l['Jalan'].href).pathname==='/yad364904/plan/'&&JSON.stringify(jalan)===JSON.stringify({stayYear:y,stayMonth:String(Number(m)),stayDay:String(Number(d)),stayCount:'2',adultNum:'3',roomCount:'1',roomCrack:'300000',dateUndecided:'0'}),{href:l['Jalan'].href});
 check('Trip.com 링크: 같은 숙소 주소에 체크인·체크아웃·성인·객실 1개',l['Trip.com'].href.startsWith(STORED.trip+'?')&&JSON.stringify(trip)===JSON.stringify({checkIn:IN,checkOut:OUT,adult:'3',crn:'1',currency:'JPY'}),{href:l['Trip.com'].href});
 check('공식 홈페이지·Google Maps 링크는 그대로, 날짜가 들어간 두 링크만 ‘고른 날짜·인원으로 열기’',l['공식 홈페이지'].href===STORED.official&&!l['Google Maps'].href.includes(IN)&&l['Jalan'].note==='고른 날짜·인원으로 열기'&&l['Trip.com'].note==='고른 날짜·인원으로 열기'&&l['공식 홈페이지'].note!=='고른 날짜·인원으로 열기',{notes:Object.fromEntries(Object.entries(l).map(([k,v])=>[k,v.note]))});
 check('안내 문장이 날짜 포함 링크를 알려 줌',(await help.innerText()).includes('고른 날짜·인원으로 열기'),{help:await help.innerText()});
 await shot('dated');
 // Opening the link takes the dates along.
 const popupWait=context.waitForEvent('page');
 const jalanLink=detail.locator('.external-links a',{hasText:'Jalan'});await jalanLink.scrollIntoViewIfNeeded();await press(jalanLink);
 const popup=await popupWait;await popup.waitForLoadState('domcontentloaded').catch(()=>{});
 check('Jalan 링크를 누르면 새 탭이 날짜 포함 주소로 열림',popup.url()===l['Jalan'].href,{opened:popup.url()});
 await popup.close();
 // The page URL keeps the conditions; a reload reopens the same dated links.
 const pageUrl=new URL(page.url());
 check('페이지 주소에 checkIn·checkOut·adults가 남음',pageUrl.searchParams.get('checkIn')===IN&&pageUrl.searchParams.get('checkOut')===OUT&&pageUrl.searchParams.get('adults')==='3'&&pageUrl.hash==='#stay/'+ID,{url:page.url()});
 await page.reload({waitUntil:'networkidle'});await detail.locator('.booking-link-fields').waitFor({timeout:15000});await page.waitForTimeout(400);
 const again=await links();
 check('새로고침 뒤에도 같은 날짜·인원과 날짜 포함 링크',await checkIn.inputValue()===IN&&await checkOut.inputValue()===OUT&&(await adults.innerText()).trim()==='3명'&&again['Jalan'].href===l['Jalan'].href&&again['Trip.com'].href===l['Trip.com'].href,{in:await checkIn.inputValue(),jalan:again['Jalan'].href});
 // Invalid: eight nights. Every link opens without dates and the reason is shown.
 await typeDate(checkOut,LONG);
 l=await links();
 check('8박(범위 밖)이면 모든 링크가 날짜 없이 열리고 이유를 알림',await checkOut.inputValue()===LONG&&undated(l)&&(await help.innerText()).includes('1~7박')&&(await help.innerText()).includes('날짜 없이 열립니다'),{links:l,help:await help.innerText()});
 await shot('invalid');
 // Missing: clear check-in.
 await typeDate(checkOut,OUT);
 await checkIn.fill('');await page.waitForTimeout(200);
 l=await links();
 check('체크인을 지우면 모든 링크가 날짜 없이 열림',await checkIn.inputValue()===''&&undated(l)&&(await help.innerText()).includes('모두 고르면'),{links:l,help:await help.innerText()});
 // Keyboard order and Escape inside the adults list.
 // Tab also steps through the parts of a date field, so record each new element focus lands on.
 await checkIn.focus();const order=[await focused()];
 for(let i=0;i<12&&order.length<4;i++){await page.keyboard.press('Tab');const now=await focused();if(now!==order.at(-1))order.push(now)}
 check('Tab 순서: 체크인 → 체크아웃 → 성인 인원 → 첫 예약 사이트 링크',order[0]==='detail-'+ID+'-in'&&order[1]==='detail-'+ID+'-out'&&order[2]==='성인 인원'&&/^(Trip\.com|Jalan)/.test(order[3]??''),{order});
 await adults.focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);await page.keyboard.press('Escape');await page.waitForTimeout(400);
 check('인원 목록에서 Escape는 목록만 닫고 상세는 열린 채 인원 칸에 포커스',await page.getByRole('listbox').count()===0&&await detail.count()===1&&await focused()==='성인 인원',{focus:await focused()});

 // List -> detail -> dates -> close -> another stay: closing goes back to the list's history
 // entry, and the conditions must survive that and reach the next stay's links.
 await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
 const openFromList=async name=>{const b=page.getByRole('button',{name:name+' 상세 보기'}).first();await b.scrollIntoViewIfNeeded();await press(b);await detail.locator('.booking-link-fields').waitFor({timeout:15000});await page.waitForTimeout(400)};
 await openFromList('다이이치 타키모토칸');
 await checkIn.fill(IN);await checkOut.fill(OUT);await page.waitForTimeout(200);
 await page.keyboard.press('Escape');await page.waitForTimeout(800);
 const listUrl=new URL(page.url());
 await openFromList('노보리베츠 온천향 타키노야');
 const nextIn=page.locator('#detail-takinoya-in'),nextLinks=await links();
 check('목록에서 연 상세를 닫고 다른 숙소를 열어도 날짜·인원이 남고 링크에 들어감',listUrl.searchParams.get('checkIn')===IN&&await nextIn.inputValue()===IN&&params(nextLinks['Jalan'].href).stayCount==='2'&&params(nextLinks['Trip.com'].href).checkIn===IN,{listUrl:listUrl.toString(),in:await nextIn.inputValue(),jalan:nextLinks['Jalan'].href,trip:nextLinks['Trip.com'].href});
 // A Trip.com property link stored on the Korean host takes the same conditions.
 await page.goto(base+'/?checkIn='+IN+'&checkOut='+OUT+'&adults=2#stay/toya-manseikaku',{waitUntil:'networkidle'});await detail.locator('.booking-link-fields').waitFor({timeout:15000});await page.waitForTimeout(400);
 const kr=(await links())['Trip.com'].href;
 check('kr.trip.com 숙소 링크에도 날짜·인원이 들어감',kr.startsWith('https://kr.trip.com/hotels/toyako-hotel-detail-993419/')&&params(kr).checkIn===IN&&params(kr).checkOut===OUT&&params(kr).adult==='2',{kr});

 // D03: an untranslated description says there is no translation and none is scheduled.
 await page.goto(base+'/#stay/jalan-300001',{waitUntil:'networkidle'});await detail.locator('.description-caption').waitFor({timeout:15000});
 const caption=await detail.locator('.description-caption').innerText();
 check('번역 없는 설명: ‘자동으로 순차 반영’ 대신 번역 없음·정기 추가 없음을 알림',!caption.includes('자동')&&caption.includes('번역은 없습니다')&&caption.includes('정기적으로 추가되지 않습니다'),{caption});
}

const chromiumVersion=browser.version();
for(const [w,touch] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext(touch?{viewport:{width:w,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'}:{viewport:{width:w,height:800},locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(['127.0.0.1','localhost'].includes(host))return route.continue();if(['www.jalan.net','www.trip.com','kr.trip.com'].includes(host)&&route.request().resourceType()==='document')return route.fulfill({status:200,contentType:'text/html',body:'<title>stub</title>'});return route.abort()});
 const page=await context.newPage();
 try{await run(page,context,touch)}catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 await context.close();
}
await browser.close();
const failed=results.filter(result=>!result.pass);
if(evidence){
 writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:'360x780, 390x780 · isMobile · hasTouch · deviceScaleFactor 2; 1280x800 desktop mouse',dates:{checkIn:IN,checkOut:OUT,outOfRange:LONG},externalRequests:'blocked; Jalan and Trip.com documents get a local stub page',results,
  notCovered:['실제 모바일 기기와 기기의 날짜 선택기(터치 폭의 체크인은 칸을 누른 뒤 값을 넣음)','Jalan·Trip.com 실제 페이지가 날짜를 받아 들이는지(외부 요청 차단)','스크린리더 읽기 순서','운영 D1 자료(검사는 로컬 개발 DB와 체크인된 스냅샷 사용)']},null,1)+'\n');
}
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
