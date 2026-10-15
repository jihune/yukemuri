// U05 detail (PR 5) in real Chromium (360·390px touch, 1280px mouse and keyboard), docs/U05-20261013.md 8.4:
// - the summary: photos stepped through with previous/next (the credit follows the photo), the Korean
//   and Japanese names, the ratings and the six bath columns (the rule written here apart from
//   lib/bath-columns.ts); on a phone the six columns are on the first screen, above the action bar;
// - ‘탕 상세’: every bath condition once, confirmed ones in their groups (전망 욕탕 among the shared
//   baths), the unconfirmed ones folded under ‘확인 전 N개 보기’; nothing confirmed is one sentence
//   and the Jalan facility page;
// - ‘객실과 시설’ (D05, D04): the room count and its kinds, the opening year, a missing year as
//   ‘확인 필요’, room types and photos per source, Trip.com first, each photo credited like the
//   representative photo and each set linked to its source; a stay without them says ‘확인 필요’;
// - the action bar stays at the bottom: Jalan and Trip.com links, favourite, compare; the date and
//   guest fields open above it and go into the two links;
// - a detail API failure other than 404 (503, network, 429) keeps the sheet open with the stay's
//   snapshot card and ‘자세한 정보를 지금 불러올 수 없습니다’, also when the stay was opened by its
//   address and the failure came before the snapshot; ‘다시 시도’ brings the full detail and
//   moves focus to the name. The loading notice shows while the request is pending.
// The rooms, years and room photos are added to the local detail response here (the local data has
// none); room photos and every other external image get a blank stand-in, other external requests
// are blocked. Each width asks the detail API four times (it allows 30 a minute); the failures
// are answered here.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-detail-browser.mjs [base] [evidence.json] [screenshot dir]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base);
// A stay with Trip.com and Jalan sources and two photos, and one with neither source id.
const ID='jalan-327522',BARE='daiichi-takimotokan';
const card=id=>search.snapshot.cards[search.snapshot.position.get(id)];
// For the address race: a stay well past the static first page (the list's 40).
const LATE=search.snapshot.cards[search.order('')[400]],onFirstPage=search.list('').hotels.some(h=>h.id===LATE.id);
if(!card(ID)||!card(BARE))throw new Error('The local snapshot lacks '+ID+' or '+BARE);
const types=readFileSync(new URL('../lib/hotel-types.ts',import.meta.url),'utf8');
const LABELS=Object.fromEntries([...types.slice(types.indexOf('CORE_FEATURE_LABELS'),types.indexOf('export const FEATURE_LABELS')).matchAll(/(\w+):\s*'([^']+)'/g)].map(m=>[m[1],m[2]]));
// The six columns, written here apart from lib/bath-columns.ts (as in check-u05-list-browser).
const COLUMNS=[
 ['천연온천',['natural'],['natural']],
 ['노천탕',['outdoor','communalOutdoor','privateOutdoor'],['outdoor']],
 ['전세탕',['privateBath','privateOutdoor'],['privateBath']],
 ['객실탕',['roomOnsen','roomIndoorOnsen','roomOutdoorOnsen','roomOutdoor'],['roomOnsen','roomOutdoor']],
 ['카케나가시',['freeFlow'],['freeFlow']],
 ['니고리유',['nigori'],['nigori']],
];
const value=(h,k)=>h.features?.[k]?.value??null;
const expected=h=>COLUMNS.map(([label,keys,base])=>{
 const yes=keys.filter(k=>value(h,k)===true);
 const state=yes.length?'yes':base.every(k=>value(h,k)===false)?'no':'unknown';
 const scope=label==='객실탕'&&yes.length?yes.some(k=>h.features[k].scope==='allRooms')?'전 객실':yes.some(k=>h.features[k].scope==='someRooms')?'일부':'':'';
 return {label,state,scope};
});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAMBAEBjgkz0wAAAABJRU5ErkJggg==','base64');
const tripPhoto=i=>`https://ak-d.tripcdn.com/images/u05check/t${i}.jpg`,jalanPhoto=i=>`https://cdn.jalan.jp/jalan/img/u05check/j${i}.jpg`;
// D05/D04 values the way the crawler stores them. The Jalan set comes first here; the page puts
// Trip.com's first. Trip.com: four named types (Korean, as D05 found) of three photos; Jalan: ten
// unnamed photos with Japanese captions.
function withRooms(h){
 const trip=h.sources.find(s=>s.sourceId.startsWith('trip-')),jalan=h.sources.find(s=>s.sourceId.startsWith('jalan-'));
 h.rooms={total:123,byType:{western:10,japanese:100,japaneseWestern:13,other:0},sourceId:jalan.sourceId,verifiedAt:'2026-10-05',note:'자란 객실 수 표: check'};
 h.facilityYears={opened:1858,sourceId:trip.sourceId,verifiedAt:'2026-10-06',note:'Trip.com 숙소 정보: check'};
 h.roomTypes=[
  {sourceId:jalan.sourceId,verifiedAt:'2026-10-05',items:[{name:null,photos:[0,1,2,3,4,5].map(i=>({url:jalanPhoto(i),caption:i%2?'':'和室10畳'}))},{name:null,photos:[6,7,8,9].map(i=>({url:jalanPhoto(i),caption:'露天風呂付客室'}))}]},
  {sourceId:trip.sourceId,verifiedAt:'2026-10-06',items:['주니어 스위트 (본관)','화실 10조','양실 트윈','노천탕 딸린 화양실'].map((name,t)=>({name,photos:[0,1,2].map(j=>({url:tripPhoto(t*3+j),caption:''}))}))},
 ];
 h.features.viewBath={value:true,sourceId:jalan.sourceId,verifiedAt:'2026-10-05'};
 return h;
}
// Every bath fact unconfirmed, Jalan's grade confirmed (the crawler can store the grade while
// leaving the baths empty).
function unconfirmed(h){for(const fact of Object.values(h.features))if(fact){fact.value=null;fact.verifiedAt=null}h.features.jalanHighClass={value:true,sourceId:h.id,verifiedAt:'2026-10-05'};return h}
const BATH_LABELS=Object.entries(LABELS).filter(([k])=>k!=='jalanHighClass').map(([,label])=>label).sort();
const FAILURES={360:'503',390:'network',1280:'429'};
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?780:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 const images=[];
 await context.route(url=>!url.href.startsWith(base),route=>{if(route.request().resourceType()==='image'){images.push(route.request().url());return route.fulfill({status:200,contentType:'image/png',body:PNG}).catch(()=>{})}return route.abort().catch(()=>{})});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=locator=>mobile?locator.tap():locator.click();
 const shot=async name=>{if(shots)await page.screenshot({path:`${shots}/${w}-${name}.png`})};
 // What the detail API answers: the local response with rooms added, as it is, with every bath
 // fact unconfirmed, or a failure after a pause (so the loading notice can be seen).
 let mode='rooms',api=null;
 await page.route(/\/api\/hotels\/[^/?#]+(?:\?.*)?$/,async route=>{
  if(mode==='race'){failedAt=Date.now();return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'잠시 후 다시 시도해 주세요.'})}).catch(()=>{})}
  if(mode==='fail'){await new Promise(r=>setTimeout(r,1200));const kind=FAILURES[w];return(kind==='network'?route.abort('failed'):route.fulfill({status:Number(kind),contentType:'application/json',body:JSON.stringify({error:'잠시 후 다시 시도해 주세요.'})})).catch(()=>{})}
  const response=await route.fetch().catch(e=>{errors.push('detail fetch: '+String(e).slice(0,120));return null});
  if(!response)return route.abort().catch(()=>{});
  let h=await response.json();
  if(mode==='rooms')h=withRooms(h);else if(mode==='unknown')h=unconfirmed(h);
  api=h;await route.fulfill({response,json:h});
 });
 const detail=page.locator('.hotel-detail');
 const open=async id=>{await page.goto(base+'/#stay/'+id,{waitUntil:'networkidle'});await detail.locator('.detail-actions').waitFor({timeout:20000});await page.waitForTimeout(500)};
 const read=()=>page.evaluate(()=>{
  const d=document.querySelector('.hotel-detail'),box=e=>{if(!e)return null;const b=e.getBoundingClientRect();return{top:Math.round(b.top),bottom:Math.round(b.bottom),left:Math.round(b.left),right:Math.round(b.right),h:Math.round(b.height),w:Math.round(b.width)}};
  const visible=e=>!!e&&e.checkVisibility();
  const bath=d.querySelector('[aria-labelledby=detail-bath-title]'),rooms=d.querySelector('[aria-labelledby=detail-rooms-title]');
  const fact=e=>({label:e.querySelector('span').textContent,value:e.querySelector('b').textContent,group:e.closest('.bath-detail-group')?.querySelector('h3')?.textContent,folded:!!e.closest('details'),shown:visible(e),small:[...e.querySelectorAll('small:not(.fact-origin)')].map(s=>s.textContent),origin:[...e.querySelectorAll('.fact-origin')].map(o=>({text:o.textContent,href:o.querySelector('a')?.href??null}))});
  return{
   title:d.querySelector('[data-slot=sheet-title]')?.textContent,grade:d.querySelector('.detail-summary .highclass-tag')?.textContent??null,names:[...d.querySelectorAll('.detail-name p')].map(p=>({lang:p.lang,text:p.textContent})),
   ratings:d.querySelectorAll('.detail-summary .detail-rating').length,
   cells:[...d.querySelectorAll('.detail-cells .bath-cell')].map(li=>({label:li.querySelector('.bath-label').textContent,state:(li.className.match(/is-(\w+)/)||[])[1],scope:li.querySelector('small')?.textContent??''})),
   photo:{counter:d.querySelector('.photo-nav>span')?.textContent.replace('사진 ','')??null,credit:d.querySelector('.detail-image .photo-source-credit')?.textContent??null},
   bath:bath?{children:[...bath.children].map(e=>e.tagName.toLowerCase()+(e.className?'.'+e.className:'')),facts:[...bath.querySelectorAll('.feature-fact')].map(fact),fold:bath.querySelector('.unknown-facts>summary')?.textContent??null,open:!!bath.querySelector('.unknown-facts')?.open,unknown:bath.querySelector('.bath-unknown')?.textContent??null,unknownLink:bath.querySelector('.bath-unknown a')?.href??null}:null,
   rooms:rooms?{facts:[...rooms.querySelectorAll('.feature-fact')].map(fact),missing:rooms.querySelector('.facts-unknown')?.textContent??null,
    sets:[...rooms.querySelectorAll('.room-set')].map(s=>({title:s.querySelector('h3').textContent,origin:{text:s.querySelector(':scope>.fact-origin').textContent,href:s.querySelector(':scope>.fact-origin a')?.href??null},
     types:[...s.querySelectorAll('.room-list b')].map(b=>({name:b.textContent,shown:visible(b),photos:b.parentElement.querySelectorAll('figure').length})),
     photos:[...s.querySelectorAll('figure')].map(f=>({src:f.querySelector('img')?.getAttribute('src')??null,credit:f.querySelector('.photo-source-credit').textContent,caption:f.querySelector('figcaption')?.textContent??'',lang:f.querySelector('figcaption')?.lang??'',shown:visible(f)})),
     more:[...s.querySelectorAll('.room-more>summary')].map(m=>m.textContent)}))}:null,
   body:!!d.querySelector('.detail-body'),unavailable:d.querySelector('.detail-unavailable p')?.textContent??null,
   bar:{box:box(d.querySelector('.detail-actions')),row:box(d.querySelector('.detail-action-row')),toggle:d.querySelector('.booking-toggle')?{expanded:d.querySelector('.booking-toggle').getAttribute('aria-expanded'),text:d.querySelector('.booking-toggle span').textContent}:null,
    panel:{shown:visible(d.querySelector('.detail-actions .booking-link-fields')),box:box(d.querySelector('.detail-actions .booking-link-fields'))},
    links:[...d.querySelectorAll('.detail-action-link')].map(a=>({text:a.textContent,label:a.getAttribute('aria-label'),href:a.href})),
    controls:[...d.querySelectorAll('.detail-actions a,.detail-actions button')].filter(visible).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),...box(e)})),
    heart:d.querySelector('.detail-heart')?.getAttribute('aria-label')??null,compare:d.querySelector('.detail-compare')?.getAttribute('aria-pressed')??null},
   sheet:box(d),lead:box(d.querySelector('.detail-lead')),main:box(d.querySelector('.detail-body')),cellsBox:box(d.querySelector('.detail-cells')),
   overflow:[...d.querySelectorAll('.detail-scroll,.detail-actions')].map(e=>e.scrollWidth-e.clientWidth),
   focus:document.activeElement?.getAttribute('data-slot')??document.activeElement?.tagName,
  }});

 // 1. The full detail with rooms, years and room photos.
 mode='rooms';await open(ID);await shot('rooms-top');
 let s=await read();const h=api,c=card(ID);
 check('요약: 한국어 이름 제목과 일본어 이름 한 줄(영어 이름은 이름 칸에 없음), 출처별 평점',s.title===c.names.ko&&same(s.names,[{lang:'ja',text:c.names.ja}])&&s.ratings===h.ratings.filter(r=>r.provider==='trip'||r.provider==='jalan').length&&s.ratings>0,{title:s.title,names:s.names,ratings:s.ratings});
 check('요약의 탕 6칸이 상세 응답으로 따로 계산한 값과 같음',same(s.cells,expected(h)),{cells:s.cells,want:expected(h)});
 if(mobile)check('휴대폰: 시트가 화면 너비 전체이고 6칸이 첫 화면에서 실행 막대 위에 보임',s.sheet.w===w&&s.cellsBox.bottom<=s.bar.box.top,{sheet:s.sheet,cells:s.cellsBox,bar:s.bar.box});
 else check('데스크톱: 오른쪽 시트 720px, 요약은 왼쪽 단·상세는 오른쪽 단',Math.abs(s.sheet.w-720)<=1&&s.sheet.right===w&&s.lead.right<=s.main.left&&s.lead.top===s.main.top,{sheet:s.sheet,lead:s.lead,main:s.main});
 // Photos: previous/next, wrapping, the credit following the photo shown.
 const next=detail.getByRole('button',{name:'다음 사진'}),before=s.photo;
 if(mobile)await next.tap();else{await next.focus();await page.keyboard.press('Enter')}
 await page.waitForTimeout(300);const second=(await read()).photo;
 if(mobile)await next.tap();else await page.keyboard.press('Enter');
 await page.waitForTimeout(300);const third=(await read()).photo;
 check(`사진 넘기기(${mobile?'터치':'키보드 Enter'}): 1/2 Trip.com → 2/2 Jalan → 처음으로, 출처 표기가 사진을 따라감`,before.counter==='1/2'&&before.credit==='Trip.com'&&second.counter==='2/2'&&second.credit==='Jalan'&&third.counter==='1/2'&&third.credit==='Trip.com',{before,second,third});
 // The bath detail: every condition once, unconfirmed ones folded.
 const labels=s.bath.facts.map(f=>f.label).sort(),folded=s.bath.facts.filter(f=>f.folded),shown=s.bath.facts.filter(f=>!f.folded);
 check(`탕 상세: 탕 조건 ${BATH_LABELS.length}개가 한 번씩, 확인된 것만 펼쳐 보이고 나머지는 ‘확인 전 ${folded.length}개 보기’로 접힘, 자란 등급은 요약에(값이 있음일 때만)`,same(labels,BATH_LABELS)&&s.grade===(h.features.jalanHighClass?.value===true?'자란 하이클래스':null)&&s.bath.fold===`확인 전 ${folded.length}개 보기`&&!s.bath.open&&folded.length>0&&folded.every(f=>f.value==='확인 필요'&&!f.shown)&&shown.every(f=>f.value!=='확인 필요'&&f.shown),{labels,grade:s.grade,fold:s.bath.fold,folded:folded.map(f=>f.label),shown:shown.map(f=>f.label+' '+f.value)});
 const view=s.bath.facts.find(f=>f.label===LABELS.viewBath);
 check('전망 욕탕(D05)이 ‘공용·전세 목욕 시설’ 묶음에 ‘있음’으로 보임(6칸에는 없음)',view&&!view.folded&&view.group==='공용·전세 목욕 시설'&&view.value.includes('있음')&&!s.cells.some(x=>x.label===LABELS.viewBath),{view});
 const summary=detail.locator('.unknown-facts>summary');await summary.scrollIntoViewIfNeeded();
 if(mobile)await summary.tap();else{await summary.focus();await page.keyboard.press('Enter')}
 await page.waitForTimeout(300);s=await read();
 check(`‘확인 전’ 접기를 ${mobile?'터치':'키보드 Enter'}로 펼치면 미확인 항목이 보임`,s.bath.open&&s.bath.facts.filter(f=>f.folded).every(f=>f.shown),{open:s.bath.open});
 // Rooms and years.
 const trip=h.sources.find(x=>x.sourceId.startsWith('trip-')),jalan=h.sources.find(x=>x.sourceId.startsWith('jalan-'));
 const count=s.rooms.facts.find(f=>f.label==='객실 수'),opened=s.rooms.facts.find(f=>f.label==='설립 연도');
 check('객실과 시설: 객실 수 123실과 종류(0실 종류 생략), 설립 1858년, 출처는 대표 사진처럼 출처 이름과 그 페이지, 확인일',count?.value.includes('123실')&&same(count.small,['양실 10실 · 화실 100실 · 화양실 13실'])&&same(count.origin,[{text:'Jalan ↗ · 확인 2026-10-05',href:jalan.url}])&&opened?.value.includes('1858년')&&same(opened.origin,[{text:'Trip.com ↗ · 확인 2026-10-06',href:trip.url}]),{count,opened});
 check('없는 리모델링 연도는 ‘확인 필요’(오래됐다고 하지 않음)',s.rooms.missing==='리모델링 연도: 확인 필요'&&!s.rooms.facts.some(f=>f.label==='리모델링 연도'),{missing:s.rooms.missing});
 const [tripSet,jalanSet]=s.rooms.sets;
 check('객실 사진: Trip.com이 먼저, 타입 이름 3개와 사진 3장씩, 넷째 타입은 ‘객실 타입 1개 더 보기’ 안, 사진마다 ‘Trip.com’ 표기',s.rooms.sets.length===2&&tripSet.title==='Trip.com 객실 타입'&&same(tripSet.origin,{text:'Trip.com ↗ · 확인 2026-10-06',href:trip.url})&&same(tripSet.types.map(t=>[t.name,t.shown,t.photos]),[['주니어 스위트 (본관)',true,3],['화실 10조',true,3],['양실 트윈',true,3],['노천탕 딸린 화양실',false,3]])&&same(tripSet.more,['객실 타입 1개 더 보기'])&&tripSet.photos.every(p=>p.credit==='Trip.com'),{tripSet});
 const jalanShown=jalanSet?.photos.filter(p=>p.shown)??[];
 check('Jalan 객실 사진: 이름 없는 사진 6장을 한 묶음으로, 나머지 4장은 ‘사진 4장 더 보기’ 안, ‘Jalan’ 표기와 일본어 설명(lang=ja)',jalanSet?.title==='Jalan 객실 사진'&&same(jalanSet.origin,{text:'Jalan ↗ · 확인 2026-10-05',href:jalan.url})&&jalanSet.photos.length===10&&jalanShown.length===6&&same(jalanSet.more,['사진 4장 더 보기'])&&jalanSet.photos.every(p=>p.credit==='Jalan')&&jalanSet.photos.filter(p=>p.caption).every(p=>p.lang==='ja')&&jalanSet.photos[0].caption==='和室10畳',{jalanSet});
 // Folded photos are not fetched until opened.
 const room=detail.locator('[aria-labelledby=detail-rooms-title]');await room.locator('.room-set').last().scrollIntoViewIfNeeded();await page.waitForTimeout(600);await shot('rooms-photos');
 const foldedUrls=[6,7,8,9].map(jalanPhoto),early=images.filter(u=>foldedUrls.includes(u)).length;
 const more=room.locator('.room-more>summary',{hasText:'사진 4장 더 보기'});
 if(mobile)await more.tap();else{await more.focus();await page.keyboard.press('Enter')}
 await page.waitForTimeout(300);await room.locator('.room-more[open] figure').last().scrollIntoViewIfNeeded();await page.waitForTimeout(800);
 check('접힌 객실 사진은 펼치기 전에는 받지 않고, 펼치면 받음',early===0&&foldedUrls.every(u=>images.includes(u)),{early,after:images.filter(u=>foldedUrls.includes(u)).length});
 // The action bar stays at the bottom while the detail scrolls.
 await detail.locator('.detail-scroll').evaluate(e=>{e.scrollTop=e.scrollHeight});await page.waitForTimeout(300);
 s=await read();
 const jalanLink=h.links.find(l=>l.provider==='jalan'),tripLink=h.links.find(l=>l.provider==='trip');
 check('실행 막대: 끝까지 내려도 시트 아래에 고정, Jalan 열기·Trip.com 열기(저장된 주소)·즐겨찾기·비교, 모두 44px 이상이고 화면 안',Math.abs(s.bar.box.bottom-s.sheet.bottom)<=1&&same(s.bar.links.map(l=>[l.text,l.href]),[['Jalan 열기',jalanLink.url],['Trip.com 열기',tripLink.url]])&&s.bar.heart&&s.bar.compare==='false'&&s.bar.controls.length>=5&&s.bar.controls.every(x=>x.h>=44&&x.top>=0&&x.bottom<=s.sheet.bottom&&x.left>=s.sheet.left&&x.right<=s.sheet.right),{bar:s.bar,sheet:s.sheet});
 // Dates and guests: they open above the bar and go into its two links.
 check('날짜·인원은 처음에 접혀 있음(고르지 않음)',s.bar.toggle?.expanded==='false'&&!s.bar.panel.shown&&s.bar.toggle.text==='고르지 않음',{toggle:s.bar.toggle,panel:s.bar.panel});
 const toggle=detail.locator('.booking-toggle');
 if(mobile)await toggle.tap();else{await toggle.focus();await page.keyboard.press('Enter')}
 await page.waitForTimeout(300);
 const day=offset=>{const [y,m,d]=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date()).split('-').map(Number);return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10)};
 const IN=day(30),OUT=day(32),md=x=>Number(x.slice(5,7))+'.'+Number(x.slice(8,10));
 await page.locator('#detail-'+ID+'-in').fill(IN);await page.locator('#detail-'+ID+'-out').fill(OUT);await page.waitForTimeout(300);
 s=await read();await shot('dates');
 const [jalanDated,tripDated]=s.bar.links.map(l=>new URL(l.href));
 check('‘날짜·인원’을 펼치면 칸이 막대 위에 열리고, 고른 날짜가 막대의 두 링크와 요약에 들어감',s.bar.toggle.expanded==='true'&&s.bar.panel.shown&&s.bar.panel.box.bottom<=s.bar.row.top&&s.bar.toggle.text===`${md(IN)}–${md(OUT)} · 성인 2명`&&jalanDated.pathname.endsWith('/plan/')&&jalanDated.searchParams.get('stayCount')==='2'&&tripDated.searchParams.get('checkIn')===IN&&s.bar.links.every(l=>l.label.endsWith('고른 날짜·인원 포함')),{toggle:s.bar.toggle,panel:s.bar.panel.box,row:s.bar.row,links:s.bar.links});
 const compare=detail.locator('.detail-compare');
 await press(compare);await page.waitForTimeout(200);const added=await read(),stored=await page.evaluate(id=>Object.values(localStorage).some(v=>v.includes(id)),ID);
 await press(compare);await page.waitForTimeout(200);const removed=await read();
 check('막대의 비교 버튼으로 비교 후보에 담고 뺌',added.bar.compare==='true'&&stored&&removed.bar.compare==='false',{added:added.bar.compare,stored,removed:removed.bar.compare});
 check('상세·막대 가로 넘침 없음',s.overflow.every(x=>x<=0),{overflow:s.overflow});

 // 2. A stay without rooms, years or room photos.
 mode='bare';await open(BARE);s=await read();
 check('객실 정보가 없는 숙소: ‘객실 수 · 설립 연도 · 리모델링 연도: 확인 필요’ 한 줄, 객실 사진 없음',s.rooms.missing==='객실 수 · 설립 연도 · 리모델링 연도: 확인 필요'&&s.rooms.facts.length===0&&s.rooms.sets.length===0&&s.bath.facts.find(f=>f.label===LABELS.viewBath)?.folded===true,{rooms:s.rooms});

 // 3. Nothing about the baths confirmed: one sentence and the Jalan facility page.
 mode='unknown';await open(ID);s=await read();await shot('unknown');
 check('탕 정보가 모두 확인 전(자란 등급만 있음): 제목 아래 한 문장과 Jalan 시설 안내 링크만(접기·온천 종류·등급 블록 없음), 등급은 요약에, 6칸 모두 ?',same(s.bath.children,['h2','p.bath-unknown'])&&s.grade==='자란 하이클래스'&&s.bath.unknown==='이 숙소의 탕 정보는 아직 확인하지 못했습니다. Jalan 시설 안내 ↗'&&s.bath.unknownLink===api.sources.find(x=>x.sourceId.startsWith('jalan-')).url&&s.bath.fold===null&&s.bath.facts.length===0&&s.cells.every(x=>x.state==='unknown'),{grade:s.grade,bath:s.bath,cells:s.cells.map(x=>x.state)});

 // 4. Opened by its address before the snapshot arrives: the detail fails first, the sheet waits
 // for the snapshot's card instead of closing (the stay is not on the static first page).
 mode='race';let failedAt=0,cardsAt=0;
 const cardsFile=/\/snapshot\/v\/[^/]+\/cards\.json$/;
 await page.route(cardsFile,async route=>{await new Promise(r=>setTimeout(r,2500));cardsAt=Date.now();await route.continue().catch(()=>{})});
 await page.goto(base+'/#stay/'+LATE.id,{waitUntil:'domcontentloaded'});
 const waited=await detail.locator('.detail-unavailable').waitFor({timeout:15000}).then(()=>true,()=>false);
 s=waited?await read():null;await page.unroute(cardsFile);
 check('첫 쪽에 없는 숙소를 주소로 열고 스냅숏보다 상세 실패가 먼저 와도 시트를 닫지 않고 스냅숏 카드를 보임',!onFirstPage&&waited&&failedAt>0&&cardsAt>failedAt&&s.title===LATE.names.ko&&same(s.cells,expected(LATE)),{id:LATE.id,onFirstPage,waited,failedBeforeCards:cardsAt-failedAt,title:s?.title,sheet:await detail.count()});

 // 5. Loading, a failure other than 404, and the retry.
 mode='fail';const pending=page.goto(base+'/#stay/'+ID,{waitUntil:'networkidle'});
 const loading=await page.locator('.toast-message',{hasText:'숙소 상세를 불러오는 중…'}).waitFor({timeout:5000}).then(()=>true,()=>false);
 await pending;const kept=await detail.locator('.detail-unavailable').waitFor({timeout:15000}).then(()=>true,()=>false);
 if(!kept){check(`상세 API 실패(${FAILURES[w]})에도 시트가 열린 채 스냅숏 카드를 보임`,false,{sheet:await detail.count(),toast:await page.locator('.toast-message').allInnerTexts(),hash:new URL(page.url()).hash});check('페이지 오류 없음',errors.length===0,{errors});await context.close();continue}
 await page.waitForTimeout(400);s=await read();await shot('failed');
 check(`불러오는 동안 안내가 보이고, 상세 API 실패(${FAILURES[w]})에도 시트는 열린 채 스냅숏 카드로 이름·평점·6칸과 ‘불러올 수 없음’ 안내(한 단)`,loading&&s.unavailable?.startsWith('자세한 정보를 지금 불러올 수 없습니다')&&s.title===c.names.ko&&same(s.cells,expected(c))&&s.ratings===c.ratings.filter(r=>r.provider==='trip'||r.provider==='jalan').length&&!s.body&&s.bar.links.length===0&&!s.bar.toggle&&s.bar.heart&&Math.abs(s.lead.w-s.sheet.w)<=1&&new URL(page.url()).hash==='#stay/'+ID,{loading,lead:s.lead,unavailable:s.unavailable,title:s.title,cells:s.cells,body:s.body,bar:s.bar.links,hash:new URL(page.url()).hash});
 mode='real';
 const retry=detail.getByRole('button',{name:'다시 시도'});
 if(mobile)await retry.tap();else{await retry.focus();await page.keyboard.press('Enter')}
 await detail.locator('.detail-body').waitFor({timeout:15000});await page.waitForTimeout(400);s=await read();
 check(`‘다시 시도’(${mobile?'터치':'키보드 Enter'})로 전체 상세를 불러오고 초점은 숙소 이름으로`,s.body&&!s.unavailable&&s.focus==='sheet-title'&&s.bar.links.length===2,{body:s.body,focus:s.focus});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
const version=browser.version();
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,browser:'Chromium '+version,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
