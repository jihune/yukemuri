import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const dir=(await import('node:path')).resolve(process.argv[2]);const browser=await chromium.launch();
for(const [name,sel] of [['mockup-a-noren','.card'],['mockup-b-checklist','.card'],['mockup-c-map','.row']]){
 const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();
 await page.goto('file://'+dir+'/'+name+'.html',{waitUntil:'networkidle'});
 const r=await page.evaluate(s=>{const c=[...document.querySelectorAll(s)].map(e=>{const b=e.getBoundingClientRect();return [Math.round(b.top),Math.round(b.height)]});const small=[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.height<40}).length;const minFont=Math.min(...[...document.querySelectorAll('body *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize)));return {cards:c,smallButtons:small,minFont}},sel);
 console.log(name,JSON.stringify(r));await ctx.close();
}
await browser.close();
