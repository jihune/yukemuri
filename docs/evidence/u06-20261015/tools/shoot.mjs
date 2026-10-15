// U06 시안 캡처: mockup-status.html을 360px(휴대폰)와 1280px(데스크톱)에서 찍는다.
// Playwright는 레포의 .sites-runtime/u01-browser(브라우저 검사와 같은 위치)에서 찾는다.
// 실행: node docs/evidence/u06-20261015/tools/shoot.mjs
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),dir=path.join(here,'..'),repo=path.join(dir,'..','..','..');
const {chromium}=createRequire(path.join(repo,'.sites-runtime','u01-browser','package.json'))('playwright');
const page_url=pathToFileURL(path.join(dir,'mockup-status.html')).href;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
const shots=[
 {name:'mockup-360.png',viewport:{width:360,height:780},mobile:true,full:true},
 {name:'mockup-360-first.png',viewport:{width:360,height:780},mobile:true,full:false},
 {name:'mockup-1280.png',viewport:{width:1280,height:800},mobile:false,full:false},
 {name:'mockup-1280-jalan.png',viewport:{width:1280,height:800},mobile:false,full:false,scope:'jalan'},
];
const report=[];
for(const s of shots){
 const ctx=await browser.newContext({viewport:s.viewport,deviceScaleFactor:2,isMobile:s.mobile,hasTouch:s.mobile});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(page_url);await page.evaluate(()=>document.fonts.ready);
 if(s.scope)await page.click(`#scope button[data-k="${s.scope}"]`);
 // 1280: the sheet scrolls on its own, so the capture is the first screen of the sheet.
 const overflow=await page.evaluate(()=>{const w=document.documentElement.clientWidth;return[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>w+0.5||r.left<-0.5)}).map(e=>e.className||e.tagName).slice(0,5)});
 const fonts=await page.evaluate(()=>[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).filter((v,i,a)=>a.indexOf(v)===i));
 const small=await page.evaluate(()=>[...document.querySelectorAll('button,[tabindex="0"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.height<44&&!e.classList.contains('help')&&!e.classList.contains('row'))}).map(e=>e.textContent.trim().slice(0,20)));
 await page.screenshot({path:path.join(dir,s.name),fullPage:s.full});
 report.push({shot:s.name,viewport:s.viewport,scope:s.scope??'all',errors,overflow,fonts,smallTargets:small});
 await ctx.close();
}
await browser.close();
console.log(JSON.stringify(report,null,1));
