import {env} from 'cloudflare:workers';
import {favoritesDb} from './favorites-db';
import {BATH_FEATURE_MASK} from './hotel-bath-facts';
import type {CollectionProvider,CollectionIssue,CollectionStatus,ProviderCollectionStatus} from './collection-status';

type ProviderRow={provider:CollectionProvider;last_success:number|null;completed_details:number;pending:number;retry:number;failed:number;active:number};
function epochIso(seconds:number|null){
 if(seconds===null||!Number.isFinite(seconds)||!Number.isFinite(new Date(seconds*1000).getTime()))return null;
 return new Date(seconds*1000).toISOString();
}
// Public summaries only. Queue URLs, claim tokens, raw errors, private metadata,
// visitor favorites and Google content never enter this response.
export async function readCollectionStatus():Promise<CollectionStatus>{
 const now=Date.now()/1000,db=favoritesDb();
 const [providers,cooldowns,issues,quality]=await Promise.all([
  db.prepare(`SELECT provider,MAX(unixepoch(fetched_at)) AS last_success,
   SUM(CASE WHEN status='done' AND kind='detail' THEN 1 ELSE 0 END) AS completed_details,
   SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) AS pending,
   SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END) AS retry,
   SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
   SUM(CASE WHEN lease_until>? THEN 1 ELSE 0 END) AS active
   FROM crawl_jobs WHERE provider IN ('jalan','trip') AND status!='skipped' GROUP BY provider`).bind(now).all<ProviderRow>(),
  db.prepare("SELECT key,value FROM catalog_meta WHERE key IN ('crawl-provider-ready:jalan','crawl-provider-ready:trip')").all<{key:string;value:string}>(),
  db.prepare(`SELECT provider,CASE
   WHEN error IN ('http_404','http_410') THEN 'missing_page'
   WHEN error IN ('http_403','http_429','robots_disallowed','robots_http_403','robots_http_429') OR error LIKE 'source_access_%' THEN 'access_limited'
   WHEN error IN ('URLError','TimeoutError','ConnectionError','robots_unavailable') OR error LIKE 'http_5%' OR error LIKE 'robots_http_5%' THEN 'connection'
   WHEN error IN ('ValueError','source_data_requires_review') THEN 'source_format'
   WHEN error IN ('source_redirect_requires_review','source_redirect_page_review','robots_redirect_requires_review','robots_response_requires_review','robots_response_too_large','robots_crawl_delay_requires_review','invalid_robots_crawl_delay','invalid_robots_request_rate','unsupported_source') THEN 'source_review'
   ELSE 'other' END AS reason,COUNT(*) AS count
   FROM crawl_jobs WHERE provider IN ('jalan','trip') AND status!='skipped' AND error IS NOT NULL
   GROUP BY provider,reason`).all<{provider:CollectionProvider;reason:CollectionIssue;count:number}>(),
  db.prepare(`SELECT COUNT(*) AS records,
   COALESCE(SUM(CASE WHEN json_extract(payload,'$.sources[0].label') LIKE '%상세%' THEN 1 ELSE 0 END),0) AS detailRecords,
   COALESCE(SUM(CASE WHEN (bath_known & ${BATH_FEATURE_MASK})>0 THEN 1 ELSE 0 END),0) AS bathKnownRecords,
   COALESCE(SUM(CASE WHEN natural=1 THEN 1 ELSE 0 END),0) AS naturalOnsenRecords,
   COALESCE(SUM(CASE WHEN room_onsen=1 THEN 1 ELSE 0 END),0) AS roomOnsenRecords
   FROM hotels`).first<CollectionStatus['quality']>(),
 ]);
 const ready=new Map(cooldowns.results.map(row=>[row.key,Number(row.value)]));
 return{measuredAt:new Date(now*1000).toISOString(),quality:quality??{records:0,detailRecords:0,bathKnownRecords:0,naturalOnsenRecords:0,roomOnsenRecords:0},providers:(['jalan','trip'] as const).map(provider=>{
  const row=providers.results.find(item=>item.provider===provider),readyAt=ready.get('crawl-provider-ready:'+provider);
  const status:ProviderCollectionStatus={provider,lastSuccessAt:epochIso(row?.last_success??null),completedDetailPages:row?.completed_details??0,pendingPages:row?.pending??0,retryPages:row?.retry??0,failedPages:row?.failed??0,activePages:row?.active??0,
   // Ordinary three-second pacing is not a provider suspension.
   waitingUntil:readyAt!==undefined&&readyAt>now+30?epochIso(readyAt):null,
   issues:issues.results.filter(item=>item.provider===provider).map(({reason,count})=>({reason,count})).sort((a,b)=>b.count-a.count||a.reason.localeCompare(b.reason)),
  };return status;
 }),google:{connected:env.GOOGLE_PLACES_ENABLED==='true'&&!!env.GOOGLE_PLACES_API_KEY,mode:'on_demand'}};
}
