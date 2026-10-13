// U05 2단계 화면 캡처: 로컬 사이트(prepare-local-site.mjs + pnpm start)의 불러오기·상세·비교·지도 화면.
// 외부 요청은 막는다(사진·지도 타일은 빈칸). 즐겨찾기 하트는 누르지 않는다.
// Usage: node docs/evidence/u05-20261013/tools/views.mjs <shots-dir> [base]
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [out,base='http://127.0.0.1:8787']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort());
 const page=await context.newPage();
 // Loading: hold the list files for a moment.
 await page.route(/\/snapshot\/v\/[^/]+\/(core|cards)\.json$/,async route=>{await new Promise(r=>setTimeout(r,2500));await route.continue().catch(()=>{})});
 await page.goto(base+'/?q='+encodeURIComponent('하코네'),{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(900);
 await page.screenshot({path:`${out}/loading-${w}.png`});
 await page.waitForTimeout(2500);await page.unroute(/\/snapshot\/v\/[^/]+\/(core|cards)\.json$/);
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`${out}/home-${w}-full.png`,fullPage:true});
 const tap=locator=>mobile?locator.tap():locator.click();
 // Detail
 await tap(page.locator('.hotel-list .card-title').first());
 await page.waitForSelector('.detail-scroll',{timeout:15000});await page.waitForTimeout(800);
 await page.screenshot({path:`${out}/detail-${w}.png`});
 await page.locator('.detail-scroll').evaluate(e=>e.scrollTop=900);await page.waitForTimeout(300);
 await page.screenshot({path:`${out}/detail-${w}-2.png`});
 await page.keyboard.press('Escape');await page.waitForTimeout(600);
 // Compare three
 const cmp=page.locator('.card-compare');
 for(let i=0;i<3;i++)await tap(cmp.nth(i));
 await tap(page.locator('.comparison-dock button').first());await page.waitForTimeout(1500);
 await page.screenshot({path:`${out}/compare-${w}.png`});
 await page.keyboard.press('Escape');await page.waitForTimeout(500);
 await tap(page.getByRole('button',{name:'비교 후보 모두 비우기'}));
 // Map
 if(mobile){await tap(page.locator('.mobile-map-toggle'));await page.waitForTimeout(1500)}
 else await page.locator('.stay-map').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/map-${w}.png`});
 await context.close();
}
await browser.close();
