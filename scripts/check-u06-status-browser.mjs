// U06 data status screen in real Chromium (360·390px touch, 1280px mouse and keyboard),
// docs/U06-20261015.md and the parent session's answer of 2026-10-15T11:21Z:
// - it opens from the list's ‘자료 현황’ button, the header menu, the footer and #status, and
//   the back button, Esc and the close button close it (focus back on the opener);
// - every number on it is the served snapshot's status.json fill, written out here apart from
//   the component (share and grouping rules below); the source buttons switch the place rows;
// - each bar's parts are as wide as their counts (2px gaps, ±1.5px), the table view has the
//   same numbers, the tooltip on hover/focus/tap has all three counts;
// - no horizontal overflow, every control at least 44px tall, no Worker request while open;
// - loading, failure and retry (focus to the first heading), a snapshot without fill and an
//   empty collection each say what is going on.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start) and the isolated
// Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u06-status-browser.mjs [base] [evidence.json] [screenshot dir]
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const UA={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0 Safari/537.36'};
const manifest=await (await fetch(base+'/snapshot/manifest.json',{headers:UA})).json();
const status=await (await fetch(base+manifest.files.status,{headers:UA})).json();
const fill=status.fill;
if(!fill)throw new Error('The served status.json has no fill: rebuild with node scripts/prepare-local-site.mjs');
// The rules, written here apart from components/collection-status-sheet.tsx.
const n=v=>v.toLocaleString('ko-KR');
const share=(part,whole)=>{if(!whole)return '0%';const p=part/whole*100;return p>0&&p<0.1?'0.1% 미만':p.toFixed(1)+'%'};
const ROWS=['detail','bath','rooms','years','rating','photo','nameKo','descKo'];
const GEO=[[1,6],[2],[3],[4,5]],GEO_LABELS=['건물 위치','번지 블록','동네','넓은 범위'];
const SCOPES={all:'전체',jalan:'자란넷',trip:'Trip.com'};
const browser=await chromium.launch();
if(shots)mkdirSync(shots,{recursive:true});
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?780:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,200)));page.on('request',r=>requests.push(new URL(r.url()).pathname));
 const press=l=>mobile?l.tap():l.click();
 const sheet=page.locator('[role="dialog"].u06-sheet');
 const focused=()=>page.evaluate(()=>document.activeElement?.getAttribute('aria-label')||document.activeElement?.id||document.activeElement?.textContent?.trim().slice(0,30));
 const overflow=()=>page.evaluate(()=>{const s=document.querySelector('.u06-sheet');return{doc:document.documentElement.scrollWidth-innerWidth,sheet:s?s.scrollWidth-s.clientWidth:0}});
 await page.goto(base+'/',{waitUntil:'networkidle'});await page.waitForTimeout(300);

 // 1. The list's button.
 const opener=page.locator('.data-status-link');
 let before=requests.length;
 await press(opener);await sheet.locator('.u06-row').first().waitFor();
 await sheet.evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
 const place=await sheet.evaluate(e=>{const r=e.getBoundingClientRect();return{left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),vw:innerWidth}});
 check(`화면이 ${mobile?'휴대폰 폭 전체':'오른쪽 960px'}를 차지하고 화면 밖으로 나가지 않음`,place.right===place.vw&&place.left>=0&&(mobile?place.width===place.vw:place.width===960),place);
 check('목록 위 ‘자료 현황’ 버튼으로 화면이 열리고 주소가 #status, 초점은 닫기 버튼',await page.evaluate(()=>location.hash)==='#status'&&await focused()==='자료 현황 닫기',{hash:await page.evaluate(()=>location.hash),focus:await focused()});
 if(shots)await page.screenshot({path:join(shots,`status-${w}.png`)});

 // 2. Numbers against status.json, per source button.
 const read=()=>sheet.evaluate(root=>({
  hero:root.querySelector('.u06-hero b')?.textContent,heroSub:root.querySelector('.u06-hero span')?.textContent,
  scopeNote:root.querySelector('#u06-fill small')?.textContent,
  rows:Object.fromEntries([...root.querySelectorAll('.u06-row')].map(r=>[r.dataset.row,{strong:r.querySelector('.u06-head strong')?.textContent,text:r.querySelector('.u06-head span')?.textContent,label:r.getAttribute('aria-label')}])),
  pages:Object.fromEntries([...root.querySelectorAll('.u06-meter')].map(m=>[m.dataset.provider,m.querySelector('.u06-head span')?.textContent])),
  geo:[...root.querySelectorAll('.u06-geo-legend li')].map(li=>li.querySelector('b')?.textContent),
  pressed:[...root.querySelectorAll('.u06-scope button')].map(b=>b.getAttribute('aria-pressed')),
 }));
 const expectScope=key=>{const s=fill.scopes[key],located=GEO.map(g=>g.reduce((a,grade)=>a+(s.geo[grade]??0),0)),total=located.reduce((a,b)=>a+b,0);return{
  hero:share(s.rows.detail.filled,s.records),heroSub:`${n(s.rows.detail.filled)} / ${n(s.records)}곳`,scopeNote:`목록의 ${n(s.records)}곳 기준`,
  rows:Object.fromEntries(ROWS.map(k=>{const c=s.rows[k];return[k,{strong:share(c.filled,s.records),text:`${share(c.filled,s.records)} · ${n(c.filled)}곳`,counts:[c.filled,c.none,c.empty]}]})),
  geo:located.map((c,i)=>`${GEO_LABELS[i]} ${share(c,total)}`),
 }};
 for(const [key,label] of Object.entries(SCOPES)){
  await press(sheet.locator('.u06-scope button',{hasText:label}));
  const got=await read(),want=expectScope(key);
  const rowsOk=ROWS.every(k=>got.rows[k]?.text===want.rows[k].text&&got.rows[k].label.includes(`채움 ${n(want.rows[k].counts[0])}곳, 출처에 없음 ${n(want.rows[k].counts[1])}곳, 아직 비어 있음 ${n(want.rows[k].counts[2])}곳`));
  check(`${label} 단추: 큰 숫자·8줄·지도 위치가 status.json과 같고 단추가 눌린 상태`,got.hero===want.hero&&got.heroSub===want.heroSub&&got.scopeNote===want.scopeNote&&rowsOk&&JSON.stringify(got.geo)===JSON.stringify(want.geo)&&got.pressed[Object.keys(SCOPES).indexOf(key)]==='true',{got,want});
  // Bars: each part as wide as its count over the bar's width less the 2px gaps.
  const bars=await sheet.evaluate((root,rows)=>rows.map(k=>{const bar=root.querySelector(`.u06-row[data-row="${k}"] .u06-bar`),parts=[...bar.children];return{k,width:bar.getBoundingClientRect().width,parts:parts.map(p=>({cls:p.className,w:p.getBoundingClientRect().width}))}}),ROWS);
  const off=bars.flatMap(b=>{const c=want.rows[b.k].counts,classes=['u06-filled','u06-none','u06-empty'],shown=classes.filter((_,i)=>c[i]>0),free=b.width-2*(shown.length-1),total=c.reduce((a,v)=>a+v,0);
   if(b.parts.map(p=>p.cls).join()!==shown.join())return[{k:b.k,parts:b.parts.map(p=>p.cls),want:shown}];
   return b.parts.flatMap((p,i)=>{const want=c[classes.indexOf(p.cls)]/total*free;return Math.abs(p.w-want)>1.5?[{k:b.k,cls:p.cls,w:p.w,want}]:[]})});
  check(`${label} 단추: 막대 칸 폭이 수에 비례(±1.5px)하고 빈 칸은 그리지 않음`,off.length===0,{off});
 }
 const pagesGot=(await read()).pages;
 const pagesWant=Object.fromEntries(['jalan','trip'].map(p=>{const d=fill.pages[p].detail,total=d.done+d.pending+d.retry+d.failed;return[p,`${share(d.done,total)} · ${n(d.done)} / ${n(total)}쪽`]}));
 check('출처별 상세 페이지 미터가 status.json(완료/합계)과 같음',JSON.stringify(pagesGot)===JSON.stringify(pagesWant),{pagesGot,pagesWant});
 await press(sheet.locator('.u06-scope button',{hasText:'전체'}));

 // 3. Table view and tooltip.
 await press(sheet.getByRole('button',{name:'표로 보기'}));
 const table=await sheet.locator('.u06-table tbody tr').evaluateAll(rows=>rows.map(r=>[...r.children].map(c=>c.textContent)));
 const tableWant=ROWS.map((k,i)=>{const c=fill.scopes.all.rows[k];return[table[i]?.[0],n(c.filled),n(c.none),n(c.empty)]});
 const region=await sheet.locator('.u06-table-region').evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));
 check('표로 보기: 8줄의 세 칸 수가 같고 표가 화면 폭 안에 들어감',JSON.stringify(table)===JSON.stringify(tableWant)&&region.scroll<=region.client+1,{table,region});
 await press(sheet.getByRole('button',{name:'표 닫기'}));
 const row=sheet.locator('.u06-row[data-row="nameKo"]');
 if(mobile)await row.tap();else await row.hover();
 const tip=row.locator('.u06-tip');const c=fill.scopes.all.rows.nameKo;
 const tipText=await tip.isVisible()?await tip.innerText():'';
 check(`${mobile?'누르면':'마우스를 올리면'} 툴팁에 세 칸의 수가 모두 보임`,[c.filled,c.none,c.empty].every(v=>tipText.includes(n(v)+'곳')),{tipText});
 if(!mobile){await row.focus();check('키보드로 줄에 초점을 두어도 툴팁이 보임',await tip.isVisible())}

 // 4. Layout and targets.
 const of=await overflow();
 check('가로 넘침 없음(문서와 화면)',of.doc<=0&&of.sheet<=0,of);
 const small=await sheet.evaluate(root=>[...root.querySelectorAll('button,summary')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<44}).map(e=>e.textContent.trim().slice(0,20)||e.getAttribute('aria-label')));
 const outside=await page.evaluate(()=>['.data-status-link','.u06-nav','.u06-open'].map(s=>{const e=document.querySelector(s),r=e?.getBoundingClientRect();return{s,h:r?Math.round(r.height):null,visible:!!r&&r.width>0}}));
 check('화면 안 조작과 여는 버튼이 모두 높이 44px 이상',small.length===0&&outside.every(o=>!o.visible||o.h>=44),{small,outside});
 const api=requests.slice(before).filter(p=>p.startsWith('/api/'));
 check('화면을 연 동안 Worker 요청 없음(/api/ 0건)',api.length===0,{api});

 // 5. Closing: Esc (keyboard) or the close button (touch); focus back on the list's button.
 if(mobile)await sheet.getByRole('button',{name:'자료 현황 닫기'}).tap();else await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 check(`${mobile?'닫기 버튼':'Esc'}로 닫히고 주소의 #status가 빠지며 초점이 목록 위 버튼으로 돌아감`,await page.evaluate(()=>location.hash)===''&&await page.evaluate(()=>document.activeElement?.classList.contains('data-status-link')),{hash:await page.evaluate(()=>location.hash),focus:await focused()});

 // 6. The header menu, then the back button.
 const nav=page.locator('.u06-nav');
 if(await nav.isVisible()){
  if(mobile)await nav.tap();else{await nav.focus();await page.keyboard.press('Enter')}
  await sheet.locator('.u06-row').first().waitFor();
  await page.goBack();await sheet.waitFor({state:'detached'});
  check('머리 메뉴로 열고 뒤로 가기로 닫힘',await page.evaluate(()=>location.hash)==='',{hash:await page.evaluate(()=>location.hash)});
 }else check('머리 메뉴 ‘자료 현황’이 보임',false);
 // 7. The footer: on a short result, as the whole list keeps loading as the footer comes near.
 await page.goto(base+'/?q='+encodeURIComponent('노보리베츠'),{waitUntil:'networkidle'});
 const footer=page.locator('.u06-open');
 await footer.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await press(footer);
 await sheet.locator('.u06-row').first().waitFor();
 check('바닥글 ‘수집 현황 자세히 보기’로 열림',await sheet.isVisible());
 await sheet.getByRole('button',{name:'자료 현황 닫기'}).click();await sheet.waitFor({state:'detached'});
 // 8. The address.
 await page.goto(base+'/#status',{waitUntil:'networkidle'});
 check('주소 /#status로 들어오면 화면이 열림',await sheet.locator('.u06-row').first().waitFor({timeout:5000}).then(()=>true,()=>false));
 await page.goto(base+'/',{waitUntil:'networkidle'});

 // 9. Loading, failure and retry.
 await page.route('**/snapshot/v/*/status.json',async route=>{await new Promise(done=>setTimeout(done,1200));await route.continue()});
 await press(opener);
 check('받는 중 안내',await sheet.getByText('자료 현황을 불러오는 중').waitFor({timeout:1000}).then(()=>true,()=>false));
 await sheet.locator('.u06-row').first().waitFor();await page.unroute('**/snapshot/v/*/status.json');
 await sheet.getByRole('button',{name:'자료 현황 닫기'}).click();await sheet.waitFor({state:'detached'});
 await page.route('**/snapshot/v/*/status.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"test"}'}));
 await press(opener);
 const alert=sheet.getByRole('alert');await alert.waitFor();
 check('받지 못하면 오류 안내와 ‘다시 시도’만 보이고 숫자는 그리지 않음',await sheet.locator('.u06-row').count()===0&&(await alert.innerText()).includes('다시 시도'));
 const retry=sheet.getByRole('button',{name:'다시 시도'});
 await page.unroute('**/snapshot/v/*/status.json');
 if(mobile)await retry.tap();else{await retry.focus();await page.keyboard.press('Enter')}
 await sheet.locator('.u06-row').first().waitFor();await alert.waitFor({state:'detached'});await page.waitForTimeout(100);
 check('다시 시도에 성공하면 오류 안내가 사라지고 초점이 첫 제목으로 옮겨 감',await focused()==='u06-detail',{focus:await focused()});
 await sheet.getByRole('button',{name:'자료 현황 닫기'}).click();await sheet.waitFor({state:'detached'});
 // 10. A snapshot without fill, and an empty collection.
 const withoutFill={...status};delete withoutFill.fill;
 await page.route('**/snapshot/v/*/status.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(withoutFill)}));
 await press(opener);
 check('채움 현황이 없는 검색 자료는 그렇다고 알림',await sheet.getByText('채움 현황이 없습니다',{exact:false}).waitFor({timeout:3000}).then(()=>true,()=>false));
 await sheet.getByRole('button',{name:'자료 현황 닫기'}).click();await sheet.waitFor({state:'detached'});await page.unroute('**/snapshot/v/*/status.json');
 const zero=s=>({...s,records:0,rows:Object.fromEntries(ROWS.map(k=>[k,{filled:0,none:0,empty:0}])),geo:s.geo.map(()=>0),staleTranslations:0});
 const empty={...status,fill:{...fill,scopes:{all:zero(fill.scopes.all),jalan:zero(fill.scopes.jalan),trip:zero(fill.scopes.trip)}}};
 await page.route('**/snapshot/v/*/status.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(empty)}));
 await press(opener);
 check('수집 기록이 없으면 빈 기록 안내',await sheet.getByText('아직 저장된 수집 기록이 없습니다',{exact:false}).waitFor({timeout:3000}).then(()=>true,()=>false));
 await page.unroute('**/snapshot/v/*/status.json');
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
const chromiumVersion=browser.version();
await browser.close();
const failed=results.filter(r=>!r.pass);
console.log(`${results.length-failed.length}/${results.length} passed`);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,snapshot:manifest.id,chromium:chromiumVersion,passed:results.length-failed.length,total:results.length,results},null,1)+'\n');
process.exitCode=failed.length?1:0;
