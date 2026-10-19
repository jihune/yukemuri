// D08 PR 3 in real Chromium (360px and 390px touch, 1280px mouse): the Oita Prefecture lodging
// business permit in the detail sheet's sources, and the credits. Two open stays of the snapshot
// the site serves: one whose card carries `oita` (lib/oita-permits.ts linked it) and one without
// (in Oita Prefecture when the snapshot has one).
// Expected:
// - the permitted stay's card says nothing about the permit (design A, D08 16); the page does not
//   scroll sideways;
// - its detail sheet's ‘정보 출처’ holds one entry: that it is on the list, the kind of business as
//   the list names it, the permit date and the month the list is as of, what a stay missing from the list does
//   not mean, and the CC BY 4.0 credit linking the dataset and the license; the other stay's sheet
//   holds none;
// - while the detail API fails the sheet shows the card and a retry, and the retry brings the entry;
// - the entry's links are reached by Tab (1280px);
// - the footer and the data status sheet credit the prefecture.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// --control serves the cards without `oita` (as before this change): the permitted stay's checks
// must then fail.
// Usage: node scripts/check-d08-oita-browser.mjs [base] [evidence.json] [--control]
import {createRequire} from 'node:module';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {siteSearch} from './site-search-node.mjs';
import {compileLib} from './build-search-snapshot.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const control=process.argv.includes('--control'),[base='http://127.0.0.1:8787',evidence]=process.argv.slice(2).filter(a=>a!=='--control');
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-d08-oita-'));
let OITA_LABEL,OITA_LIMIT,OITA_LINKS,OITA_ATTRIBUTION,oitaAsOf,displayNames;
try{({OITA_LABEL,OITA_LIMIT,OITA_LINKS,OITA_ATTRIBUTION,oitaAsOf}=createRequire(import.meta.url)(compileLib(temp,'lib/oita-attribution.ts')));({displayNames}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'n-')),'lib/hotel-names.ts')))}finally{rmSync(temp,{recursive:true,force:true})}
const {snapshot}=await siteSearch(base);
const open=i=>!['closed','temporarily_closed'].includes(snapshot.core.state[i]);
const japanese=c=>/[\u3040-\u30ff\u4e00-\u9fff]/.test(c.names.ja);
const stay=snapshot.cards.find((c,i)=>c.oita?.permitted&&open(i)&&japanese(c));
const plain=snapshot.cards.find((c,i)=>!c.oita&&snapshot.core.prefecture[i]==='pref-ooita'&&open(i)&&japanese(c))??snapshot.cards.find((c,i)=>!c.oita&&open(i)&&japanese(c));
if(!stay||!plain)throw new Error('The local snapshot has no permitted stay to check');
const {kind,permitted,asOf}=stay.oita;
const ENTRY='.provenance [data-oita-permit]';
const browser=await chromium.launch();
for(const [w,mobile] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 if(control)await context.route(/\/snapshot\/v\/[^/]+\/cards\.json$/,async route=>{const response=await route.fetch();const cards=await response.json();for(const c of cards)delete c.oita;await route.fulfill({response,json:cards})});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=l=>mobile?l.tap():l.click();
 // The cards, found by their original names.
 const card=async h=>{
  await page.goto(base+'/?'+new URLSearchParams({q:h.names.ja}),{waitUntil:'networkidle'});
  return page.locator(`[id="card-${h.id}"]`);
 };
 const mine=await card(stay);await mine.waitFor({timeout:15000}).catch(()=>{});
 const cardText=await mine.textContent().catch(()=>null),sideways=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 check('카드: 허가 숙소의 카드에는 허가 이야기가 없고 옆으로 넘치지 않음',!!cardText&&!cardText.includes('오이타현')&&!cardText.includes('허가')&&!sideways,{id:stay.id,sideways});
 // The detail sheet of the permitted stay, opened from its card.
 const sheetOf=async(h,open)=>{await card(h);await page.locator(`[id="card-${h.id}"]`).waitFor({timeout:15000});await open(page.locator(`[id="card-${h.id}"] .card-title`));const s=page.locator('.hotel-detail');await s.waitFor({timeout:15000});return s};
 let sheet=await sheetOf(stay,press);
 await sheet.locator('.provenance').waitFor({timeout:15000}).catch(()=>{});
 const entry=sheet.locator(ENTRY);
 const title=await entry.locator('b').textContent().catch(()=>null),body=await entry.textContent().catch(()=>''),listKind=await entry.locator('span[lang="ja"]').first().textContent().catch(()=>null);
 const links=await entry.locator('a').evaluateAll(as=>as.map(a=>({href:a.href,text:a.textContent,target:a.target,rel:a.rel}))).catch(()=>[]);
 check(`상세: 정보 출처에 ‘${OITA_LABEL}’와 ${kind} 영업 · 허가 ${permitted}(${oitaAsOf(asOf)})`,title===OITA_LABEL&&listKind===kind&&body.includes(`${kind} 영업 · 허가 ${permitted}(${oitaAsOf(asOf)})`),{title,listKind,body});
 check('상세: 목록에 없다는 것의 뜻, 가공 출처와 데이터셋·CC BY 4.0 링크',body.includes(OITA_LIMIT)&&body.includes(OITA_ATTRIBUTION)&&JSON.stringify(links.map(l=>l.href))===JSON.stringify(OITA_LINKS.map(l=>l.url))&&links.every(l=>l.target==='_blank'&&l.rel.includes('noopener')),{links});
 // The sheet slides in from the right: measured once its right edge is the window's.
 await page.waitForFunction(()=>{const e=document.querySelector('.hotel-detail');return!!e&&e.getAnimations().every(a=>a.playState!=='running')&&Math.abs(e.getBoundingClientRect().right-window.innerWidth)<0.5},null,{timeout:5000}).catch(()=>{});
 const boxes=await page.evaluate(sel=>{const box=e=>{const r=e?.getBoundingClientRect();return r?{left:r.left,right:r.right}:null};return{sheet:box(document.querySelector('.hotel-detail')),entry:box(document.querySelector(sel)),width:window.innerWidth}},ENTRY);
 check('상세: 항목이 시트 너비 안에 있음',!!boxes.sheet&&!!boxes.entry&&boxes.entry.left>=boxes.sheet.left&&boxes.entry.right<=boxes.sheet.right+0.5&&boxes.sheet.right<=boxes.width+0.5,boxes);
 if(!mobile){
  // Tab through the sheet until the entry's first link has focus.
  let reached=false;
  for(let n=0;n<160&&!reached;n++){await page.keyboard.press('Tab');reached=await page.evaluate(href=>document.activeElement?.closest?.('[data-oita-permit]')!==null&&document.activeElement?.getAttribute('href')===href,OITA_LINKS[0].url)}
  check('키보드: Tab으로 출처 링크에 닿음',reached);
 }
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 sheet=await sheetOf(plain,press);await sheet.locator('.provenance').waitFor({timeout:15000}).catch(()=>{});
 check('상세: 허가가 이어지지 않은 숙소에는 항목 없음',await sheet.locator('.provenance').count()===1&&await sheet.locator('[data-oita-permit]').count()===0,{id:plain.id});
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 // The detail API failing, then the retry.
 let fail=true;
 await page.route(new RegExp('/api/hotels/'+stay.id+'$'),route=>fail?route.fulfill({status:503,json:{error:'check'}}):route.continue());
 sheet=await sheetOf(stay,press);
 await sheet.locator('.detail-unavailable').waitFor({timeout:15000}).catch(()=>{});
 check('실패: 상세를 못 받으면 카드 정보와 다시 시도 단추만 있음',await sheet.getByRole('button',{name:'다시 시도'}).count()===1&&await sheet.locator('[data-oita-permit]').count()===0);
 fail=false;
 await press(sheet.getByRole('button',{name:'다시 시도'}));
 await sheet.locator(ENTRY).waitFor({timeout:15000}).catch(()=>{});
 check('재시도: 다시 받으면 허가 항목이 나옴',await sheet.locator(ENTRY+' b').textContent().catch(()=>null)===OITA_LABEL);
 await page.unroute(new RegExp('/api/hotels/'+stay.id+'$'));
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 // The credits: the footer and the data status sheet.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const footer=await page.locator('footer.site-footer [data-oita-credit]').evaluate(p=>({text:p.textContent,links:[...p.querySelectorAll('a')].map(a=>a.href)})).catch(()=>null);
 check('바닥글: 오이타현 목록 가공 출처와 두 링크',!!footer&&footer.text.includes(OITA_ATTRIBUTION)&&JSON.stringify(footer.links)===JSON.stringify(OITA_LINKS.map(l=>l.url)),{footer});
 await page.goto(base+'/#status',{waitUntil:'networkidle'});
 const status=await page.locator('.u06-credits').evaluate(s=>({text:s.textContent,links:[...s.querySelectorAll('a')].map(a=>a.href)}),undefined,{timeout:15000}).catch(()=>null);
 check('자료 현황 출처 표기: 오이타현 목록 가공 출처와 두 링크',!!status&&status.text.includes(OITA_ATTRIBUTION)&&OITA_LINKS.every(l=>status.links.includes(l.url)),{status});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,control,stay:{id:stay.id,oita:stay.oita,title:displayNames(stay.names).title},plain:plain.id,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
