// U05 comparison (PR 6) in real Chromium (360·390px touch, 1280px mouse and keyboard), docs/U05-20261013.md 8.5:
// - on a phone four candidates fit side by side without moving sideways: a 120px label column and
//   one narrow column per stay, each cell a mark (✓ – ?) or a short value read from the comparison
//   response (written here apart from the page); the full cells are hidden;
// - a row's ‘근거’ (or a tap on its cells) opens each stay's full cell below the row, with its date
//   and source, and closes again; the button says whether it is open;
// - D04/D05 rows: room count (kinds compared only when both state them) and opening/renovation
//   years. Known different values are ‘다름’; a stay without a value is held back (U03), never the
//   same or different;
// - a wide screen keeps the full cells (no marks, no ‘근거’ buttons).
// The rooms and years are added to the local comparison response here (the local data has none).
// External images get a blank stand-in; other external requests are blocked.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-comparison-browser.mjs [base] [evidence.json] [screenshot dir]
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const FOUR=['noboribetsu-grand','takinoya','bourou-noboribetsu','daiichi-takimotokan'];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAMBAEBjgkz0wAAAABJRU5ErkJggg==','base64');
// Stated values, as the crawler stores them: takinoya with kinds, bourou with the same total but
// no kinds, daiichi with another total and both years; noboribetsu-grand with none.
const STATED={
 takinoya:{rooms:{total:120,byType:{western:10,japanese:100,japaneseWestern:10,other:0}},years:{opened:1958}},
 'bourou-noboribetsu':{rooms:{total:120},years:{opened:1958}},
 'daiichi-takimotokan':{rooms:{total:390},years:{opened:1858,renovated:2019}},
};
function addStated(h){
 const s=STATED[h.id];if(!s)return h;
 const sourceId=h.sources[0].sourceId;
 h.rooms={...s.rooms,sourceId,verifiedAt:'2026-10-05',note:'check'};
 h.facilityYears={...s.years,sourceId,verifiedAt:'2026-10-06',note:'check'};
 return h;
}
// The mark a phone cell shows, written here apart from components/hotel-comparison.tsx.
function expectedMarks(h){
 const score=p=>{const r=h.ratings.find(r=>r.provider===p&&!r.isMock&&r.scale===(p==='trip'?10:5));return r?r.score.toFixed(1):'?'};
 const fact=k=>{const f=h.features[k];return !f||f.value===null?'?':f.value===false?'–':'✓'+(f.scope==='someRooms'?'일부':f.scope==='allRooms'?'전':'')};
 return {trip:score('trip'),jalan:score('jalan'),natural:fact('natural'),outdoor:fact('outdoor'),privateBath:fact('privateBath'),roomOnsen:fact('roomOnsen'),rooms:h.rooms?String(h.rooms.total):'?',opened:h.facilityYears?.opened?String(h.facilityYears.opened):'?',renovated:h.facilityYears?.renovated?String(h.facilityYears.renovated):'?'};
}
const ROWS={trip:'Trip.com · 10점',jalan:'자란넷 · 5점',natural:'천연온천',outdoor:'노천탕',privateBath:'전세탕 / 가족탕',roomOnsen:'객실 온천',rooms:'객실 수',opened:'설립 연도',renovated:'리모델링 연도'};
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?780:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.request().resourceType()==='image'?route.fulfill({status:200,contentType:'image/png',body:PNG}).catch(()=>{}):route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=locator=>mobile?locator.tap():locator.click();
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${w}-${name}.png`})};
 let api=null;
 await page.route(/\/api\/hotel-comparison/,async route=>{const response=await route.fetch();const data=await response.json();data.hotels.forEach(addStated);api=data;await route.fulfill({response,json:data})});
 const sheet=page.locator('.hotel-comparison');
 const open=async ids=>{
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.evaluate(ids=>localStorage.setItem('yukemuri-comparison-v1',JSON.stringify(ids)),ids);
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await press(page.locator('.comparison-dock').getByRole('button',{name:/곳 비교$/}));
  await sheet.locator('.comparison-table tbody tr').first().waitFor({timeout:15000});await page.waitForTimeout(500);
 };
 // Each body row: its label, tag, and per stay the mark shown, its spoken word and whether the
 // full cell shows.
 const read=()=>sheet.evaluate(root=>{
  const visible=e=>!!e&&e.checkVisibility();
  const region=root.querySelector('.comparison-table-region'),box=e=>{const r=e.getBoundingClientRect();return{left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)}};
  const heads=[...root.querySelectorAll('.comparison-table thead th')].map(box);
  const rows=[...root.querySelectorAll('.comparison-table tbody tr:not(.comparison-evidence)')].map(tr=>{const th=tr.querySelector('th');return{name:th.firstChild.textContent.trim(),diff:!!th.querySelector('.comparison-diff-tag'),undecided:th.querySelector('.comparison-undecided')?.textContent??'',
   button:th.querySelector('.comparison-expand')&&visible(th.querySelector('.comparison-expand'))?{expanded:th.querySelector('.comparison-expand').getAttribute('aria-expanded'),h:Math.round(th.querySelector('.comparison-expand').getBoundingClientRect().height),w:Math.round(th.querySelector('.comparison-expand').getBoundingClientRect().width)}:null,
   cells:[...tr.querySelectorAll('td')].map(td=>{const m=td.querySelector('.comparison-mark');return{mark:visible(m)?[...m.querySelectorAll('[aria-hidden=true]')].map(e=>e.textContent).join(''):null,said:m?.querySelector('.sr-only')?.textContent??null,full:visible(td.querySelector('.comparison-full')),h:Math.round(m?.getBoundingClientRect().height??0)}})}});
  const evidence=[...root.querySelectorAll('.comparison-evidence')].filter(visible).map(tr=>({id:tr.id,items:[...tr.querySelectorAll('li')].map(li=>({name:li.querySelector('b').textContent,text:li.textContent,links:[...li.querySelectorAll('a')].map(a=>a.href)}))}));
  const names=[...root.querySelectorAll('.comparison-hotel-name')].map(b=>({h:Math.round(b.getBoundingClientRect().height),lines:Math.round(b.scrollHeight/parseFloat(getComputedStyle(b).lineHeight))}));
  const removes=[...root.querySelectorAll('.comparison-remove')].map(box);
  return{fit:{scroll:region.scrollWidth,client:region.clientWidth},heads,rows,evidence,names,removes,overflow:root.scrollWidth-root.clientWidth};
 });

 await open(FOUR);
 let s=await read();await shot('four');
 const byId=new Map(api.hotels.map(h=>[h.id,h])),want=Object.fromEntries(Object.keys(ROWS).map(k=>[k,FOUR.map(id=>expectedMarks(byId.get(id))[k])]));
 const shown=Object.fromEntries(Object.entries(ROWS).map(([k,name])=>[k,s.rows.find(r=>r.name===name)?.cells.map(c=>c.mark)]));
 if(mobile){
  check('휴대폰: 4곳이 가로 이동 없이 한 화면(이름표 열 120px, 숙소 열 52px 이상), 시트 가로 넘침 없음',s.fit.scroll<=s.fit.client&&Math.abs(s.heads[0].w-120)<=1&&s.heads.slice(1).every(h=>h.w>=52)&&s.overflow<=0,{fit:s.fit,heads:s.heads.map(h=>h.w),overflow:s.overflow});
  check('휴대폰: 칸마다 표지(✓ – ?)나 짧은 값이 응답 값과 같고(없음 2곳인 전세탕 포함), 전체 칸은 숨음',same(shown,want)&&want.privateBath.includes('–')&&s.rows.every(r=>r.cells.every(c=>c.mark!==null&&!c.full&&c.said)),{shown,want});
  check('휴대폰: 숙소 이름은 두 줄까지(44px), 빼기 버튼 44px, ‘근거’ 버튼 44×44px 이상',s.names.every(n=>n.h<=44&&n.h>=44-1)&&s.removes.every(b=>b.w>=44&&b.h>=44)&&s.rows.every(r=>r.button&&r.button.h>=44&&r.button.w>=44),{names:s.names,removes:s.removes,buttons:s.rows.map(r=>[r.button?.w,r.button?.h])});
  // Open a row by tapping one of its cells; close it with its ‘근거’ button.
  const roomRow=sheet.locator('.comparison-table tbody tr',{has:page.locator('th',{hasText:'객실 수'})}).first();
  await roomRow.scrollIntoViewIfNeeded();await roomRow.locator('td').nth(1).tap();await page.waitForTimeout(300);
  s=await read();await shot('rooms-open');
  const ev=s.evidence[0],taki=ev?.items.find(i=>i.name===byId.get('takinoya').names.ko),grand=ev?.items.find(i=>i.name===byId.get('noboribetsu-grand').names.ko);
  check('칸을 누르면 그 행 아래에 숙소마다 전체 칸(값·종류·확인일·출처)이 열리고 버튼이 열림 상태',ev?.id==='comparison-evidence-rooms'&&ev.items.length===4&&taki?.text.includes('120실')&&taki.text.includes('양실 10실 · 화실 100실 · 화양실 10실')&&taki.text.includes('확인 2026-10-05')&&taki.links.length===1&&grand?.text.includes('확인 필요')&&s.rows.find(r=>r.name==='객실 수').button.expanded==='true',{ev,button:s.rows.find(r=>r.name==='객실 수').button});
  await roomRow.locator('.comparison-expand').tap();await page.waitForTimeout(300);s=await read();
  check('‘근거’ 버튼으로 다시 닫힘',s.evidence.length===0&&s.rows.find(r=>r.name==='객실 수').button.expanded==='false',{evidence:s.evidence.length});
 }else{
  check('데스크톱: 전체 칸을 그대로 보이고 표지·‘근거’ 버튼은 없음',s.rows.every(r=>r.cells.every(c=>c.mark===null&&c.full))&&s.rows.every(r=>!r.button)&&s.overflow<=0,{sample:s.rows.slice(0,2)});
  const roomCells=await sheet.locator('.comparison-table tbody tr',{has:page.locator('th',{hasText:'객실 수'})}).first().locator('td').allInnerTexts();
  check('데스크톱: 객실 수 칸에 값·종류·확인일·출처, 없는 숙소는 확인 필요',roomCells[0].includes('확인 필요')&&roomCells[1].includes('120실')&&roomCells[1].includes('양실 10실')&&roomCells[1].includes('확인 2026-10-05')&&roomCells[3].includes('390실'),{roomCells});
  // Keyboard: the evidence button is not there, so Tab never lands on a hidden control.
  await sheet.locator('.comparison-table-region').focus();
  check('데스크톱: 비교표에 키보드 초점이 감(가로 이동 영역)',await page.evaluate(()=>document.activeElement?.classList.contains('comparison-table-region')),{});
 }
 // D04/D05 rows: known different totals and years are ‘다름’; a single known renovation year is held back.
 const row=name=>s.rows.find(r=>r.name===name);
 check('객실 수(120·120·390, 하나는 미확인)와 설립 연도(1958·1958·1858)는 다름, 리모델링 연도(하나만 있음)는 판단 보류 · 미확인 3곳',row('객실 수')?.diff&&row('설립 연도')?.diff&&!row('리모델링 연도')?.diff&&row('리모델링 연도')?.undecided==='판단 보류 · 미확인 3곳',{rooms:row('객실 수'),opened:row('설립 연도'),renovated:row('리모델링 연도')});
 // Same total, kinds stated by one only: held back, not called the same.
 await open(['takinoya','bourou-noboribetsu']);
 s=await read();await shot('two');
 check('같은 객실 수(120·120)라도 한쪽만 종류를 밝히면 판단 보류 · 미확인 1곳, 같은 설립 연도(1958)는 표지 없음',!row('객실 수')?.diff&&row('객실 수')?.undecided==='판단 보류 · 미확인 1곳'&&!row('설립 연도')?.diff&&!row('설립 연도')?.undecided,{rooms:row('객실 수'),opened:row('설립 연도')});
 if(mobile){
  // Keyboard on a phone width too: Enter on ‘근거’ opens and closes.
  const button=sheet.locator('.comparison-table tbody tr',{has:page.locator('th',{hasText:'설립 연도'})}).first().locator('.comparison-expand');
  await button.focus();await page.keyboard.press('Enter');await page.waitForTimeout(200);const opened=await button.getAttribute('aria-expanded');
  await page.keyboard.press('Enter');await page.waitForTimeout(200);const closed=await button.getAttribute('aria-expanded');
  check('키보드 Enter로 ‘근거’를 열고 닫음(초점은 버튼에 남음)',opened==='true'&&closed==='false'&&await page.evaluate(()=>document.activeElement?.classList.contains('comparison-expand')),{opened,closed});
 }
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
const version=browser.version();
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,browser:'Chromium '+version,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
