// U07 in-place translation in real Chromium (390px touch, 1280px mouse), docs/U07-20261019.md.
// The browser's Translator API is replaced here by a stand-in with the documented shape
// (availability, create with a download monitor, translate), so the page's own handling is
// what is checked, not Chrome's model:
// - a browser that is not Chrome or Edge shows a note and no button, and is never asked to
//   translate (a Chromium build without the service ended the page); the original keeps its own
//   lang; Chrome that cannot translate the pair (unavailable, or a refused question) shows a note
//   of its own, which does not send the visitor to Chrome or Edge;
// - Chrome (checked at 390px) or Edge (at 1280px) with the pair available shows a 44px button,
//   the model's size and never the note, not even for a frame while it asks the browser; pressing
//   it shows the
//   download progress, then the translation under the original, marked as the browser's, in
//   Korean, line by line; the original stays; ‘번역 닫기’ hides it; the status line says it is
//   done; on the wide screen the button is pressed with the keyboard and the focus stays on it
//   (‘번역 닫기’ once the translation is there, the translate button again once it is closed);
// - a failed translation says so and offers ‘다시 시도’, which works;
// - a stay whose description is already Korean shows neither button nor note;
// - closing the sheet while the model downloads aborts the signal given to create(), and leaves no
//   translator behind: the one made after that is destroyed and never translates;
// - an English description has lang="en", asks for the English pair and gives the one-pack size.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u07-translate-browser.mjs [base] [evidence.json] [screenshot folder]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-u07-translate-'));
let needsKoreanDescription;
try{({needsKoreanDescription}=createRequire(import.meta.url)(compileLib(temp,'lib/hotel-description.ts')))}finally{rmSync(temp,{recursive:true,force:true})}
// A stay whose description needs Korean (Japanese, in the checked-in catalogue the local site
// loads) and one whose description is already Korean. Picked from the file, not by asking the
// detail API of every stay: the local Worker limits detail requests per address (H02).
const catalogue=JSON.parse(readFileSync(new URL('../lib/hotels.crawled.json',import.meta.url),'utf8'));
const manifest=await (await fetch(base+'/snapshot/manifest.json')).json(),core=await (await fetch(base+manifest.files.core)).json(),listed=new Set(core.ids);
const pick=want=>catalogue.find(h=>listed.has(h.id)&&h.description&&needsKoreanDescription(h.description)===want);
const foreign=pick(true),korean=pick(false);
if(!foreign||!korean)throw new Error('No checked-in stay for the translation checks');
// The detail the page receives carries that description in two lines (no checked-in description
// has a line break), so the translation line by line is what is judged.
const described=foreign.description.trim()+'\n客室は全室和室です。';
// The same stay with an English description (the catalogue has none), for the English pair.
const english='A quiet hot spring inn by the river.\nAll rooms are Japanese style.';
// The stand-in: brands, availability and translation are set per run through window.__u07.
const standIn=({brand,availability,fail})=>{
 Object.defineProperty(Navigator.prototype,'userAgentData',{configurable:true,get:()=>({brands:[{brand,version:'141'}],mobile:false,platform:'Linux'})});
 const log=window.__u07={availability:0,create:0,created:0,destroyed:0,translate:[],fail,sawUnsupported:false};
 // Whether the unsupported note ever showed, even for a frame (a supported browser must not see it).
 new MutationObserver(()=>{if(document.body?.textContent.includes('바로 번역을 쓸 수 없습니다'))log.sawUnsupported=true}).observe(document,{subtree:true,childList:true,characterData:true});
 window.Translator={
  availability:async o=>{log.availability++;log.pair=o.sourceLanguage+'>'+o.targetLanguage;if(availability==='reject')throw new DOMException('stand-in refusal','NotSupportedError');return availability},
  create:async o=>{log.create++;log.activation=navigator.userActivation?.isActive??null;
   if(log.fail){log.fail--;throw new DOMException('stand-in failure','NetworkError')}
   const target=new EventTarget();o.monitor?.(target);
   for(const loaded of [0,0.5]){const e=new Event('downloadprogress');e.loaded=loaded;target.dispatchEvent(e);await new Promise(r=>setTimeout(r,400))}
   // Made even when the page has gone in the meantime (the signal is not honoured), so the page
   // itself must destroy it; whether the page passed a signal and aborted it is recorded.
   log.created++;log.signalAborted=o.signal?.aborted??null;
   return{translate:async t=>{log.translate.push(t);return '번역: '+t.slice(0,12)},destroy:()=>{log.destroyed++}};
  },
 };
};
const browser=await chromium.launch();
for(const [w,mobile] of [[390,true],[1280,false]]){
 width=w;
 const open=async(page,id)=>{
  await page.goto(base+'/?q='+encodeURIComponent(id===foreign.id?foreign.names.ja:korean.names.ja),{waitUntil:'networkidle'});
  const card=page.locator(`[id="card-${id}"] .card-title`);
  await (mobile?card.tap():card.click());await page.waitForTimeout(1500);
  return page.locator('.hotel-description');
 };
 const context=async(init,description=described)=>{const c=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});await c.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));await c.route(url=>url.pathname==='/api/hotels/'+foreign.id,async route=>{const response=await route.fetch();const hotel=await response.json();hotel.description=description;await route.fulfill({response,json:hotel})});if(init)await c.addInitScript(standIn,init);return c};
 // 1. Not Chrome or Edge (this Chromium names itself ‘Chromium’): a note, no button, never asked.
 {
  const c=await context(null),page=await c.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e)));
  const d=await open(page,foreign.id);
  const r={note:await d.locator('.translate-note').textContent().catch(()=>null),buttons:await d.locator('.translate-button').count(),original:await d.locator('.hotel-intro').first().textContent(),lang:await d.locator('.hotel-intro').first().getAttribute('lang')};
  if(shots)await d.screenshot({path:join(shots,`translate-unsupported-${w}.png`)});
  check('Chrome·Edge가 아닌 브라우저: 번역 단추 없이 ‘이 브라우저에서는 바로 번역을 쓸 수 없습니다’를 보이고 원문은 그대로(lang="ja"), 페이지 오류 없음',/쓸 수 없습니다/.test(r.note??'')&&r.buttons===0&&r.original.trim()===described&&r.lang==='ja'&&errors.length===0,{...r,errors});
  await c.close();
 }
 // 2. Chrome that cannot translate the pair (says unavailable on the phone width, refuses on the
 // wide one): a note of its own, which does not send it to Chrome or Edge.
 {
  const c=await context({brand:'Google Chrome',availability:mobile?'unavailable':'reject',fail:0}),page=await c.newPage();
  const d=await open(page,foreign.id);
  const r={note:await d.locator('.translate-note').textContent().catch(()=>null),buttons:await d.locator('.translate-button').count(),log:await page.evaluate(()=>window.__u07)};
  if(shots)await d.screenshot({path:join(shots,`translate-unavailable-${w}.png`)});
  check(`Chrome이 언어 쌍을 못 하면(${mobile?'unavailable':'availability() 거절'}) 단추 없이 ‘이 브라우저에서는 이 설명을 번역할 수 없습니다’(Chrome·Edge로 보내지 않음)`,/이 설명을 번역할 수 없습니다/.test(r.note??'')&&!/Chrome·Edge에서는/.test(r.note??'')&&r.buttons===0&&r.log.availability===1&&r.log.pair==='ja>ko',r);
  await c.close();
 }
 // 3. Chrome on the phone width, Edge on the wide one (each brand opens the button), downloadable:
 // the button, the progress, the translation under the original.
 {
  const brand=mobile?'Google Chrome':'Microsoft Edge';
  const c=await context({brand,availability:'downloadable',fail:1}),page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const d=await open(page,foreign.id),button=d.locator('.translate-button');
  // A page without the button (a build from before U07) fails here and goes on, as a control.
  if(!await button.count()){check(`${brand}: 번역 단추(44px)가 원문 아래에 있고 누르면 번역이 원문 아래에 붙음`,false,{buttons:0});await c.close();continue}
  const box=await button.boundingBox(),label=await button.textContent(),flashed=await page.evaluate(()=>window.__u07.sawUnsupported),readyNote=await d.locator('.translate-note').first().textContent().catch(()=>null);
  if(shots)await d.screenshot({path:join(shots,`translate-ready-${w}.png`)});
  // The first press fails (the stand-in's network error), the second works.
  // The phone taps; the wide screen presses Enter on the focused button (a keyboard user's path).
  const press=async()=>{if(mobile)await button.tap();else{await button.focus();await page.keyboard.press('Enter')}};
  await press();await page.waitForTimeout(400);
  const failed={note:await d.locator('.translate-note[role=status]').textContent().catch(()=>null),label:await button.textContent()};
  check(`${brand}: 번역 단추(44px)가 원문 아래에 있고(‘쓸 수 없습니다’ 안내는 한 번도 보이지 않고, 모델 크기 약 110MB를 알림), 실패하면 ‘번역하지 못했습니다’와 ‘다시 시도’`,!flashed&&/약 110MB/.test(readyNote??'')&&/이 자리에서 한국어로 번역/.test(label)&&box.height>=44&&/번역하지 못했습니다/.test(failed.note??'')&&/다시 시도/.test(failed.label),{label,box,failed,flashed,readyNote});
  await press();
  // The stand-in reports 0% at once and 50% after 0.4s, then finishes 0.4s later.
  let progress=null;for(let t=0;t<12&&!/50%/.test(progress??'');t++){await page.waitForTimeout(50);progress=await d.locator('.translate-note[role=status]').textContent().catch(()=>null)}
  if(shots)await d.screenshot({path:join(shots,`translate-progress-${w}.png`)});
  await page.waitForTimeout(1200);
  const done=await page.evaluate(()=>{const d=document.querySelector('.hotel-description'),t=d.querySelector('.browser-translation .hotel-intro');return{original:d.querySelector('.hotel-intro').textContent,translation:t?.textContent??null,lang:t?.getAttribute('lang')??null,caption:d.querySelector('.browser-translation .description-caption')?.textContent??null,order:t?!!(d.querySelector('.hotel-intro').compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING):false,log:window.__u07}});
  const lines=described.split('\n'),want=lines.map(l=>l.trim()?'번역: '+l.slice(0,12):'').join('\n');
  if(shots)await d.screenshot({path:join(shots,`translate-done-${w}.png`)});
  check('다시 누르면 번역 모델 받는 진행률을 보인 뒤, 원문 아래에 ‘브라우저 번역’ 표시와 함께 한국어 번역(줄마다)이 붙고 원문은 그대로',/번역 모델을 받는 중 50%/.test(progress??'')&&done.translation===want&&done.lang==='ko'&&/브라우저 번역/.test(done.caption??'')&&done.order&&done.original.trim()===described&&done.log.create===2&&done.log.activation===true&&done.log.translate.length===lines.filter(l=>l.trim()).length&&errors.length===0,{progress,done:{...done,original:undefined},want});
  // Where the keyboard's focus is once the translation arrives, and what the status line says.
  const focused=()=>page.evaluate(()=>document.activeElement?.matches('.translate-button')?document.activeElement.textContent.trim():'(not the button: '+(document.activeElement?.tagName??'none')+')');
  const focusDone=await focused(),announced=await d.locator('[role=status]').allTextContents();
  // The wide screen closes with the keyboard when the focus is on ‘번역 닫기’, else with a click
  // (so the close check below still judges the closing).
  if(!mobile&&/번역 닫기/.test(focusDone))await page.keyboard.press('Enter');
  else await (mobile?d.locator('.translate-button',{hasText:'번역 닫기'}).tap():d.locator('.translate-button',{hasText:'번역 닫기'}).click());
  await page.waitForTimeout(200);
  const focusClosed=await focused();
  check(mobile?'번역이 붙으면 상태 줄이 ‘번역을 원문 아래에 붙였습니다’를 알림':'키보드: 번역이 붙은 뒤 포커스가 ‘번역 닫기’에, 닫은 뒤 ‘이 자리에서 한국어로 번역’에 남고, 상태 줄이 완료를 알림',announced.some(t=>/원문 아래에 붙였습니다/.test(t))&&(mobile||/번역 닫기/.test(focusDone)&&/이 자리에서 한국어로 번역/.test(focusClosed)),{focusDone,focusClosed,announced});
  check('‘번역 닫기’로 번역이 사라지고 원문과 번역 단추가 남음',await d.locator('.browser-translation .hotel-intro').count()===0&&await d.locator('.translate-button',{hasText:'이 자리에서 한국어로 번역'}).count()===1);
  await c.close();
 }
 // 4. A description already in Korean: no button, no note.
 {
  const c=await context({brand:'Google Chrome',availability:'available',fail:0}),page=await c.newPage();
  const d=await open(page,korean.id);
  check('설명이 이미 한국어인 숙소에는 번역 단추도 안내도 없음',await d.locator('.translate-button').count()===0&&await d.locator('.translate-note').count()===0&&await page.evaluate(()=>window.__u07.availability)===0);
  await c.close();
 }
 // 5. The sheet closes while the model downloads: the signal given to create() is aborted, and the
 // translator made after that is destroyed and never asked to translate.
 {
  const c=await context({brand:'Google Chrome',availability:'downloadable',fail:0}),page=await c.newPage();
  const d=await open(page,foreign.id),button=d.locator('.translate-button');
  if(await button.count()){await (mobile?button.tap():button.click());await page.waitForTimeout(150);await page.keyboard.press('Escape');await page.waitForTimeout(1500)}
  const log=await page.evaluate(()=>window.__u07),open_=await page.locator('.hotel-description').count();
  check('모델을 받는 중 상세를 닫으면 create()에 넘긴 신호가 중단되고, 그 뒤 만들어진 번역기는 정리되고(destroy) 번역에 쓰이지 않음',open_===0&&log.create===1&&log.created===1&&log.signalAborted===true&&log.destroyed===1&&log.translate.length===0,{log:{create:log.create,created:log.created,signalAborted:log.signalAborted,destroyed:log.destroyed,translate:log.translate},open:open_});
  await c.close();
 }
 // 6. An English description (Chrome, downloadable): its own lang, the English pair, the size of
 // its one language pack.
 {
  const c=await context({brand:'Google Chrome',availability:'downloadable',fail:0},english),page=await c.newPage();
  const d=await open(page,foreign.id);
  const r={original:await d.locator('.hotel-intro').first().textContent(),lang:await d.locator('.hotel-intro').first().getAttribute('lang'),readyNote:await d.locator('.translate-note').first().textContent().catch(()=>null),pair:await page.evaluate(()=>window.__u07.pair??null)};
  check('영어 설명: 원문은 lang="en"이고 영어→한국어 쌍(en>ko)으로 물음',r.original.trim()===english&&r.lang==='en'&&r.pair==='en>ko',r);
  check('영어 설명: 단추 아래 안내가 모델 크기 약 57MB를 알림(일본어의 약 110MB가 아님)',/약 57MB/.test(r.readyNote??'')&&!/110MB/.test(r.readyNote??''),r);
  await c.close();
 }
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,stays:{foreign:foreign.id,korean:korean.id},results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
