import {prepareCollectionPriorities} from './collection-priorities';
import {attachLifecycle} from './hotel-lifecycle';
import {attachSourceGroups,importVerifiedSourceGroups,importReviewedSourceGroups,refreshSourceGroupIndexes} from './hotel-source-groups';
import { favoritesDb } from './favorites-db';
import { Hotel, FeatureKey, type CoreFeatureKey } from './hotel-types';
import { catalogVersion, catalogCoverage } from './catalog-core';
import { providerRating } from './hotel-ratings';
import { enrichHotel } from './hotel-enrichment';
import { normalizeSearch, hotelNames, hotelSearchText } from './hotel-names';
import {featureMasks,hotelFeature} from './hotel-bath-facts';
import {DAILY_PROGRESS_KEY} from './collection-status';
import {applyNamePatch, type HotelNamePatch} from './hotel-name-localization';
import localizedNames from '../data/korean-hotel-names.json';
import {needsKoreanDescription} from './hotel-description';
import type {DescriptionPatch} from './description-contract';
import {validComparisonIds} from './hotel-comparison';
import {withWikidataNames} from './wikidata-names';
import {withCommonsPhoto} from './commons-photos';
import {localeNamesFor,prepareLocaleLists,withJalanLocaleNames} from './jalan-locale-names';
const columns=['id','region','prefecture','name','search_text','kind','trip_score','trip_reviews','jalan_score','jalan_reviews','natural','large_bath','outdoor','private_bath','room_onsen','room_outdoor','bath_features','bath_known','payload'];
const coreColumns:Record<CoreFeatureKey,string>={natural:'natural',largeBath:'large_bath',outdoor:'outdoor',privateBath:'private_bath',roomOnsen:'room_onsen',roomOutdoor:'room_outdoor'};
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
  // (a primary-key lookup per row), then write. Without a new id the counter
  // row is not rewritten (C04).
  const json=JSON.stringify(rows),fresh="FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM hotels h WHERE h.id=json_extract(j.value,'$[0]'))";
  const [,accepted]=await db.batch<{id:string;payload:string}>([db.prepare(`UPDATE catalog_meta SET value=CAST(value AS INTEGER)+(SELECT COUNT(DISTINCT json_extract(j.value,'$[0]')) ${fresh}) WHERE key=? AND EXISTS (SELECT 1 ${fresh})`).bind(json,RECORD_COUNTER,json),db.prepare(sql).bind(json)]);
  written+=accepted.results.length;
  // Index only committed records. Stale/list observations rejected by the
  // UPSERT must not inject their aliases into search.
  await indexNames(accepted.results.map(row=>JSON.parse(row.payload) as Hotel));
  if(accepted.results.length)await refreshSourceGroupIndexes(accepted.results.map(row=>row.id));
 }
 // The search snapshot shows new records from its next build (P03).
 return written;
}
export type CoverageCounts={records:number;prefectures:number};
export type CoverageJobs={provider:'trip'|'jalan';discovered:number;completed:number;details:number;pending:number;failed:number;updated:string|null};
function coverageStatements(db:D1Database){
 return [db.prepare('SELECT COUNT(*) AS records,COUNT(DISTINCT prefecture) AS prefectures FROM hotels'),db.prepare("SELECT provider,SUM(CASE WHEN kind='detail' THEN 1 ELSE 0 END) AS discovered,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='done' AND kind='detail' THEN 1 ELSE 0 END) AS details,SUM(CASE WHEN status IN ('pending','retry','running') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,MAX(fetched_at) AS updated FROM crawl_jobs WHERE status!='skipped' AND kind<>'names' GROUP BY provider")];
}
// The collection summary from the counts and the queue rows (the snapshot
// builder derives both from its own reads, P04).
export function coverageFrom(counts:CoverageCounts|undefined,jobs:CoverageJobs[]){
 const aggregate={...catalogCoverage,records:counts?.records??0,prefectures:counts?.prefectures??0,crawledRecords:(counts?.records??0)-20,discoveredDetailUrls:0,completedDetailPages:0,pending:0,failed:0,providers:{jalan:{discovered:0,completed:0},trip:{discovered:0,completed:0}}};
 for(const job of jobs){aggregate.providers[job.provider]={discovered:job.discovered,completed:job.completed};aggregate.discoveredDetailUrls+=job.discovered;aggregate.completedDetailPages+=job.details;aggregate.pending+=job.pending;aggregate.failed+=job.failed;if(job.updated&&job.updated>aggregate.updatedAt)aggregate.updatedAt=job.updated}
 return aggregate;
}
export async function queryCoverage(){
 const db=favoritesDb(),[counts,jobs]=await db.batch(coverageStatements(db));
 return coverageFrom((counts.results as CoverageCounts[])[0],jobs.results as CoverageJobs[]);
}
// Hotel rows are only ever inserted by writeHotels, which keeps this counter.
export const RECORD_COUNTER='hotel-records';
let coverageCache:{expires:number;promise:ReturnType<typeof queryCoverage>}|null=null;
function cacheCoverage(promise:ReturnType<typeof queryCoverage>){
 coverageCache={expires:Date.now()+300000,promise};
 promise.catch(()=>{if(coverageCache?.promise===promise)coverageCache=null});
 return promise;
}
const COVERAGE_SNAPSHOT='coverage-snapshot';
export const COVERAGE_SEQUENCE='coverage-sequence';
const NEXT_SEQUENCE="INSERT INTO catalog_meta (key,value) VALUES (?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1 RETURNING value";
// U06 trend: the same counts as the day's row (UTC day; the day's last run stays).
export const trendPages=(jobs:CoverageJobs[])=>Object.fromEntries((['jalan','trip'] as const).map(p=>{const job=jobs.find(j=>j.provider===p);return[p,{done:job?.details??0,total:job?.discovered??0}]}));
// The aggregate, so other isolates need not count it again, and the day's
// trend row; each only over an older sequence number, so a slower writer never
// stores an older aggregate over a newer one.
async function storeCoverage(db:D1Database,sequence:{results:unknown[]},coverage:ReturnType<typeof coverageFrom>,day:string,jobs:CoverageJobs[]){
 const seq=Number((sequence.results as {value:string}[])[0].value);
 const newer="INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE COALESCE(json_extract(catalog_meta.value,'$.seq'),-1)<json_extract(excluded.value,'$.seq')";
 await db.batch([db.prepare(newer).bind(COVERAGE_SNAPSHOT,JSON.stringify({seq,coverage})),db.prepare(newer).bind(DAILY_PROGRESS_KEY+day,JSON.stringify({seq,records:coverage.records,pages:trendPages(jobs)}))]);
 return cacheCoverage(Promise.resolve(coverage));
}
// Full count (the queue GET; the collector called it at the end of each run
// until C07). It also resets the record counter (first run, restored backups)
// from the true count in the same transaction, so a write either lands before
// it and is counted, or after it and adds to the corrected value. The sequence
// number is taken in that transaction.
export async function readCoverage(){
 const db=favoritesDb();
 const [sequence,,counts,jobs]=await db.batch([db.prepare(NEXT_SEQUENCE).bind(COVERAGE_SEQUENCE),db.prepare('INSERT INTO catalog_meta (key,value) SELECT ?,COUNT(*) FROM hotels WHERE 1 ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE catalog_meta.value!=excluded.value').bind(RECORD_COUNTER),...coverageStatements(db)]);
 return storeCoverage(db,sequence,coverageFrom((counts.results as CoverageCounts[])[0],jobs.results as CoverageJobs[]),new Date().toISOString().slice(0,10),jobs.results as CoverageJobs[]);
}
// C07 plan 2: the same rows from the counts the search snapshot build made
// after a collection (scripts/record-coverage.mjs), dated the UTC day the
// collector finished. sequence and counter: the two as the build read them
// before counting (null: none yet). The sequence number is taken only while it
// still holds that value, so the count keeps the order of its read as the GET's
// does; when another count was stored since, nothing is written (null). The
// counter is reset only while it still holds the value read: a save adds to it
// in the save's own transaction, so a changed counter means the count may miss
// a record. With no counter yet, a save cannot change it, so it is made from a
// count taken in its own statement, as the GET makes it.
export type CoverageRecord={day:string;counts:CoverageCounts;jobs:CoverageJobs[];counter:string|null;sequence:string|null};
export async function recordCoverage(record:CoverageRecord){
 const db=favoritesDb(),records=String(record.counts.records);
 const [sequence]=await db.batch([record.sequence===null
  ?db.prepare("INSERT INTO catalog_meta (key,value) VALUES (?,'1') ON CONFLICT(key) DO NOTHING RETURNING value").bind(COVERAGE_SEQUENCE)
  :db.prepare('UPDATE catalog_meta SET value=CAST(value AS INTEGER)+1 WHERE key=? AND value=? RETURNING value').bind(COVERAGE_SEQUENCE,record.sequence)]);
 if(!sequence.results.length)return null;
 await db.batch([record.counter===null
  ?db.prepare('INSERT INTO catalog_meta (key,value) SELECT ?,COUNT(*) FROM hotels WHERE 1 ON CONFLICT(key) DO NOTHING').bind(RECORD_COUNTER)
  :db.prepare('UPDATE catalog_meta SET value=? WHERE key=? AND value=? AND value!=?').bind(records,RECORD_COUNTER,record.counter,records)]);
 return storeCoverage(db,sequence,coverageFrom(record.counts,record.jobs),record.day,record.jobs);
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
// Writes outside the collector's PUT (names, lifecycle, source links) change
// the collection summary; the search snapshot follows at the next build.
export function invalidateSearch(){coverageCache=null}
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
 await db.batch(updates.length?[update,progress]:[progress]);invalidateSearch();
 return {done:next==='done',processed:rows.results.length,cursor:next};
}
export async function prepareOnsenCatalog(){
 await ensureCatalog();
 // Outside ensureCatalog's promise, which an isolate keeps: a pair still unknown is tried
 // again on the next crawl-prepare in the same isolate (Codex P2 on PR #204).
 await importReviewedSourceGroups();
 const search=await preparePlaceSearch();
 const priorities=await prepareCollectionPriorities();
 const bathScope=await prepareExternalBathFacts();
 const localeLists=await prepareLocaleLists();
 return {done:search.done&&priorities.done&&bathScope.done,search,priorities,bathScope,localeLists};
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
}
async function ensureCatalog(){if(!ready)ready=importSnapshot().then(reindexNames).then(backfillBathFacts).then(importLocalizedNames).then(importVerifiedSourceGroups).catch(error=>{ready=null;throw error});await ready}
// What ensureCatalog (run by /api/crawl-prepare) has not done yet on this
// database, read only: the seed version and its one-time steps (the keys of
// importSnapshot, reindexNames, backfillBathFacts, importLocalizedNames and
// importVerifiedSourceGroups). Empty when the catalogue is prepared.
// importReviewedSourceGroups is not a seed step: its key follows its file's
// content, and every crawl-prepare runs it (prepareOnsenCatalog).
export async function catalogPreparation(){
 const once=['bath-facts-backfill-v1','korean-names-20261004','verified-source-groups-v1'];
 const rows=await favoritesDb().prepare('SELECT key,value FROM catalog_meta WHERE key IN (?,?,?,?,?)').bind('snapshot','multilingual-index-v1',...once).all<{key:string;value:string}>();
 const stored=new Map(rows.results.map(r=>[r.key,r.value]));
 return[...(stored.get('snapshot')===catalogVersion?[]:['snapshot']),...(stored.get('multilingual-index-v1')==='done'?[]:['multilingual-index-v1']),...once.filter(key=>!stored.has(key))];
}
export const hotelRepository={
 async get(id:string):Promise<Hotel|null>{
  if(!validComparisonIds([id]))return null;
  return(await this.getMany([id]))[0]??null;
 },
 async getMany(ids:string[]):Promise<Hotel[]>{
  if(!validComparisonIds(ids))throw new RangeError('Invalid comparison selection');
  if(!ids.length)return[];
  // Public reads never prepare the catalogue (no D1 writes on a read, P03);
  // the collector's /api/crawl-prepare does. An unprepared DB finds nothing.
  const rows=await favoritesDb().prepare("SELECT h.id,h.payload,t.text_ko,t.translated_at FROM hotels h LEFT JOIN hotel_description_translations t ON t.hotel_id=h.id AND t.source_text=json_extract(h.payload,'$.description') WHERE h.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all<{id:string;payload:string;text_ko:string|null;translated_at:string|null}>();
  const byId=new Map(rows.results.map(row=>{
   const hotel=enrichHotel(JSON.parse(row.payload) as Hotel);delete hotel.descriptionTranslation;
   if(row.text_ko&&row.translated_at)hotel.descriptionTranslation={text:row.text_ko,translatedAt:row.translated_at};
   return[row.id,hotel];
  }));
  // Wikidata and Jalan locale names as the search snapshot shows them (D07); the Commons photo (D08).
  const locale=await localeNamesFor(ids);
  return(await attachLifecycle(await attachSourceGroups(ids.flatMap(id=>{const hotel=byId.get(id);return hotel?[hotel]:[]})))).map(h=>withJalanLocaleNames(withWikidataNames(withCommonsPhoto(h)),locale.get(h.id)));
 },
 async ready(){await ensureCatalog()},
};
