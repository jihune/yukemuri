// U07 map evidence: the map of a name search for Okinawa (its main island, Miyako, Yaeyama and
// the Daito islands far apart) drawn by a local build over the public snapshot of 2026-10-17
// (copied into dist/client/snapshot; no database is read), with OpenStreetMap tiles, before and
// after the fix. For each marker it records the caret tip and the distance in screen pixels to
// the nearest stay point of the result, and for groups the distance to their nearest member.
// Usage: node docs/evidence/u07-20261019/tools/map-sea-shots.mjs <base> <name> <out folder> <snapshot folder>
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base,name,out,snap]=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync(join(snap,'manifest.json'),'utf8')),file=f=>JSON.parse(readFileSync(join(snap,manifest.files[f].replace(/^\/snapshot\//,'')),'utf8'));
const core=file('core'),geo=file('geo');
const point=i=>core.lat[i]!==null&&core.lng[i]!==null?[core.lat[i],core.lng[i]]:geo.grade[i]>0?[geo.lat[i],geo.lng[i]]:null;
const mx=lng=>(lng+180)/360,my=lat=>{const t=Math.sin(lat*Math.PI/180);return 0.5-Math.log((1+t)/(1-t))/(4*Math.PI)};
const browser=await chromium.launch(),report=[];
for(const [w,mobile] of [[1280,false],[390,true]]){
 const page=await browser.newPage({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 // Only the site and the map tiles; no stay photos.
 await page.route(u=>!u.href.startsWith(base)&&!u.href.startsWith('https://tile.openstreetmap.org/'),r=>r.abort().catch(()=>{}));
 await page.goto(base+'/?q='+encodeURIComponent('오키나와'),{waitUntil:'networkidle'});
 if(mobile){await page.locator('.mobile-map-toggle').tap()}
 await page.waitForFunction(()=>document.querySelector('.map-canvas')?.dataset.view,null,{timeout:20000});
 await page.waitForLoadState('networkidle');await page.waitForTimeout(1500);
 await page.locator('.stay-map').screenshot({path:join(out,`map-okinawa-${w}-${name}.png`)});
 const r=await page.evaluate(()=>{const c=document.querySelector('.map-canvas'),cr=c.getBoundingClientRect();return{view:c.dataset.view,markers:[...c.querySelectorAll('.leaflet-marker-icon')].map(icon=>{const l=icon.querySelector('.stay-marker'),b=l.getBoundingClientRect();let tip=null;for(let y=b.bottom-2;y<=b.bottom+14;y+=0.5){const hit=document.elementFromPoint(b.left+b.width/2,y);if(hit===l)tip={x:b.left+b.width/2-cr.left,y:y+0.5-cr.top}}return{text:l.textContent.trim(),tip}})}});
 const [west,,, north,zoom]=r.view.split(',').map(Number),W=256*2**zoom,px=p=>({x:(mx(p[1])-mx(west))*W,y:(my(p[0])-my(north))*W});
 const pts=[];for(let i=0;i<core.ids.length;i++){const p=point(i);if(p)pts.push(px(p))}
 const kmPerPx=40075016.686*Math.cos(26.3*Math.PI/180)/W/1000;
 const markers=r.markers.map(m=>{if(!m.tip)return{...m,nearestStayPx:null};const d=Math.min(...pts.map(p=>Math.hypot(p.x-m.tip.x,p.y-m.tip.y)));return{text:m.text,tip:m.tip,nearestStayPx:+d.toFixed(1),nearestStayKm:+(d*kmPerPx).toFixed(1)}});
 report.push({width:w,view:r.view,kmPerPx:+kmPerPx.toFixed(2),markers});
 await page.close();
}
await browser.close();
writeFileSync(join(out,`map-okinawa-${name}.json`),JSON.stringify({checkedAt:new Date().toISOString(),base,snapshot:manifest.id,report},null,1)+'\n');
console.log(JSON.stringify(report.map(r=>({width:r.width,view:r.view,markers:r.markers.map(m=>`${m.text}:${m.nearestStayPx}px/${m.nearestStayKm}km`)}))));
