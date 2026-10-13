// U05 2단계 1번(토대) 검사: 실제 Chromium 360·390·1280px.
// - axe-core 색 대비 위반 0, 1280px axe critical 0(탭 ARIA)
// - 보이는 조작 요소가 모두 44×44px 이상(문장 안 링크·지도 저작권 표시 제외)
// - 보이는 글자가 13px 이상(사진 위 표지만 12px 허용)
// - Pretendard가 사이트 정적 파일에서 실제로 적재됨, 외부 글꼴 요청 없음
// - 'EXPLORE JAPAN'·'MY SAVED STAYS'·'YUKEMURI'·'v0.5' 흔적 없음, 가로 넘침 없음
// - 불러오기 실패 → 다시 시도로 회복, 키보드 초점이 보임
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u05-foundation-browser.mjs [base] [evidence.json] [shots-dir]
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync,readdirSync} from 'node:fs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
// axe-core is a transitive dependency of the repository (pnpm store), not a direct one.
const PNPM=new URL('../node_modules/.pnpm/',import.meta.url);
const axeDir=readdirSync(PNPM).filter(name=>name.startsWith('axe-core@')).sort().pop();
if(!axeDir)throw new Error('axe-core not found under node_modules/.pnpm');
const AXE=new URL(axeDir+'/node_modules/axe-core/axe.min.js',PNPM).pathname;
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const browser=await chromium.launch();
const coreFile=url=>/\/snapshot\/v\/[^/]+\/(core|cards)\.json$/.test(url.pathname);

// Every visible control on the page, its size and whether it is exempt.
const targets=page=>page.evaluate(()=>{
 const shown=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-hidden=true],[inert]')};
 // A link inside running text, or the map attribution (WCAG 2.5.8 inline and essential exceptions).
 const exempt=e=>!!e.closest('.leaflet-control-attribution')||(e.tagName==='A'&&[...e.parentElement.childNodes].some(n=>n!==e&&n.nodeType===3&&n.textContent.trim().length>1));
 return [...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,summary,[role=combobox],[role=checkbox],[role=tab],[role=button],[tabindex="0"]')].filter(shown).map(e=>{
  // A checkbox inside its label is touched through the whole label row.
  const r=(e.getAttribute('role')==='checkbox'&&e.closest('label')||e).getBoundingClientRect();return {name:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||e.className||e.tagName).toString().trim().split('\n')[0].slice(0,40),w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,exempt:exempt(e)}});
});
const smallText=page=>page.evaluate(()=>{
 const out=[];
 for(const e of document.querySelectorAll('body *')){
  if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
  const r=e.getBoundingClientRect(),s=getComputedStyle(e);
  if(!r.width||!r.height||s.visibility==='hidden'||s.display==='none'||e.closest('[aria-hidden=true]'))continue;
  // Labels set on a photo may be 12px (U05 check rule 2); the map attribution is the tile provider's.
  if(e.closest('.photo-tag,.type-tag,.leaflet-control-attribution'))continue;
  const size=parseFloat(s.fontSize);if(size<12.95)out.push({text:e.textContent.trim().slice(0,30),size,cls:String(e.className).slice(0,40)});
 }
 return out;
});
const axe=async(page,rules)=>{await page.addScriptTag({path:AXE});return page.evaluate(async rules=>{const r=await window.axe.run(document,rules);return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,sample:v.nodes.slice(0,5).map(n=>(n.target.join(' ')+' | '+(n.any[0]?.message||'')).slice(0,180))}))},rules)};
const leftovers=page=>page.evaluate(()=>{const t=document.body.innerText;return ['EXPLORE JAPAN','MY SAVED STAYS','YUKEMURI','v0.5'].filter(s=>t.includes(s))});

for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1,locale:'ko-KR'});
 const external=[];
 await context.route(url=>!url.href.startsWith(base),route=>{external.push(route.request().url());route.abort()});
 const page=await context.newPage();
 const fontFiles=[];page.on('response',r=>{if(/\.woff2(\?|$)/.test(r.url()))fontFiles.push({url:r.url().replace(base,''),status:r.status()})});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.waitForSelector('.hotel-list .hotel-card');
 await page.evaluate(()=>document.fonts.ready);
 if(shots)await page.screenshot({path:`${shots}/home-${w}.png`});
 const fonts=await page.evaluate(()=>[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/"/g,'')));
 const family=await page.evaluate(()=>getComputedStyle(document.querySelector('.card-title h3')).fontFamily);
 check('Pretendard를 사이트 정적 파일에서 적재(외부 글꼴 요청 없음)',fonts.includes('Pretendard Variable')&&/^"?Pretendard Variable/.test(family)&&fontFiles.length>0&&fontFiles.every(f=>f.url.startsWith('/fonts/pretendard/')&&f.status===200)&&!external.some(u=>/font|woff/i.test(u)),{fonts:[...new Set(fonts)],family,fontFiles:fontFiles.slice(0,4),fontRequests:fontFiles.length,externalFont:external.filter(u=>/font|woff/i.test(u))});
 const contrast=await axe(page,{runOnly:{type:'rule',values:['color-contrast']}});
 check('axe 색 대비 위반 0(첫 화면)',contrast.length===0,{violations:contrast});
 const all=await axe(page,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
 const critical=all.filter(v=>v.impact==='critical');
 check('axe critical 위반 0',critical.length===0,{critical,other:all.filter(v=>v.impact!=='critical').map(v=>({id:v.id,impact:v.impact,nodes:v.nodes}))});
 const list=await targets(page),small=list.filter(t=>!t.exempt&&(t.w<44||t.h<44));
 check('44px 미만 조작 0(문장 안 링크·지도 저작권 제외)',small.length===0,{controls:list.length,exempt:list.filter(t=>t.exempt).length,small:small.slice(0,30),smallCount:small.length});
 const tiny=await smallText(page);
 check('13px 미만 글자 0(사진 위 표지 제외)',tiny.length===0,{count:tiny.length,sample:tiny.slice(0,15)});
 check('영어 대문자 소제목·버전 흔적 없음',(await leftovers(page)).length===0,{found:await leftovers(page)});
 const overflow=await page.evaluate(()=>document.scrollingElement.scrollWidth-innerWidth);
 check('가로 넘침 없음',overflow<=0,{overflow});
 // Keyboard: the first Tab stops show a visible focus ring.
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
 const rings=[];
 for(let i=0;i<6;i++){await page.keyboard.press('Tab');rings.push(await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {name:(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,24),outline:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2,ring:s.boxShadow!=='none'}}))}
 check('키보드 초점이 보임(첫 Tab 6개)',rings.every(r=>r.outline||r.ring),{rings});
 if(shots){await page.keyboard.press('Tab');await page.screenshot({path:`${shots}/focus-${w}.png`})}
 // Saved view: no English eyebrow there either (reads favourites only).
 await page.locator('.header-inner nav button').nth(1).click();await page.waitForTimeout(800);
 check('즐겨찾기 화면에도 흔적 없음',(await leftovers(page)).length===0,{found:await leftovers(page)});
 if(shots)await page.screenshot({path:`${shots}/saved-${w}.png`});
 if(mobile){
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.locator('.mobile-filter').click();await page.waitForTimeout(700);
  const sheet=(await targets(page)).filter(t=>!t.exempt&&(t.w<44||t.h<44));
  const sheetText=await smallText(page);
  check('필터 시트: 44px 미만 조작 0·13px 미만 글자 0',sheet.length===0&&sheetText.length===0,{small:sheet.slice(0,20),tiny:sheetText.slice(0,10)});
  if(shots)await page.screenshot({path:`${shots}/filter-${w}.png`});
  await page.keyboard.press('Escape');await page.waitForTimeout(500);
 }else{
  // The desktop map/list switch: real tabs with panels, or plain buttons.
  const tabs=await page.evaluate(()=>[...document.querySelectorAll('[role=tab]')].map(t=>({controls:t.getAttribute('aria-controls'),panel:!!(t.getAttribute('aria-controls')&&document.getElementById(t.getAttribute('aria-controls')))})));
  check('탭이 실제 패널을 가리킴(또는 탭이 아님)',tabs.every(t=>t.panel),{tabs});
 }
 await context.close();
 // Loading, failure and retry with the new tokens.
 {
  const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1,locale:'ko-KR'});
  await context.route(url=>!url.href.startsWith(base),route=>route.abort());
  let block=true;
  await context.route(url=>coreFile(url),route=>block?route.abort():route.continue());
  const page=await context.newPage();
  await page.goto(base+'/?q='+encodeURIComponent('하코네'),{waitUntil:'networkidle'});
  const banner=page.locator('.error-banner[role=alert]');
  await banner.first().waitFor({timeout:15000}).catch(()=>{});
  const retry=banner.getByRole('button',{name:'다시 시도'});
  const size=await retry.count()?await retry.first().evaluate(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}}):null;
  const contrast=await axe(page,{runOnly:{type:'rule',values:['color-contrast']}});
  check('실패 화면: 경고와 다시 시도(44px), 대비 위반 0',!!size&&size.h>=44&&size.w>=44&&contrast.length===0,{size,contrast});
  if(shots)await page.screenshot({path:`${shots}/error-${w}.png`});
  block=false;
  if(mobile)await retry.first().tap();else await retry.first().click();
  await page.waitForSelector('.hotel-list .hotel-card',{timeout:15000}).catch(()=>{});
  const recovered=await page.locator('.hotel-list .hotel-card').count();
  check('다시 시도로 목록 회복',recovered>0&&!(await banner.count()),{cards:recovered});
  if(shots)await page.screenshot({path:`${shots}/retry-${w}.png`});
  await context.close();
 }
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
