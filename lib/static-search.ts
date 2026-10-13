import type {HotelFilters,FeatureKey} from './hotel-types';
import type {SortOrder} from './hotel-search';
import {FEATURE_KEYS} from './hotel-bath-facts';
import {normalizeSearch} from './hotel-names';
import {prepareSearchIndex,searchIndexMatches,localHotelSuggestions,type PreparedSearchIndex,type SearchIndexHotel} from './hotel-search-index';
import {rankHotelAlternatives} from './hotel-alternatives';
import type {HotelSuggestion} from './hotel-suggestions';
import type {HotelSummary,SnapshotCore,SnapshotText,SnapshotManifest,SnapshotCoverage} from './search-snapshot';
// The former server search (lib/hotel-repository.ts until P03) over the static
// snapshot, in the browser. Every rule follows the SQL it replaces: a NULL value
// satisfies no condition, DESC puts NULL last, text compares in SQLite BINARY
// (code point) order, ties end in id order. Snapshot rows are in id order, so
// a row's position is its id rank.
export const PAGE_SIZE=40,MAP_POINT_LIMIT=500;
export type SearchSnapshot={manifest:SnapshotManifest;core:SnapshotCore;cards:HotelSummary[];size:number;position:Map<string,number>;plain:boolean;text?:SnapshotText;index?:{prepared:PreparedSearchIndex;keys:Map<string,number[]>}};
export type HotelAlternative={hotel:HotelSummary;unmetConditions:string[];queryMatched:boolean};
export type SearchResult={order:number[];total:number;unknownExcluded:number;featureCounts:Record<FeatureKey,number>;ryokanCount:number;similarCount:number;similar:string[];alternatives:HotelAlternative[]};
export type SearchResponse={hotels:HotelSummary[];total:number;unknownExcluded:number;page:number;pageSize:number;featureCounts:Record<FeatureKey,number>;ryokanCount:number;coverage:SnapshotCoverage;similarCount:number;similarHotelIds:string[];alternatives:HotelAlternative[]};
// The default view's first page of one snapshot, rendered into the static page.
export type FirstPage={snapshot:string;manifest:SnapshotManifest;response:SearchResponse};
export type MapBounds={west:number;south:number;east:number;north:number};
// grade: lib/search-snapshot.ts GEO_GRADE (1 the source's point, 2 and up approximate).
export type MapPoint={id:string;name:string;lat:number;lng:number;score:number|null;grade?:number};
// The D06 approximate points (geo.json), when the page has them: a stay without the
// source's point is placed there, as on the U05 map (lib/map-groups.ts).
export type GeoColumns={grade:(number|null)[];lat:(number|null)[];lng:(number|null)[]};
// approximate: members whose point is approximate (grade 2 and up).
export type MapCell={lat:number;lng:number;count:number;south:number;west:number;north:number;east:number;approximate:number};
export type MapAreaResponse={total:number;inBounds:number;outOfBounds:number;withoutCoordinates:number;limit:number;points:MapPoint[];cells:MapCell[]};
const SURROGATE=/[\ud800-\udfff]/;
// SQLite BINARY order (UTF-8 bytes, i.e. code points). Native comparison of
// UTF-16 units agrees unless a surrogate pair meets U+E000..U+FFFF.
export function compareText(a:string,b:string){
 for(let i=0,n=Math.min(a.length,b.length);i<n;i++){
  let x=a.charCodeAt(i),y=b.charCodeAt(i);if(x===y)continue;
  if(x>=0xd800&&y>=0xd800){x+=x<0xe000?0x2000:-0x800;y+=y<0xe000?0x2000:-0x800}
  return x-y;
 }
 return a.length-b.length;
}
export function openSnapshot(manifest:SnapshotManifest,core:SnapshotCore,cards:HotelSummary[]):SearchSnapshot{
 const size=core.ids.length;
 if(cards.length!==size||Object.values(core).some(column=>column.length!==size))throw new Error('Snapshot columns differ in length');
 return{manifest,core,cards,size,position:new Map(core.ids.map((id,i)=>[id,i])),plain:!core.name.some(n=>SURROGATE.test(n))};
}
// The name-search part: the substring columns and the typo-tolerant index of
// every hotel that is not closed, in id order as the former index was.
export function addSnapshotText(s:SearchSnapshot,text:SnapshotText){
 const hotels:SearchIndexHotel[]=[],c=s.core;
 for(let i=0;i<s.size;i++){const names=text.names[i];if(names)hotels.push({id:c.ids[i],names,location:text.location[i]!,context:text.context[i]!,region:c.region[i],prefecture:c.prefecture[i],kind:c.kind[i],features:c.features[i]??0,knownFeatures:c.known[i]??0,tripScore:c.tripScore[i],tripReviews:c.tripReviews[i],jalanScore:c.jalanScore[i],jalanReviews:c.jalanReviews[i]})}
 const keys=new Map<string,number[]>();
 text.nameKeys.forEach((list,i)=>{for(const key of list){const rows=keys.get(key);if(rows)rows.push(i);else keys.set(key,[i])}});
 s.text=text;s.index={prepared:prepareSearchIndex(hotels),keys};
}
export const needsText=(filters:HotelFilters)=>!!normalizeSearch(filters.query);
const BITS=Object.fromEntries(FEATURE_KEYS.map((key,i)=>[key,1<<i])) as Record<FeatureKey,number>;
const CLOSED=new Set(['closed','temporarily_closed']);
// Facility, rating, review and ryokan conditions.
function eligible(c:SnapshotCore,i:number,f:HotelFilters){
 if(f.ryokanOnly&&c.kind[i]!=='ryokan')return false;
 const features=c.features[i];
 for(const key of f.features)if(features===null||(features&BITS[key])===0)return false;
 const score=f.ratingProvider==='jalan'?c.jalanScore[i]:c.tripScore[i],reviews=f.ratingProvider==='jalan'?c.jalanReviews[i]:c.tripReviews[i];
 if(f.minRating&&!(score!==null&&score>=f.minRating))return false;
 if(f.minReviews&&!(reviews!==null&&reviews>=f.minReviews))return false;
 return true;
}
// Excluded only for lacking a fact: no selected condition is known to fail.
function unknownOnly(c:SnapshotCore,i:number,f:HotelFilters){
 if(!f.ryokanOnly&&!f.features.length&&!f.minRating&&!f.minReviews)return false;
 if(f.ryokanOnly&&c.kind[i]!=='ryokan')return false;
 const features=c.features[i];
 for(const key of f.features){const bit=BITS[key];if((features===null||(features&bit)===0)&&((c.known[i]??0)&bit)!==0)return false}
 const score=f.ratingProvider==='jalan'?c.jalanScore[i]:c.tripScore[i],reviews=f.ratingProvider==='jalan'?c.jalanReviews[i]:c.tripReviews[i];
 if(f.minRating&&!(score===null||score>=f.minRating))return false;
 if(f.minReviews&&!(reviews===null||reviews>=f.minReviews))return false;
 return true;
}
type Scope={q:string;matches:{id:string;score:number;similar:boolean}[];found:Set<number>|null;saved:Set<string>|null};
// The former name scope: search text containing q, or every hotel sharing a
// name key with a hotel that has a key containing q (the same hotel, or one in
// the same known prefecture), plus the typo-tolerant index matches.
function scopeOf(s:SearchSnapshot,f:HotelFilters,savedOnly:boolean,savedIds:string[]):Scope{
 const q=normalizeSearch(f.query),scope:Scope={q,matches:[],found:null,saved:savedOnly?new Set(savedIds):null};
 if(!q)return scope;
 if(!s.text||!s.index)throw new Error('Name search needs the snapshot text');
 const found=new Set<number>(),text=s.text,prefecture=s.core.prefecture;
 for(let i=0;i<s.size;i++)if(text.searchText[i].includes(q))found.add(i);
 for(const [key,originals] of s.index.keys)if(key.includes(q))for(const o of originals)for(const shared of text.nameKeys[o])for(const t of s.index.keys.get(shared)!)if(t===o||prefecture[o]!==null&&prefecture[o]===prefecture[t])found.add(t);
 scope.matches=searchIndexMatches(s.index.prepared,f.query,f.region).map(({id,score,similar})=>({id,score,similar}));
 for(const m of scope.matches)found.add(s.position.get(m.id)!);
 scope.found=found;return scope;
}
function inScope(s:SearchSnapshot,i:number,f:HotelFilters,scope:Scope){
 const c=s.core;
 if(!scope.saved&&c.state[i]!==null&&CLOSED.has(c.state[i]!))return false;
 if(f.region!=='all'&&c.region[i]!==f.region&&c.prefecture[i]!==f.region)return false;
 if(scope.saved&&!scope.saved.has(c.ids[i]))return false;
 return!scope.found||scope.found.has(i);
}
const orders=new WeakMap<SearchSnapshot,Map<string,number[]>>();
// Positions of every row in each sort's former ORDER BY.
function sorted(s:SearchSnapshot,sort:SortOrder,provider:HotelFilters['ratingProvider']){
 let cache=orders.get(s);if(!cache){cache=new Map();orders.set(s,cache)}
 const key=sort==='name'?'name':sort+':'+provider,hit=cache.get(key);if(hit)return hit;
 const c=s.core,n=s.size,numbers=(column:(number|null)[])=>{const a=new Float64Array(n);for(let i=0;i<n;i++){const v=column[i];a[i]=v===null?-Infinity:v}return a};
 const desc=(k:Float64Array,a:number,b:number)=>k[a]===k[b]?0:k[b]-k[a];
 let compare:(a:number,b:number)=>number;
 if(sort==='name'){const names=c.name;compare=s.plain?(a,b)=>names[a]<names[b]?-1:names[a]>names[b]?1:a-b:(a,b)=>compareText(names[a],names[b])||a-b}
 else{
  const score=numbers(provider==='jalan'?c.jalanScore:c.tripScore),reviews=numbers(provider==='jalan'?c.jalanReviews:c.tripReviews);
  const rating=(a:number,b:number)=>desc(score,a,b)||desc(reviews,a,b)||a-b;
  if(sort==='reviews')compare=(a,b)=>desc(reviews,a,b)||desc(score,a,b)||a-b;
  else if(sort==='rating')compare=rating;
  else{
   // natural = 1 first, then Trip.com 9.0+ with 50+ reviews, then the rating order.
   const first=new Uint8Array(n);
   for(let i=0;i<n;i++){const t=c.tripScore[i],r=c.tripReviews[i];first[i]=(c.natural[i]===1?2:0)+(t!==null&&t>=9&&r!==null&&r>=50?1:0)}
   compare=(a,b)=>first[b]-first[a]||rating(a,b);
  }
 }
 const order=Array.from({length:n},(_,i)=>i).sort(compare);cache.set(key,order);return order;
}
// alternatives=false skips ranking other candidates for an empty result (they
// need the name-search file); a count alone does not use them.
export function searchSnapshot(s:SearchSnapshot,f:HotelFilters,sort:SortOrder,savedOnly=false,savedIds:string[]=[],alternatives=true):SearchResult{
 const c=s.core,scope=scopeOf(s,f,savedOnly,savedIds);
 const counts=new Array<number>(32).fill(0),matched=new Uint8Array(s.size);
 let ryokanCount=0,unknownExcluded=0,total=0;
 for(let i=0;i<s.size;i++){
  if(!inScope(s,i,f,scope))continue;
  for(let v=c.features[i]??0;v;v&=v-1)counts[31-Math.clz32(v&-v)]++;
  if(c.kind[i]==='ryokan')ryokanCount++;
  if(eligible(c,i,f)){matched[i]=1;total++}
  else if(unknownOnly(c,i,f))unknownExcluded++;
 }
 let order=sorted(s,sort,f.ratingProvider).filter(i=>matched[i]);
 // Broad substring hits rank below the shared name/place relevance (score 20).
 if(sort==='recommended'&&scope.q){const score=new Map(scope.matches.map(m=>[s.position.get(m.id)!,m.score]));order=order.map(i=>({i,score:score.get(i)??20})).sort((a,b)=>b.score-a.score).map(r=>r.i)}
 const featureCounts=Object.fromEntries(FEATURE_KEYS.map(key=>[key,counts[Math.log2(BITS[key])]])) as Record<FeatureKey,number>;
 let others:HotelAlternative[]=[];
 if(alternatives&&!order.length&&(scope.q||f.region!=='all'||f.features.length||f.ryokanOnly||f.minRating||f.minReviews)){
  if(!s.index)throw new Error('Alternatives need the snapshot text');
  others=rankHotelAlternatives(s.index.prepared,f,scope.saved??undefined).map(a=>({hotel:s.cards[s.position.get(a.id)!],unmetConditions:a.unmetConditions,queryMatched:a.queryMatched}));
 }
 // Similar names in match order (the former result session kept that order).
 const similarIds=scope.matches.filter(m=>m.similar&&matched[s.position.get(m.id)!]).map(m=>m.id);
 return{order,total,unknownExcluded,featureCounts,ryokanCount,similarCount:similarIds.length,similar:similarIds,alternatives:others};
}
// Whether a search with no matches will rank alternatives (and so needs the text).
export const mayNeedAlternatives=(f:HotelFilters)=>!!(normalizeSearch(f.query)||f.region!=='all'||f.features.length||f.ryokanOnly||f.minRating||f.minReviews);
export const pageSimilar=(r:SearchResult,hotels:HotelSummary[])=>{const shown=new Set(hotels.map(h=>h.id));return r.similar.filter(id=>shown.has(id))};
// One page of a result, as the former list response.
export function resultPage(s:SearchSnapshot,r:SearchResult,page:number):SearchResponse{
 const actual=Math.max(1,Math.min(page,Math.max(1,Math.ceil(r.total/PAGE_SIZE))));
 const hotels=r.order.slice((actual-1)*PAGE_SIZE,actual*PAGE_SIZE).map(i=>s.cards[i]);
 return{hotels,total:r.total,unknownExcluded:r.unknownExcluded,page:actual,pageSize:PAGE_SIZE,featureCounts:r.featureCounts,ryokanCount:r.ryokanCount,coverage:s.manifest.coverage,similarCount:r.similarCount,similarHotelIds:pageSimilar(r,hotels),alternatives:r.alternatives};
}
// SQLite AVG of a REAL column: integers summed exactly until the first real
// value, then a Kahan-Babuska-Neumaier sum.
function sqliteAverage(values:number[]){
 let integer=0,approximate=false,sum=0,error=0;
 for(const value of values){
  if(!approximate&&Number.isInteger(value)){integer+=value;continue}
  if(!approximate){approximate=true;sum=integer;error=0}
  const t=sum+value;error+=Math.abs(sum)>Math.abs(value)?(sum-t)+value:(value-t)+sum;sum=t;
 }
 return approximate?(sum+error)/values.length:integer/values.length;
}
// Every matching hotel inside the bounds: points (id order) up to the limit,
// else counts on a 16 x 16 grid over the bounds.
export function mapArea(s:SearchSnapshot,f:HotelFilters,b:MapBounds,savedOnly=false,savedIds:string[]=[],geo:GeoColumns|null=null):MapAreaResponse{
 const c=s.core,scope=scopeOf(s,f,savedOnly,savedIds);
 // Approximate points only from a geo.json that is row for row this snapshot.
 if(geo&&geo.grade.length!==s.size)geo=null;
 let total=0,withoutCoordinates=0;const inside:number[]=[];
 for(let i=0;i<s.size;i++){
  if(!inScope(s,i,f,scope)||!eligible(c,i,f))continue;
  total++;let lat=c.lat[i],lng=c.lng[i];
  if((lat===null||lng===null)&&geo&&(geo.grade[i]??0)>0){lat=geo.lat[i]??null;lng=geo.lng[i]??null}
  if(lat===null||lng===null){withoutCoordinates++;continue}
  if(lat>=b.south&&lat<=b.north&&lng>=b.west&&lng<=b.east)inside.push(i);
 }
 const score=f.ratingProvider==='jalan'?c.jalanScore:c.tripScore;
 const result:MapAreaResponse={total,inBounds:inside.length,outOfBounds:total-withoutCoordinates-inside.length,withoutCoordinates,limit:MAP_POINT_LIMIT,points:[],cells:[]};
 if(!inside.length)return result;
 const at=(i:number):[number,number,number]=>c.lat[i]!==null&&c.lng[i]!==null?[c.lat[i]!,c.lng[i]!,Math.max(1,geo?.grade[i]??1)]:[geo!.lat[i]!,geo!.lng[i]!,geo!.grade[i]!];
 if(inside.length<=MAP_POINT_LIMIT){result.points=inside.map(i=>{const [lat,lng,grade]=at(i);return{id:c.ids[i],name:c.name[i],lat,lng,score:score[i],grade}});return result}
 const latStep=(b.north-b.south)/16||1e-9,lngStep=(b.east-b.west)/16||1e-9,cells=new Map<number,{row:number;col:number;lats:number[];lngs:number[];approximate:number}>();
 for(const i of inside){
  const [lat,lng,grade]=at(i),row=Math.min(15,Math.trunc((lat-b.south)/latStep)),col=Math.min(15,Math.trunc((lng-b.west)/lngStep));
  const cell=cells.get(row*16+col)??{row,col,lats:[],lngs:[],approximate:0};cell.lats.push(lat);cell.lngs.push(lng);if(grade>=2)cell.approximate++;cells.set(row*16+col,cell);
 }
 result.cells=[...cells.values()].sort((x,y)=>x.row-y.row||x.col-y.col).map(x=>({lat:sqliteAverage(x.lats),lng:sqliteAverage(x.lngs),count:x.lats.length,south:b.south+x.row*latStep,north:b.south+(x.row+1)*latStep,west:b.west+x.col*lngStep,east:b.west+(x.col+1)*lngStep,approximate:x.approximate}));
 return result;
}
export function suggestions(s:SearchSnapshot,f:HotelFilters,savedOnly=false,savedIds:string[]=[]):HotelSuggestion[]{
 return s.index?localHotelSuggestions(s.index.prepared,f.query,f,savedOnly?new Set(savedIds):undefined):[];
}
