// D08 PR 1 in real Chromium (360px and 390px touch, 1280px mouse): the Japan Tourism Agency
// registration on the card, the detail sheet and the credits. Two stays of the snapshot the site
// serves: one whose card carries `jta` (lib/jta-registration.ts linked it) and one without.
// Expected:
// - the registered stay's card shows ‘관광청 등록 호텔’ or ‘…료칸’ inside the card, the other none;
//   the page does not scroll sideways;
// - its detail sheet shows the tag beside the kind and a section with the meaning, the number and
//   the PDL1.0 credit linking the list page and the license; the other stay's sheet shows neither;
// - while the detail API fails the sheet shows the card with the tag and a retry, and the retry
//   brings the section; while it loads, the loading notice shows;
// - the section's links are reached by Tab (1280px);
// - the footer and the data status sheet credit the agency.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// --control serves the cards without `jta` (as before this change): the registered stay's checks
// must then fail.
// Usage: node scripts/check-d08-jta-browser.mjs [base] [evidence.json] [--control]
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
const temp=mkdtempSync(join(tmpdir(),'yukemuri-d08-jta-'));
let JTA_LABEL,JTA_LINKS,JTA_MEANING,jtaKind,displayNames;
try{({JTA_LABEL,JTA_LINKS,JTA_MEANING,jtaKind}=createRequire(import.meta.url)(compileLib(temp,'lib/jta-attribution.ts')));({displayNames}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'n-')),'lib/hotel-names.ts')))}finally{rmSync(temp,{recursive:true,force:true})}
const {snapshot}=await siteSearch(base);
// A registered stay and an unregistered one, both open, with a Japanese name to search by.
const open=i=>!['closed','temporarily_closed'].includes(snapshot.core.state[i]);
const pick=registered=>snapshot.cards.find((c,i)=>!!c.jta===registered&&open(i)&&/[\u3040-\u30ff\u4e00-\u9fff]/.test(c.names.ja));
const stay=pick(true),plain=pick(false);
if(!stay||!plain)throw new Error('The local snapshot has no registered stay to check');
const label=JTA_LABEL[jtaKind(stay.jta)];
const browser=await chromium.launch();
for(const [w,mobile] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 if(control)await context.route(/\/snapshot\/v\/[^/]+\/cards\.json$/,async route=>{const response=await route.fetch();const cards=await response.json();for(const c of cards)delete c.jta;await route.fulfill({response,json:cards})});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const press=l=>mobile?l.tap():l.click();
 // The cards, found by their original names.
 const card=async h=>{
  await page.goto(base+'/?'+new URLSearchParams({q:h.names.ja}),{waitUntil:'networkidle'});
  return page.locator(`[id="card-${h.id}"]`);
 };
 const mine=await card(stay);await mine.waitFor({timeout:15000}).catch(()=>{});
 const tag=mine.locator('.jta-tag');
 const box=await mine.boundingBox(),tagBox=await tag.boundingBox().catch(()=>null);
 const sideways=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 check(`카드: ‘${label}’ 표시가 카드 안에 있고 옆으로 넘치지 않음`,(await tag.textContent().catch(()=>null))===label&&!!box&&!!tagBox&&tagBox.x>=box.x&&tagBox.x+tagBox.width<=box.x+box.width+0.5&&!sideways,{id:stay.id,jta:stay.jta,box,tagBox,sideways});
 const theirs=await card(plain);await theirs.waitFor({timeout:15000}).catch(()=>{});
 check('카드: 등록이 이어지지 않은 숙소에는 표시 없음',await theirs.count()===1&&await theirs.locator('.jta-tag').count()===0,{id:plain.id});
 // The detail sheet of the registered stay, opened from its card.
 const sheetOf=async(h,open)=>{await card(h);await page.locator(`[id="card-${h.id}"]`).waitFor({timeout:15000});await open(page.locator(`[id="card-${h.id}"] .card-title`));const s=page.locator('.hotel-detail');await s.waitFor({timeout:15000});return s};
 let sheet=await sheetOf(stay,press);
 await sheet.locator('.detail-body').waitFor({timeout:15000}).catch(()=>{});
 const eyebrow=await sheet.locator('.detail-eyebrow .jta-tag').textContent().catch(()=>null);
 const section=sheet.locator('section[aria-labelledby="detail-jta-title"]');
 const heading=await section.locator('h2').textContent().catch(()=>null),body=await section.textContent().catch(()=>'');
 const links=await section.locator('a').evaluateAll(as=>as.map(a=>({href:a.href,text:a.textContent,target:a.target,rel:a.rel})));
 check(`상세: 종류 옆 ‘${label}’ 표시와 같은 이름의 절`,eyebrow===label&&heading===label,{eyebrow,heading});
 check(`상세: 뜻, 등록번호 ${stay.jta}, 출처(가공 작성)와 목록·이용규약 링크`,body.includes(JTA_MEANING)&&body.includes('등록번호 '+stay.jta)&&body.includes('を加工して作成')&&JSON.stringify(links.map(l=>l.href))===JSON.stringify(JTA_LINKS.map(l=>l.url))&&links.every(l=>l.target==='_blank'&&l.rel.includes('noopener')),{links});
 // The sheet slides in from the right: measured once its right edge is the window's, both boxes at once.
 await page.waitForFunction(()=>{const e=document.querySelector('.hotel-detail');return!!e&&e.getAnimations().every(a=>a.playState!=='running')&&Math.abs(e.getBoundingClientRect().right-window.innerWidth)<0.5},null,{timeout:5000}).catch(()=>{});
 const boxes=await page.evaluate(()=>{const box=e=>{const r=e?.getBoundingClientRect();return r?{left:r.left,right:r.right}:null};return{sheet:box(document.querySelector('.hotel-detail')),section:box(document.querySelector('section[aria-labelledby="detail-jta-title"]')),width:window.innerWidth}});
 check('상세: 절이 시트 너비 안에 있음',!!boxes.sheet&&!!boxes.section&&boxes.section.left>=boxes.sheet.left&&boxes.section.right<=boxes.sheet.right+0.5&&boxes.sheet.right<=boxes.width+0.5,boxes);
 if(!mobile){
  // Tab through the sheet until the section's first link has focus.
  let reached=false;
  for(let n=0;n<120&&!reached;n++){await page.keyboard.press('Tab');reached=await page.evaluate(href=>document.activeElement?.closest?.('section[aria-labelledby="detail-jta-title"]')!==null&&document.activeElement?.getAttribute('href')===href,JTA_LINKS[0].url)}
  check('키보드: Tab으로 출처 링크에 닿음',reached);
 }
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 sheet=await sheetOf(plain,press);await sheet.locator('.detail-body').waitFor({timeout:15000}).catch(()=>{});
 check('상세: 등록이 이어지지 않은 숙소에는 표시도 절도 없음',await sheet.locator('.jta-tag').count()===0&&await sheet.locator('section[aria-labelledby="detail-jta-title"]').count()===0,{id:plain.id});
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 // The detail API failing, then the retry.
 let fail=true;
 await page.route(new RegExp('/api/hotels/'+stay.id+'$'),route=>fail?route.fulfill({status:503,json:{error:'check'}}):route.continue());
 sheet=await sheetOf(stay,press);
 await sheet.locator('.detail-unavailable').waitFor({timeout:15000}).catch(()=>{});
 const fallbackTag=await sheet.locator('.detail-eyebrow .jta-tag').textContent().catch(()=>null);
 check('실패: 상세를 못 받아도 카드 정보로 표시가 보이고 다시 시도 단추가 있음',fallbackTag===label&&await sheet.getByRole('button',{name:'다시 시도'}).count()===1&&await sheet.locator('section[aria-labelledby="detail-jta-title"]').count()===0,{fallbackTag});
 fail=false;
 await press(sheet.getByRole('button',{name:'다시 시도'}));
 await sheet.locator('section[aria-labelledby="detail-jta-title"]').waitFor({timeout:15000}).catch(()=>{});
 check('재시도: 다시 받으면 등록 절이 나옴',await sheet.locator('section[aria-labelledby="detail-jta-title"] h2').textContent().catch(()=>null)===label);
 await page.unroute(new RegExp('/api/hotels/'+stay.id+'$'));
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 // Loading: the API answers after a second.
 await page.route(new RegExp('/api/hotels/'+stay.id+'$'),async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue()});
 await card(stay);await press(page.locator(`[id="card-${stay.id}"] .card-title`));
 const loading=await page.locator('.toast-message').filter({hasText:'숙소 상세를 불러오는 중'}).waitFor({timeout:3000}).then(()=>true,()=>false);
 await page.locator('section[aria-labelledby="detail-jta-title"]').waitFor({timeout:15000}).catch(()=>{});
 check('불러오는 중: 안내가 뜨고 받은 뒤 등록 절이 나옴',loading&&await page.locator('section[aria-labelledby="detail-jta-title"]').count()===1,{loading});
 await page.unroute(new RegExp('/api/hotels/'+stay.id+'$'));
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 // The credits: the footer and the data status sheet.
 await page.goto(base+'/',{waitUntil:'networkidle'});
 const footer=await page.locator('footer.site-footer [data-jta-credit]').evaluate(p=>({text:p.textContent,links:[...p.querySelectorAll('a')].map(a=>a.href)})).catch(()=>null);
 check('바닥글: 관광청 목록 가공 출처와 두 링크',!!footer&&footer.text.includes('を加工して作成')&&JSON.stringify(footer.links)===JSON.stringify(JTA_LINKS.map(l=>l.url)),{footer});
 await page.goto(base+'/#status',{waitUntil:'networkidle'});
 const status=await page.locator('.u06-credits').evaluate(s=>({text:s.textContent,links:[...s.querySelectorAll('a')].map(a=>a.href)}),undefined,{timeout:15000}).catch(()=>null);
 check('자료 현황 출처 표기: 관광청 목록 가공 출처와 두 링크',!!status&&status.text.includes('を加工して作成')&&JTA_LINKS.every(l=>status.links.includes(l.url)),{status});
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,control,stay:{id:stay.id,jta:stay.jta,title:displayNames(stay.names).title},plain:plain.id,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
