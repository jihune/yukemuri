import {prepareCollectionPriorities} from './collection-priorities';
import {attachLifecycle} from './hotel-lifecycle';
import {attachSourceGroups,importVerifiedSourceGroups,refreshSourceGroupIndexes} from './hotel-source-groups';
import { favoritesDb } from './favorites-db';
import { Hotel, HotelFilters, FeatureKey, type CoreFeatureKey } from './hotel-types';
import { catalogVersion, catalogCoverage } from './catalog-core';
import { providerRating } from './hotel-ratings';
import { SortOrder } from './hotel-search';
import { enrichHotel } from './hotel-enrichment';
import { normalizeSearch, hotelNames, hotelSearchText } from './hotel-names';
import { formatHotelLocation, hotelPlaceSearchText } from './japan-place-labels';
import { prepareSearchIndex, searchIndexMatches, localHotelSuggestions, type SearchIndexHotel, type PreparedSearchIndex } from './hotel-search-index';
import type { HotelSuggestion } from './hotel-suggestions';
import {FEATURE_KEYS,featureMasks,hotelFeature} from './hotel-bath-facts';
import {rankHotelAlternatives} from './hotel-alternatives';
import {applyNamePatch, type HotelNamePatch} from './hotel-name-localization';
import localizedNames from '../data/korean-hotel-names.json';
import {needsKoreanDescription} from './hotel-description';
import type {DescriptionPatch} from './description-contract';
import {createResultSession,readResultSession,resultQueryKey,hotelsInOrder,type SearchOptions} from './hotel-result-session';
import {validComparisonIds} from './hotel-comparison';
const columns=['id','region','prefecture','name','search_text','kind','trip_score','trip_reviews','jalan_score','jalan_reviews','natural','large_bath','outdoor','private_bath','room_onsen','room_outdoor','bath_features','bath_known','payload'];
const coreColumns:Record<CoreFeatureKey,string>={natural:'natural',largeBath:'large_bath',outdoor:'outdoor',privateBath:'private_bath',roomOnsen:'room_onsen',roomOutdoor:'room_outdoor'};
const featureColumns=Object.fromEntries(FEATURE_KEYS.map((key,i)=>[key,`((bath_features & ${1<<i}) != 0)`])) as Record<FeatureKey,string>;
let searchIndex:{expires:number;promise:Promise<{hotels:SearchIndexHotel[];prepared:PreparedSearchIndex}>}|null=null;
async function catalogueSearchIndex(){
 if(!searchIndex||searchIndex.expires<Date.now()){
  const promise=(async()=>{
   type Row={id:string;region:string;prefecture:string|null;kind:string;trip_score:number|null;trip_reviews:number|null;jalan_score:number|null;jalan_reviews:number|null;names:string;location:string}&Record<string,unknown>;
   const hotels:SearchIndexHotel[]=[],db=favoritesDb();let cursor='';
   // All aliases in one primary-key-ordered read, in the same (hotel_id,
   // name_key) order the former per-hotel subquery returned them.
   const aliases=new Map<string,string[]>();
   for(const r of (await db.prepare('SELECT hotel_id,name FROM hotel_names ORDER BY hotel_id,name_key').all<{hotel_id:string;name:string}>()).results){const list=aliases.get(r.hotel_id);if(list)list.push(r.name);else aliases.set(r.hotel_id,[r.name])}
   for(;;){
    const rows=await db.prepare(`SELECT id,region,prefecture,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,bath_features,bath_known,json_extract(payload,'$.names') AS names,json_extract(payload,'$.location') AS location FROM hotels WHERE id>? AND NOT EXISTS (SELECT 1 FROM hotel_lifecycle l WHERE l.hotel_id=hotels.id AND l.state IN ('closed','temporarily_closed')) ORDER BY id LIMIT 1500`).bind(cursor).all<Row>();
    for(const row of rows.results){
     const names=JSON.parse(row.names) as Hotel['names'],location=JSON.parse(row.location) as Hotel['location'];
     const place={prefecture:row.prefecture,regionId:row.region,location,names};
     hotels.push({id:row.id,names:[...new Set([names.ko,names.ja,names.en,...(aliases.get(row.id)??[])].filter(Boolean))],location:formatHotelLocation(place),context:hotelPlaceSearchText(place),region:row.region,prefecture:row.prefecture,kind:row.kind,features:Number(row.bath_features??0),knownFeatures:Number(row.bath_known??0),tripScore:row.trip_score,tripReviews:row.trip_reviews,jalanScore:row.jalan_score,jalanReviews:row.jalan_reviews});
    }
    if(rows.results.length<1500)break;cursor=rows.results.at(-1)!.id;
   }
   return{hotels,prepared:prepareSearchIndex(hotels)};
  })();
  searchIndex={expires:Date.now()+120000,promise};promise.catch(()=>{if(searchIndex?.promise===promise)searchIndex=null});
 }
 return searchIndex.promise;
}
async function nameMatches(query:string,region:string){
 return searchIndexMatches((await catalogueSearchIndex()).prepared,query,region).map(({id,score,similar})=>({id,score,similar}));
}
const exactQuery=`(instr(search_text,?)>0 OR id IN (SELECT linked.hotel_id FROM hotel_names matched JOIN hotel_names linked ON linked.name_key=matched.name_key JOIN hotels original ON original.id=matched.hotel_id JOIN hotels target ON target.id=linked.hotel_id WHERE matched.hotel_id IN (SELECT hotel_id FROM hotel_names WHERE instr(name_key,?)>0) AND (matched.hotel_id=linked.hotel_id OR original.prefecture IS NOT NULL AND original.prefecture=target.prefecture)))`;
function addConstraints(filters:HotelFilters,clauses:string[],args:(string|number)[],savedOnly:boolean,facilities=true,savedIds:string[]=[]){
 if(!savedOnly&&!facilities)clauses.push("NOT EXISTS (SELECT 1 FROM hotel_lifecycle l WHERE l.hotel_id=hotels.id AND l.state IN ('closed','temporarily_closed'))");
 if(filters.region!=='all'){clauses.push('(region=? OR prefecture=?)');args.push(filters.region,filters.region)}
 if(savedOnly){clauses.push('id IN (SELECT value FROM json_each(?))');args.push(JSON.stringify(savedIds))}
 if(!facilities)return;
 if(filters.ryokanOnly)clauses.push("kind='ryokan'");
 for(const key of filters.features)clauses.push(featureColumns[key]+'=1');
 const rating=filters.ratingProvider==='jalan'?'jalan':'trip';
 if(filters.minRating){clauses.push(rating+'_score>=?');args.push(filters.minRating)}
 if(filters.minReviews){clauses.push(rating+'_reviews>=?');args.push(filters.minReviews)}
}
async function indexNames(hotels:Hotel[]){
 const rows=hotels.flatMap(h=>hotelNames(h).map(name=>({hotelId:h.id,key:normalizeSearch(name),name}))).filter(r=>r.key);
 for(let offset=0;offset<rows.length;offset+=400)await favoritesDb().prepare("INSERT INTO hotel_names (hotel_id,name_key,name) SELECT json_extract(value,'$.hotelId'),json_extract(value,'$.key'),json_extract(value,'$.name') FROM json_each(?) WHERE 1 ON CONFLICT(hotel_id,name_key) DO NOTHING").bind(JSON.stringify(rows.slice(offset,offset+400))).run();
}
export async function writeHotels(observations:Hotel[]){
 const patches=await favoritesDb().prepare("SELECT payload FROM hotel_name_localizations WHERE payload IS NOT NULL AND hotel_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(observations.map(h=>h.id))).all<{payload:string}>();
 const byId=new Map((localizedNames as HotelNamePatch[]).map(p=>[p.id,p]));
 for(const p of patches.results.map(r=>JSON.parse(r.payload) as HotelNamePatch))byId.set(p.id,p);

 const hotels=observations.map(h=>applyNamePatch(enrichHotel(h),byId.get(h.id)));
 const db=favoritesDb();let written=0;
 const sql=`INSERT INTO hotels (${columns.join(',')}) SELECT ${columns.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?) WHERE 1 ON CONFLICT(id) DO UPDATE SET ${columns.slice(1).map(c=>`${c}=excluded.${c}`).join(',')} WHERE COALESCE(julianday(json_extract(excluded.payload,'$.sources[0].retrievedAt')),0)>=COALESCE(julianday(json_extract(hotels.payload,'$.sources[0].retrievedAt')),0) AND (json_extract(hotels.payload,'$.sources[0].label') NOT LIKE '%상세%' OR json_extract(excluded.payload,'$.sources[0].label') LIKE '%상세%') RETURNING id,payload`;
 for(let offset=0;offset<hotels.length;offset+=100){
  const rows=hotels.slice(offset,offset+100).map(h=>{
   const trip=providerRating(h,'trip'),jalan=providerRating(h,'jalan');
   const search=hotelSearchText(h);
   const mask=featureMasks(h);
   return [h.id,h.regionId,h.prefecture??null,h.names.ko,search,h.kind,trip?.score??null,trip?.reviewCount??null,jalan?.score??null,jalan?.reviewCount??null,...Object.keys(coreColumns).map(k=>hotelFeature(h,k as FeatureKey).value===null?null:Number(hotelFeature(h,k as FeatureKey).value)),mask.features,mask.knownFeatures,JSON.stringify(h)];
  });
  // One transaction: add the ids this upsert inserts to the record counter
  // (a primary-key lookup per row), then write.
  const json=JSON.stringify(rows);
  const [,accepted]=await db.batch<{id:string;payload:string}>([db.prepare("UPDATE catalog_meta SET value=CAST(value AS INTEGER)+(SELECT COUNT(DISTINCT json_extract(j.value,'$[0]')) FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM hotels h WHERE h.id=json_extract(j.value,'$[0]'))) WHERE key=?").bind(json,RECORD_COUNTER),db.prepare(sql).bind(json)]);
  written+=accepted.results.length;
  // Index only committed records. Stale/list observations rejected by the
  // UPSERT must not inject their aliases into search.
  await indexNames(accepted.results.map(row=>JSON.parse(row.payload) as Hotel));
  if(accepted.results.length)await refreshSourceGroupIndexes(accepted.results.map(row=>row.id));
 }
 // Substring search reads hotels and hotel_names directly, so new names are
 // found at once. The fuzzy index and the coverage aggregate expire on their
 // timers, as they already do in every isolate that did not take this write.
 resultCache.clear();
 return written;
}
async function queryCoverage(){
 const db=favoritesDb();
 const counts=await db.prepare('SELECT COUNT(*) AS records,COUNT(DISTINCT prefecture) AS prefectures FROM hotels').first<{records:number;prefectures:number}>();
 const jobs=await db.prepare("SELECT provider,SUM(CASE WHEN kind='detail' THEN 1 ELSE 0 END) AS discovered,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='done' AND kind='detail' THEN 1 ELSE 0 END) AS details,SUM(CASE WHEN status IN ('pending','retry','running') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,MAX(fetched_at) AS updated FROM crawl_jobs WHERE status!='skipped' GROUP BY provider").all<{provider:'trip'|'jalan';discovered:number;completed:number;details:number;pending:number;failed:number;updated:string|null}>();
 const aggregate={...catalogCoverage,records:counts?.records??0,prefectures:counts?.prefectures??0,crawledRecords:(counts?.records??0)-20,discoveredDetailUrls:0,completedDetailPages:0,pending:0,failed:0,providers:{jalan:{discovered:0,completed:0},trip:{discovered:0,completed:0}}};
 for(const job of jobs.results){aggregate.providers[job.provider]={discovered:job.discovered,completed:job.completed};aggregate.discoveredDetailUrls+=job.discovered;aggregate.completedDetailPages+=job.details;aggregate.pending+=job.pending;aggregate.failed+=job.failed;if(job.updated&&job.updated>aggregate.updatedAt)aggregate.updatedAt=job.updated}
 return aggregate;
}
// Hotel rows are only ever inserted by writeHotels, which keeps this counter.
const RECORD_COUNTER='hotel-records';
let coverageCache:{expires:number;promise:ReturnType<typeof queryCoverage>}|null=null;
function cacheCoverage(promise:ReturnType<typeof queryCoverage>){
 coverageCache={expires:Date.now()+300000,promise};
 promise.catch(()=>{if(coverageCache?.promise===promise)coverageCache=null});
 return promise;
}
const COVERAGE_SNAPSHOT='coverage-snapshot';
// Full count, read by the collector at the end of each run. It resets the
// record counter to the true count (first run, restored backups) and stores
// the aggregate so other isolates need not count it again.
export async function readCoverage(){
 const coverage=await cacheCoverage(queryCoverage()),db=favoritesDb(),upsert='INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE catalog_meta.value!=excluded.value';
 await db.batch([db.prepare(upsert).bind(RECORD_COUNTER,String(coverage.records)),db.prepare(upsert).bind(COVERAGE_SNAPSHOT,JSON.stringify(coverage))]);
 return coverage;
}
// Exact record count over the aggregate of the last full count: from this
// isolate's memory for five minutes, else as stored by the collector's GET.
// Without a counter yet, the collector (sync) takes the full count first.
export async function readCachedCoverage(sync=false){
 const rows=await favoritesDb().prepare('SELECT key,value FROM catalog_meta WHERE key IN (?,?)').bind(RECORD_COUNTER,COVERAGE_SNAPSHOT).all<{key:string;value:string}>();
 const stored=new Map(rows.results.map(r=>[r.key,r.value]));
 const counter=stored.get(RECORD_COUNTER);
 if(counter===undefined&&sync)return readCoverage();
 const snapshot=stored.get(COVERAGE_SNAPSHOT);
 const coverage=await(coverageCache&&coverageCache.expires>=Date.now()?coverageCache.promise:cacheCoverage(snapshot?Promise.resolve(JSON.parse(snapshot) as Awaited<ReturnType<typeof queryCoverage>>):queryCoverage()));
 if(counter===undefined)return coverage;
 const records=Number(counter);
 return{...coverage,records,crawledRecords:records-20};
}
const resultCache=new Map<string,{expires:number;promise:Promise<SearchResponse>}>();
export function invalidateSearch(){searchIndex=null;resultCache.clear();coverageCache=null}
export async function requestDescriptionTranslation(hotel:Hotel){
 if(hotel.descriptionTranslation||!needsKoreanDescription(hotel.description))return;
 await favoritesDb().prepare('INSERT INTO hotel_description_requests (hotel_id,source_text,requested_at) VALUES (?,?,?) ON CONFLICT(hotel_id) DO UPDATE SET source_text=excluded.source_text,requested_at=excluded.requested_at WHERE hotel_description_requests.source_text!=excluded.source_text').bind(hotel.id,hotel.description,new Date().toISOString()).run();
}
export async function saveDescriptionTranslations(patches:DescriptionPatch[]){
 const db=favoritesDb(),input=JSON.stringify(patches);
 const rows=await db.prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(patches.map(p=>p.id))).all<{id:string;payload:string}>();
 const originals=new Map(rows.results.map(r=>[r.id,(JSON.parse(r.payload) as Hotel).description]));
 for(const p of patches)if(originals.get(p.id)!==p.sourceText||!needsKoreanDescription(p.sourceText))throw new Error('Description changed or is not eligible for translation');
 // One statement commits the whole batch only if all source descriptions still
 // match. Translations never alter the collected description or facility facts.
 const result=await db.prepare(`INSERT INTO hotel_description_translations (hotel_id,source_text,text_ko,translated_at)
  SELECT h.id,json_extract(p.value,'$.sourceText'),json_extract(p.value,'$.textKo'),? FROM json_each(?) p JOIN hotels h ON h.id=json_extract(p.value,'$.id')
  WHERE json_extract(h.payload,'$.description')=json_extract(p.value,'$.sourceText') AND
   (SELECT COUNT(*) FROM json_each(?) c JOIN hotels current ON current.id=json_extract(c.value,'$.id') WHERE json_extract(current.payload,'$.description')=json_extract(c.value,'$.sourceText'))=?
  ON CONFLICT(hotel_id) DO UPDATE SET source_text=excluded.source_text,text_ko=excluded.text_ko,translated_at=excluded.translated_at`).bind(new Date().toISOString(),input,input,patches.length).run();
 if(result.meta.changes!==patches.length)throw new Error('Description changed; read current sources before retrying');
 return patches.length;
}
export async function saveNamePatches(patches:HotelNamePatch[]){
 const db=favoritesDb();
 const rows=await db.prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(patches.map(p=>p.id))).all<{id:string;payload:string}>();
 const existing=new Map(rows.results.map(r=>[r.id,r]));
 // Check every identity before writing any part of a submitted batch.
 for(const p of patches){const row=existing.get(p.id);if(!row||!hotelNames(JSON.parse(row.payload) as Hotel).some(name=>normalizeSearch(name)===normalizeSearch(p.matchedName)))throw new Error('Hotel identity does not match')}
 for(const p of patches){
  const row=existing.get(p.id)!,hotel=applyNamePatch(enrichHotel(JSON.parse(row.payload) as Hotel),p);
  const payload=JSON.stringify(hotel);
  const [updated]=await db.batch([
   db.prepare('UPDATE hotels SET name=?,search_text=?,payload=? WHERE id=? AND payload=?').bind(hotel.names.ko,hotelSearchText(hotel),payload,p.id,row.payload),
   db.prepare('INSERT INTO hotel_name_localizations (hotel_id,payload,checked_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM hotels WHERE id=? AND payload=?) ON CONFLICT(hotel_id) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at').bind(p.id,JSON.stringify(p),new Date().toISOString(),p.id,payload),
  ]);
  if(!updated.meta.changes)throw new Error('Hotel changed; retry after reading its current identity');
  await indexNames([hotel]);
 }
 invalidateSearch();
 return patches.length;
}
export async function deferNameResearch(ids:string[]){
 if(!ids.length)return;
 await favoritesDb().prepare("INSERT INTO hotel_name_localizations (hotel_id,payload,checked_at) SELECT id,NULL,? FROM hotels WHERE id IN (SELECT value FROM json_each(?)) ON CONFLICT(hotel_id) DO UPDATE SET checked_at=excluded.checked_at WHERE hotel_name_localizations.payload IS NULL").bind(new Date().toISOString(),JSON.stringify(ids)).run();
}
async function importLocalizedNames(){
 const db=favoritesDb(),key='korean-names-20261004';
 if(await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first())return;
 const present=await db.prepare('SELECT id FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(localizedNames.map(p=>p.id))).all<{id:string}>();
 const ids=new Set(present.results.map(r=>r.id));
 const patches=(localizedNames as HotelNamePatch[]).filter(p=>ids.has(p.id));
 if(patches.length)await saveNamePatches(patches);
 await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(key,'done').run();
}
let ready:Promise<void>|null=null;
// Bounded, idempotent DATA backfill. Schema is owned solely by migrations.
// The version marker is written last; interrupted imports safely resume.
async function importSnapshot(){
 const db=favoritesDb();
 const version=await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind('snapshot').first<{value:string}>();
 if(version?.value===catalogVersion)return;
 const [{catalogHotels},{default:queue}]=await Promise.all([import('./hotel-catalog'),import('../data/crawl-jobs.json')]);
 await writeHotels(catalogHotels);
 const jobKeys=['url','provider','kind','prefecture','status','attempts','next_at','error','fetched_at'];
 const jobSql=`INSERT INTO crawl_jobs (${jobKeys.join(',')}) SELECT ${jobKeys.map(k=>`json_extract(value,'$.${k}')`).join(',')} FROM json_each(?) WHERE 1 ON CONFLICT(url) DO NOTHING`;
 for(let offset=0;offset<queue.length;offset+=250)await db.prepare(jobSql).bind(JSON.stringify(queue.slice(offset,offset+250))).run();
 await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('snapshot',catalogVersion).run();
}
async function reindexNames(){
 const db=favoritesDb(),key='multilingual-index-v1';
 const state=await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first<{value:string}>();
 if(state?.value==='done')return;
 let cursor=state?.value??'';
 for(;;){
  const rows=await db.prepare('SELECT id,payload FROM hotels WHERE id>? ORDER BY id LIMIT 100').bind(cursor).all<{id:string;payload:string}>();
  if(!rows.results.length)break;
  const hotels=rows.results.map(r=>enrichHotel(JSON.parse(r.payload) as Hotel));
  await indexNames(hotels);
  const data=hotels.map((h,i)=>({id:h.id,search:hotelSearchText(h),payload:JSON.stringify(h),old:rows.results[i].payload}));
  await db.prepare("WITH changes AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.search') AS search,json_extract(value,'$.payload') AS updated,json_extract(value,'$.old') AS original FROM json_each(?)) UPDATE hotels SET search_text=(SELECT search FROM changes WHERE changes.id=hotels.id),payload=(SELECT updated FROM changes WHERE changes.id=hotels.id) WHERE id IN (SELECT id FROM changes) AND payload=(SELECT original FROM changes WHERE changes.id=hotels.id)").bind(JSON.stringify(data)).run();
  cursor=rows.results.at(-1)!.id;
  await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,cursor).run();
 }
 await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,'done').run();
 invalidateSearch();
}
// Maintenance advances one small, resumable page. Public reads never wait
// for a full catalog scan, and historical source payloads stay untouched.
async function preparePlaceSearch(){
 const db=favoritesDb(),key='onsen-place-search-v1';
 const state=await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first<{value:string}>();
 if(state?.value==='done')return {done:true,processed:0,cursor:'done'};
 const cursor=state?.value??'';
 type Row={id:string;region:string;prefecture:string|null;names:string;aliases:string|null;location:string;search_text:string};
 const rows=await db.prepare("SELECT id,region,prefecture,json_extract(payload,'$.names') AS names,json_extract(payload,'$.aliases') AS aliases,json_extract(payload,'$.location') AS location,search_text FROM hotels WHERE id>? ORDER BY id LIMIT 500").bind(cursor).all<Row>();
 const patches=rows.results.map(row=>({id:row.id,search:hotelSearchText({names:JSON.parse(row.names),aliases:row.aliases?JSON.parse(row.aliases):[],location:JSON.parse(row.location),regionId:row.region,prefecture:row.prefecture}),original:row.search_text}));
 const next=rows.results.length<500?'done':rows.results.at(-1)!.id;
 const update=db.prepare("WITH changes AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.search') AS search,json_extract(value,'$.original') AS original FROM json_each(?)) UPDATE hotels SET search_text=(SELECT search FROM changes WHERE changes.id=hotels.id) WHERE id IN (SELECT id FROM changes) AND search_text=(SELECT original FROM changes WHERE changes.id=hotels.id)").bind(JSON.stringify(patches));
 const progress=db.prepare("INSERT INTO catalog_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE catalog_meta.value!='done' AND (excluded.value='done' OR catalog_meta.value<excluded.value)").bind(key,next);
 await db.batch(patches.length?[update,progress]:[progress]);
 invalidateSearch();
 return {done:next==='done',processed:rows.results.length,cursor:next};
}
async function prepareExternalBathFacts(){
 const db=favoritesDb(),key='external-bath-scope-v1';
 const state=await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first<{value:string}>();
 if(state?.value==='done')return {done:true,processed:0,cursor:'done'};
 const rows=await db.prepare("SELECT id,payload FROM hotels WHERE id>? AND (json_extract(payload,'$.spring.waterNotes') LIKE '%温泉施設はリゾート内の施設%' OR json_extract(payload,'$.spring.waterNotes') LIKE '%温泉施設は館外%' OR json_extract(payload,'$.spring.waterNotes') LIKE '%温泉施設は敷地外%' OR json_extract(payload,'$.spring.waterNotes') LIKE '%温泉施設は別施設%' OR json_extract(payload,'$.spring.waterNotes') LIKE '%館外の温泉施設%' OR json_extract(payload,'$.spring.waterNotes') LIKE '%敷地外の温泉施設%' OR json_extract(payload,'$.spring.waterNotes') LIKE '%外部の温泉施設%') ORDER BY id LIMIT 100").bind(state?.value??'').all<{id:string;payload:string}>();
 const updates=rows.results.map(row=>{const h=enrichHotel(JSON.parse(row.payload) as Hotel);return{id:h.id,...featureMasks(h),core:Object.fromEntries(Object.keys(coreColumns).map(k=>[k,hotelFeature(h,k as FeatureKey).value===null?null:Number(hotelFeature(h,k as FeatureKey).value)])),original:row.payload}});
 const next=rows.results.length<100?'done':rows.results.at(-1)!.id;
 const assignments=['bath_features=(SELECT features FROM patches WHERE patches.id=hotels.id)','bath_known=(SELECT known FROM patches WHERE patches.id=hotels.id)',...Object.entries(coreColumns).map(([key,column])=>`${column}=(SELECT json_extract(core,'$.${key}') FROM patches WHERE patches.id=hotels.id)`)];
 const update=db.prepare(`WITH patches AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.features') AS features,json_extract(value,'$.knownFeatures') AS known,json_extract(value,'$.core') AS core,json_extract(value,'$.original') AS original FROM json_each(?)) UPDATE hotels SET ${assignments.join(',')} WHERE id IN (SELECT id FROM patches) AND payload=(SELECT original FROM patches WHERE patches.id=hotels.id)`).bind(JSON.stringify(updates));
 const progress=db.prepare("INSERT INTO catalog_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE catalog_meta.value!='done' AND (excluded.value='done' OR catalog_meta.value<excluded.value)").bind(key,next);
 // A corrected facility scope also expires paginated snapshots that still
 // contain the property's old filter qualification.
 await db.batch(updates.length?[update,db.prepare('DELETE FROM hotel_result_sessions'),progress]:[progress]);invalidateSearch();
 return {done:next==='done',processed:rows.results.length,cursor:next};
}
export async function prepareOnsenCatalog(){
 await ensureCatalog();
 const search=await preparePlaceSearch();
 const priorities=await prepareCollectionPriorities();
 const bathScope=await prepareExternalBathFacts();
 return {done:search.done&&priorities.done&&bathScope.done,search,priorities,bathScope};
}
async function backfillBathFacts(){
 // The scan for unset masks reads every hotel; run it until it finds none once.
 // writeHotels always sets the masks, so no later row needs it.
 const db=favoritesDb(),key='bath-facts-backfill-v1';
 if(await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first())return;
 for(;;){
  const rows=await db.prepare('SELECT id,payload FROM hotels WHERE bath_features IS NULL ORDER BY id LIMIT 200').all<{id:string;payload:string}>();
  if(!rows.results.length)break;
  const updates=rows.results.map(row=>{const h=enrichHotel(JSON.parse(row.payload) as Hotel);return{id:h.id,...featureMasks(h),natural:hotelFeature(h,'natural').value===null?null:Number(hotelFeature(h,'natural').value),original:row.payload}});
  await db.prepare("WITH patches AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.features') AS features,json_extract(value,'$.knownFeatures') AS known,json_extract(value,'$.natural') AS natural,json_extract(value,'$.original') AS original FROM json_each(?)) UPDATE hotels SET bath_features=(SELECT features FROM patches WHERE patches.id=hotels.id),bath_known=(SELECT known FROM patches WHERE patches.id=hotels.id),natural=(SELECT natural FROM patches WHERE patches.id=hotels.id) WHERE bath_features IS NULL AND id IN (SELECT id FROM patches) AND payload=(SELECT original FROM patches WHERE patches.id=hotels.id)").bind(JSON.stringify(updates)).run();
 }
 await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(key,'done').run();
 searchIndex=null;
}
async function ensureCatalog(){if(!ready)ready=importSnapshot().then(reindexNames).then(backfillBathFacts).then(importLocalizedNames).then(importVerifiedSourceGroups).catch(error=>{ready=null;throw error});await ready}
export type HotelAlternative={hotel:Hotel;unmetConditions:string[];queryMatched:boolean};
export type SearchResponse={hotels:Hotel[];total:number;unknownExcluded?:number;page:number;pageSize:number;featureCounts:Record<FeatureKey,number>;ryokanCount:number;coverage:typeof catalogCoverage;similarCount?:number;similarHotelIds?:string[];alternatives?:HotelAlternative[];snapshot?:{token:string;createdAt:string;expiresAt:string}};
// One WHERE for the list and the map: scope (lifecycle, region, saved, query),
// then the facility, rating and review conditions.
async function searchWhere(filters:HotelFilters,savedOnly:boolean,savedIds:string[]){
  const clauses:string[]=[],args:(string|number)[]=[];
  addConstraints(filters,clauses,args,savedOnly,false,savedIds);
  const q=normalizeSearch(filters.query);
  let matchesJson='[]',similarJson='[]';
  if(q){
   const matches=await nameMatches(filters.query,filters.region);matchesJson=JSON.stringify(matches);similarJson=JSON.stringify(matches.filter(m=>m.similar).map(m=>m.id));
   // The substring match scans hotels and hotel_names once per request. The
   // counts and the ordered list then read only the matching rows by id.
   const exact=await favoritesDb().prepare(`SELECT id FROM hotels WHERE ${exactQuery}`).bind(q,q).all<{id:string}>();
   clauses.push('id IN (SELECT value FROM json_each(?))');args.push(JSON.stringify([...new Set([...exact.results.map(r=>r.id),...matches.map(m=>m.id)])]));
  }
  const facilityClauses:string[]=[],facilityArgs:(string|number)[]=[];
  addConstraints({...filters,region:'all'},facilityClauses,facilityArgs,false,true);
  return{clauses,args,q,matchesJson,similarJson,facilityClauses,facilityArgs};
}
export const MAP_POINT_LIMIT=500;
export type MapBounds={west:number;south:number;east:number;north:number};
export type MapPoint={id:string;name:string;lat:number;lng:number;score:number|null};
export type MapCell={lat:number;lng:number;count:number;south:number;west:number;north:number;east:number};
export type MapAreaResponse={total:number;inBounds:number;outOfBounds:number;withoutCoordinates:number;limit:number;points:MapPoint[];cells:MapCell[]};
// Every matching record inside the bounds, not only the loaded list pages.
// Coordinates live only in the payload in this phase (docs/U02-20261010.md).
async function mapArea(filters:HotelFilters,bounds:MapBounds,savedOnly:boolean,savedIds:string[]):Promise<MapAreaResponse>{
  await ensureCatalog();const db=favoritesDb();
  const {clauses,args,facilityClauses,facilityArgs}=await searchWhere(filters,savedOnly,savedIds);
  const all=[...clauses,...facilityClauses],where=all.length?'WHERE '+all.join(' AND '):'',whereArgs=[...args,...facilityArgs];
  const score=filters.ratingProvider==='jalan'?'jalan_score':'trip_score';
  // Same rule as hasCoordinates on the client: both values must be numbers.
  const numeric=`json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real')`;
  const located=`SELECT id,name,${score} AS score,CASE WHEN ${numeric} THEN json_extract(payload,'$.location.latitude') END AS lat,CASE WHEN ${numeric} THEN json_extract(payload,'$.location.longitude') END AS lng FROM hotels ${where}`;
  const inside='lat IS NOT NULL AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',box=[bounds.south,bounds.north,bounds.west,bounds.east];
  const summary=await db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(lat IS NULL),0) AS missing,COALESCE(SUM(${inside}),0) AS inside FROM (${located})`).bind(...box,...whereArgs).first<{total:number;missing:number;inside:number}>();
  const total=summary?.total??0,withoutCoordinates=summary?.missing??0,inBounds=summary?.inside??0;
  const result:MapAreaResponse={total,inBounds,outOfBounds:total-withoutCoordinates-inBounds,withoutCoordinates,limit:MAP_POINT_LIMIT,points:[],cells:[]};
  if(!inBounds)return result;
  if(inBounds<=MAP_POINT_LIMIT){
   const rows=await db.prepare(`SELECT id,name,score,lat,lng FROM (${located}) WHERE ${inside} ORDER BY id`).bind(...whereArgs,...box).all<MapPoint>();
   result.points=rows.results;return result;
  }
  // Too many points for one response: counts on a 16 x 16 grid over the bounds.
  const latStep=(bounds.north-bounds.south)/16||1e-9,lngStep=(bounds.east-bounds.west)/16||1e-9;
  const rows=await db.prepare(`SELECT MIN(15,CAST((lat-?)/? AS INTEGER)) AS row,MIN(15,CAST((lng-?)/? AS INTEGER)) AS col,COUNT(*) AS count,AVG(lat) AS lat,AVG(lng) AS lng FROM (${located}) WHERE ${inside} GROUP BY row,col ORDER BY row,col`).bind(bounds.south,latStep,bounds.west,lngStep,...whereArgs,...box).all<{row:number;col:number;count:number;lat:number;lng:number}>();
  result.cells=rows.results.map(c=>({lat:c.lat,lng:c.lng,count:c.count,south:bounds.south+c.row*latStep,north:bounds.south+(c.row+1)*latStep,west:bounds.west+c.col*lngStep,east:bounds.west+(c.col+1)*lngStep}));
  return result;
}
async function searchHotels(filters:HotelFilters,sort:SortOrder,page:number,savedOnly:boolean,savedIds:string[],options:SearchOptions={}):Promise<SearchResponse>{
  await ensureCatalog();const db=favoritesDb();
  const queryKey=await resultQueryKey(filters,sort,savedOnly,savedIds,options.scope);
  if(options.snapshot)return readResultSession(options.snapshot,queryKey,page);
  const {clauses,args,q,matchesJson,similarJson,facilityClauses,facilityArgs}=await searchWhere(filters,savedOnly,savedIds);
  const scope=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const scopeArgs=[...args];
  const eligible=facilityClauses.length?facilityClauses.join(' AND '):'1';
  const rating=filters.ratingProvider==='jalan'?'jalan':'trip';
  // Candidates that fail no selected condition, only lack the fact for one.
  // They stay excluded and are counted so the list can say so.
  const unknownClauses:string[]=[],unknownArgs:(string|number)[]=[];
  if(filters.ryokanOnly)unknownClauses.push("kind='ryokan'");
  for(const key of filters.features){const bit=1<<FEATURE_KEYS.indexOf(key);unknownClauses.push(`((bath_features & ${bit}) != 0 OR (COALESCE(bath_known,0) & ${bit}) = 0)`)}
  if(filters.minRating){unknownClauses.push(`(${rating}_score>=? OR ${rating}_score IS NULL)`);unknownArgs.push(filters.minRating)}
  if(filters.minReviews){unknownClauses.push(`(${rating}_reviews>=? OR ${rating}_reviews IS NULL)`);unknownArgs.push(filters.minReviews)}
  const unknownOnly=unknownClauses.length?unknownClauses.join(' AND '):'0';
  const coveragePromise=readCachedCoverage();
  const facetsPromise=db.prepare(`SELECT ${Object.entries(featureColumns).map(([k,c])=>`SUM(CASE WHEN ${c}=1 THEN 1 ELSE 0 END) AS ${k}`).join(',')},SUM(CASE WHEN kind='ryokan' THEN 1 ELSE 0 END) AS ryokan,COUNT(CASE WHEN ${eligible} THEN 1 END) AS count,COALESCE(SUM(CASE WHEN (${eligible}) AND id IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END),0) AS similar,COALESCE(SUM(CASE WHEN COALESCE((${eligible}),0)=0 AND (${unknownOnly}) THEN 1 ELSE 0 END),0) AS unknown FROM hotels ${scope}`).bind(...facilityArgs,...facilityArgs,similarJson,...facilityArgs,...unknownArgs,...scopeArgs).first<Record<string,number>>();
  clauses.push(...facilityClauses);args.push(...facilityArgs);
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const [facets,coverage]=await Promise.all([facetsPromise,coveragePromise]);
  const total=facets?.count??0,pageSize=40,actualPage=Math.max(1,Math.min(page,Math.max(1,Math.ceil(total/pageSize))));
  const ratingSort=`${rating}_score DESC,${rating}_reviews DESC,id ASC`;
  const order=sort==='name'?'name ASC,id ASC':sort==='reviews'?`${rating}_reviews DESC,${rating}_score DESC,id ASC`:sort==='rating'?ratingSort:`CASE WHEN natural=1 THEN 1 ELSE 0 END DESC,CASE WHEN trip_score>=9 AND trip_reviews>=50 THEN 1 ELSE 0 END DESC,${ratingSort}`;
  const relevance=sort==='recommended'&&!!q;
  const cte=relevance?"WITH query_matches AS MATERIALIZED (SELECT json_extract(value,'$.id') AS hotel_id,json_extract(value,'$.score') AS score FROM json_each(?)) ":'';
  // Broad legacy full-text hits can join separate name words. Keep them below
  // the shared name/place relevance so both result and prediction order agree.
  const matchScore=relevance?',COALESCE(query_matches.score,20) AS match_score':'';
  const join=relevance?' LEFT JOIN query_matches ON query_matches.hotel_id=hotels.id':'';
  const ordered=options.stable?await db.prepare(`${cte}SELECT id${matchScore} FROM hotels${join} ${where} ORDER BY ${relevance?'match_score DESC,':''}${order} LIMIT 50001`).bind(...(relevance?[matchesJson]:[]),...args).all<{id:string}>():null;
  const rows=ordered?{results:[] as {id:string;payload:string;similar_match:number}[]}:await db.prepare(`${cte}SELECT id,payload,id IN (SELECT value FROM json_each(?)) AS similar_match${matchScore} FROM hotels${join} ${where} ORDER BY ${relevance?'match_score DESC,':''}${order} LIMIT ? OFFSET ?`).bind(...(relevance?[matchesJson]:[]),similarJson,...args,pageSize,(actualPage-1)*pageSize).all<{id:string;payload:string;similar_match:number}>();
  let alternatives:HotelAlternative[]=[];
  if((ordered?ordered.results.length:total)===0&&(q||filters.region!=='all'||filters.features.length||filters.ryokanOnly||filters.minRating||filters.minReviews)){
   const saved=savedOnly?new Set(savedIds):undefined;
   const candidates=rankHotelAlternatives((await catalogueSearchIndex()).prepared,filters,saved);
   if(candidates.length){const picked=await db.prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(candidates.map(c=>c.id))).all<{id:string;payload:string}>();const byId=new Map(picked.results.map(row=>[row.id,enrichHotel(JSON.parse(row.payload) as Hotel)]));alternatives=candidates.flatMap(c=>{const hotel=byId.get(c.id);return hotel?[{hotel,unmetConditions:c.unmetConditions,queryMatched:c.queryMatched}]:[]})}
  }
  const result:SearchResponse={hotels:rows.results.map(r=>enrichHotel(JSON.parse(r.payload) as Hotel)),total,unknownExcluded:facets?.unknown??0,page:actualPage,pageSize,featureCounts:Object.fromEntries(Object.keys(featureColumns).map(k=>[k,facets?.[k]??0])) as Record<FeatureKey,number>,ryokanCount:facets?.ryokan??0,coverage,similarCount:facets?.similar??0,similarHotelIds:rows.results.filter(r=>r.similar_match).map(r=>r.id),alternatives};
  if(ordered){
   const ids=ordered.results.map(r=>r.id),idSet=new Set(ids),allSimilar=(JSON.parse(similarJson) as string[]).filter(id=>idSet.has(id));
   result.total=ids.length;result.page=Math.max(1,Math.min(page,Math.max(1,Math.ceil(ids.length/pageSize))));
   const pageIds=ids.slice((result.page-1)*pageSize,result.page*pageSize);
   result.hotels=await hotelsInOrder(pageIds);result.similarHotelIds=allSimilar.filter(id=>pageIds.includes(id));result.similarCount=allSimilar.length;
   if(ids.length>pageSize){
    result.snapshot=await createResultSession(queryKey,ids,{total:result.total,unknownExcluded:result.unknownExcluded,pageSize,featureCounts:result.featureCounts,ryokanCount:result.ryokanCount,coverage,similarCount:result.similarCount,similarHotelIds:allSimilar,alternatives});
   }
  }
  result.hotels=await attachLifecycle(await attachSourceGroups(result.hotels));
  if(result.alternatives?.length){const attached=await attachLifecycle(await attachSourceGroups(result.alternatives.map(a=>a.hotel)));result.alternatives=result.alternatives.map((a,i)=>({...a,hotel:attached[i]}))}
  return result;
}
export const hotelRepository={
 async search(filters:HotelFilters,sort:SortOrder='recommended',page=1,savedOnly=false,savedIds:string[]=[],options:SearchOptions={}):Promise<SearchResponse>{
  await ensureCatalog();
  const key=JSON.stringify([{...filters,features:[...filters.features].sort()},sort,page,savedOnly,savedOnly?[...savedIds].sort():[],options]);
  if(options.snapshot||options.fresh)return searchHotels(filters,sort,page,savedOnly,savedIds,options);
  const cached=resultCache.get(key);if(cached&&cached.expires>Date.now())return cached.promise;
  if(cached)resultCache.delete(key);
  const promise=searchHotels(filters,sort,page,savedOnly,savedIds,options);
  resultCache.set(key,{expires:Date.now()+30000,promise});
  while(resultCache.size>24)resultCache.delete(resultCache.keys().next().value!);
  promise.catch(()=>{if(resultCache.get(key)?.promise===promise)resultCache.delete(key)});
  return promise;
 },
 mapArea(filters:HotelFilters,bounds:MapBounds,savedOnly=false,savedIds:string[]=[]){return mapArea(filters,bounds,savedOnly,savedIds)},
 async suggest(filters:HotelFilters,savedOnly=false,savedIds:string[]=[]):Promise<HotelSuggestion[]>{
  await ensureCatalog();const index=await catalogueSearchIndex();
  const saved=savedOnly?new Set(savedIds):undefined;
  return localHotelSuggestions(index.prepared,filters.query,filters,saved);
 },
 async searchIndex():Promise<SearchIndexHotel[]>{await ensureCatalog();return(await catalogueSearchIndex()).hotels},
 async get(id:string):Promise<Hotel|null>{
  if(!validComparisonIds([id]))return null;
  return(await this.getMany([id]))[0]??null;
 },
 async getMany(ids:string[]):Promise<Hotel[]>{
  if(!validComparisonIds(ids))throw new RangeError('Invalid comparison selection');
  if(!ids.length)return[];
  await ensureCatalog();
  const rows=await favoritesDb().prepare("SELECT h.id,h.payload,t.text_ko,t.translated_at FROM hotels h LEFT JOIN hotel_description_translations t ON t.hotel_id=h.id AND t.source_text=json_extract(h.payload,'$.description') WHERE h.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all<{id:string;payload:string;text_ko:string|null;translated_at:string|null}>();
  const byId=new Map(rows.results.map(row=>{
   const hotel=enrichHotel(JSON.parse(row.payload) as Hotel);delete hotel.descriptionTranslation;
   if(row.text_ko&&row.translated_at)hotel.descriptionTranslation={text:row.text_ko,translatedAt:row.translated_at};
   return[row.id,hotel];
  }));
  return attachLifecycle(await attachSourceGroups(ids.flatMap(id=>{const hotel=byId.get(id);return hotel?[hotel]:[]})));
 },
 async ready(){await ensureCatalog()},
};
