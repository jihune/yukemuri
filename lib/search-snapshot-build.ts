import {favoritesDb} from './favorites-db';
import {enrichHotel} from './hotel-enrichment';
import {attachSourceGroups} from './hotel-source-groups';
import {composePreferredHotel} from './source-policy';
import {attachLifecycle} from './hotel-lifecycle';
import {formatHotelLocation,hotelPlaceSearchText,geocodeInput} from './japan-place-labels';
import {queryCoverage,catalogPreparation} from './hotel-repository';
import {readCollectionStatus} from './read-collection-status';
import {hotelSummary,GEO_GRADE,type HotelSummary,type SnapshotCore,type SnapshotText,type SnapshotGeo,type GeocodeInput} from './search-snapshot';
// The builder writes the manifest with this format (scripts/build-search-snapshot.mjs).
export {SNAPSHOT_FORMAT} from './search-snapshot';
import {DEFAULT_FILTERS,type Hotel} from './hotel-types';
import {openSnapshot,resultPage,searchSnapshot,type SearchResponse} from './static-search';
import {BATH_FEATURE_MASK} from './hotel-bath-facts';
import {needsKoreanDescription} from './hotel-description';
import {FILL_ROWS,type CollectionFill,type CollectionProvider,type FillScope,type FillScopeKey,type PageCounts} from './collection-status';
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
// U06 data status (docs/U06-20261015.md 4절): each place in its scopes, one state per row.
// geo stays zero here; the builder fills it after geocoding (addFillGeo).
const emptyScope=():FillScope=>({records:0,rows:Object.fromEntries(FILL_ROWS.map(r=>[r.key,{filled:0,none:0,empty:0}])) as FillScope['rows'],geo:[0,0,0,0,0,0,0],staleTranslations:0});
const scopeOf=(id:string):Exclude<FillScopeKey,'all'>|null=>id.startsWith('jalan-')?'jalan':id.startsWith('trip-')?'trip':null;
const HANGUL=/[가-힣]/;
export function addFillGeo(fill:CollectionFill,ids:string[],grades:number[]){
 ids.forEach((id,i)=>{const own=scopeOf(id);for(const s of own?[fill.scopes.all,fill.scopes[own]]:[fill.scopes.all])s.geo[grades[i]]++});
 return fill;
}
// The Cloudflare API source sends every parameter as a string (build-search-snapshot.mjs), so
// numbers are cast in SQL.
async function collectionFill(db:ReturnType<typeof favoritesDb>,now:Date){
 // Places whose Korean name was looked for and not found (hotel-names route, deferNameResearch).
 const researched=new Set((await db.prepare('SELECT hotel_id FROM hotel_name_localizations WHERE payload IS NULL').all<{hotel_id:string}>()).results.map(r=>r.hotel_id));
 // A translation counts when it is of the current source text, as the detail API joins it.
 const translations=new Map((await db.prepare("SELECT t.hotel_id,CASE WHEN t.source_text=json_extract(h.payload,'$.description') THEN 1 ELSE 0 END AS current FROM hotel_description_translations t JOIN hotels h ON h.id=t.hotel_id").all<{hotel_id:string;current:number}>()).results.map(r=>[r.hotel_id,r.current===1]));
 const zero=():PageCounts=>({done:0,pending:0,retry:0,failed:0});
 const pages={jalan:{detail:zero(),list:zero(),detailChecked24h:0},trip:{detail:zero(),list:zero(),detailChecked24h:0}};
 for(const r of (await db.prepare(`SELECT provider,kind,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
  SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END) AS retry,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN status='done' AND unixepoch(fetched_at)>CAST(? AS REAL) THEN 1 ELSE 0 END) AS recent
  FROM crawl_jobs WHERE provider IN ('jalan','trip') AND kind IN ('detail','list') AND status!='skipped' GROUP BY provider,kind`).bind(now.getTime()/1000-86400).all<{provider:CollectionProvider;kind:'detail'|'list';recent:number}&PageCounts>()).results){
  pages[r.provider][r.kind]={done:r.done,pending:r.pending,retry:r.retry,failed:r.failed};
  if(r.kind==='detail')pages[r.provider].detailChecked24h=r.recent;
 }
 const fill:CollectionFill={scopes:{all:emptyScope(),jalan:emptyScope(),trip:emptyScope()},pages};
 // raw: the stored payload (the detail label, as status.quality counts it); h: the hotel the
 // card and detail show (sources, names, rating, photo, rooms, years, description).
 const add=(id:string,raw:Hotel,h:Hotel,bathKnown:number|null)=>{
  // v3: a Jalan detail read with the current rule (only the collector's Jalan details carry
  // bathDataVersion) among the sources the detail shows, a linked one included (curated places).
  const own=scopeOf(id),detail=!!raw.sources[0]?.label.includes('상세'),v3=h.sources.some(s=>s.bathDataVersion==='v3'&&s.label.includes('상세'));
  // The description the detail shows: a linked Jalan detail's, with its translation, replaces
  // the stored one (composePreferredHotel); otherwise the stored text and the translation table.
  const linked=h.description!==raw.description,description=h.description??'',translated=linked?!!h.descriptionTranslation:translations.get(id),stale=!linked&&translations.get(id)===false;
  const state={
   detail:detail?'filled':'empty',
   bath:(bathKnown??0)&BATH_FEATURE_MASK?'filled':v3?'none':'empty',
   rooms:h.rooms||h.roomTypes?.some(set=>set.items.length)?'filled':v3?'none':'empty',
   years:h.facilityYears?'filled':own==='jalan'?'none':'empty',
   rating:h.ratings.some(r=>!r.isMock)?'filled':'none',
   photo:h.image.url?'filled':'none',
   nameKo:HANGUL.test(h.names.ko)?'filled':researched.has(id)||raw.sources.some(s=>s.nameLocaleUrl)?'none':'empty',
   descKo:!description.trim()?'none':!needsKoreanDescription(description)||translated?'filled':'empty',
  } as const;
  for(const s of own?[fill.scopes.all,fill.scopes[own]]:[fill.scopes.all]){
   s.records++;
   for(const row of FILL_ROWS)s.rows[row.key][state[row.key]]++;
   if(stale&&state.descKo==='empty')s.staleTranslations++;
  }
 };
 return{fill,add};
}
export async function buildSearchSnapshot(now:Date){
 const db=favoritesDb();
 const {fill,add}=await collectionFill(db,now);
 const core:SnapshotCore={ids:[],region:[],prefecture:[],name:[],kind:[],tripScore:[],tripReviews:[],jalanScore:[],jalanReviews:[],natural:[],features:[],known:[],lat:[],lng:[],state:[]};
 const text:SnapshotText={searchText:[],nameKeys:[],names:[],location:[],context:[]},cards:HotelSummary[]=[];
 // Map positions: the payload coordinates here; scripts/build-search-snapshot.mjs
 // adds approximate ones for the rest from geocodeInputs (D06), never written.
 const geo:SnapshotGeo={grade:[],lat:[],lng:[]},geocodeInputs:(GeocodeInput|null)[]=[];
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
   // A source that marks its own coordinates approximate (only the sample seed
   // does; the collector contract refuses them) ranks as a city-level point.
   const located=r.lat!==null&&r.lng!==null;
   geo.grade.push(located?raw.location.isApproximate?GEO_GRADE.city:GEO_GRADE.source:GEO_GRADE.none);geo.lat.push(located?r.lat:null);geo.lng.push(located?r.lng:null);
   geocodeInputs.push(located?null:geocodeInput(place));
   cards.push(hotelSummary(h));
   add(r.id,raw,h,r.bath_known);
  });
  if(rows.length<PAGE)break;cursor=rows.at(-1)!.id;
 }
 const [coverage,status,unprepared]=await Promise.all([queryCoverage(),readCollectionStatus(now.getTime()),catalogPreparation()]);
 // unprepared: seed steps crawl-prepare has not run on this database (a
 // deploy that changes the seed prepares it and builds again, deploy.yml).
 return{core,text,cards,geo,geocodeInputs,coverage,status:{...status,fill},unprepared,first:firstPage(core,cards,coverage)};
}
// The first page of the default view (no conditions, recommended order): put
// in the static page so the list shows before core and cards arrive.
export function firstPage(core:SnapshotCore,cards:HotelSummary[],coverage:Awaited<ReturnType<typeof queryCoverage>>):SearchResponse{
 const s=openSnapshot({coverage} as Parameters<typeof openSnapshot>[0],core,cards);
 return resultPage(s,searchSnapshot(s,DEFAULT_FILTERS,'recommended'),1);
}
