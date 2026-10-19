// D08 PR 2 after deploy: the Commons photo and its credit in the detail of the live site, in
// Chromium with the real images (Wikimedia thumbnails included). Public GETs only, no key.
// Usage: node docs/evidence/d08-20261019/tools/commons-live.mjs out.json trip-1 trip-2 ...
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [out,...ids]=process.argv.slice(2),base='https://yukemuri.jihune.workers.dev';
const rows=new Map(JSON.parse(readFileSync(new URL('../../../../data/commons-trip-photos.json',import.meta.url),'utf8')).hotels.map(r=>['trip-'+r[0],r]));
const browser=await chromium.launch(),results=[];
for(const id of ids){
 const [,,url,page,author,licence]=rows.get(id),shown=licence==='Public domain'?'퍼블릭 도메인':licence;
 const context=await browser.newContext({viewport:{width:390,height:780},isMobile:true,hasTouch:true,locale:'ko-KR'}),tab=await context.newPage(),errors=[];
 tab.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 await tab.goto(base+'/#stay/'+id,{waitUntil:'networkidle'});await tab.locator('.hotel-detail .detail-body').waitFor({timeout:30000});
 const next=tab.getByRole('button',{name:'다음 사진'});
 // Step to the last photo, where the Commons photo is.
 for(let i=0;i<10;i++){const c=await tab.locator('.photo-nav>span').textContent();const [a,b]=c.replace('사진 ','').split('/');if(a===b)break;await next.tap();await tab.waitForTimeout(500)}
 await tab.waitForFunction(()=>{const i=document.querySelector('.detail-image img');return i&&i.complete},null,{timeout:20000}).catch(()=>{});
 const s=await tab.evaluate(()=>{const d=document.querySelector('.hotel-detail'),img=d.querySelector('.detail-image img'),credit=d.querySelector('.detail-image .photo-source-credit');
  return{counter:d.querySelector('.photo-nav>span')?.textContent,src:img?.currentSrc,loaded:img?.naturalWidth??0,credit:credit?.textContent,links:[...(credit?.querySelectorAll('a')??[])].map(a=>a.href),sources:[...d.querySelectorAll('.provenance b>a')].map(a=>({text:a.textContent,href:a.href}))}});
 const want=['Wikimedia Commons',author,shown].filter(Boolean).join(' · '),listed=s.sources.find(x=>x.href===page);
 const pass=s.src===url&&s.loaded>0&&s.credit===want&&s.links[0]===page&&listed?.text===`Wikimedia Commons 사진(${[author,shown].filter(Boolean).join(', ')}) ↗`&&errors.length===0;
 results.push({id,pass,want,...s,listed:listed?.text??null,errors});
 console.log(`${pass?'PASS':'FAIL'} ${id} ${s.counter} loaded=${s.loaded} credit=${s.credit}`);
 await context.close();
}
const version=browser.version();await browser.close();
writeFileSync(out,JSON.stringify({checkedAt:new Date().toISOString(),base,browser:'Chromium '+version,results},null,1)+'\n');
const failed=results.filter(r=>!r.pass).length;
console.log(`live checks=${results.length} failed=${failed} ${failed?'FAIL':'PASS'}`);process.exit(failed?1:0);
