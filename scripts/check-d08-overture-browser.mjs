// D08 PR 4 Overture credit in real Chromium (360·390px touch, 1280px mouse):
// - the footer and the data status screen's ‘출처 표기’ show the Overture note, the
//   attribution of every source and its links (Overture, the CDLA Permissive 2.0 and
//   Apache 2.0 texts, Foursquare's NOTICE.txt), wholly on screen when scrolled to, with
//   no horizontal overflow;
// - the map's attribution has the Overture Maps link next to OpenStreetMap, and a hit
//   test at its centre lands on it;
// - every text the credit links to is served as text, byte for byte.
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start) and the
// isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-d08-overture-browser.mjs [base] [evidence.json] [screenshot dir]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
// The credit as lib/geo-attribution.ts writes it, read here from the source.
const source=readFileSync('lib/geo-attribution.ts','utf8');
const NOTE=/OVERTURE_NOTE='([^']+)'/.exec(source)[1],SOURCES=[...source.matchAll(/'(Data from [^']+)'/g)].map(m=>m[1]);
const LINKS=[.../export const OVERTURE_LINKS=\[(.*)\] as const;/.exec(source)[1].matchAll(/url:'([^']+)'/g)].map(m=>m[1]),TEXTS=LINKS.filter(u=>u.startsWith('/licenses/'));
for(const url of TEXTS){
 const served=await fetch(base+url);
 check(url+' 전문이 글자로 그대로 제공됨',served.status===200&&/^text\/plain/.test(served.headers.get('content-type')??'')&&await served.text()===readFileSync('public'+url,'utf8'),{status:served.status,type:served.headers.get('content-type')});
}
const browser=await chromium.launch();
for(const w of [360,390,1280]){
 width=w;const mobile=w<900;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 const tap=l=>mobile?l.tap():l.click();
 // A link that wraps has one box per line: each is hit-tested at its own centre.
 const credit=async root=>page.evaluate(([root,note,sources])=>{
  const p=[...document.querySelectorAll(root+' p')].find(e=>e.textContent.includes(note));if(!p)return null;
  p.scrollIntoView({block:'center'});
  const r=p.getBoundingClientRect(),links=[...p.querySelectorAll('a')].map(a=>{const b=a.getBoundingClientRect(),boxes=[...a.getClientRects()].filter(x=>x.width>0);return{text:a.textContent,href:a.getAttribute('href'),target:a.target,lines:boxes.length,onScreen:b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth,hit:boxes.length>0&&boxes.every(x=>{const hit=document.elementFromPoint(x.left+x.width/2,x.top+x.height/2);return!!hit&&(hit===a||a.contains(hit))})}});
  return{text:p.textContent,sources:sources.every(s=>p.textContent.includes(s)),overture:p.textContent.includes('Overture Maps Foundation, overturemaps.org'),inside:r.left>=0&&r.right<=innerWidth+0.5,links,overflow:document.documentElement.scrollWidth>innerWidth};
 },[root,NOTE,SOURCES]);
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.locator('[data-overture-credit]').scrollIntoViewIfNeeded();
 const foot=await credit('footer.site-footer');
 const same=c=>!!c&&c.links.length===LINKS.length&&c.links.every((l,i)=>l.href===LINKS[i]);
 check(`바닥글: 안내 문장, Overture 표기(출처 ${SOURCES.length}곳 문구), 링크 ${LINKS.length}개(Overture Maps와 전문들)가 화면 안에 있고 눌림, 가로 넘침 없음`,!!foot&&foot.sources&&foot.overture&&foot.inside&&!foot.overflow&&same(foot)&&foot.links.every(l=>l.onScreen&&l.hit&&l.target==='_blank'),foot);
 if(shots)await page.locator('[data-overture-credit]').screenshot({path:join(shots,`footer-${w}.png`)});
 // Opened by its address: the footer button moves while the list keeps loading more stays.
 await page.goto(base+'/#status',{waitUntil:'networkidle'});
 const sheet=page.locator('#u06-credits');await sheet.waitFor({timeout:10000});await sheet.scrollIntoViewIfNeeded();
 const status=await credit('.u06-credits');
 check(`자료 현황 ‘출처 표기’: 같은 안내·표기·링크 ${LINKS.length}개가 화면 안에 있고 눌림, 가로 넘침 없음`,!!status&&status.sources&&status.overture&&status.inside&&!status.overflow&&same(status)&&status.links.every(l=>l.onScreen&&l.hit),status);
 if(shots)await page.locator('.u06-credits').screenshot({path:join(shots,`status-credits-${w}.png`)});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 if(mobile)await tap(page.locator('.mobile-map-toggle'));else await page.getByRole('button',{name:'지도 크게'}).click();
 const attribution=page.locator('.leaflet-control-attribution');await attribution.waitFor({timeout:10000});await page.waitForTimeout(800);await attribution.scrollIntoViewIfNeeded();
 const map=await attribution.evaluate(e=>{const links=[...e.querySelectorAll('a')].map(a=>{const b=a.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return{text:a.textContent.trim(),href:a.href,onScreen:b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth,hit:!!hit&&(hit===a||a.contains(hit))}});return{text:e.textContent.trim(),links,overflow:document.documentElement.scrollWidth>innerWidth}});
 const ov=map.links.find(l=>l.text==='Overture Maps'),osm=map.links.find(l=>l.text==='OpenStreetMap');
 check('지도 출처 칸: OpenStreetMap과 Overture Maps 링크가 화면 안에 있고 눌림, 가로 넘침 없음',!!ov&&!!osm&&ov.href==='https://overturemaps.org/'&&ov.onScreen&&ov.hit&&osm.hit&&!map.overflow,map);
 if(shots)await page.screenshot({path:join(shots,`map-${w}.png`)});
 check('페이지 오류 없음',!errors.length,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass).length;
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`D08 Overture browser: ${results.length-failed}/${results.length} passed -> ${failed?'FAIL':'PASS'}`);
process.exit(failed?1:0);
