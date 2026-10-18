// Opens a stay's detail by its address (#stay/<id>) with a Translator stand-in (Chrome, available),
// and counts React hydration errors in the console. With "corrupt", the server HTML's first text
// is altered before the page reads it, so a hydration error must appear (the control).
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base,id,mode]=process.argv.slice(2);
const browser=await chromium.launch();
const out={};
for(const [w,mobile] of [[390,true],[1280,false]]){
 const c=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,locale:'ko-KR'});
 await c.route(u=>!u.href.startsWith(base),r=>r.abort().catch(()=>{}));
 if(mode==='corrupt')await c.route(u=>u.href===base+'/'||u.href===base+'/index.html',async r=>{const res=await r.fetch();let html=await res.text();html=html.replace(/(<h2[^>]*>)([^<]+)/,'$1변조된 제목');await r.fulfill({response:res,body:html,headers:{...res.headers(),'content-type':'text/html; charset=utf-8'}})});
 await c.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'userAgentData',{configurable:true,get:()=>({brands:[{brand:'Google Chrome',version:'141'}],mobile:false,platform:'Linux'})});window.Translator={availability:async()=>'available',create:async()=>({translate:async t=>'번역: '+t})}});
 const p=await c.newPage(),logs=[];
 p.on('console',m=>{if(m.type()==='error')logs.push(m.text().slice(0,160))});p.on('pageerror',e=>logs.push('pageerror '+String(e).slice(0,160)));
 await p.goto(base+'/#stay/'+id,{waitUntil:'networkidle'});await p.waitForTimeout(2500);
 const button=await p.locator('.hotel-description .translate-button').count(),note=await p.locator('.hotel-description .translate-note').count();
 const hydration=logs.filter(l=>/hydrat|#418|#423|#425/i.test(l));
 out[w]={button,note,hydration:hydration.length,errors:logs.length,sample:logs.slice(0,3)};
 await c.close();
}
await browser.close();
const bad=Object.values(out).reduce((a,r)=>a+r.hydration,0);
console.log(JSON.stringify(out));
console.log(`mode=${mode??'plain'} hydrationErrors=${bad}`);
