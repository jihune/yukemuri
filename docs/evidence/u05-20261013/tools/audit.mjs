// Read-only UI audit of the live site. GET loads and read-only clicks only.
// Never clicks favourite hearts. Logs any non-GET request to the site (must stay empty).
import {createRequire} from 'node:module';
const require=createRequire('/home/user/yukemuri/.sites-runtime/u01-browser/package.json');
const {chromium}=require('playwright');
const out=process.argv[2];
const base='https://yukemuri.jihune.workers.dev';
const AXE='/home/user/yukemuri/node_modules/.pnpm/axe-core@4.11.4/node_modules/axe-core/axe.min.js';
const browser=await chromium.launch();
const report={writes:[],errors:[],views:{}};
async function ctxFor(w){
  const mobile=w<900;
  const ctx=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,locale:'ko-KR',deviceScaleFactor:mobile?2:1});
  const page=await ctx.newPage();
  page.on('request',r=>{if(r.method()!=='GET'&&r.url().startsWith(base))report.writes.push(r.method()+' '+r.url())});
  page.on('pageerror',e=>report.errors.push(w+' '+String(e).slice(0,160)));
  return {ctx,page};
}
async function settle(page,ms=1500){await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});await page.waitForTimeout(ms)}
async function metrics(page){
  return page.evaluate(()=>{
    const vis=el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&r.bottom>0&&r.top<innerHeight*3};
    const inter=[...document.querySelectorAll('button,a[href],input,select,[role=combobox],[role=checkbox],[role=tab]')].filter(vis);
    const small=inter.map(el=>{const r=el.getBoundingClientRect();return {t:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||el.tagName).trim().slice(0,28),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x=>x.h<44||x.w<44);
    const texts=[...document.querySelectorAll('body *')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1)&&vis(el));
    const sizes={};for(const el of texts){const fs=Math.round(parseFloat(getComputedStyle(el).fontSize));sizes[fs]=(sizes[fs]||0)+1}
    const colors={};for(const el of texts){const c=getComputedStyle(el).color;colors[c]=(colors[c]||0)+1}
    const fonts=[...new Set(texts.slice(0,50).map(el=>getComputedStyle(el).fontFamily))];
    const docH=document.documentElement.scrollHeight;
    const firstCard=document.querySelector('.hotel-list .hotel-card');const firstCardTop=firstCard?Math.round(firstCard.getBoundingClientRect().top+scrollY):null;
    const firstCardH=firstCard?Math.round(firstCard.getBoundingClientRect().height):null;
    const hscroll=document.documentElement.scrollWidth>innerWidth;
    const fontsLoaded=[...document.fonts].map(f=>f.family+':'+f.status);
    return {interactiveCount:inter.length,smallTargets:small.length,smallSample:small.slice(0,40),fontSizes:sizes,topColors:Object.entries(colors).sort((a,b)=>b[1]-a[1]).slice(0,12),fonts,docH,firstCardTop,firstCardH,hscroll,fontsLoaded};
  });
}
async function axe(page,label){
  await page.addScriptTag({path:AXE});
  const r=await page.evaluate(async()=>{const res=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return res.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,help:v.help,sample:v.nodes.slice(0,4).map(n=>(n.target.join(' ')+' | '+(n.any[0]?.message||'')).slice(0,200))}))});
  report.views[label+'-axe']=r;
}
for(const w of [360,390,1280]){
  const {ctx,page}=await ctxFor(w);
  const t0=Date.now();
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.hotel-list .card-title',{timeout:30000});
  const firstCardMs=Date.now()-t0;
  await settle(page,2500);
  await page.screenshot({path:`${out}/home-${w}.png`});
  if(w!==1280)await page.screenshot({path:`${out}/home-${w}-full.png`,fullPage:true});
  report.views['home-'+w]={firstCardMs,...await metrics(page)};
  if(w===390||w===1280)await axe(page,'home-'+w);
  if(w<900){
    // filter sheet
    await page.locator('.mobile-filter').first().click();await page.waitForTimeout(800);
    await page.screenshot({path:`${out}/filter-${w}.png`});
    report.views['filter-'+w]=await page.evaluate(()=>{const s=document.querySelector('.mobile-sheet-body');return s?{scrollH:s.scrollHeight,clientH:s.clientHeight,checks:document.querySelectorAll('.mobile-filter-sheet .check-row').length}:null});
    await page.keyboard.press('Escape');await page.waitForTimeout(600);
    // sort select open
    await page.locator('.result-actions [data-slot=select-trigger]').first().click().catch(()=>{});await page.waitForTimeout(600);
    await page.screenshot({path:`${out}/sort-${w}.png`});
    await page.keyboard.press('Escape');await page.waitForTimeout(400);
    // map mode
    await page.locator('.mobile-map-toggle').click();await settle(page,3000);
    await page.screenshot({path:`${out}/map-${w}.png`});
    // tap a single marker (not a cluster) if any
    const marker=page.locator('.stay-marker:not(.is-cluster)').first();
    if(await marker.count()){await marker.click({force:true}).catch(()=>{});await page.waitForTimeout(1500);await page.screenshot({path:`${out}/map-preview-${w}.png`});}
    report.views['map-'+w]=await page.evaluate(()=>({markers:document.querySelectorAll('.stay-marker').length,clusters:document.querySelectorAll('.stay-marker.is-cluster').length,coverage:document.querySelector('.map-coverage')?.innerText.slice(0,300),mapTop:Math.round(document.querySelector('.stay-map')?.getBoundingClientRect().top+scrollY),mapH:Math.round(document.querySelector('.stay-map')?.getBoundingClientRect().height)}));
    await page.locator('.mobile-map-toggle').click();await page.waitForTimeout(800);
  }
  await ctx.close();
}
// Search, autocomplete, compare, detail scroll, empty and error states (390 and 1280)
for(const w of [390,1280]){
  const {ctx,page}=await ctxFor(w);
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('.hotel-list .card-title',{timeout:30000});await settle(page,1000);
  const q=page.locator('.search-form input').first();
  await q.click();await q.pressSequentially('하코',{delay:120});await page.waitForTimeout(2500);
  await page.screenshot({path:`${out}/autocomplete-${w}.png`});
  await q.fill('하코네');await page.locator('.search-form .search-button').click();await settle(page,2500);
  await page.screenshot({path:`${out}/search-hakone-${w}.png`});
  if(w===390)await page.screenshot({path:`${out}/search-hakone-${w}-full.png`,fullPage:true});
  report.views['search-'+w]=await metrics(page);
  // compare three
  const cmp=page.locator('.card-compare');const n=Math.min(3,await cmp.count());
  for(let i=0;i<n;i++){await cmp.nth(i).click();await page.waitForTimeout(300)}
  await page.screenshot({path:`${out}/compare-dock-${w}.png`});
  await page.locator('.comparison-dock button').first().click();await settle(page,3000);
  await page.screenshot({path:`${out}/compare-${w}.png`});
  await axe(page,'compare-'+w);
  await page.locator('.comparison-scroll').evaluate(el=>el.scrollTop=700);await page.waitForTimeout(800);
  await page.screenshot({path:`${out}/compare-${w}-rows.png`});
  await page.keyboard.press('Escape');await page.waitForTimeout(600);
  // clear compare (local only)
  await page.locator('.comparison-dock button[aria-label]').click().catch(()=>{});
  // detail
  await page.locator('.hotel-list .card-title').first().click();await settle(page,3000);
  await page.screenshot({path:`${out}/detail-${w}-0.png`});
  await axe(page,'detail-'+w);
  for(const [i,y] of [[1,800],[2,1700],[3,2600],[4,3600]]){await page.locator('.detail-scroll').evaluate((el,y)=>el.scrollTop=y,y);await page.waitForTimeout(900);await page.screenshot({path:`${out}/detail-${w}-${i}.png`})}
  report.views['detail-'+w]=await page.evaluate(()=>{const s=document.querySelector('.detail-scroll');return {scrollH:s?.scrollHeight,sections:[...document.querySelectorAll('.detail-section h2,.bath-detail-group h3')].map(h=>h.innerText.trim()),facts:document.querySelectorAll('.feature-fact').length,unknownFacts:[...document.querySelectorAll('.feature-fact')].filter(f=>f.innerText.includes('확인 필요')).length}});
  await page.keyboard.press('Escape');await page.waitForTimeout(600);
  // empty state: gibberish search
  await q.fill('ㅋㅋㅋzzqx');await page.locator('.search-form .search-button').click();await settle(page,2500);
  await page.screenshot({path:`${out}/empty-${w}.png`});
  report.views['empty-'+w]=await page.evaluate(()=>({empty:!!document.querySelector('.empty-state'),alternatives:document.querySelectorAll('.alternative-results .hotel-card').length,text:(document.querySelector('.empty-state')?.innerText||document.querySelector('.alternative-heading')?.innerText||'').slice(0,200)}));
  // saved view (reads favourites with GET only)
  await page.locator('.header-inner nav button').nth(1).click();await settle(page,2000);
  await page.screenshot({path:`${out}/saved-${w}.png`});
  await ctx.close();
}
// Error state: block the snapshot files in this browser only.
for(const w of [390]){
  const {ctx,page}=await ctxFor(w);
  await page.route(/\/snapshot\//,r=>r.abort());
  await page.goto(base+'/?q=%EC%9C%A0%ED%9B%84%EC%9D%B8',{waitUntil:'domcontentloaded'});await page.waitForTimeout(8000);
  await page.screenshot({path:`${out}/error-${w}.png`});
  report.views['error-'+w]=await page.evaluate(()=>({banner:document.querySelector('.error-banner')?.innerText||'',demo:document.querySelector('.demo-banner')?.innerText||'',pending:document.querySelector('.conditions-pending')?.innerText||''}));
  await ctx.close();
}
await browser.close();
const fs=await import('node:fs');fs.writeFileSync(out+'/../audit.json',JSON.stringify(report,null,1));
console.log(JSON.stringify({writes:report.writes,errors:report.errors.slice(0,8)},null,1));
