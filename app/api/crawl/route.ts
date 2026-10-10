import {collectionPriority} from '@/lib/collection-priorities';
import {observeHotelPresence,observeMissingSource} from '@/lib/hotel-lifecycle';
import { crawlUpdate,providerCooldown } from '@/lib/crawl-contract';
import { favoritesDb } from '@/lib/favorites-db';
import { hotelRepository, readCoverage, writeHotels } from '@/lib/hotel-repository';
import { catalogHotels } from '@/lib/hotel-catalog';
import type { Hotel } from '@/lib/hotel-types';
import { sourceRegion } from '@/lib/hotel-region';
import { verifiedHotels } from '@/lib/hotel-enrichment';
import {hasCrawlAccess} from '@/lib/crawl-access';
import {claimCrawlJob,crawlClaim,crawlHealth,jobIdentity,LEASE_SECONDS,legacyRedirectRepair,isolateLegacyRedirect,reviewedRedirectRepair,releaseReviewedRedirect} from '@/lib/crawl-queue';
import {writeLinkedSourceObservations} from '@/lib/hotel-source-groups';
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const p=new URL(request.url).searchParams;
 if(p.get('report')==='1'){try{await hotelRepository.ready();return Response.json(await crawlHealth(),{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Crawl health read failed',error);return Response.json({error:'Health report unavailable'},{status:503})}}
 const provider=p.get('provider'),kind=p.get('kind'),limit=Number(p.get('limit')??10);
 if(!['trip','jalan'].includes(provider??'')||!['list','detail'].includes(kind??'')||!Number.isInteger(limit)||limit<1||limit>40)return Response.json({error:'Invalid queue query'},{status:400});
 if(p.get('names')==='1'&&(provider!=='trip'||kind!=='detail'))return Response.json({error:'Name enrichment requires Trip.com details'},{status:400});
 if(p.get('baths')==='1'&&(provider!=='jalan'||kind!=='detail'))return Response.json({error:'Bath enrichment requires Jalan details'},{status:400});
 try{await hotelRepository.ready();const db=favoritesDb();
 const jobs=p.get('baths')==='1'
  ?await db.prepare("SELECT j.* FROM crawl_jobs j JOIN hotels h ON json_extract(h.payload,'$.links[0].url')=j.url WHERE h.id GLOB 'jalan-[0-9]*' AND j.provider='jalan' AND j.kind='detail' AND j.status IN ('done','pending','retry') AND j.next_at<=? AND json_extract(h.payload,'$.sources[0].bathDataVersion') IS NULL AND h.id NOT IN (SELECT value FROM json_each(?)) ORDER BY CASE WHEN h.natural=1 THEN 0 WHEN h.large_bath=1 THEN 1 ELSE 2 END,j.attempts,j.url LIMIT ?").bind(Date.now()/1000,JSON.stringify(verifiedHotels.map(h=>h.id)),limit).all()
  :p.get('names')==='1'
  ?await db.prepare("SELECT j.* FROM crawl_jobs j JOIN hotels h ON json_extract(h.payload,'$.links[0].url')=j.url WHERE h.id GLOB 'trip-[0-9]*' AND j.provider='trip' AND j.kind='detail' AND j.status IN ('done','pending','retry') AND j.next_at<=? AND json_extract(h.payload,'$.sources[0].nameLocaleUrl') IS NULL ORDER BY j.attempts,j.url LIMIT ?").bind(Date.now()/1000,limit).all()
  :await db.prepare("SELECT * FROM crawl_jobs WHERE provider=? AND kind=? AND status IN ('pending','retry') AND next_at<=? ORDER BY (prefecture IS NULL),attempts,url LIMIT ?").bind(provider,kind,Date.now()/1000,limit).all();
 return Response.json({jobs:jobs.results,coverage:await readCoverage()},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Crawl queue read failed',error);return Response.json({error:'Queue unavailable'},{status:503})}
}
export async function POST(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw:unknown;try{const text=await request.text();if(text.length>3000)return Response.json({error:'Claim too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 if(raw&&typeof raw==='object'&&'action' in raw){
  if(raw.action==='release-reviewed-redirect'){
   const repair=reviewedRedirectRepair.safeParse(raw);if(!repair.success)return Response.json({error:'Invalid policy repair'},{status:400});
   try{await hotelRepository.ready();const result=await releaseReviewedRedirect(repair.data);return Response.json(result,{status:result.repaired?200:409,headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Reviewed redirect release failed',error);return Response.json({error:'Policy repair unavailable'},{status:503})}
  }
  const repair=legacyRedirectRepair.safeParse(raw);if(!repair.success)return Response.json({error:'Invalid policy repair'},{status:400});
  try{await hotelRepository.ready();const result=await isolateLegacyRedirect(repair.data);return Response.json(result,{status:result.repaired||'alreadyIsolated' in result?200:409,headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Crawl policy repair failed',error);return Response.json({error:'Policy repair unavailable'},{status:503})}
 }
 const parsed=crawlClaim.safeParse(raw);if(!parsed.success)return Response.json({error:'Invalid crawl claim'},{status:400});
 try{await hotelRepository.ready();return Response.json({jobs:await claimCrawlJob(parsed.data),leaseSeconds:LEASE_SECONDS},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('Crawl claim failed',error);return Response.json({error:'Claim unavailable; retry with the same token'},{status:503})}
}
export async function PUT(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw:unknown;try{const text=await request.text();if(text.length>1500000)return Response.json({error:'Update too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const parsed=crawlUpdate.safeParse(raw);if(!parsed.success)return Response.json({error:'Invalid catalogue observation'},{status:400});const update=parsed.data;
 try{
  await hotelRepository.ready();const db=favoritesDb();
  const job=await db.prepare('SELECT provider,kind,attempts,status,lease_token,lease_until,last_token FROM crawl_jobs WHERE url=?').bind(update.url).first<{provider:string;kind:string;attempts:number;status:string;lease_token:string|null;lease_until:number;last_token:string|null}>();
  if(!job)return Response.json({error:'Unknown crawl job'},{status:404});
  if(update.claimToken&&job.last_token===update.claimToken)return Response.json({accepted:0,replayed:true,coverage:await readCoverage(true)});
  if(job.kind==='detail'&&update.observations.some(h=>h.id!==jobIdentity(update.url)))return Response.json({error:'Detail observation identity does not match requested property'},{status:400});
  if(update.observations.some(h=>!h.id.startsWith(job.provider+'-')||h.sources.some(s=>s.url!==update.url||s.nameLocaleUrl&&s.nameLocaleUrl.replace('https://kr.trip.com/','https://www.trip.com/')!==update.url))||job.kind==='detail'&&update.status==='done'&&!update.observations.length)return Response.json({error:'Observation does not match crawl job'},{status:400});
  const claimToken=update.claimToken??crypto.randomUUID(),now=Date.now()/1000;
  const reserved=await db.prepare('UPDATE crawl_jobs SET lease_token=?,lease_until=? WHERE url=? AND ((lease_token=? AND lease_until>?) OR (lease_until<=? AND ?=1))').bind(claimToken,now+LEASE_SECONDS,update.url,claimToken,now,now,update.claimToken?0:1).run();
  if(!reserved.meta.changes)return Response.json({error:'Crawl claim expired or belongs to another worker; claim again'},{status:409});
  const curatedIds=new Set(catalogHotels.filter(h=>!h.id.match(/^(jalan|trip)-\d+$/)).flatMap(h=>h.links.flatMap(l=>{const match=l.url?.match(/yad(\d+)|hotel-detail-(\d+)/);return match?[match[1]?'jalan-'+match[1]:'trip-'+match[2]]:[]})));
  for(const h of verifiedHotels)for(const l of h.links){const match=l.url?.match(/yad(\d+)|hotel-detail-(\d+)/);if(match){const id=match[1]?'jalan-'+match[1]:'trip-'+match[2];if(id!==h.id)curatedIds.add(id)}}
  const observations=update.observations.filter(h=>!curatedIds.has(h.id));
  const linked=await writeLinkedSourceObservations(update.observations.filter(h=>curatedIds.has(h.id)) as Hotel[]);
  const normalAccepted=await writeHotels((observations as Hotel[]).map(h=>({...h,regionId:sourceRegion(h)})));
  const accepted=linked.accepted+normalAccepted;
  await observeHotelPresence(observations as Hotel[],job.kind==='detail'&&update.status==='done');
  if(job.kind==='detail'&&['http_404','http_410'].includes(update.error??'')){const id=jobIdentity(update.url);if(id)await observeMissingSource(id,claimToken)}
  const observedByUrl=new Map(update.observations.map(h=>[h.links[0].url,h]));
  const jobs=update.links.map(l=>({url:l.url,provider:l.url.includes('jalan.net')?'jalan':'trip',kind:l.kind,prefecture:l.prefecture,priority:collectionPriority(l.prefecture,l.url,observedByUrl.get(l.url))}));
  const own=observedByUrl.get(update.url);if(own)await db.prepare('UPDATE crawl_jobs SET priority=?,prefecture=COALESCE(?,prefecture) WHERE url=?').bind(collectionPriority(own.prefecture,update.url,own),own.prefecture,update.url).run();
  for(let offset=0;offset<jobs.length;offset+=200)await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at) SELECT json_extract(value,'$.url'),json_extract(value,'$.provider'),json_extract(value,'$.kind'),json_extract(value,'$.prefecture'),json_extract(value,'$.priority'),'pending',0,0 FROM json_each(?) WHERE 1 ON CONFLICT(url) DO UPDATE SET priority=MIN(crawl_jobs.priority,excluded.priority),prefecture=COALESCE(crawl_jobs.prefecture,excluded.prefecture)").bind(JSON.stringify(jobs.slice(offset,offset+200))).run();
  const alreadyDone=job.status==='done';const attempts=update.status==='done'?1:job.attempts+(alreadyDone&&!update.claimToken?0:1),status=update.status==='retry'&&attempts>=3?'failed':update.status;
  const nextAt=status==='retry'?now+(update.retryAfterSeconds??60):status==='failed'?now+Math.max(7*86400,update.retryAfterSeconds??0):0;
  // Persist provider pacing across workers. Cooldowns do not rewrite every
  // completed URL, and a replay cannot increase attempts or repeat data writes.
  await db.batch([
   db.prepare("INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(catalog_meta.value AS REAL),CAST(excluded.value AS REAL)) AS TEXT)").bind('crawl-provider-ready:'+job.provider,String(now+Math.max(3,providerCooldown(update)))),
   db.prepare("UPDATE crawl_jobs SET status=CASE WHEN status='done' THEN 'done' ELSE ? END,attempts=?,next_at=?,error=?,fetched_at=CASE WHEN ?='done' THEN ? ELSE fetched_at END,lease_token=NULL,lease_until=0,last_token=? WHERE url=? AND lease_token=?").bind(status,attempts,nextAt,update.error??null,status,new Date().toISOString(),claimToken,update.url,claimToken),
  ]);
  // A foreign-city list with explicit non-Japanese Hotel addresses can retire
  // its old worldwide-navigation jobs together, without spending a request on
  // every unrelated property. No hotel or favorite is removed.
  if(update.excludedCity)await db.prepare("UPDATE crawl_jobs SET status='skipped',error='Explicit non-Japanese source country',next_at=0 WHERE provider='trip' AND instr(url,?)=1").bind('https://www.trip.com/hotels/'+update.excludedCity+'-').run();
  return Response.json({accepted,linkedAccepted:linked.accepted,readbackId:normalAccepted?observations[0]?.id:linked.hotelIds[0]??null,observed:update.observations.length,coverage:await readCoverage()});
 }catch(error){console.error('Crawl observation write failed',error);return Response.json({error:'Observation save failed; safe to retry'},{status:503})}
}
