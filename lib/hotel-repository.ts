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
import {searchSnapshot,snapshotVersions,compareText,textOrder,type SnapshotCore,type SnapshotRow} from './hotel-search-snapshot';
import {validComparisonIds} from './hotel-comparison';
const columns=['id','region','prefecture','name','search_text','kind','trip_score','trip_reviews','jalan_score','jalan_reviews','natural','large_bath','outdoor','private_bath','room_onsen','room_outdoor','bath_features','bath_known','payload'];
const coreColumns:Record<CoreFeatureKey,string>={natural:'natural',largeBath:'large_bath',outdoor:'outdoor',privateBath:'private_bath',roomOnsen:'room_onsen',roomOutdoor:'room_outdoor'};
let searchIndex:{expires:number;promise:Promise<{hotels:SearchIndexHotel[];prepared:PreparedSearchIndex;key:string}>}|null=null;
async function catalogueSearchIndex(){
 if(!searchIndex||searchIndex.expires<Date.now()){
  const promise=(async()=>{
   const hotels:SearchIndexHotel[]=[];
   const byId=(a:SnapshotRow,b:SnapshotRow)=>textOrder(a.id,b.id,a.plain&&b.plain),snapshot=await searchSnapshot(true);
   for(const {id,core,text} of snapshot.rows.slice().sort(byId)){
    if(core[13]!==null&&CLOSED.has(core[13]))continue;
    const [,names,location,aliases]=text!,place={prefecture:core[1],regionId:core[0],location,names};
    // Aliases in name-key order, as the former (hotel_id, name_key) read.
    const aliasNames=(aliases??[]).slice().sort((a,b)=>compareText(a[0],b[0])).map(a=>a[1]);
    hotels.push({id,names:[...new Set([names.ko,names.ja,names.en,...aliasNames].filter(Boolean))],location:formatHotelLocation(place),context:hotelPlaceSearchText(place),region:core[0],prefecture:core[1],kind:core[3],features:Number(core[9]??0),knownFeatures:Number(core[10]??0),tripScore:core[4],tripReviews:core[5],jalanScore:core[6],jalanReviews:core[7]});
   }
   return{hotels,prepared:prepareSearchIndex(hotels),key:snapshot.key};
  })();
  searchIndex={expires:Date.now()+120000,promise};promise.catch(()=>{if(searchIndex?.promise===promise)searchIndex=null});
 }
 return searchIndex.promise;
}
async function nameMatches(query:string,region:string){
 const index=await catalogueSearchIndex();
 return{key:index.key,matches:searchIndexMatches(index.prepared,query,region).map(({id,score,similar})=>({id,score,similar}))};
}
const CLOSED=new Set(['closed','temporarily_closed']);
const FEATURE_BITS=Object.fromEntries(FEATURE_KEYS.map((key,i)=>[key,1<<i])) as Record<FeatureKey,number>;
const hasFeature=(core:SnapshotCore,bit:number)=>core[9]!==null&&(core[9]&bit)!==0;
const ratingOf=(core:SnapshotCore,provider:HotelFilters['ratingProvider'])=>provider==='jalan'?[core[6],core[7]]:[core[4],core[5]];
// The facility, rating and review conditions. As in SQL, a missing value
// satisfies no condition.
function eligible(core:SnapshotCore,filters:HotelFilters){
 if(filters.ryokanOnly&&core[3]!=='ryokan')return false;
 for(const key of filters.features)if(!hasFeature(core,FEATURE_BITS[key]))return false;
 const [score,reviews]=ratingOf(core,filters.ratingProvider);
 if(filters.minRating&&!(score!==null&&score>=filters.minRating))return false;
 if(filters.minReviews&&!(reviews!==null&&reviews>=filters.minReviews))return false;
 return true;
}
// Candidates that fail no selected condition, only lack the fact for one.
function unknownOnly(core:SnapshotCore,filters:HotelFilters){
 if(!filters.ryokanOnly&&!filters.features.length&&!filters.minRating&&!filters.minReviews)return false;
 if(filters.ryokanOnly&&core[3]!=='ryokan')return false;
 for(const key of filters.features){const bit=FEATURE_BITS[key];if(!hasFeature(core,bit)&&((core[10]??0)&bit)!==0)return false}
 const [score,reviews]=ratingOf(core,filters.ratingProvider);
 if(filters.minRating&&!(score===null||score>=filters.minRating))return false;
 if(filters.minReviews&&!(reviews===null||reviews>=filters.minReviews))return false;
 return true;
}
// indexKey: the snapshot generation of the name index, when it was used.
type SearchScope={q:string;region:string;savedOnly:boolean;saved:Set<string>;matches:{id:string;score:number;similar:boolean}[];found:Set<string>|null;indexKey?:string};
// Lifecycle (unless saved), region, saved and query scope.
function inScope(row:SnapshotRow,scope:SearchScope){
 if(!scope.savedOnly&&row.core[13]!==null&&CLOSED.has(row.core[13]))return false;
 if(scope.region!=='all'&&row.core[0]!==scope.region&&row.core[1]!==scope.region)return false;
 if(scope.savedOnly&&!scope.saved.has(row.id))return false;
 return!scope.found||scope.found.has(row.id);
}
let nameKeys:{generation:number;rows:Map<string,SnapshotRow[]>}|null=null;
// The former substring query: search text containing q, or every hotel that
// shares a name key with a hotel whose name key contains q (same hotel, or same
// known prefecture).
function substringMatches(q:string,snapshot:Awaited<ReturnType<typeof searchSnapshot>>){
 if(nameKeys?.generation!==snapshot.generation){
  const rows=new Map<string,SnapshotRow[]>();
  for(const row of snapshot.rows)for(const [key] of row.text![3]??[]){const list=rows.get(key);if(list)list.push(row);else rows.set(key,[row])}
  nameKeys={generation:snapshot.generation,rows};
 }
 const found=new Set<string>(),byKey=nameKeys.rows;
 for(const row of snapshot.rows)if(row.text![0].includes(q))found.add(row.id);
 for(const [key,matched] of byKey)if(key.includes(q))for(const original of matched)for(const [shared] of original.text![3]!)for(const target of byKey.get(shared)!)if(target===original||original.core[1]!==null&&original.core[1]===target.core[1])found.add(target.id);
 return found;
}
async function searchScope(filters:HotelFilters,savedOnly:boolean,savedIds:string[],snapshot:Awaited<ReturnType<typeof searchSnapshot>>):Promise<SearchScope>{
 const q=normalizeSearch(filters.query),scope:SearchScope={q,region:filters.region,savedOnly,saved:new Set(savedIds),matches:[],found:null};
 if(q){const named=await nameMatches(filters.query,filters.region);scope.matches=named.matches;scope.indexKey=named.key;scope.found=new Set([...substringMatches(q,snapshot),...scope.matches.map(m=>m.id)])}
 return scope;
}
let orders:{generation:number;idRank:Int32Array|null;lists:Map<string,SnapshotRow[]>}|null=null;
// The former ORDER BY of each sort, on positions in snapshot.rows: numeric keys
// in typed arrays (NULL as -Infinity, so DESC puts it last) and the id order
// as a rank, computed once per generation.
function sortedRows(snapshot:Awaited<ReturnType<typeof searchSnapshot>>,sort:SortOrder,provider:HotelFilters['ratingProvider']){
 if(orders?.generation!==snapshot.generation)orders={generation:snapshot.generation,idRank:null,lists:new Map()};
 const key=sort+':'+provider,cached=orders.lists.get(key);if(cached)return cached;
 const rows=snapshot.rows,n=rows.length;
 if(!orders.idRank){
  // Native string order is SQLite's when no id holds a surrogate pair.
  const ids=rows.map(r=>r.id),rank=new Map<string,number>(),idRank=new Int32Array(n);
  if(rows.every(r=>r.plain))ids.sort();else ids.sort(compareText);
  for(let i=0;i<n;i++)rank.set(ids[i],i);
  for(let i=0;i<n;i++)idRank[i]=rank.get(rows[i].id)!;
  orders.idRank=idRank;
 }
 const idRank=orders.idRank,numbers=(k:number)=>{const a=new Float64Array(n);for(let i=0;i<n;i++){const v=rows[i].core[k] as number|null;a[i]=v===null?-Infinity:v}return a};
 const desc=(k:Float64Array,a:number,b:number)=>k[a]===k[b]?0:k[b]-k[a];
 const [score,reviews]=provider==='jalan'?[numbers(6),numbers(7)]:[numbers(4),numbers(5)];
 const rating=(a:number,b:number)=>desc(score,a,b)||desc(reviews,a,b)||idRank[a]-idRank[b];
 let compare:(a:number,b:number)=>number;
 if(sort==='name')compare=(a,b)=>textOrder(rows[a].core[2],rows[b].core[2],rows[a].plain&&rows[b].plain)||idRank[a]-idRank[b];
 else if(sort==='reviews')compare=(a,b)=>desc(reviews,a,b)||desc(score,a,b)||idRank[a]-idRank[b];
 else if(sort==='rating')compare=rating;
 else{
  // natural = 1 first, then trip score >= 9 with >= 50 reviews, then rating.
  const first=new Uint8Array(n);
  for(let i=0;i<n;i++){const c=rows[i].core;first[i]=(c[8]===1?2:0)+(c[4]!==null&&c[4]>=9&&c[5]!==null&&c[5]>=50?1:0)}
  compare=(a,b)=>first[b]-first[a]||rating(a,b);
 }
 const order=Array.from({length:n},(_,i)=>i).sort(compare),list=order.map(i=>rows[i]);
 orders.lists.set(key,list);return list;
}
async function hotelPayloads(ids:string[]){
 const rows=await favoritesDb().prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{id:string;payload:string}>();
 const byId=new Map(rows.results.map(r=>[r.id,r.payload]));
 return ids.flatMap(id=>{const payload=byId.get(id);return payload?[enrichHotel(JSON.parse(payload) as Hotel)]:[]});
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
type CoverageCounts={records:number;prefectures:number};
type CoverageJobs={provider:'trip'|'jalan';discovered:number;completed:number;details:number;pending:number;failed:number;updated:string|null};
function coverageStatements(db:D1Database){
 return [db.prepare('SELECT COUNT(*) AS records,COUNT(DISTINCT prefecture) AS prefectures FROM hotels'),db.prepare("SELECT provider,SUM(CASE WHEN kind='detail' THEN 1 ELSE 0 END) AS discovered,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='done' AND kind='detail' THEN 1 ELSE 0 END) AS details,SUM(CASE WHEN status IN ('pending','retry','running') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,MAX(fetched_at) AS updated FROM crawl_jobs WHERE status!='skipped' GROUP BY provider")];
}
function coverageFrom(counts:CoverageCounts|undefined,jobs:CoverageJobs[]){
 const aggregate={...catalogCoverage,records:counts?.records??0,prefectures:counts?.prefectures??0,crawledRecords:(counts?.records??0)-20,discoveredDetailUrls:0,completedDetailPages:0,pending:0,failed:0,providers:{jalan:{discovered:0,completed:0},trip:{discovered:0,completed:0}}};
 for(const job of jobs){aggregate.providers[job.provider]={discovered:job.discovered,completed:job.completed};aggregate.discoveredDetailUrls+=job.discovered;aggregate.completedDetailPages+=job.details;aggregate.pending+=job.pending;aggregate.failed+=job.failed;if(job.updated&&job.updated>aggregate.updatedAt)aggregate.updatedAt=job.updated}
 return aggregate;
}
async function queryCoverage(){
 const db=favoritesDb(),[counts,jobs]=await db.batch(coverageStatements(db));
 return coverageFrom((counts.results as CoverageCounts[])[0],jobs.results as CoverageJobs[]);
}
// Hotel rows are only ever inserted by writeHotels, which keeps this counter.
const RECORD_COUNTER='hotel-records';
let coverageCache:{expires:number;promise:ReturnType<typeof queryCoverage>}|null=null;
function cacheCoverage(promise:ReturnType<typeof queryCoverage>){
 coverageCache={expires:Date.now()+300000,promise};
 promise.catch(()=>{if(coverageCache?.promise===promise)coverageCache=null});
 return promise;
}
const COVERAGE_SNAPSHOT='coverage-snapshot',COVERAGE_SEQUENCE='coverage-sequence';
// Full count, read by the collector at the end of each run. It also resets
// the record counter (first run, restored backups) from the true count in the
// same transaction, so a write either lands before it and is counted, or after
// it and adds to the corrected value (overlapping collector runs). The
// aggregate is stored so other isolates need not count it again; a sequence
// number taken in that transaction keeps a slower GET from storing an older
// aggregate over a newer one.
export async function readCoverage(){
 const db=favoritesDb();
 const [sequence,,counts,jobs]=await db.batch([db.prepare("INSERT INTO catalog_meta (key,value) VALUES (?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 RETURNING value").bind(COVERAGE_SEQUENCE),db.prepare('INSERT INTO catalog_meta (key,value) SELECT ?,COUNT(*) FROM hotels WHERE 1 ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE catalog_meta.value!=excluded.value').bind(RECORD_COUNTER),...coverageStatements(db)]);
 const coverage=coverageFrom((counts.results as CoverageCounts[])[0],jobs.results as CoverageJobs[]);
 const seq=Number((sequence.results as {value:string}[])[0].value);
 await db.prepare("INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE COALESCE(json_extract(catalog_meta.value,'$.seq'),-1)<json_extract(excluded.value,'$.seq')").bind(COVERAGE_SNAPSHOT,JSON.stringify({seq,coverage})).run();
 return cacheCoverage(Promise.resolve(coverage));
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
 const coverage=await(coverageCache&&coverageCache.expires>=Date.now()?coverageCache.promise:cacheCoverage(snapshot?Promise.resolve((JSON.parse(snapshot) as {coverage:Awaited<ReturnType<typeof queryCoverage>>}).coverage):queryCoverage()));
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
export const MAP_POINT_LIMIT=500;
export type MapBounds={west:number;south:number;east:number;north:number};
export type MapPoint={id:string;name:string;lat:number;lng:number;score:number|null};
export type MapCell={lat:number;lng:number;count:number;south:number;west:number;north:number;east:number};
export type MapAreaResponse={total:number;inBounds:number;outOfBounds:number;withoutCoordinates:number;limit:number;points:MapPoint[];cells:MapCell[]};
// SQLite AVG of a REAL column: Kahan-Babuska-Neumaier sum over the group,
// integers summed exactly until the first real value.
function sqliteAverage(values:number[]){
 let integer=0,approximate=false,sum=0,error=0;
 for(const value of values){
  if(!approximate&&Number.isInteger(value)){integer+=value;continue}
  if(!approximate){approximate=true;sum=integer;error=0}
  const t=sum+value;error+=Math.abs(sum)>Math.abs(value)?(sum-t)+value:(value-t)+sum;sum=t;
 }
 return approximate?(sum+error)/values.length:integer/values.length;
}
// Every matching record inside the bounds, not only the loaded list pages.
// Coordinates count only when both are JSON numbers (hasCoordinates on the client).
async function mapArea(filters:HotelFilters,bounds:MapBounds,savedOnly:boolean,savedIds:string[]):Promise<MapAreaResponse>{
  await ensureCatalog();
  const {versions,generation}=await snapshotVersions(),key=savedOnly?null:await resultKey(['map',{...filters,features:[...new Set(filters.features)].sort()},bounds]);
  const stored=key?await storedResult<MapAreaResponse>(key,generation):null;if(stored)return stored;
  const result=await computeMapArea(filters,bounds,savedOnly,savedIds,versions);
  if(key&&result.key)await storeResult(key,result.key,result.response);
  return result.response;
}
async function computeMapArea(filters:HotelFilters,bounds:MapBounds,savedOnly:boolean,savedIds:string[],versions:Versions){
  const snapshot=await searchSnapshot(!!normalizeSearch(filters.query),versions),scope=await searchScope(filters,savedOnly,savedIds,snapshot);
  const key=reusable(snapshot.key,scope);
  let total=0,withoutCoordinates=0;const inside:SnapshotRow[]=[];
  for(const row of snapshot.rows){
   if(!inScope(row,scope)||!eligible(row.core,filters))continue;
   total++;const lat=row.core[11],lng=row.core[12];
   if(lat===null||lng===null){withoutCoordinates++;continue}
   if(lat>=bounds.south&&lat<=bounds.north&&lng>=bounds.west&&lng<=bounds.east)inside.push(row);
  }
  // Points in id order (the former ORDER BY id); the grid sums in that order.
  inside.sort((a,b)=>textOrder(a.id,b.id,a.plain&&b.plain));
  const inBounds=inside.length,score=filters.ratingProvider==='jalan'?6:4;
  const result:MapAreaResponse={total,inBounds,outOfBounds:total-withoutCoordinates-inBounds,withoutCoordinates,limit:MAP_POINT_LIMIT,points:[],cells:[]};
  if(!inBounds)return{key,response:result};
  if(inBounds<=MAP_POINT_LIMIT){
   result.points=inside.map(r=>({id:r.id,name:r.core[2],score:r.core[score] as number|null,lat:r.core[11]!,lng:r.core[12]!}));
   return{key,response:result};
  }
  // Too many points for one response: counts on a 16 x 16 grid over the bounds.
  const latStep=(bounds.north-bounds.south)/16||1e-9,lngStep=(bounds.east-bounds.west)/16||1e-9;
  const cells=new Map<number,{row:number;col:number;lats:number[];lngs:number[]}>();
  for(const r of inside){
   const lat=r.core[11]!,lng=r.core[12]!,row=Math.min(15,Math.trunc((lat-bounds.south)/latStep)),col=Math.min(15,Math.trunc((lng-bounds.west)/lngStep));
   const cell=cells.get(row*16+col)??{row,col,lats:[],lngs:[]};cell.lats.push(lat);cell.lngs.push(lng);cells.set(row*16+col,cell);
  }
  result.cells=[...cells.values()].sort((a,b)=>a.row-b.row||a.col-b.col).map(c=>({lat:sqliteAverage(c.lats),lng:sqliteAverage(c.lngs),count:c.lats.length,south:bounds.south+c.row*latStep,north:bounds.south+(c.row+1)*latStep,west:bounds.west+c.col*lngStep,east:bounds.west+(c.col+1)*lngStep}));
  return{key,response:result};
}
// Search results of one snapshot generation, without the page: order, scope
// counts, name-match ids and alternative candidates. Bump RESULT_LOGIC when the
// code that makes them changes, so results of the former code are not reused.
const RESULT_LOGIC='p02-results-1',MAX_STORED_RESULTS=64,STORED_RESULT_SECONDS=86400;
type Versions=Awaited<ReturnType<typeof snapshotVersions>>['versions'];
type StoredSearch={ids:string[];total:number;unknownExcluded:number;featureCounts:Record<FeatureKey,number>;ryokanCount:number;similarCount:number;similar:string[];alternatives:{id:string;unmetConditions:string[];queryMatched:boolean}[]};
async function resultKey(parts:unknown[]){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([RESULT_LOGIC,catalogVersion,...parts])));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
// The generation a result may be stored under: the snapshot's, unless the name
// index it used was built from another one (it is rebuilt on a timer).
const reusable=(key:string,scope:SearchScope)=>scope.indexKey===undefined||scope.indexKey===key?key:null;
// The isolate also keeps the last stored results it read or wrote, so a warm
// isolate does not parse the same body again. Callers never modify a body.
const remembered=new Map<string,{generation:string;body:unknown;createdAt:number}>();
function remember(key:string,generation:string,body:unknown,createdAt:number){
 remembered.delete(key);remembered.set(key,{generation,body,createdAt});
 while(remembered.size>32)remembered.delete(remembered.keys().next().value!);
}
async function storedResult<T>(key:string,generation:string){
 const since=Math.floor(Date.now()/1000)-STORED_RESULT_SECONDS,known=remembered.get(key);
 if(known&&known.generation===generation&&known.createdAt>since)return known.body as T;
 const row=await favoritesDb().prepare('SELECT body,created_at FROM hotel_search_results WHERE key=? AND generation=? AND created_at>?').bind(key,generation,since).first<{body:string;created_at:number}>();
 if(!row)return null;
 const body=JSON.parse(row.body) as T;remember(key,generation,body,row.created_at);return body;
}
async function storeResult(key:string,generation:string,body:unknown){
 const db=favoritesDb(),now=Math.floor(Date.now()/1000);remember(key,generation,body,now);
 await db.batch([
  db.prepare('INSERT INTO hotel_search_results(key,generation,body,created_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET generation=excluded.generation,body=excluded.body,created_at=excluded.created_at').bind(key,generation,JSON.stringify(body),now),
  db.prepare('DELETE FROM hotel_search_results WHERE key IN (SELECT key FROM hotel_search_results ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)').bind(MAX_STORED_RESULTS),
 ]);
}
// Scope, facets and order from the search snapshot.
async function computeSearch(filters:HotelFilters,sort:SortOrder,savedOnly:boolean,savedIds:string[],versions:Versions):Promise<{key:string|null;stored:StoredSearch}>{
  const snapshot=await searchSnapshot(!!normalizeSearch(filters.query),versions),scope=await searchScope(filters,savedOnly,savedIds,snapshot);
  const similar=scope.matches.filter(m=>m.similar).map(m=>m.id),similarSet=new Set(similar);
  const bitCounts=new Array<number>(32).fill(0),matched=new Set<SnapshotRow>(),matchedIds=new Set<string>();
  let ryokanCount=0,similarCount=0,unknownExcluded=0;
  for(const row of snapshot.rows){
   if(!inScope(row,scope))continue;
   // Count each set feature bit (lowest first) instead of testing every key.
   for(let v=row.core[9]??0;v;v&=v-1)bitCounts[31-Math.clz32(v&-v)]++;
   if(row.core[3]==='ryokan')ryokanCount++;
   // Unknown: excluded only for lacking a fact, counted so the list can say so.
   if(eligible(row.core,filters)){matched.add(row);matchedIds.add(row.id);if(similarSet.has(row.id))similarCount++}
   else if(unknownOnly(row.core,filters))unknownExcluded++;
  }
  const featureCounts=Object.fromEntries(FEATURE_KEYS.map(key=>[key,bitCounts[Math.log2(FEATURE_BITS[key])]])) as Record<FeatureKey,number>;
  let list=sortedRows(snapshot,sort,filters.ratingProvider).filter(row=>matched.has(row));
  // Broad legacy full-text hits can join separate name words. Keep them below
  // the shared name/place relevance so both result and prediction order agree.
  if(sort==='recommended'&&scope.q){const score=new Map(scope.matches.map(m=>[m.id,m.score]));list=list.map(row=>({row,score:score.get(row.id)??20})).sort((a,b)=>b.score-a.score).map(r=>r.row)}
  let alternatives:StoredSearch['alternatives']=[],key=reusable(snapshot.key,scope);
  if(matched.size===0&&(scope.q||filters.region!=='all'||filters.features.length||filters.ryokanOnly||filters.minRating||filters.minReviews)){
   const index=await catalogueSearchIndex();if(index.key!==snapshot.key)key=null;
   alternatives=rankHotelAlternatives(index.prepared,filters,savedOnly?new Set(savedIds):undefined).map(c=>({id:c.id,unmetConditions:c.unmetConditions,queryMatched:c.queryMatched}));
  }
  return{key,stored:{ids:list.map(r=>r.id),total:matched.size,unknownExcluded,featureCounts,ryokanCount,similarCount,similar:similar.filter(id=>matchedIds.has(id)),alternatives}};
}
// The page of a search: from a result stored for the current snapshot
// generation if there is one, else computed and stored. Only the page's
// payloads and the result session touch the catalogue tables.
async function searchHotels(filters:HotelFilters,sort:SortOrder,page:number,savedOnly:boolean,savedIds:string[],options:SearchOptions={}):Promise<SearchResponse>{
  await ensureCatalog();const db=favoritesDb();
  const queryKey=await resultQueryKey(filters,sort,savedOnly,savedIds,options.scope);
  if(options.snapshot)return readResultSession(options.snapshot,queryKey,page);
  const coveragePromise=readCachedCoverage();
  const {versions,generation}=await snapshotVersions(),key=savedOnly?null:await resultKey(['search',queryKey]);
  let stored=key?await storedResult<StoredSearch>(key,generation):null;
  if(!stored){const computed=await computeSearch(filters,sort,savedOnly,savedIds,versions);stored=computed.stored;if(key&&computed.key)await storeResult(key,computed.key,stored)}
  const {ids,total,unknownExcluded,featureCounts,ryokanCount,similarCount}=stored,similarSet=new Set(stored.similar);
  const coverage=await coveragePromise;
  const pageSize=40,actualPage=Math.max(1,Math.min(page,Math.max(1,Math.ceil(total/pageSize))));
  const ordered=options.stable?ids.slice(0,50001):null;
  const pageIds=ordered?[]:ids.slice((actualPage-1)*pageSize,actualPage*pageSize);
  let alternatives:HotelAlternative[]=[];
  if(stored.alternatives.length){const picked=await db.prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(stored.alternatives.map(c=>c.id))).all<{id:string;payload:string}>();const byId=new Map(picked.results.map(row=>[row.id,enrichHotel(JSON.parse(row.payload) as Hotel)]));alternatives=stored.alternatives.flatMap(c=>{const hotel=byId.get(c.id);return hotel?[{hotel,unmetConditions:c.unmetConditions,queryMatched:c.queryMatched}]:[]})}
  const result:SearchResponse={hotels:await hotelPayloads(pageIds),total,unknownExcluded,page:actualPage,pageSize,featureCounts,ryokanCount,coverage,similarCount,similarHotelIds:pageIds.filter(id=>similarSet.has(id)),alternatives};
  if(ordered){
   const idSet=ordered.length<ids.length?new Set(ordered):null,allSimilar=idSet?stored.similar.filter(id=>idSet.has(id)):stored.similar;
   result.total=ordered.length;result.page=Math.max(1,Math.min(page,Math.max(1,Math.ceil(ordered.length/pageSize))));
   const stablePage=ordered.slice((result.page-1)*pageSize,result.page*pageSize);
   result.hotels=await hotelsInOrder(stablePage);result.similarHotelIds=allSimilar.filter(id=>stablePage.includes(id));result.similarCount=allSimilar.length;
   if(ordered.length>pageSize){
    result.snapshot=await createResultSession(queryKey,ordered,{total:result.total,unknownExcluded:result.unknownExcluded,pageSize,featureCounts:result.featureCounts,ryokanCount:result.ryokanCount,coverage,similarCount:result.similarCount,similarHotelIds:allSimilar,alternatives});
   }
  }
  // hotelsInOrder already attached the stable page's groups and lifecycle.
  if(!ordered)result.hotels=await attachLifecycle(await attachSourceGroups(result.hotels));
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
