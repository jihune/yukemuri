// U05 map mode: every stay of the current search result is on the map or counted as
// "location unknown" (user decision 2026-10-13: other sites drop stays from their maps in
// dense places and large areas, and this map must not).
//
// Grouping runs over the stays inside the current view only, in square cells of the
// world pixel grid at the current zoom. A group therefore holds only stays that are on
// screen and sits at their mean position, which is on screen too, so
//   stays in view = single markers + the numbers on group markers
// holds exactly at every zoom, and the list beside the map shows the same stays. A
// whole-set clusterer (supercluster) places a cluster at the centre of all its members,
// so a cluster can sit off screen while some members are on screen and those stays would
// vanish from the view; that is the failure the user asked to avoid. The cells are
// anchored to the world grid, not the screen, so panning does not reshuffle them.
//
// Positions are Web Mercator x/y in [0, 1] (Leaflet EPSG:3857: 256px at zoom 0), computed
// once per result. grade: lib/search-snapshot.ts GEO_GRADE (1 = the source's own point,
// 2 and up = an approximate point; 0 = none, counted as unknown).

export type PositionColumns={lat:(number|null)[];lng:(number|null)[];grade?:(number|null)[]};
export type ResultPositions={
 // Snapshot rows of the result that have a point, in result order.
 rows:Int32Array;lat:Float64Array;lng:Float64Array;x:Float64Array;y:Float64Array;grade:Uint8Array;
 // Snapshot rows of the result without a point.
 unknown:number[];
};
export type MapView={west:number;south:number;east:number;north:number;zoom:number};
export type StayMarker={kind:'stay';row:number;lat:number;lng:number;grade:number};
export type GroupMarker={kind:'group';rows:number[];count:number;lat:number;lng:number;
 // Every member at the same point: zooming cannot split it, so it opens as a list.
 samePoint:boolean;south:number;west:number;north:number;east:number;
 // Members whose point is approximate (grade 2 and up).
 approximate:number};
export type MapMarker=StayMarker|GroupMarker;
export type ViewGroups={markers:MapMarker[];
 // The stays in view, in result order: what the list beside the map shows.
 inView:number[];outOfView:number;unknown:number;total:number};

// A group marker is up to 60px wide; cells a little wider keep neighbours from overlapping much.
export const GROUP_CELL_PX=72;
// The largest marker icon (stay-map.tsx: groups 60×44, single stays 52×44); icons centred on
// points closer than this in both directions overlap.
export const MARKER_PX={width:60,height:44};
// Web Mercator x/y in [0, 1] at zoom 0, as Leaflet projects.
export const mercatorPoint=(lat:number,lng:number):[number,number]=>[mercatorX(lng),mercatorY(lat)];

const mercatorX=(lng:number)=>(lng+180)/360;
const mercatorY=(lat:number)=>{const s=Math.sin(Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180);return 0.5-Math.log((1+s)/(1-s))/(4*Math.PI)};

// The result's points: payload points first, then the approximate ones (D06 geo.json)
// when that file is loaded. A row with neither is unknown.
export function resultPositions(order:ArrayLike<number>,core:PositionColumns,geo:PositionColumns|null):ResultPositions{
 const n=order.length,rows:number[]=[],lat:number[]=[],lng:number[]=[],grade:number[]=[],unknown:number[]=[];
 for(let k=0;k<n;k++){
  const i=order[k];let a=core.lat[i]??null,b=core.lng[i]??null,g=1;
  if((a===null||b===null)&&geo){const gg=geo.grade?.[i]??0;if(gg>0){a=geo.lat[i]??null;b=geo.lng[i]??null;g=gg}}
  if(a===null||b===null||!Number.isFinite(a)||!Number.isFinite(b)){unknown.push(i);continue}
  rows.push(i);lat.push(a);lng.push(b);grade.push(g);
 }
 return{rows:Int32Array.from(rows),lat:Float64Array.from(lat),lng:Float64Array.from(lng),x:Float64Array.from(lng.map(mercatorX)),y:Float64Array.from(lat.map(mercatorY)),grade:Uint8Array.from(grade),unknown};
}

export function viewGroups(p:ResultPositions,view:MapView,cellPx=GROUP_CELL_PX):ViewGroups{
 const world=256*2**view.zoom,scale=world/cellPx,cells=new Map<number,number[]>(),inView:number[]=[];
 for(let k=0;k<p.rows.length;k++){
  const a=p.lat[k],b=p.lng[k];
  if(a<view.south||a>view.north||b<view.west||b>view.east)continue;
  inView.push(k);
  const key=Math.floor(p.x[k]*scale)*2**22+Math.floor(p.y[k]*scale);
  const cell=cells.get(key);if(cell)cell.push(k);else cells.set(key,[k]);
 }
 // Neighbouring cells can put two icons almost on top of each other across a cell border;
 // the lower one could then not be seen or tapped. So in passes, each group (largest first)
 // takes in the groups whose icons overlap its own, found through buckets of icon size,
 // until a pass merges nothing. A merged group sits at its members' mean, inside the view.
 type Group={members:number[];lat:number;lng:number};
 let groups:Group[]=[...cells.values()].map(members=>{let la=0,lo=0;for(const k of members){la+=p.lat[k];lo+=p.lng[k]}return{members,lat:la/members.length,lng:lo/members.length}});
 const W=MARKER_PX.width,H=MARKER_PX.height;
 for(let merged=true;merged;){
  merged=false;
  groups.sort((a,b)=>b.members.length-a.members.length);
  const n=groups.length,x=new Float64Array(n),y=new Float64Array(n),buckets=new Map<number,number[]>();
  for(let i=0;i<n;i++){
   x[i]=mercatorX(groups[i].lng)*world;y[i]=mercatorY(groups[i].lat)*world;
   const key=Math.floor(x[i]/W)*2**22+Math.floor(y[i]/H),bucket=buckets.get(key);
   if(bucket)bucket.push(i);else buckets.set(key,[i]);
  }
  const taken=new Uint8Array(n),next:Group[]=[];
  for(let i=0;i<n;i++){
   if(taken[i])continue;taken[i]=1;
   const g=groups[i],bx=Math.floor(x[i]/W),by=Math.floor(y[i]/H);
   let la=g.lat*g.members.length,lo=g.lng*g.members.length;
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of buckets.get((bx+dx)*2**22+by+dy)??[]){
    if(taken[j]||Math.abs(x[i]-x[j])>=W||Math.abs(y[i]-y[j])>=H)continue;
    taken[j]=1;merged=true;
    const h=groups[j];la+=h.lat*h.members.length;lo+=h.lng*h.members.length;
    for(const k of h.members)g.members.push(k);
   }
   next.push({members:g.members,lat:la/g.members.length,lng:lo/g.members.length});
  }
  groups=next;
 }
 const markers:MapMarker[]=[];
 for(const {members,lat,lng} of groups){
  if(members.length===1){const k=members[0];markers.push({kind:'stay',row:p.rows[k],lat:p.lat[k],lng:p.lng[k],grade:p.grade[k]});continue}
  let south=90,north=-90,west=180,east=-180,approximate=0;
  for(const k of members){const a=p.lat[k],b=p.lng[k];if(a<south)south=a;if(a>north)north=a;if(b<west)west=b;if(b>east)east=b;if(p.grade[k]>=2)approximate++}
  markers.push({kind:'group',rows:members.map(k=>p.rows[k]),count:members.length,lat,lng,samePoint:south===north&&west===east,south,west,north,east,approximate});
 }
 return{markers,inView:inView.map(k=>p.rows[k]),outOfView:p.rows.length-inView.length,unknown:p.unknown.length,total:p.rows.length+p.unknown.length};
}

// Stays a marker stands for (one for a single marker, every member for a group).
export const markerCount=(m:MapMarker)=>m.kind==='stay'?1:m.count;
