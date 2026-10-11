// U03 comparison differences in real Chromium: 360px and 390px with touch and keyboard,
// 1280px with a mouse and keyboard. Rows whose known values differ carry a "다름" text tag,
// rows with unknowns are held back rather than called the same or different, and the
// "다른 항목만 보기" toggle keeps focus, announces its state and leaves the U01 sheet focus intact.
// Needs a running portable dev server and the isolated Playwright install in docs/ui-u01-20261010.md.
// Uses the checked-in snapshot: the four Noboribetsu records, a record with nothing confirmed
// (jalan-305378) and an ID that has no record. External requests are blocked.
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
const FOUR=['noboribetsu-grand','takinoya','bourou-noboribetsu','daiichi-takimotokan'];
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

async function run(page,touch){
 const press=async locator=>touch?locator.tap():locator.click();
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${width}-${name}.png`})};
 const focused=()=>page.evaluate(()=>{const e=document.activeElement;return e?.getAttribute('aria-label')||e?.innerText?.trim().split('\n')[0].slice(0,40)||e?.tagName});
 const sheet=page.locator('.hotel-comparison'),toggle=sheet.getByRole('button',{name:'다른 항목만 보기'});
 // Each body row: its name, its tag and whether it is marked as differing.
 const rows=()=>sheet.locator('.comparison-table tbody tr').evaluateAll(trs=>trs.map(tr=>{const th=tr.querySelector('th');return {name:th?.firstChild?.textContent?.trim()??'',diff:!!th?.querySelector('.comparison-diff-tag'),tag:th?.querySelector('.comparison-diff-tag')?.textContent??'',undecided:th?.querySelector('.comparison-undecided')?.textContent??'',marked:tr.classList.contains('comparison-row-diff'),text:tr.innerText.slice(0,80)}}));
 const open=async ids=>{
  await page.evaluate(ids=>localStorage.setItem('yukemuri-comparison-v1',JSON.stringify(ids)),ids);
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await press(page.locator('.comparison-dock').getByRole('button',{name:/곳 비교$/}));
  await sheet.locator('.comparison-table').waitFor({timeout:10000});await page.waitForTimeout(400);
 };

 await page.goto(base+'/',{waitUntil:'networkidle'});
 // Four candidates.
 await open(FOUR);
 check('비교를 열면 닫기 버튼에 포커스(U01 유지)',await focused()==='숙소 비교 닫기',{focus:await focused()});
 let all=await rows();
 const differing=all.filter(r=>r.diff).map(r=>r.name);
 check('후보 4곳: 확인된 값이 다른 행에만 ‘다름’ 글자 표지(Trip.com·자란넷·내 검증 기준·객실 온천)',same(differing,['Trip.com · 10점','자란넷 · 5점','내 검증 기준','객실 온천'])&&all.every(r=>r.diff===r.marked&&(!r.diff||r.tag.includes('다름'))),{differing,rows:all.map(r=>[r.name,r.tag,r.undecided])});
 const privateBath=all.find(r=>r.name==='전세탕 / 가족탕'),natural=all.find(r=>r.name==='천연온천'),reference=all.filter(r=>['Google Maps · 5점','주소','온천수 안내'].includes(r.name));
 check('없음 2곳과 미확인 2곳은 다름이 아니라 판단 보류 · 미확인 2곳',!!privateBath&&!privateBath.diff&&privateBath.undecided==='판단 보류 · 미확인 2곳',{privateBath});
 check('모두 확인되고 같은 행(천연온천)과 참고 행(Google Maps·주소·온천수 안내)은 표지 없음',!!natural&&!natural.diff&&!natural.undecided&&reference.length===3&&reference.every(r=>!r.diff&&!r.undecided),{natural,reference});
 const summary=await sheet.locator('.comparison-diff-bar p').innerText();
 check('요약: 값이 다른 항목 4개 · 미확인으로 판단 보류 9개',summary==='값이 다른 항목 4개 · 미확인으로 판단 보류 9개',{summary});
 await toggle.scrollIntoViewIfNeeded();
 const toggleBox=await toggle.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,vw:innerWidth,vh:innerHeight,reachable:!!hit&&(hit===e||e.contains(hit))}});
 check('전환 버튼이 화면 안에 있고 가려지지 않으며 높이 44px 이상',toggleBox.left>=0&&toggleBox.right<=toggleBox.vw&&toggleBox.top>=0&&toggleBox.bottom<=toggleBox.vh&&toggleBox.reachable&&toggleBox.height>=44,toggleBox);
 await shot('four-all');
 await press(toggle);await page.waitForTimeout(300);
 let shown=await rows();
 const live=()=>sheet.locator('.comparison-diff-bar [aria-live]').innerText();
 check(`${touch?'터치':'클릭'}로 켜면 다름 행 4개만 남고 aria-pressed·포커스·알림 문장이 맞음`,await toggle.getAttribute('aria-pressed')==='true'&&same(shown.map(r=>r.name),differing)&&shown.every(r=>r.diff)&&await focused()==='다른 항목만 보기'&&await live()==='다른 항목 4개만 표시 중',{shown:shown.map(r=>r.name),pressed:await toggle.getAttribute('aria-pressed'),focus:await focused(),live:await live()});
 const hidden=await sheet.locator('.comparison-diff-hidden').innerText();
 check('숨긴 수 안내: 같거나 판단 보류 12개와 참고 항목 3개',hidden.includes('12개')&&hidden.includes('참고 항목 3개'),{hidden});
 await shot('four-diff');
 await toggle.focus();await page.keyboard.press('Space');await page.waitForTimeout(300);
 const offRows=(await rows()).length;
 check('Space로 끄면 모든 행(19행)이 돌아오고 포커스가 버튼에 남음',await toggle.getAttribute('aria-pressed')==='false'&&offRows===all.length&&all.length===19&&await focused()==='다른 항목만 보기'&&await live()==='모든 항목 표시 중',{offRows,focus:await focused(),live:await live()});
 await page.keyboard.press('Enter');await page.waitForTimeout(300);
 check('Enter로 다시 켬',await toggle.getAttribute('aria-pressed')==='true'&&(await rows()).length===4,{rows:(await rows()).length});
 // U01: Tab stays inside the sheet with the new control in it.
 let inside=true;for(let i=0;i<25;i++){await page.keyboard.press('Tab');if(!await page.evaluate(()=>!!document.activeElement?.closest('.hotel-comparison'))){inside=false;break}}
 check('Tab 포커스가 시트 안에서 순환(U01 유지)',inside);
 // Removing candidates while the toggle is on: focus moves to the next remove button, the rows are
 // judged again and the live sentence follows the new count, not the count of the last press.
 const removeAt=async index=>{await sheet.locator('.comparison-remove').nth(index).focus();await page.keyboard.press('Enter');await page.waitForTimeout(800)};
 await removeAt(1);
 const afterRemove=await focused(),threeRows=await rows();
 check('켠 채로 후보를 빼면 다음 제거 버튼에 포커스(U01 유지)·남은 3곳으로 다시 판정',/비교에서 빼기$/.test(afterRemove)&&(await sheet.locator('.comparison-remove').count())===3&&threeRows.every(r=>r.diff),{focus:afterRemove,rows:threeRows.map(r=>r.name)});
 await removeAt(2);
 const pairRows=await rows(),pairLive=await live();
 check('켠 채로 2곳(같은 Trip.com 점수)만 남으면 다름 1행(자란넷)만 보이고 알림 문장이 새 개수(1개)를 말함',same(pairRows.map(r=>r.name),['자란넷 · 5점'])&&pairLive==='다른 항목 1개만 표시 중',{rows:pairRows.map(r=>r.name),live:pairLive});
 await removeAt(0);
 const oneRows=await rows();
 check('후보가 1곳이 되면 전환 버튼과 표지가 사라지고 모든 행이 보임',await toggle.count()===0&&oneRows.length===19&&oneRows.every(r=>!r.diff&&!r.undecided),{toggle:await toggle.count(),rows:oneRows.length});
 await page.keyboard.press('Escape');await page.waitForTimeout(600);
 check('Escape로 닫으면 비교 시트가 닫히고 비교 열기 버튼에 포커스(U01 유지)',await sheet.count()===0&&(await focused()).startsWith('숙소 비교 열기'),{focus:await focused()});

 // Two candidates: equal Trip.com scores are not marked; an unknown against a scope is held back.
 await open(['noboribetsu-grand','bourou-noboribetsu']);
 const two=await rows(),twoDiff=two.filter(r=>r.diff).map(r=>r.name);
 const roomOnsen=two.find(r=>r.name==='객실 온천'),trip=two.find(r=>r.name==='Trip.com · 10점');
 check('후보 2곳: 같은 Trip.com 점수(8.9·8.9)는 표지 없음, 자란넷(4.2·4.5)은 다름',!!trip&&!trip.diff&&!trip.undecided&&twoDiff.includes('자란넷 · 5점'),{twoDiff});
 check('후보 2곳: 미확인과 전 객실은 판단 보류 · 미확인 1곳',!!roomOnsen&&!roomOnsen.diff&&roomOnsen.undecided==='판단 보류 · 미확인 1곳',{roomOnsen});
 await shot('two');
 // Almost nothing confirmed and a missing record: no row is called different.
 await open(['noboribetsu-grand','jalan-305378','jalan-0000001']);
 const sparse=await rows();
 check('확인된 값이 거의 없는 기록·기록 없는 ID: 다름 0개, 판단할 행은 모두 판단 보류',sparse.every(r=>!r.diff)&&sparse.filter(r=>r.undecided).length===16&&(await sheet.locator('.comparison-diff-bar p').innerText())==='값이 다른 항목 0개 · 미확인으로 판단 보류 16개'&&(await sheet.getByText('기록 없음').count())>0,{undecided:sparse.filter(r=>r.undecided).map(r=>[r.name,r.undecided])});
 await press(toggle);await page.waitForTimeout(300);
 const noneText=await sheet.locator('.comparison-diff-none').innerText().catch(()=>'');
 check('다름이 0개일 때 켜면 ‘확인된 값이 다른 항목이 없습니다’와 미확인 비판단 안내',noneText.includes('확인된 값이 다른 항목이 없습니다')&&noneText.includes('미확인'),{noneText});
 await shot('sparse-diff');
 const overflow=await sheet.evaluate(e=>e.scrollWidth-e.clientWidth);
 check('비교 시트 가로 넘침 없음',overflow<=0,{overflow});
}

const chromiumVersion=browser.version();
for(const [w,touch] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext(touch?{viewport:{width:w,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'}:{viewport:{width:w,height:800},locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 try{await run(page,touch)}catch(error){check('검사 중단',false,{error:String(error).slice(0,500)})}
 await context.close();
}
await browser.close();
const failed=results.filter(result=>!result.pass);
if(evidence){
 writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:'360x780, 390x780 · isMobile · hasTouch · deviceScaleFactor 2; 1280x800 desktop mouse',externalRequests:'blocked',results,
  notCovered:['실제 모바일 기기','스크린리더 읽기 순서(표지는 행 머리 글자로 확인)','운영 D1 자료(검사는 로컬 개발 DB와 체크인된 스냅샷 사용)']},null,1)+'\n');
}
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
