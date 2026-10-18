// U07 map markers in real Chromium (360·390px touch, 1280px mouse), docs/U07-20261019.md:
// a marker's caret points at a stay's own point. For every marker wholly inside the map, at the
// first view and four zoom steps in (all Japan, with groups at every width, and a name search
// for Okinawa's islands, whose four points in the checked-in data group only on a phone):
// - a single stay's caret tip is within 2px of that stay's point;
// - a group's caret tip is within 2px of the point of a stay in view (a group sits on a member,
//   never on the members' mean, which lay 40 km out at sea between Miyako and Ishigaki).
// The tip is found by hit testing down the marker's middle, so it is where the caret is drawn.
// Points are projected from the view the map reports (data-view) as Leaflet does (Web Mercator).
// Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)
// and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-u07-map-browser.mjs [base] [evidence.json] [screenshot folder]
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {siteSearch} from './site-search-node.mjs';
const require=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const [base='http://127.0.0.1:8787',evidence,shots]=process.argv.slice(2);
if(shots)mkdirSync(shots,{recursive:true});
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const search=await siteSearch(base),s=search.snapshot,geo=search.geo;
// The page's rule (lib/map-groups.ts resultPositions): the source's point, else a graded D06 point.
const point=i=>{let a=s.core.lat[i],b=s.core.lng[i];if((a===null||b===null)&&geo&&(geo.grade[i]??0)>0){a=geo.lat[i];b=geo.lng[i]}return a===null||b===null?null:[a,b]};
const mx=lng=>(lng+180)/360,my=lat=>{const t=Math.sin(Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180);return 0.5-Math.log((1+t)/(1-t))/(4*Math.PI)};
const browser=await chromium.launch();
for(const [w,mobile] of [[360,true],[390,true],[1280,false]]){
 width=w;
 const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
 await context.route(url=>!url.href.startsWith(base),route=>route.abort().catch(()=>{}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
 for(const [params,label] of [['','전국'],['q=오키나와','오키나와']]){
  const order=search.order(params),ids=new Map(order.map(i=>[s.core.ids[i],i]));
  await page.goto(base+'/'+(params?'?'+params:''),{waitUntil:'networkidle'});
  if(mobile)await page.locator('.mobile-map-toggle').tap();
  await page.locator('.stay-map').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.map-canvas')?.dataset.view,null,{timeout:15000}).catch(()=>{});
  // Every marker wholly inside the map: its caret tip, found by hit testing down its middle.
  const read=()=>page.evaluate(()=>{
   const canvas=document.querySelector('.map-canvas'),c=canvas.getBoundingClientRect();
   return{view:canvas.dataset.view,canvas:{left:c.left,top:c.top},markers:[...canvas.querySelectorAll('.leaflet-marker-icon')].map(icon=>{
    const r=icon.getBoundingClientRect(),label=icon.querySelector('.stay-marker'),l=label.getBoundingClientRect();
    if(r.left<c.left||r.right>c.right||r.top<c.top||r.bottom>c.bottom)return null;
    let tip=null;
    for(let dx=-3;dx<=3;dx++)for(let y=l.bottom-2;y<=r.bottom+12;y+=0.5){const hit=document.elementFromPoint(l.left+l.width/2+dx,y);if(hit===label&&(tip===null||y>tip.y))tip={x:l.left+l.width/2+dx,y}}
    // A caret under the map's own controls or notes cannot be seen; it is counted, not judged.
    const under=document.elementFromPoint(l.left+l.width/2,l.bottom+3);
    if(!tip&&under&&!under.closest('.leaflet-marker-pane'))return{covered:true};
    return{stay:icon.dataset.stayIds??null,group:icon.dataset.group??null,count:Number(icon.dataset.count??1),text:label.textContent.trim(),tip:tip&&{x:tip.x-c.left,y:tip.y+0.5-c.top}};
   }).filter(Boolean)};
  });
  const steps=[];
  const audit=async step=>{
   await page.waitForTimeout(700);const r=await read();
   const [west,south,east,north,zoom]=r.view.split(',').map(Number),W=256*2**zoom;
   const at=i=>{const p=point(i);return p&&{x:(mx(p[1])-mx(west))*W,y:(my(p[0])-my(north))*W,lat:p[0],lng:p[1]}};
   const inView=order.map(at).filter(p=>p&&p.lat>=south&&p.lat<=north&&p.lng>=west&&p.lng<=east);
   const off=[],covered=r.markers.filter(m=>m.covered).length;
   for(const m of r.markers.filter(m=>!m.covered)){
    if(!m.tip){off.push({...m,why:'no tip'});continue}
    const near=m.stay?[at(ids.get(m.stay.split(' ')[0]))]:inView;
    const d=Math.min(...near.filter(Boolean).map(p=>Math.hypot(p.x-m.tip.x,p.y-m.tip.y)));
    if(!(d<=2))off.push({text:m.text,stay:m.stay,group:m.group,tip:m.tip,distance:+d.toFixed(1)});
   }
   steps.push({step,zoom,markers:r.markers.length-covered,covered,groups:r.markers.filter(m=>m.group).length,off:off.length});
   return off;
  };
  const offs=[await audit('처음')];
  if(shots)await page.locator('.stay-map').screenshot({path:join(shots,`map-${label}-${w}.png`)});
  const zoomIn=page.getByRole('button',{name:'지도 확대'});
  for(let i=0;i<4;i++){await zoomIn.evaluate(e=>e.click());offs.push(await audit('확대 '+(i+1)))}
  const bad=offs.flat(),checked=steps.reduce((n,x)=>n+x.markers,0),groups=steps.reduce((n,x)=>n+x.groups,0);
  check(`${label}: 처음과 확대 4단계에서 표지 ${checked}개(묶음 ${groups}개)의 꼬리 끝이 숙소 점에서 2px 안(묶음은 화면 안 숙소 하나의 점 위)`,checked>0&&(label!=='전국'||groups>0)&&bad.length===0,{steps,off:bad.slice(0,8)});
 }
 check('페이지 오류 없음',errors.length===0,{errors});
 await context.close();
}
await browser.close();
const failed=results.filter(r=>!r.pass);
if(evidence)writeFileSync(evidence,JSON.stringify({checkedAt:new Date().toISOString(),base,results},null,1)+'\n');
console.log(`checks=${results.length} failed=${failed.length} ${failed.length?'FAIL':'PASS'}`);
process.exit(failed.length?1:0);
