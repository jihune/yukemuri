import {createRequire} from 'node:module';
const require=createRequire('/home/user/yukemuri/.sites-runtime/u01-browser/package.json');
const {chromium}=require('playwright');
const out=process.argv[2],base='https://yukemuri.jihune.workers.dev';
const browser=await chromium.launch();const writes=[];
for(const w of [390,1280]){
 const mobile=w<900;
 const ctx=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,locale:'ko-KR',deviceScaleFactor:mobile?2:1});
 const page=await ctx.newPage();page.on('request',r=>{if(r.method()!=='GET'&&r.url().startsWith(base))writes.push(r.method()+' '+r.url())});
 await page.goto(base+'/?q=%ED%95%98%EC%BD%94%EB%84%A4'+(mobile?'&view=map':''),{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.stay-marker',{timeout:30000});await page.waitForTimeout(4000);
 await page.screenshot({path:`${out}/map-hakone-${w}.png`});
 // zoom in twice to split clusters, then tap a single marker
 for(let i=0;i<3;i++){await page.locator('.map-controls button').first().click();await page.waitForTimeout(900)}
 const single=page.locator('.stay-marker:not(.is-cluster)');
 const n=await single.count();let clicked=false;
 for(let i=0;i<n&&!clicked;i++){const el=single.nth(i);const box=await el.boundingBox();const mapBox=await page.locator('.map-canvas').boundingBox();
  if(box&&mapBox&&box.x>mapBox.x+10&&box.x+box.width<mapBox.x+mapBox.width-10&&box.y>mapBox.y+10&&box.y+box.height<mapBox.y+mapBox.height-10){await el.click({force:true});clicked=true;await page.waitForTimeout(2000)}}
 await page.screenshot({path:`${out}/map-hakone-preview-${w}.png`});
 // map area search button state
 const area=await page.locator('.map-area-search').count();
 console.log(w,'singles',await single.count(),'areaButton',area);
 await ctx.close();
}
await browser.close();console.log('writes',JSON.stringify(writes));
