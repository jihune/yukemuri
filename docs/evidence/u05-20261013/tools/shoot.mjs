import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const dir=(await import('node:path')).resolve(process.argv[2]);
const browser=await chromium.launch();
for(const name of ['mockup-a-noren','mockup-b-checklist','mockup-c-map']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ko-KR'});
 const page=await ctx.newPage();
 await page.goto('file://'+dir+'/'+name+'.html',{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(800);
 const fonts=await page.evaluate(()=>[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).filter((v,i,a)=>a.indexOf(v)===i));
 await page.screenshot({path:dir+'/'+name+'-390.png'});
 console.log(name,fonts.join(','));
 await ctx.close();
}
await browser.close();
