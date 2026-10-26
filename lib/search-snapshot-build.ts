import {favoritesDb} from './favorites-db';
import {enrichHotel} from './hotel-enrichment';
import {attachSourceGroups} from './hotel-source-groups';
import {composePreferredHotel} from './source-policy';
import {withLifecycle} from './hotel-lifecycle';
import {formatHotelLocation,hotelPlaceSearchText,geocodeInput} from './japan-place-labels';
import {coverageFrom,catalogPreparation,COVERAGE_SEQUENCE,RECORD_COUNTER,trendPages,type CoverageJobs,type CoverageRecord} from './hotel-repository';
import {collectionStatusFrom,collectionStatusSideRows,type ProviderRow} from './read-collection-status';
import {hotelSummary,GEO_GRADE,type HotelSummary,type SnapshotCore,type SnapshotText,type SnapshotGeo,type GeocodeInput} from './search-snapshot';
// The builder writes the manifest with this format (scripts/build-search-snapshot.mjs).
export {SNAPSHOT_FORMAT} from './search-snapshot';
import {DEFAULT_FILTERS,type Hotel} from './hotel-types';
import {openSnapshot,resultPage,searchSnapshot,type SearchResponse} from './static-search';
import {BATH_FEATURE_MASK} from './hotel-bath-facts';
import {needsKoreanDescription} from './hotel-description';
import {displayNames,hotelNames,normalizeSearch} from './hotel-names';
import {withWikidataNames} from './wikidata-names';
import {withJalanLocaleNames,type LocaleNameRow} from './jalan-locale-names';
import {jtaCandidates,resolveJtaLinks,type JtaCandidate} from './jta-registration';
import {oitaCandidates,resolveOitaPermits} from './oita-permits';
import type {ListCandidate} from './lodging-lists';
import {DAILY_PROGRESS_KEY,FILL_ROWS,type CollectionFill,type FillScope,type FillScopeKey,type PageCounts,type TrendDay} from './collection-status';
// Reads only (scripts/build-search-snapshot.mjs refuses any other statement).
// Cards go through the same steps as the former list pages (hotelsInOrder):
// enrichHotel, then the linked source rows, then the lifecycle. The source
// lookup runs only for hotels in a source group: one without is composed alone
// (what attachSourceGroups does for it), and per-id lookups of every hotel
// would read about 100,000 index rows at production size. Lifecycle rows are
// read once per page by its id range (P04; per-id lookups read about three
// rows a hotel) and attached as attachLifecycle attaches them (withLifecycle);
// a hotel without one is left as it is.
const PAGE=500;
async function attach(hotels:Hotel[],members:Set<string>,lifecycles:Map<unknown,Record<string,unknown>>){
 const merge=async(list:Hotel[],has:Set<string>,run:(h:Hotel[])=>Promise<Hotel[]>,otherwise:(h:Hotel)=>Hotel)=>{const done=await run(list.filter(h=>has.has(h.id)));let i=0;return list.map(h=>has.has(h.id)?done[i++]:otherwise(h))};
 return(await merge(hotels,members,attachSourceGroups,h=>composePreferredHotel(h,[]))).map(h=>withLifecycle(h,lifecycles.get(h.id)));
}
// One read of the queue for every page count the snapshot carries: the data
// status pages, the collection summary (queryCoverage) and the collection
// status per provider (readCollectionStatus). Grouped in the order of a claim
// index, so each job is read once; the three used to read the queue apart (P04).
type JobGroup={provider:string;kind:string;status:string;count:number;updated:string|null;last_success:number|null;recent:number;active:number};
async function jobGroups(db:ReturnType<typeof favoritesDb>,now:Date){
 return(await db.prepare(`SELECT provider,kind,status,COUNT(*) AS count,MAX(fetched_at) AS updated,MAX(unixepoch(fetched_at)) AS last_success,
  SUM(CASE WHEN status='done' AND unixepoch(fetched_at)>CAST(? AS REAL) THEN 1 ELSE 0 END) AS recent,SUM(CASE WHEN lease_until>CAST(? AS REAL) THEN 1 ELSE 0 END) AS active
  FROM crawl_jobs WHERE status!='skipped' AND kind<>'names' GROUP BY provider,kind,status`).bind(now.getTime()/1000-86400,now.getTime()/1000).all<JobGroup>()).results;
}
const total=(groups:JobGroup[],keep:(g:JobGroup)=>boolean,field:'count'|'recent'|'active'='count')=>groups.reduce((n,g)=>keep(g)?n+g[field]:n,0);
const latest=<T extends string|number>(values:(T|null)[])=>values.reduce<T|null>((a,v)=>v!==null&&(a===null||v>a)?v:a,null);
const WAITING=['pending','retry','running'],OPEN=['pending','running'];
// U06 data status (docs/U06-20261015.md 4절): each place in its scopes, one state per row.
// geo stays zero here; the builder fills it after geocoding (addFillGeo).
const emptyScope=():FillScope=>({records:0,rows:Object.fromEntries(FILL_ROWS.map(r=>[r.key,{filled:0,none:0,empty:0}])) as FillScope['rows'],geo:Object.values(GEO_GRADE).map(()=>0),staleTranslations:0});
const scopeOf=(id:string):Exclude<FillScopeKey,'all'>|null=>id.startsWith('jalan-')?'jalan':id.startsWith('trip-')?'trip':null;
const HANGUL=/[가-힣]/;
export function addFillGeo(fill:CollectionFill,ids:string[],grades:number[]){
 ids.forEach((id,i)=>{const own=scopeOf(id);for(const s of own?[fill.scopes.all,fill.scopes[own]]:[fill.scopes.all])s.geo[grades[i]]++});
 return fill;
}
// The Cloudflare API source sends every parameter as a string (build-search-snapshot.mjs), so
// numbers are cast in SQL.
async function collectionFill(db:ReturnType<typeof favoritesDb>,now:Date,groups:JobGroup[]){
 // Places whose Korean name was looked for and not found (hotel-names route, deferNameResearch).
 const researched=new Set((await db.prepare('SELECT hotel_id FROM hotel_name_localizations WHERE payload IS NULL').all<{hotel_id:string}>()).results.map(r=>r.hotel_id));
 // A translation counts when it is of the current source text, as the detail API joins it.
 const translations=new Map((await db.prepare("SELECT t.hotel_id,CASE WHEN t.source_text=json_extract(h.payload,'$.description') THEN 1 ELSE 0 END AS current FROM hotel_description_translations t JOIN hotels h ON h.id=t.hotel_id").all<{hotel_id:string;current:number}>()).results.map(r=>[r.hotel_id,r.current===1]));
 const zero=():PageCounts=>({done:0,pending:0,retry:0,failed:0});
 const pages={jalan:{detail:zero(),list:zero(),detailChecked24h:0},trip:{detail:zero(),list:zero(),detailChecked24h:0}};
 for(const provider of ['jalan','trip'] as const)for(const kind of ['detail','list'] as const){
  const of=(g:JobGroup)=>g.provider===provider&&g.kind===kind;
  pages[provider][kind]={done:total(groups,g=>of(g)&&g.status==='done'),pending:total(groups,g=>of(g)&&OPEN.includes(g.status)),retry:total(groups,g=>of(g)&&g.status==='retry'),failed:total(groups,g=>of(g)&&g.status==='failed')};
  if(kind==='detail')pages[provider].detailChecked24h=total(groups,of,'recent');
 }
 // The last 30 UTC days' rows that each collection's count stores (lib/hotel-repository.ts recordCoverage).
 const day=(ms:number)=>new Date(ms).toISOString().slice(0,10);
 const trend=(await db.prepare('SELECT key,value FROM catalog_meta WHERE key>=? AND key<=? ORDER BY key').bind(DAILY_PROGRESS_KEY+day(now.getTime()-29*86400000),DAILY_PROGRESS_KEY+day(now.getTime())).all<{key:string;value:string}>()).results.map(r=>{const v=JSON.parse(r.value) as Omit<TrendDay,'date'>;return{date:r.key.slice(DAILY_PROGRESS_KEY.length),records:v.records,pages:v.pages}});
 const fill:CollectionFill={scopes:{all:emptyScope(),jalan:emptyScope(),trip:emptyScope()},pages,trend};
 // raw: the stored payload (the detail label, as status.quality counts it); h: the hotel the
 // card and detail show (sources, names, rating, photo, rooms, years, description).
 const add=(id:string,raw:Hotel,h:Hotel,bathKnown:number|null)=>{
  // detail: the latest observation (status.quality's rule). A curated place's own source is its
  // official page, so its detail is a linked one among the sources the detail shows.
  // v3: a Jalan detail read with the current rule (only the collector's Jalan details carry
  // bathDataVersion) among the sources the detail shows, a linked one included (curated places).
  const own=scopeOf(id),detail=own?!!raw.sources[0]?.label.includes('상세'):h.sources.some(s=>s.label.includes('상세')),v3=h.sources.some(s=>s.bathDataVersion==='v3'&&s.label.includes('상세'));
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
// progressDay: the UTC day a collection finished, for the snapshot deploy after it
// (C07 plan 2): the build also makes the count the collector made at the end of
// its run until then, puts that day's trend row in, and returns the count for
// recordCoverage. Without it the trend rows are shown as stored.
export async function buildSearchSnapshot(now:Date,progressDay?:string){
 const db=favoritesDb();
 // Before any count: recordCoverage stores the count only if no other count was stored since
 // (the sequence) and resets the counter only if no save changed it since.
 const seen=progressDay?new Map((await db.prepare('SELECT key,value FROM catalog_meta WHERE key IN (?,?)').bind(RECORD_COUNTER,COVERAGE_SEQUENCE).all<{key:string;value:string}>()).results.map(r=>[r.key,r.value])):new Map<string,string>();
 const counter=seen.get(RECORD_COUNTER)??null,sequence=seen.get(COVERAGE_SEQUENCE)??null;
 const queue=await jobGroups(db,now);
 const {fill,add}=await collectionFill(db,now,queue);
 const core:SnapshotCore={ids:[],region:[],prefecture:[],name:[],kind:[],tripScore:[],tripReviews:[],jalanScore:[],jalanReviews:[],natural:[],features:[],known:[],lat:[],lng:[],state:[]};
 const text:SnapshotText={searchText:[],nameKeys:[],names:[],location:[],context:[]},cards:HotelSummary[]=[];
 // Map positions: the payload coordinates here; scripts/build-search-snapshot.mjs
 // adds approximate ones for the rest from geocodeInputs (D06), never written.
 const geo:SnapshotGeo={grade:[],lat:[],lng:[]},geocodeInputs:(GeocodeInput|null)[]=[];
 // Aliases in the order the former index and substring queries read them.
 const aliases=new Map<string,{key:string;name:string}[]>();
 for(const r of (await db.prepare('SELECT hotel_id,name_key,name FROM hotel_names ORDER BY hotel_id,name_key').all<{hotel_id:string;name_key:string;name:string}>()).results){const list=aliases.get(r.hotel_id);if(list)list.push({key:r.name_key,name:r.name});else aliases.set(r.hotel_id,[{key:r.name_key,name:r.name}])}
 // Jalan's Korean and English names (D07), one row per named stay.
 const locale=new Map((await db.prepare('SELECT * FROM hotel_locale_names').all<LocaleNameRow>()).results.map(r=>[r.hotel_id,r]));
 const groups=(await db.prepare('SELECT hotel_id,trip_hotel_id,jalan_hotel_id FROM hotel_source_groups').all<{hotel_id:string;trip_hotel_id:string|null;jalan_hotel_id:string|null}>()).results;
 const members=new Set(groups.flatMap(g=>[g.hotel_id,g.trip_hotel_id,g.jalan_hotel_id].filter((id):id is string=>!!id)));
 // D08 PR 6 (docs/D08-20261019.md 13.5): in a group whose own hotel is one of its provider
 // records, the other provider record is shown on that hotel's card only. It leaves the rows,
 // so the list, map, search and every count here; its names search for the card. Only when
 // both rows are stored. A curated group's provider records are never hotels rows.
 const pairs=groups.flatMap(g=>g.hotel_id===g.jalan_hotel_id||g.hotel_id===g.trip_hotel_id?[g.trip_hotel_id,g.jalan_hotel_id].flatMap(id=>id&&id!==g.hotel_id?[[id,g.hotel_id] as const]:[]):[]);
 const paired=pairs.length?(await db.prepare('SELECT id,CASE WHEN id IN (SELECT value FROM json_each(?)) THEN payload END AS payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(pairs.map(p=>p[0])),JSON.stringify(pairs.flat())).all<{id:string;payload:string|null}>()).results:[];
 const stored=new Map(paired.map(r=>[r.id,r.payload])),mergedInto=new Map(pairs.filter(([id,base])=>stored.has(id)&&stored.has(base)));
 // The names of the records each card absorbs: stored, Wikidata and Jalan locale names (D07).
 const absorbed=new Map<string,{names:string[];aliases:{key:string;name:string}[]}>();
 for(const [id,base] of mergedInto){
  const h=withJalanLocaleNames(withWikidataNames(enrichHotel(JSON.parse(stored.get(id)!) as Hotel)),locale.get(id)),own=absorbed.get(base)??{names:[],aliases:[]};
  absorbed.set(base,{names:[...own.names,...hotelNames(h)],aliases:[...own.aliases,...aliases.get(id)??[]]});
 }
 type Row={id:string;region:string;prefecture:string|null;name:string;kind:string;trip_score:number|null;trip_reviews:number|null;jalan_score:number|null;jalan_reviews:number|null;natural:number|null;room_onsen:number|null;bath_features:number|null;bath_known:number|null;search_text:string;lat:number|null;lng:number|null;payload:string};
 // Japan Tourism Agency registrations and Oita Prefecture permits (D08): every stay's candidate
 // rows, decided across them after the pass.
 const jta=new Map<string,JtaCandidate[]>(),oita=new Map<string,ListCandidate[]>();
 // The record counts of the collection summary and status, counted on this pass
 // with the rules of their former queries (queryCoverage, readCollectionStatus).
 const prefectures=new Set<string>(),quality={records:0,detailRecords:0,bathKnownRecords:0,naturalOnsenRecords:0,roomOnsenRecords:0};
 // Every row, the records a card absorbs included: the rule of readCoverage's COUNT(*).
 const all={records:0,prefectures:new Set<string>()};
 // The same coordinate rule as the former map query and hasCoordinates.
 const numeric=`json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real')`;
 for(let cursor='';;){
  const rows=(await db.prepare(`SELECT id,region,prefecture,name,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,room_onsen,bath_features,bath_known,search_text,CASE WHEN ${numeric} THEN json_extract(payload,'$.location.latitude') END AS lat,CASE WHEN ${numeric} THEN json_extract(payload,'$.location.longitude') END AS lng,payload FROM hotels WHERE id>? ORDER BY id LIMIT ${PAGE}`).bind(cursor).all<Row>()).results;
  const lifecycles=rows.length?new Map((await db.prepare('SELECT * FROM hotel_lifecycle WHERE hotel_id>? AND hotel_id<=?').bind(cursor,rows.at(-1)!.id).all<Record<string,unknown>>()).results.map(r=>[r.hotel_id,r])):new Map();
  all.records+=rows.length;for(const r of rows)if(r.prefecture!==null)all.prefectures.add(r.prefecture);
  const kept=rows.filter(r=>!mergedInto.has(r.id)),hotels=await attach(kept.map(r=>enrichHotel(JSON.parse(r.payload) as Hotel)),members,lifecycles);
  kept.forEach((r,i)=>{
   // Wikidata and Jalan locale names (D07) on the card, the name column (the shown title, which the
   // area map labels markers with) and the name search, as the detail API adds them.
   const w=withWikidataNames(hotels[i]),h=withJalanLocaleNames(w,locale.get(r.id)),state=h.lifecycle?.state??null,closed=state==='closed'||state==='temporarily_closed',raw=JSON.parse(r.payload) as Hotel;
   const added=h===hotels[i]?[]:[h.names.ko,h.names.en].filter(n=>!Object.values(hotels[i].names).includes(n));
   core.ids.push(r.id);core.region.push(r.region);core.prefecture.push(r.prefecture);core.name.push(h===hotels[i]?r.name:displayNames(h.names).title);core.kind.push(r.kind);
   core.tripScore.push(r.trip_score);core.tripReviews.push(r.trip_reviews);core.jalanScore.push(r.jalan_score);core.jalanReviews.push(r.jalan_reviews);
   core.natural.push(r.natural);core.features.push(r.bath_features);core.known.push(r.bath_known);core.lat.push(r.lat);core.lng.push(r.lng);core.state.push(state);
   const own=[...aliases.get(r.id)??[],...absorbed.get(r.id)?.aliases??[]],peer=absorbed.get(r.id)?.names??[];
   // Wikidata names join the substring and typo-tolerant search, never the shared name keys.
   text.searchText.push(r.search_text+[...added,...peer].map(normalizeSearch).join(''));text.nameKeys.push(own.map(a=>a.key));
   // The former search index: the stored payload (not enriched) and table columns.
   const place={prefecture:r.prefecture,regionId:r.region,location:raw.location,names:raw.names};
   text.names.push(closed?null:[...new Set([raw.names.ko,raw.names.ja,raw.names.en,...own.map(a=>a.name),...added,...peer].filter(Boolean))]);
   text.location.push(closed?null:formatHotelLocation(place));text.context.push(closed?null:hotelPlaceSearchText(place));
   // A source that marks its own coordinates approximate (only the sample seed
   // does; the collector contract refuses them) ranks as a city-level point.
   const located=r.lat!==null&&r.lng!==null;
   geo.grade.push(located?raw.location.isApproximate?GEO_GRADE.city:GEO_GRADE.source:GEO_GRADE.none);geo.lat.push(located?r.lat:null);geo.lng.push(located?r.lng:null);
   geocodeInputs.push(located?null:geocodeInput(place));
   // The card notes only the Wikidata step's names (Jalan names are kept in hotel_locale_names).
   const item=w===hotels[i]?null:w.sources.find(s=>s.sourceId==='wikidata-name:'+w.id)!.url!.split('/').pop()!;
   cards.push(item?{...hotelSummary(h),wikidataNames:{item,was:Object.fromEntries((['ko','en'] as const).filter(k=>w.names[k]!==hotels[i].names[k]).map(k=>[k,hotels[i].names[k]]))}}:hotelSummary(h));
   const rows=jtaCandidates({...hotels[i],prefecture:r.prefecture});if(rows.length)jta.set(r.id,rows);
   const permits=oitaCandidates({...hotels[i],prefecture:r.prefecture});if(permits.length)oita.set(r.id,permits);
   add(r.id,raw,h,r.bath_known);
   if(r.prefecture!==null)prefectures.add(r.prefecture);
   quality.records++;if(raw.sources[0]?.label?.includes('상세'))quality.detailRecords++;if((r.bath_known??0)&BATH_FEATURE_MASK)quality.bathKnownRecords++;
   if(r.natural===1)quality.naturalOnsenRecords++;if(r.room_onsen===1)quality.roomOnsenRecords++;
  });
  if(rows.length<PAGE)break;cursor=rows.at(-1)!.id;
 }
 const registered=resolveJtaLinks(jta),permitted=resolveOitaPermits(oita);
 core.ids.forEach((id,i)=>{const link=registered.get(id),p=permitted.get(id);if(link)cards[i]={...cards[i],jta:link.number};if(p)cards[i]={...cards[i],oita:{kind:p.kind,permitted:p.permitted,asOf:p.asOf}}});
 const providers=[...new Set(queue.map(g=>g.provider))].sort();
 const jobs:CoverageJobs[]=providers.map(provider=>{const of=(g:JobGroup)=>g.provider===provider;return{provider:provider as CoverageJobs['provider'],discovered:total(queue,g=>of(g)&&g.kind==='detail'),completed:total(queue,g=>of(g)&&g.status==='done'),details:total(queue,g=>of(g)&&g.status==='done'&&g.kind==='detail'),pending:total(queue,g=>of(g)&&WAITING.includes(g.status)),failed:total(queue,g=>of(g)&&g.status==='failed'),updated:latest(queue.filter(of).map(g=>g.updated))}});
 const statusRows:ProviderRow[]=providers.filter(p=>p==='jalan'||p==='trip').map(provider=>{const of=(g:JobGroup)=>g.provider===provider;return{provider:provider as ProviderRow['provider'],last_success:latest(queue.filter(of).map(g=>g.last_success)),completed_details:total(queue,g=>of(g)&&g.status==='done'&&g.kind==='detail'),pending:total(queue,g=>of(g)&&OPEN.includes(g.status)),retry:total(queue,g=>of(g)&&g.status==='retry'),failed:total(queue,g=>of(g)&&g.status==='failed'),active:total(queue,of,'active')}});
 const coverage=coverageFrom({records:quality.records,prefectures:prefectures.size},jobs);
 const progress:CoverageRecord|null=progressDay?{day:progressDay,counts:{records:all.records,prefectures:all.prefectures.size},jobs,counter,sequence}:null;
 // The row the collector's count used to store before this build read the trend.
 if(progress&&progress.day>=new Date(now.getTime()-29*86400000).toISOString().slice(0,10)&&progress.day<=now.toISOString().slice(0,10))
  fill.trend=[...fill.trend!.filter(t=>t.date!==progress.day),{date:progress.day,records:progress.counts.records,pages:trendPages(jobs) as TrendDay['pages']}].sort((a,b)=>a.date<b.date?-1:1);
 const [side,unprepared]=await Promise.all([collectionStatusSideRows(db),catalogPreparation()]);
 const status=collectionStatusFrom(now.getTime(),{providers:statusRows,...side,quality});
 // unprepared: seed steps crawl-prepare has not run on this database (a
 // deploy that changes the seed prepares it and builds again, deploy.yml).
 return{core,text,cards,geo,geocodeInputs,coverage,status:{...status,fill},unprepared,mergedInto:Object.fromEntries(mergedInto),first:firstPage(core,cards,coverage),progress};
}
// The first page of the default view (no conditions, recommended order): put
// in the static page so the list shows before core and cards arrive.
export function firstPage(core:SnapshotCore,cards:HotelSummary[],coverage:ReturnType<typeof coverageFrom>):SearchResponse{
 const s=openSnapshot({coverage} as Parameters<typeof openSnapshot>[0],core,cards);
 return resultPage(s,searchSnapshot(s,DEFAULT_FILTERS,'recommended'),1);
}
