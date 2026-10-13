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
 const scale=256*2**view.zoom/cellPx,cells=new Map<string,number[]>(),inView:number[]=[];
 for(let k=0;k<p.rows.length;k++){
  const a=p.lat[k],b=p.lng[k];
  if(a<view.south||a>view.north||b<view.west||b>view.east)continue;
  inView.push(k);
  const key=Math.floor(p.x[k]*scale)+':'+Math.floor(p.y[k]*scale);
  const cell=cells.get(key);if(cell)cell.push(k);else cells.set(key,[k]);
 }
 const markers:MapMarker[]=[];
 for(const members of cells.values()){
  if(members.length===1){const k=members[0];markers.push({kind:'stay',row:p.rows[k],lat:p.lat[k],lng:p.lng[k],grade:p.grade[k]});continue}
  let la=0,lo=0,south=90,north=-90,west=180,east=-180,approximate=0;
  for(const k of members){const a=p.lat[k],b=p.lng[k];la+=a;lo+=b;if(a<south)south=a;if(a>north)north=a;if(b<west)west=b;if(b>east)east=b;if(p.grade[k]>=2)approximate++}
  markers.push({kind:'group',rows:members.map(k=>p.rows[k]),count:members.length,lat:la/members.length,lng:lo/members.length,samePoint:south===north&&west===east,south,west,north,east,approximate});
 }
 return{markers,inView:inView.map(k=>p.rows[k]),outOfView:p.rows.length-inView.length,unknown:p.unknown.length,total:p.rows.length+p.unknown.length};
}

// Stays a marker stands for (one for a single marker, every member for a group).
export const markerCount=(m:MapMarker)=>m.kind==='stay'?1:m.count;
