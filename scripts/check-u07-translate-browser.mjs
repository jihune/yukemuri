// U07 in-place translation in real Chromium (390px touch, 1280px mouse), docs/U07-20261019.md.
// The browser's Translator API is replaced here by a stand-in with the documented shape
// (availability, create with a download monitor, translate), so the page's own handling is
// what is checked, not Chrome's model:
// - a browser that is not Chrome or Edge, or says the pair is unavailable, shows a note and no
//   button, and is never asked to translate (a Chromium build without the service ended the page);
// - Chrome (checked at 390px) or Edge (at 1280px) with the pair available shows a 44px button;
//   pressing it shows the download progress, then the translation under the original, marked as
//   the browser's, in Korean, line by line; the original stays; ‘번역 닫기’ hides it;
// - a failed translation says so and offers ‘다시 시도’, which works;
// - a stay whose description is already Korean shows neither button nor note.
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
// The stand-in: brands, availability and translation are set per run through window.__u07.
const standIn=({brand,availability,fail})=>{
 Object.defineProperty(Navigator.prototype,'userAgentData',{configurable:true,get:()=>({brands:[{brand,version:'141'}],mobile:false,platform:'Linux'})});
 const log=window.__u07={availability:0,create:0,translate:[],fail};
 window.Translator={
  availability:async o=>{log.availability++;log.pair=o.sourceLanguage+'>'+o.targetLanguage;return availability},
  create:async o=>{log.create++;log.activation=navigator.userActivation?.isActive??null;
   if(log.fail){log.fail--;throw new DOMException('stand-in failure','NetworkError')}
   const target=new EventTarget();o.monitor?.(target);
   for(const loaded of [0,0.5]){const e=new Event('downloadprogress');e.loaded=loaded;target.dispatchEvent(e);await new Promise(r=>setTimeout(r,400))}
   return{translate:async t=>{log.translate.push(t);return '번역: '+t.slice(0,12)}};
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
 const context=async init=>{const c=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});await c.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));if(init)await c.addInitScript(standIn,init);return c};
 // 1. Not Chrome or Edge (this Chromium names itself ‘Chromium’): a note, no button, never asked.
 {
  const c=await context(null),page=await c.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e)));
  const d=await open(page,foreign.id);
  const r={note:await d.locator('.translate-note').textContent().catch(()=>null),buttons:await d.locator('.translate-button').count(),original:await d.locator('.hotel-intro').first().textContent()};
  if(shots)await d.screenshot({path:join(shots,`translate-unsupported-${w}.png`)});
  check('Chrome·Edge가 아닌 브라우저: 번역 단추 없이 ‘이 브라우저에서는 바로 번역을 쓸 수 없습니다’를 보이고 원문은 그대로, 페이지 오류 없음',/쓸 수 없습니다/.test(r.note??'')&&r.buttons===0&&r.original.trim()===foreign.description.trim()&&errors.length===0,{...r,errors});
  await c.close();
 }
 // 2. Chrome with the pair unavailable: the same note.
 {
  const c=await context({brand:'Google Chrome',availability:'unavailable',fail:0}),page=await c.newPage();
  const d=await open(page,foreign.id);
  const r={note:await d.locator('.translate-note').textContent().catch(()=>null),buttons:await d.locator('.translate-button').count(),log:await page.evaluate(()=>window.__u07)};
  check('브라우저가 언어 쌍을 못 한다고 하면(unavailable) 단추 없이 같은 안내',/쓸 수 없습니다/.test(r.note??'')&&r.buttons===0&&r.log.availability===1&&r.log.pair==='ja>ko',r);
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
  const box=await button.boundingBox(),label=await button.textContent();
  // The first press fails (the stand-in's network error), the second works.
  await (mobile?button.tap():button.click());await page.waitForTimeout(400);
  const failed={note:await d.locator('.translate-note[role=status]').textContent().catch(()=>null),label:await button.textContent()};
  check(`${brand}: 번역 단추(44px)가 원문 아래에 있고, 실패하면 ‘번역하지 못했습니다’와 ‘다시 시도’`,/이 자리에서 한국어로 번역/.test(label)&&box.height>=44&&/번역하지 못했습니다/.test(failed.note??'')&&/다시 시도/.test(failed.label),{label,box,failed});
  await (mobile?button.tap():button.click());
  // The stand-in reports 0% at once and 50% after 0.4s, then finishes 0.4s later.
  let progress=null;for(let t=0;t<12&&!/50%/.test(progress??'');t++){await page.waitForTimeout(50);progress=await d.locator('.translate-note[role=status]').textContent().catch(()=>null)}
  if(shots)await d.screenshot({path:join(shots,`translate-progress-${w}.png`)});
  await page.waitForTimeout(1200);
  const done=await page.evaluate(()=>{const d=document.querySelector('.hotel-description'),t=d.querySelector('.browser-translation .hotel-intro');return{original:d.querySelector('.hotel-intro').textContent,translation:t?.textContent??null,lang:t?.getAttribute('lang')??null,caption:d.querySelector('.browser-translation .description-caption')?.textContent??null,order:t?!!(d.querySelector('.hotel-intro').compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING):false,log:window.__u07}});
  const lines=foreign.description.split('\n'),want=lines.map(l=>l.trim()?'번역: '+l.slice(0,12):'').join('\n');
  if(shots)await d.screenshot({path:join(shots,`translate-done-${w}.png`)});
  check('다시 누르면 번역 모델 받는 진행률을 보인 뒤, 원문 아래에 ‘브라우저 번역’ 표시와 함께 한국어 번역(줄마다)이 붙고 원문은 그대로',/번역 모델을 받는 중 50%/.test(progress??'')&&done.translation===want&&done.lang==='ko'&&/브라우저 번역/.test(done.caption??'')&&done.order&&done.original.trim()===foreign.description.trim()&&done.log.create===2&&done.log.activation===true&&done.log.translate.length===lines.filter(l=>l.trim()).length&&errors.length===0,{progress,done:{...done,original:undefined},want});
  await (mobile?d.locator('.translate-button',{hasText:'번역 닫기'}).tap():d.locator('.translate-button',{hasText:'번역 닫기'}).click());await page.waitForTimeout(200);
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
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,stays:{foreign:foreign.id,korean:korean.id},results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
