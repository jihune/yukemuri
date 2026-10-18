// U05 map mode: no stay of the search result goes missing from the map.
// On a dense fixture (13,000 stays, 2,000 of them in one onsen town, 49 at one
// point, some without any point) at every zoom from all Japan to street level:
// - single markers + group numbers = the stays whose point is inside the view
//   (counted independently here) = the list beside the map, each stay once;
// - in view + out of view + location unknown = the result count;
// - every marker sits inside the view;
// - the 49 stays at one point stay one group that opens as a list.
// A variant that shows only a representative per group, and one that clusters
// over the whole set (a cluster outside the view hides stays inside it), must fail.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-map-groups-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/map-groups.ts','--outDir',dir,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 const {resultPositions,viewGroups,markerCount,MARKER_PX,mercatorPoint,GROUP_CELL_PX,nearestMean}=createRequire(join(dir,'x.cjs'))(join(dir,'map-groups.js'));
 // A fixed pseudo-random fixture.
 let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const N=13000,lat=[],lng=[],grade=[],geoLat=[],geoLng=[];
 for(let i=0;i<N;i++){
  let a,b;
  if(i<2000){a=35.23+rnd()*0.06;b=139.0+rnd()*0.1}            // Hakone, dense
  else if(i<2049){a=33.2650;b=131.3560}                          // 49 at one point (Yufuin centre)
  else{a=31+rnd()*14;b=129.5+rnd()*16}                           // all of Japan
  const unknown=i%97===0,approximate=!unknown&&i%3===0;
  lat.push(approximate||unknown?null:a);lng.push(approximate||unknown?null:b);
  grade.push(unknown?0:approximate?4:1);geoLat.push(unknown?null:a);geoLng.push(unknown?null:b);
 }
 const order=Array.from({length:N},(_,i)=>N-1-i);
 const geo={lat:geoLat,lng:geoLng,grade};
 const p=resultPositions(order,{lat,lng},geo);
 const unknownCount=Array.from({length:N},(_,i)=>i).filter(i=>i%97===0).length;
 assert.equal(p.unknown.length,unknownCount,'rows with no point are counted as unknown');
 assert.equal(p.rows.length+p.unknown.length,N,'every result row is placed or unknown');
 // Without geo.json only payload points are on the map; the rest are unknown, none dropped.
 const bare=resultPositions(order,{lat,lng},null);
 assert.equal(bare.rows.length+bare.unknown.length,N);
 assert.equal(bare.rows.length,lat.filter(v=>v!==null).length);
 // A payload point keeps the grade geo.json gives it: a seed point (grade 4) is approximate.
 const seedPoints=resultPositions([0,1],{lat:[35,35.1],lng:[139,139.1]},{lat:[35,35.1],lng:[139,139.1],grade:[4,1]});
 assert.deepEqual([...seedPoints.grade],[4,1],'payload points keep their geo.json grade');

 const views=[];
 const japan={west:122,south:24,east:154,north:46};
 for(let zoom=3;zoom<=18;zoom++){
  const span=Math.min(1,2**(5-zoom));
  views.push({...japan,zoom},{zoom,west:139.05-8*span,east:139.05+8*span,south:35.26-5*span,north:35.26+5*span},{zoom,west:131.356-2*span,east:131.356+2*span,south:33.265-1.5*span,north:33.265+1.5*span});
  for(let r=0;r<4;r++){const cx=130+rnd()*14,cy=32+rnd()*12;views.push({zoom,west:cx-6*span,east:cx+6*span,south:cy-4*span,north:cy+4*span})}
 }
 const inside=(v,a,b)=>a>=v.south&&a<=v.north&&b>=v.west&&b<=v.east;
 // Icons stand on their points with one offset; two closer than an icon in both directions overlap,
 // and the lower one cannot be seen or tapped.
 const overlaps=(v,markers)=>{const w=256*2**v.zoom,pts=markers.map(m=>mercatorPoint(m.lat,m.lng).map(c=>c*w));let n=0;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(Math.abs(pts[i][0]-pts[j][0])<MARKER_PX.width&&Math.abs(pts[i][1]-pts[j][1])<MARKER_PX.height)n++;return n};
 // U07: a group sits on one of its members' points, never on their mean (which can be in the sea).
 const rowIndex=new Map([...p.rows].map((r,k)=>[r,k]));
 const onMember=m=>m.kind==='stay'||m.rows.some(r=>{const k=rowIndex.get(r);return p.lat[k]===m.lat&&p.lng[k]===m.lng});
 const audit=(v,g)=>{
  let expected=0;for(let k=0;k<p.rows.length;k++)if(inside(v,p.lat[k],p.lng[k]))expected++;
  const shown=g.markers.reduce((n,m)=>n+markerCount(m),0);
  const members=g.markers.flatMap(m=>m.kind==='stay'?[m.row]:m.rows);
  return {expected,shown,list:g.inView.length,unique:new Set(members).size,members:members.length,
   sameSet:members.length===g.inView.length&&new Set(members).size===members.length&&g.inView.every(r=>members.includes(r)),
   placed:g.markers.every(m=>inside(v,m.lat,m.lng)),
   onMember:g.markers.every(onMember),
   overlaps:overlaps(v,g.markers),
   total:g.inView.length+g.outOfView+g.unknown};
 };
 let checked=0,slowest=0,stress=0;
 // Warm the code up first so the timings below are of the grouping, not of compiling it.
 for(const v of views.slice(0,30))viewGroups(p,v);
 for(const v of views){
  const t=performance.now(),g=viewGroups(p,v),took=performance.now()-t;
  // A screen holds at most about 1920×1200px; the all-Japan box at street zoom is only a stress case.
  const [x0,y0]=mercatorPoint(v.north,v.west),[x1,y1]=mercatorPoint(v.south,v.east),w=256*2**v.zoom;
  if((x1-x0)*w<=1920&&(y1-y0)*w<=1200)slowest=Math.max(slowest,took);else stress=Math.max(stress,took);
  const a=audit(v,g),label=JSON.stringify(v);
  assert.equal(a.shown,a.expected,'markers + group numbers = stays in view '+label);
  assert.equal(a.list,a.expected,'the list beside the map holds the stays in view '+label);
  assert.ok(a.sameSet,'markers and the list are the same stays, each once '+label);
  assert.ok(a.placed,'every marker inside the view '+label);
  assert.ok(a.onMember,'every group sits on one of its members\' points '+label);
  assert.equal(a.overlaps,0,'no two marker icons overlap '+label);
  assert.equal(a.total,N,'in view + out of view + unknown = result '+label);
  checked++;
 }
 // The 49 stays at one point: one group at street level that opens as a list.
 const street=viewGroups(p,{zoom:18,west:131.355,east:131.357,south:33.264,north:33.266});
 const stack=street.markers.find(m=>m.kind==='group'&&m.samePoint);
 assert.ok(stack&&stack.count===street.inView.length&&stack.count>=30,'stays at one point stay one group '+JSON.stringify(stack&&{count:stack.count,inView:street.inView.length}));
 assert.ok(viewGroups(p,{...japan,zoom:5}).markers.some(m=>m.kind==='group'&&m.approximate>0),'groups count their approximate members');
 // 13,000 stays at the widest view stay fast enough for a phone (laptop CPU here).
 const wide=performance.now();for(let r=0;r<10;r++)viewGroups(p,{...japan,zoom:5});const per=(performance.now()-wide)/10;
 assert.ok(per<25,`grouping 13,000 stays took ${per.toFixed(1)}ms`);
 assert.ok(slowest<25,`the slowest screen-sized view took ${slowest.toFixed(1)}ms`);

 // Broken variants must fail the same audit.
 const representative=(v)=>{const g=viewGroups(p,v);return{...g,markers:g.markers.map(m=>m.kind==='group'?{kind:'stay',row:m.rows[0],lat:m.lat,lng:m.lng,grade:1}:m)}};
 const a1=audit(japan.zoom?japan:{...japan,zoom:5},representative({...japan,zoom:5}));
 assert.notEqual(a1.shown,a1.expected,'a representative-only map is caught');
 // Whole-set clustering at a coarse grid: clusters are placed at the mean of all members
 // and dropped when that mean is off screen.
 const wholeSet=(v)=>{const all=viewGroups(p,{west:-180,east:180,south:-85,north:85,zoom:v.zoom});const markers=all.markers.filter(m=>inside(v,m.lat,m.lng));return{markers,inView:markers.flatMap(m=>m.kind==='stay'?[m.row]:m.rows),outOfView:0,unknown:p.unknown.length}};
 const caught=views.filter(v=>{const a=audit(v,wholeSet(v));return a.shown!==a.expected||!a.sameSet}).length;
 assert.ok(caught>0,'whole-set clustering loses stays at some view');
 // Groups at their members' mean (as before U07) are caught: the mean is no stay's point.
 const atMean=v=>{const g=viewGroups(p,v);return{...g,markers:g.markers.map(m=>m.kind==='stay'?m:{...m,lat:m.rows.reduce((n,r)=>n+p.lat[rowIndex.get(r)],0)/m.count,lng:m.rows.reduce((n,r)=>n+p.lng[rowIndex.get(r)],0)/m.count})}};
 const meanCaught=views.filter(v=>!audit(v,atMean(v)).onMember).length;
 assert.ok(meanCaught>0,'groups at the mean are caught');
 // nearestMean, where the area search's grouped spots and grid cells put their marker: the member
 // nearest the members' mean on the screen. At 45°N a degree north is 1.41 times as long on the
 // screen as a degree east, so a stay 0.12° east is nearer the mean than one 0.1° north. The same
 // pick in degrees (as before) chooses the one north and is caught.
 const cross=[{lat:45.1,lng:141},{lat:44.9,lng:141},{lat:45,lng:141.12},{lat:45,lng:140.88}];
 assert.equal(nearestMean(cross),cross[2],'nearestMean measures on the screen (Web Mercator)');
 const inDegrees=list=>{const la=list.reduce((a,h)=>a+h.lat,0)/list.length,lo=list.reduce((a,h)=>a+h.lng,0)/list.length;return list.reduce((b,h)=>(h.lat-la)**2+(h.lng-lo)**2<(b.lat-la)**2+(b.lng-lo)**2?h:b)};
 assert.notEqual(inDegrees(cross),cross[2],'a pick in degrees is caught');
 // The grid alone (no merging of neighbouring cells) puts icons on top of each other.
 const gridOnly=v=>{const scale=256*2**v.zoom/GROUP_CELL_PX,cells=new Map();for(let k=0;k<p.rows.length;k++){if(!inside(v,p.lat[k],p.lng[k]))continue;const key=Math.floor(p.x[k]*scale)+':'+Math.floor(p.y[k]*scale);(cells.get(key)??cells.set(key,[]).get(key)).push(k)}return[...cells.values()].map(ks=>({lat:ks.reduce((n,k)=>n+p.lat[k],0)/ks.length,lng:ks.reduce((n,k)=>n+p.lng[k],0)/ks.length}))};
 const overlapping=views.filter(v=>overlaps(v,gridOnly(v))>0).length;
 assert.ok(overlapping>0,'grid-only grouping overlaps icons at some view');
 console.log(`Map groups: ${checked} views (zoom 3-18, 13,000 stays, ${p.unknown.length} unknown) keep markers + group numbers = stays in view = list, and in view + out of view + unknown = result; every group sits on a member's point (groups at the mean fail ${meanCaught} views); 49 stays at one point stay one list group; slowest screen-sized view ${slowest.toFixed(1)}ms, all Japan ${per.toFixed(1)}ms (all-Japan box at street zoom, ${stress.toFixed(1)}ms). No two icons overlap. Representative-only and whole-set variants fail (${caught} views); grid-only grouping overlaps icons (${overlapping} views).`);
}finally{rmSync(dir,{recursive:true,force:true})}
