import {favoritesDb} from './favorites-db';
import {enrichHotel} from './hotel-enrichment';
import {attachSourceGroups} from './hotel-source-groups';
import {composePreferredHotel} from './source-policy';
import {attachLifecycle} from './hotel-lifecycle';
import {formatHotelLocation,hotelPlaceSearchText} from './japan-place-labels';
import {queryCoverage} from './hotel-repository';
import {readCollectionStatus} from './read-collection-status';
import {hotelSummary,type HotelSummary,type SnapshotCore,type SnapshotText} from './search-snapshot';
import type {Hotel} from './hotel-types';
// Reads only (scripts/build-search-snapshot.mjs refuses any other statement).
// Cards go through the same steps as the former list pages (hotelsInOrder):
// enrichHotel, then the linked source rows, then the lifecycle. Both lookups
// run only for hotels that have such rows: a hotel without a source group is
// composed alone (what attachSourceGroups does for it), one without a
// lifecycle row is left as it is (attachLifecycle), and per-id lookups of every
// hotel would read about 100,000 index rows at production size.
const PAGE=500;
async function attach(hotels:Hotel[],members:Set<string>,lifecycles:Set<string>){
 const merge=async(list:Hotel[],has:Set<string>,run:(h:Hotel[])=>Promise<Hotel[]>,otherwise:(h:Hotel)=>Hotel)=>{const done=await run(list.filter(h=>has.has(h.id)));let i=0;return list.map(h=>has.has(h.id)?done[i++]:otherwise(h))};
 return merge(await merge(hotels,members,attachSourceGroups,h=>composePreferredHotel(h,[])),lifecycles,attachLifecycle,h=>h);
}
export async function buildSearchSnapshot(now:Date){
 const db=favoritesDb();
 const core:SnapshotCore={ids:[],region:[],prefecture:[],name:[],kind:[],tripScore:[],tripReviews:[],jalanScore:[],jalanReviews:[],natural:[],features:[],known:[],lat:[],lng:[],state:[]};
 const text:SnapshotText={searchText:[],nameKeys:[],names:[],location:[],context:[]},cards:HotelSummary[]=[];
 // Aliases in the order the former index and substring queries read them.
 const aliases=new Map<string,{key:string;name:string}[]>();
 for(const r of (await db.prepare('SELECT hotel_id,name_key,name FROM hotel_names ORDER BY hotel_id,name_key').all<{hotel_id:string;name_key:string;name:string}>()).results){const list=aliases.get(r.hotel_id);if(list)list.push({key:r.name_key,name:r.name});else aliases.set(r.hotel_id,[{key:r.name_key,name:r.name}])}
 const groups=(await db.prepare('SELECT hotel_id,trip_hotel_id,jalan_hotel_id FROM hotel_source_groups').all<{hotel_id:string;trip_hotel_id:string|null;jalan_hotel_id:string|null}>()).results;
 const members=new Set(groups.flatMap(g=>[g.hotel_id,g.trip_hotel_id,g.jalan_hotel_id].filter((id):id is string=>!!id)));
 const lifecycles=new Set((await db.prepare('SELECT hotel_id FROM hotel_lifecycle').all<{hotel_id:string}>()).results.map(r=>r.hotel_id));
 type Row={id:string;region:string;prefecture:string|null;name:string;kind:string;trip_score:number|null;trip_reviews:number|null;jalan_score:number|null;jalan_reviews:number|null;natural:number|null;bath_features:number|null;bath_known:number|null;search_text:string;lat:number|null;lng:number|null;payload:string};
 // The same coordinate rule as the former map query and hasCoordinates.
 const numeric=`json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real')`;
 for(let cursor='';;){
  const rows=(await db.prepare(`SELECT id,region,prefecture,name,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,bath_features,bath_known,search_text,CASE WHEN ${numeric} THEN json_extract(payload,'$.location.latitude') END AS lat,CASE WHEN ${numeric} THEN json_extract(payload,'$.location.longitude') END AS lng,payload FROM hotels WHERE id>? ORDER BY id LIMIT ${PAGE}`).bind(cursor).all<Row>()).results;
  const hotels=await attach(rows.map(r=>enrichHotel(JSON.parse(r.payload) as Hotel)),members,lifecycles);
  rows.forEach((r,i)=>{
   const h=hotels[i],state=h.lifecycle?.state??null,closed=state==='closed'||state==='temporarily_closed',raw=JSON.parse(r.payload) as Hotel;
   core.ids.push(r.id);core.region.push(r.region);core.prefecture.push(r.prefecture);core.name.push(r.name);core.kind.push(r.kind);
   core.tripScore.push(r.trip_score);core.tripReviews.push(r.trip_reviews);core.jalanScore.push(r.jalan_score);core.jalanReviews.push(r.jalan_reviews);
   core.natural.push(r.natural);core.features.push(r.bath_features);core.known.push(r.bath_known);core.lat.push(r.lat);core.lng.push(r.lng);core.state.push(state);
   const own=aliases.get(r.id)??[];
   text.searchText.push(r.search_text);text.nameKeys.push(own.map(a=>a.key));
   // The former search index: the stored payload (not enriched) and table columns.
   const place={prefecture:r.prefecture,regionId:r.region,location:raw.location,names:raw.names};
   text.names.push(closed?null:[...new Set([raw.names.ko,raw.names.ja,raw.names.en,...own.map(a=>a.name)].filter(Boolean))]);
   text.location.push(closed?null:formatHotelLocation(place));text.context.push(closed?null:hotelPlaceSearchText(place));
   cards.push(hotelSummary(h));
  });
  if(rows.length<PAGE)break;cursor=rows.at(-1)!.id;
 }
 const [coverage,status]=await Promise.all([queryCoverage(),readCollectionStatus(now.getTime())]);
 return{core,text,cards,coverage,status};
}
