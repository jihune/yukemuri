import {refreshIntervalSql,collectionPlan} from './collection-priorities';
import {crawlJobUrl,publicUrl} from './crawl-contract';
import {z} from 'zod';
import {favoritesDb} from './favorites-db';
import {verifiedHotels} from './hotel-enrichment';
import {BATH_FEATURE_MASK} from './hotel-bath-facts';

export const crawlClaim=z.object({provider:z.enum(['jalan','trip']),phase:z.enum(['list','detail','names','baths','refresh','localnames']),kind:z.enum(['list','detail']).optional(),url:crawlJobUrl.optional(),lane:z.enum(['priority','national']).default('priority'),token:z.string().uuid()}).strict().refine(v=>v.phase!=='names'||v.provider==='trip').refine(v=>v.phase!=='baths'||v.provider==='jalan').refine(v=>v.phase!=='localnames'||v.provider==='jalan');
export type CrawlClaim=z.infer<typeof crawlClaim>;
export const LEASE_SECONDS=180;
export const LOCALE_REFRESH_DAYS=14;
export const legacyRedirectRepair=z.object({action:z.literal('isolate-legacy-redirect'),url:publicUrl,expectedNextAt:z.number().finite().positive()}).strict();
export const reviewedRedirectRepair=z.object({action:z.literal('release-reviewed-redirect'),url:publicUrl,expectedNextAt:z.number().finite().positive()}).strict();
// After a read-only source check succeeds, release one obsolete page hold.
// Exact old timestamp and reason are required; access pauses and active work win.
export async function releaseReviewedRedirect(input:z.infer<typeof reviewedRedirectRepair>){
 const db=favoritesDb(),now=Date.now()/1000;
 const result=await db.batch([
  db.prepare(`UPDATE crawl_jobs SET next_at=0 WHERE url=? AND provider='jalan' AND kind='detail' AND status='retry' AND attempts=1 AND error='source_redirect_page_review' AND next_at=? AND next_at>? AND fetched_at IS NULL AND lease_until<=?
   AND NOT EXISTS (SELECT 1 FROM crawl_jobs WHERE provider='jalan' AND lease_until>?)
   AND NOT EXISTS (SELECT 1 FROM catalog_meta WHERE key='crawl-provider-ready:jalan' AND CAST(value AS REAL)>?)
   AND NOT EXISTS (SELECT 1 FROM crawl_jobs WHERE provider='jalan' AND next_at>? AND (error IN ('http_403','http_429','robots_http_403','robots_http_429') OR error LIKE 'source_access_%' AND error<>'source_access_redirect_repeated'))`).bind(input.url,input.expectedNextAt,now,now,now,now,now),
  db.prepare("INSERT INTO catalog_meta(key,value) SELECT 'crawl-reviewed-redirect-release:jalan',? WHERE EXISTS (SELECT 1 FROM crawl_jobs WHERE url=? AND provider='jalan' AND status='retry' AND attempts=1 AND error='source_redirect_page_review' AND next_at=0 AND fetched_at IS NULL) ON CONFLICT(key) DO NOTHING").bind(JSON.stringify({action:input.action,url:input.url,previousNextAt:input.expectedNextAt,repairedAt:new Date().toISOString()}),input.url),
 ]);
 return{repaired:result[0].meta.changes===1};
}
// Repair only the old one-page redirect policy. The page retains its original
// retry time; a newer pause, active claim or another blocking failure wins.
export async function isolateLegacyRedirect(input:z.infer<typeof legacyRedirectRepair>){
 const db=favoritesDb(),now=Date.now()/1000,ready=String(now+8),key='crawl-provider-ready:jalan';
 const job=await db.prepare('SELECT provider,status,error,attempts,next_at FROM crawl_jobs WHERE url=?').bind(input.url).first<{provider:string;status:string;error:string;attempts:number;next_at:number}>();
 if(job?.provider==='jalan'&&job.error==='source_redirect_page_review'&&job.next_at===input.expectedNextAt)return{repaired:false,alreadyIsolated:true};
 const result=await db.batch([
  db.prepare(`UPDATE catalog_meta SET value=? WHERE key=? AND CAST(value AS REAL)=? AND CAST(value AS REAL)>?
   AND EXISTS (SELECT 1 FROM crawl_jobs WHERE url=? AND provider='jalan' AND status='retry' AND attempts=1 AND error='source_redirect_requires_review' AND next_at=? AND lease_until<=?)
   AND NOT EXISTS (SELECT 1 FROM crawl_jobs WHERE provider='jalan' AND lease_until>?)
   AND NOT EXISTS (SELECT 1 FROM crawl_jobs WHERE provider='jalan' AND url<>? AND next_at>? AND (error LIKE 'robots_%' OR error LIKE 'source_access_%' OR error IN ('source_redirect_requires_review','source_data_requires_review','http_403','http_429','URLError','TimeoutError','OSError') OR error GLOB 'http_5[0-9][0-9]'))`).bind(ready,key,input.expectedNextAt,now,input.url,input.expectedNextAt,now,now,input.url,now),
  db.prepare("UPDATE crawl_jobs SET error='source_redirect_page_review' WHERE url=? AND provider='jalan' AND error='source_redirect_requires_review' AND next_at=? AND EXISTS (SELECT 1 FROM catalog_meta WHERE key=? AND value=?)").bind(input.url,input.expectedNextAt,key,ready),
  db.prepare("INSERT INTO catalog_meta(key,value) SELECT 'crawl-policy-repair:jalan',? WHERE EXISTS (SELECT 1 FROM catalog_meta WHERE key=? AND value=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({action:input.action,url:input.url,previousReadyAt:input.expectedNextAt,repairedAt:new Date().toISOString()}),key,ready),
 ]);
 return{repaired:result[0].meta.changes===1,pageRetained:true};
}
export function jobIdentity(url:string):string|null{
 const u=new URL(url);
 const id=u.hostname==='www.jalan.net'?u.pathname.match(/^\/yad(\d+)\/$/)?.[1]:u.pathname.match(/-hotel-detail-(\d+)\//)?.[1];
 return id?(u.hostname==='www.jalan.net'?'jalan-':'trip-')+id:null;
}
// A Jalan detail job (alias j) saved by an older parser, as a hotel row
// (verified hotels excluded; one JSON array argument) or as a curated group's
// linked observation. The baths claim and the queue view share it (D05).
export const BATHS_CANDIDATE="(EXISTS (SELECT 1 FROM hotels h WHERE h.id='jalan-'||substr(j.url,26,instr(substr(j.url,26),'/')-1) AND json_extract(h.payload,'$.links[0].url')=j.url AND json_extract(h.payload,'$.sources[0].bathDataVersion') IS NOT 'v3' AND h.id NOT IN (SELECT value FROM json_each(?))) OR EXISTS (SELECT 1 FROM hotel_source_observations o WHERE o.id='jalan-'||substr(j.url,26,instr(substr(j.url,26),'/')-1) AND json_extract(o.payload,'$.links[0].url')=j.url AND json_extract(o.payload,'$.sources[0].bathDataVersion') IS NOT 'v3'))";
// The selection and lease write share one SQL statement. A provider has at
// most one active claim, across processes/isolates and enrichment phases.
export async function claimCrawlJob(claim:CrawlClaim){
 const db=favoritesDb(),now=Date.now()/1000,kind=claim.phase==='refresh'?(claim.kind??'any'):claim.phase==='localnames'?'names':['names','baths'].includes(claim.phase)?'detail':claim.phase;
 const kinds=kind==='any'?['list','detail']:[kind];
 const repeated=await db.prepare("SELECT * FROM crawl_jobs WHERE provider=? AND (?='any' OR kind=?) AND lease_token=? AND lease_until>?").bind(claim.provider,kind,kind,claim.token,now).all();
 if(repeated.results.length)return{jobs:repeated.results,exhausted:false};
 // D07: a Jalan locale list page is read again LOCALE_REFRESH_DAYS after it was done, on another default stay date,
 // and one that failed three times once its wait is over (as refresh does for list and detail pages).
 const extra=claim.phase==='localnames'?`AND (j.status<>'done' OR COALESCE(unixepoch(j.fetched_at),0)+${LOCALE_REFRESH_DAYS*86400}<=${now}) AND (j.status<>'failed' OR j.next_at>0)`:claim.phase==='names'?"AND EXISTS (SELECT 1 FROM hotels h WHERE h.id='trip-'||substr(j.url,instr(j.url,'-hotel-detail-')+14,instr(substr(j.url,instr(j.url,'-hotel-detail-')+14),'/')-1) AND json_extract(h.payload,'$.links[0].url')=j.url AND json_extract(h.payload,'$.sources[0].nameLocaleUrl') IS NULL)":claim.phase==='baths'?'AND '+BATHS_CANDIDATE:'';
 const extraArgs=claim.phase==='baths'?[JSON.stringify(verifiedHotels.map(h=>h.id))]:[];
 const statuses=claim.phase==='refresh'?['done','failed']:claim.phase==='localnames'?['done','pending','retry','failed']:['names','baths'].includes(claim.phase)?['done','pending','retry']:['pending','retry'];
 const refresh=claim.phase==='refresh'?`AND ((j.status='done' AND COALESCE(unixepoch(j.fetched_at),0)+(${refreshIntervalSql})<=${now}) OR (j.status='failed' AND j.next_at>0))`:'';
 // Complete the complementary source of verified properties first within a
 // region: Trip for review/photo evidence, Jalan for property/room facts.
 // Only curated groups: a group whose own hotel is one of its provider records
 // (the reviewed pairs of D08 PR 5) waits its normal turn, so the rows a claim
 // reads do not grow with those groups (docs/D08-20261019.md 13.4).
 const missingLinkedDetail="CASE WHEN j.kind='detail' AND EXISTS (SELECT 1 FROM hotel_source_groups g LEFT JOIN hotels h ON h.id=CASE WHEN j.provider='trip' THEN g.trip_hotel_id ELSE g.jalan_hotel_id END WHERE g.hotel_id<>COALESCE(g.jalan_hotel_id,'') AND g.hotel_id<>COALESCE(g.trip_hotel_id,'') AND (j.provider='trip' AND instr(j.url,'-hotel-detail-'||substr(g.trip_hotel_id,6)||'/')>0 OR j.provider='jalan' AND j.url='https://www.jalan.net/yad'||substr(g.jalan_hotel_id,7)||'/') AND (h.id IS NULL OR json_extract(h.payload,'$.sources[0].label') NOT LIKE '%상세%')) THEN 0 ELSE 1 END";
 // Due retries would otherwise stay behind the pending backlog indefinitely.
 // Use the national lane for those pages; all readiness and lease guards below
 // still apply. The priority lane continues normal discovery/enrichment.
 const fetched='COALESCE(unixepoch(j.fetched_at),0)',national=claim.lane==='national';
 const order=national?`CASE WHEN status='retry' THEN 0 ELSE 1 END,fetched,next_at,attempts,url`:'priority,missing,fetched,attempts,url';
 // The lane's order without the missing-detail term is the column order of its
 // index, so each kind and status yields its first eligible job without a sort
 // of the whole queue. Missing details are found separately (few: one per
 // verified link) and win over the other jobs of their priority, as before.
 const eligible=`j.next_at<=? AND j.lease_until<=? ${extra} ${refresh} ${claim.url?'AND j.url=?':''}`,eligibleArgs=[now,now,...extraArgs,...(claim.url?[claim.url]:[])];
 const columns=`j.url,j.status,j.priority,${fetched} AS fetched,j.next_at,j.attempts`;
 const branches:{sql:string;args:unknown[]}[]=[];
 for(const k of kinds)for(const status of statuses)branches.push({sql:`SELECT * FROM (SELECT ${columns},1 AS missing FROM crawl_jobs j INDEXED BY ${national?'idx_crawl_jobs_claim_national':'idx_crawl_jobs_claim_priority'} WHERE j.provider=? AND j.kind=? AND j.status=? AND ${eligible} ORDER BY ${national?`${fetched},j.next_at`:`j.priority,${fetched}`},j.attempts,j.url LIMIT 1)`,args:[claim.provider,k,status,...eligibleArgs]});
 if(!national&&kinds.includes('detail')){
  // Only jobs a verified group can name are tested against the full condition:
  // for Jalan the URL the group names, for Trip a URL whose only detail id is a
  // group's id, or one that holds the detail marker twice.
  const after="substr(j.url,instr(j.url,'-hotel-detail-')+14)";
  const [jobs,named]=claim.provider==='jalan'?["hotel_source_groups linked CROSS JOIN crawl_jobs j ON linked.hotel_id<>linked.jalan_hotel_id AND linked.hotel_id<>COALESCE(linked.trip_hotel_id,'') AND j.url='https://www.jalan.net/yad'||substr(linked.jalan_hotel_id,7)||'/'",'']:['crawl_jobs j',`AND (instr(${after},'-hotel-detail-')>0 OR substr(${after},1,instr(${after},'/')-1) IN (SELECT substr(trip_hotel_id,6) FROM hotel_source_groups WHERE trip_hotel_id IS NOT NULL AND hotel_id<>trip_hotel_id AND hotel_id<>COALESCE(jalan_hotel_id,'')))`];
  branches.push({sql:`SELECT * FROM (SELECT ${columns},0 AS missing FROM ${jobs} WHERE j.provider=? AND j.kind='detail' AND j.status IN (${statuses.map(()=>'?').join(',')}) AND ${eligible} ${named} AND (${missingLinkedDetail})=0 ORDER BY j.priority,${fetched},j.attempts,j.url LIMIT 1)`,args:[claim.provider,...statuses,...eligibleArgs]});
 }
 // C07: in the same transaction and at the same clock, whether the provider waits
 // (pacing, a cooldown) or holds another claim: the two guards of the UPDATE. An
 // empty claim with neither found no due page in its phase (exhausted).
 const [result,wait]=await db.batch([db.prepare(`UPDATE crawl_jobs SET lease_token=?,lease_until=?
  WHERE url=(SELECT url FROM (${branches.map(b=>b.sql).join(' UNION ALL ')}) ORDER BY ${order} LIMIT 1)
  AND lease_until<=? AND COALESCE((SELECT CAST(value AS REAL) FROM catalog_meta WHERE key=?),0)<=? AND NOT EXISTS (SELECT 1 FROM crawl_jobs active WHERE active.provider=? AND active.lease_until>?)
  RETURNING *`).bind(claim.token,now+LEASE_SECONDS,...branches.flatMap(b=>b.args),now,'crawl-provider-ready:'+claim.provider,now,claim.provider,now),
  db.prepare("SELECT COALESCE((SELECT CAST(value AS REAL) FROM catalog_meta WHERE key=?),0)>? OR EXISTS (SELECT 1 FROM crawl_jobs WHERE provider=? AND lease_until>?) AS waiting").bind('crawl-provider-ready:'+claim.provider,now,claim.provider,now)]);
 if(result.results.length)return{jobs:result.results,exhausted:false};
 // Concurrent retries of the same POST may arrive before either SELECT sees
// the other claim. Return that same claim after the guarded UPDATE.
 const jobs=(await db.prepare("SELECT * FROM crawl_jobs WHERE provider=? AND (?='any' OR kind=?) AND lease_token=? AND lease_until>?").bind(claim.provider,kind,kind,claim.token,now).all()).results;
 return{jobs,exhausted:!jobs.length&&(wait.results[0] as {waiting:number}).waiting!==1};
}

export async function crawlHealth(){
 const db=favoritesDb();
 const phases=await db.prepare(`SELECT provider,kind,status,COUNT(*) AS count,SUM(CASE WHEN lease_until>? THEN 1 ELSE 0 END) AS active,strftime('%Y-%m-%dT%H:%M:%SZ',MAX(unixepoch(fetched_at)),'unixepoch') AS last_success FROM crawl_jobs GROUP BY provider,kind,status`).bind(Date.now()/1000).all();
 const quality=await db.prepare(`SELECT COUNT(*) AS records,
  SUM(CASE WHEN name GLOB '*[가-힣]*' THEN 1 ELSE 0 END) AS korean_name,
  SUM(CASE WHEN n.payload IS NOT NULL THEN 1 ELSE 0 END) AS researched_korean_name,
  SUM(CASE WHEN json_extract(h.payload,'$.sources[0].label') LIKE '%상세%' THEN 1 ELSE 0 END) AS detail_records,
  SUM(CASE WHEN json_extract(h.payload,'$.location.latitude') IS NOT NULL AND json_extract(h.payload,'$.location.longitude') IS NOT NULL THEN 1 ELSE 0 END) AS coordinates,
  SUM(CASE WHEN (bath_known & ${BATH_FEATURE_MASK})>0 THEN 1 ELSE 0 END) AS bath_known,
  SUM(CASE WHEN t.source_text=json_extract(h.payload,'$.description') THEN 1 ELSE 0 END) AS current_translation
  FROM hotels h LEFT JOIN hotel_name_localizations n ON n.hotel_id=h.id LEFT JOIN hotel_description_translations t ON t.hotel_id=h.id`).first();
 const prefectures=await db.prepare(`SELECT prefecture,COUNT(*) AS records,SUM(CASE WHEN (bath_known & ${BATH_FEATURE_MASK})>0 THEN 1 ELSE 0 END) AS bath_known FROM hotels GROUP BY prefecture ORDER BY prefecture`).all();
 const failures=await db.prepare("SELECT provider,kind,status,error,COUNT(*) AS count FROM crawl_jobs WHERE error IS NOT NULL GROUP BY provider,kind,status,error ORDER BY count DESC LIMIT 30").all();
 // Bounded maintenance diagnostics only: no lease tokens or hotel/user payloads.
 // Samples retain the original job and do not claim, retry or retire a page.
 const failureExamples=await db.prepare("SELECT provider,kind,url,status,error,attempts,next_at,fetched_at FROM crawl_jobs WHERE provider IN ('jalan','trip') AND status IN ('retry','failed') AND error IS NOT NULL ORDER BY provider,kind,error,url LIMIT 20").all();
 const refreshDue=await db.prepare(`SELECT provider,kind,priority,COUNT(*) AS count FROM crawl_jobs j WHERE status='done' AND next_at<=? AND COALESCE(unixepoch(fetched_at),0)+(${refreshIntervalSql})<=? GROUP BY provider,kind,priority`).bind(Date.now()/1000,Date.now()/1000).all();
 const lifecycle=await db.prepare('SELECT state,COUNT(*) AS records,SUM(CASE WHEN missing_count>0 THEN 1 ELSE 0 END) AS review_needed FROM hotel_lifecycle GROUP BY state').all();
 return{collectionPlan,refreshDue:refreshDue.results,lifecycle:lifecycle.results,measuredAt:new Date().toISOString(),inventoryComplete:false,countMeaning:'provider records; cross-provider duplicates may remain',quality,phases:phases.results,prefectures:prefectures.results,failures:failures.results,failureExamples:failureExamples.results};
}
