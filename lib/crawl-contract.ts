import { z } from 'zod';
import { PREFECTURES, FEATURE_LABELS, CORE_FEATURE_LABELS } from './hotel-types';
const pref=z.string().refine(s=>PREFECTURES.some(p=>p.id===s));
export const publicUrl=z.string().url().max(600).refine(value=>{
 const url=new URL(value);
 return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&
 (url.hostname==='www.jalan.net'&&/^\/(?:yad\d+\/|ikisaki\/map\/[a-z]+\/|\d{6}\/LRG_\d{6}\/(?:page\d+\.html)?)$/.test(url.pathname)||
 url.hostname==='www.trip.com'&&/^\/hotels\/(?:country\/japan\.html|[a-z0-9-]+-hotels-list-\d+\/(?:location\d+\/|zone\d+\/)?|[a-z0-9-]+-hotel-detail-\d+\/[^/]+\/?)$/.test(url.pathname));
},'Unsupported public catalogue URL');
const stamp=z.string().datetime({offset:true});
// D07: one page of Jalan's Korean or English stay list for a prefecture, the first page and the
// pages it lists, in this parameter order only. The stay date is Jalan's default (about a month
// ahead), so a later visit lists another day's vacancies.
export const LOCALE_LIST=/^https:\/\/www\.jalan\.net\/ui\/uip1400\/uiw1402\.do\?langCd=(ko_KR|en_US)&kenCd=(0[1-9]|[1-3]\d|4[0-7])0000&stayCount=1&roomCount=1&distCd=01&crcyCd=(KRW|USD)&activeSort=1&screenId=UIW1402&idx=([1-9]\d{0,2})&pageNum=\4$/;
export const localeListUrl=z.string().max(600).refine(s=>{const m=LOCALE_LIST.exec(s);return!!m&&(m[1]==='ko_KR')===(m[3]==='KRW')},'Unsupported Jalan locale list page');
export const crawlJobUrl=z.union([publicUrl,localeListUrl]);
// A stay on that list: its Jalan number, its name there and its page on the same site (the
// collector percent-encodes the page's name path).
const localeName=z.object({id:z.string().regex(/^jalan-\d{1,9}$/),name:z.string().trim().min(1).max(400),url:z.string().max(600).regex(/^https:\/\/www\.jalan\.net\/(?:kr|en)\/japan_hotels_ryokan\/(?:[A-Za-z0-9_-]+\/){3,5}[A-Za-z0-9_.~%-]+\/$/)}).strict();
const source=z.object({sourceId:z.string().max(100),sourceType:z.literal('web'),label:z.string().max(100),retrievedAt:stamp,verifiedAt:z.string().nullable(),url:publicUrl,isMock:z.literal(false),bathDataVersion:z.enum(['v1','v2','v3']).optional(),nameLocaleUrl:z.string().url().max(600).refine(s=>{const u=new URL(s);return u.origin==='https://kr.trip.com'&&!u.search&&!u.hash&&/^\/hotels\/[a-z0-9-]+-hotel-detail-\d+\/[^/]+\/?$/.test(u.pathname)}).optional()});
const fact=z.object({value:z.boolean().nullable(),sourceId:z.string().max(100),verifiedAt:z.string().nullable(),scope:z.enum(['property','someRooms','allRooms']).optional(),note:z.string().max(3000).optional()});
const roomCount=z.number().int().min(0).max(5000);
const rooms=z.object({total:roomCount.min(1),byType:z.object({western:roomCount,japanese:roomCount,japaneseWestern:roomCount,other:roomCount}).optional(),sourceId:z.string().max(100),verifiedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),note:z.string().max(600)});
const facilityYear=z.number().int().min(1000).max(2100);
const facilityYears=z.object({opened:facilityYear.optional(),renovated:facilityYear.optional(),sourceId:z.string().max(100),verifiedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),note:z.string().max(300)}).refine(y=>y.opened!==undefined||y.renovated!==undefined);
const roomPhotoUrl=z.string().url().max(600).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='cdn.jalan.jp'||/^[a-z0-9-]+\.tripcdn\.com$/.test(u.hostname))});
const roomTypes=z.array(z.object({sourceId:z.string().max(100),verifiedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),items:z.array(z.object({name:z.string().min(1).max(200).nullable(),photos:z.array(z.object({url:roomPhotoUrl,caption:z.string().max(300)})).max(6)})).min(1).max(30)})).max(1);
const featureShape=Object.fromEntries(Object.keys(FEATURE_LABELS).map(k=>[k,Object.hasOwn(CORE_FEATURE_LABELS,k)?fact:fact.optional()])) as Record<keyof typeof FEATURE_LABELS,typeof fact>;
export const observedHotel=z.object({
 id:z.string().regex(/^(jalan|trip)-\d+$/),names:z.object({ko:z.string().min(1).max(400),ja:z.string().max(400),en:z.string().max(400)}),aliases:z.array(z.string().min(1).max(400)).max(30).optional(),kind:z.enum(['hotel','ryokan','unknown']),regionId:z.string().max(100),prefecture:pref.nullable(),
 location:z.object({label:z.string().max(400),address:z.string().max(1000),latitude:z.number().min(20).max(46.5).nullable(),longitude:z.number().min(122).max(154).nullable(),isApproximate:z.literal(false)}),
 description:z.string().max(6000),image:z.object({url:z.string().max(2000).refine(s=>!s||s.startsWith('https://')),alt:z.string().max(600),sourceId:z.string().max(100),isRepresentative:z.literal(false)}),
 features:z.object(featureShape),rooms:rooms.optional(),roomTypes:roomTypes.optional(),facilityYears:facilityYears.optional(),spring:z.object({types:z.array(z.string().max(200)).max(20),waterNotes:z.string().max(6000),useNotes:z.string().max(6000)}),
 ratings:z.array(z.object({sourceId:z.string().max(100),provider:z.enum(['trip','jalan']),score:z.number().positive().max(10),scale:z.union([z.literal(5),z.literal(10)]),reviewCount:z.number().int().min(0),summary:z.string().max(3000),highlights:z.array(z.string().max(300)).max(20),isMock:z.literal(false),verifiedAt:z.string().nullable()})).max(2),
 links:z.array(z.object({provider:z.enum(['trip','jalan','maps']),url:z.string().url().max(2000).refine(s=>s.startsWith('https://')),kind:z.enum(['property','coordinates']),label:z.string().max(200)})).max(4),sources:z.array(source).min(1).max(2),
}).superRefine((h,ctx)=>{
 const [provider,id]=h.id.split('-');
 const property=h.links.find(l=>l.provider===provider);
 if(!property||!publicUrl.safeParse(property.url).success||!(provider==='jalan'?property.url.includes('/yad'+id+'/'):property.url.includes('hotel-detail-'+id+'/')))ctx.addIssue({code:'custom',message:'Source ID does not match property URL'});
 if(h.sources.some(s=>s.sourceId!==h.id)||h.ratings.some(r=>r.provider!==provider||r.sourceId!==h.id||r.scale!==(provider==='trip'?10:5)||r.score>r.scale)||Object.values(h.features).some(f=>f && (f.sourceId!==h.id||(f.value===null)!==(f.verifiedAt===null)))||h.rooms&&h.rooms.sourceId!==h.id||h.roomTypes?.some(s=>s.sourceId!==h.id)||h.facilityYears&&h.facilityYears.sourceId!==h.id)ctx.addIssue({code:'custom',message:'Inconsistent source, facility or rating scale'});
});
export const crawlUpdate=z.object({url:crawlJobUrl,claimToken:z.string().uuid().optional(),providerCooldownSeconds:z.number().int().min(60).max(604800).optional(),providerWaitReason:z.literal('retry_after').optional(),status:z.enum(['done','retry','failed','skipped']),observations:z.array(observedHotel).max(80).default([]),links:z.array(z.object({url:crawlJobUrl,kind:z.enum(['list','detail','names']),prefecture:pref.nullable()})).max(600).default([]),localeNames:z.array(localeName).max(30).default([]),error:z.string().max(300).nullable().optional(),retryAfterSeconds:z.number().int().min(60).max(604800).optional(),excludedCity:z.string().regex(/^[a-z0-9-]{1,100}$/).optional()}).superRefine((u,ctx)=>{if(u.status==='skipped'&&(u.observations.length||u.links.length||u.error!=='Explicit non-Japanese source country'||!u.url.includes('www.trip.com/'))||u.excludedCity&&(u.status!=='skipped'||!new URL(u.url).pathname.startsWith('/hotels/'+u.excludedCity+'-hotels-list-')))ctx.addIssue({code:'custom',message:'Unsupported skipped source'});
 // A locale list page reports names and its own pages only; every other page neither.
 const page=LOCALE_LIST.exec(u.url);
 if(page?u.observations.length||u.links.some(l=>l.kind!=='names'||LOCALE_LIST.exec(l.url)?.slice(1,4).join()!==page.slice(1,4).join())||u.localeNames.some(n=>!n.url.startsWith('https://www.jalan.net/'+(page[1]==='ko_KR'?'kr':'en')+'/'))||new Set(u.localeNames.map(n=>n.id)).size!==u.localeNames.length
  :u.localeNames.length||u.links.some(l=>l.kind==='names'||LOCALE_LIST.test(l.url)))ctx.addIssue({code:'custom',message:'Locale names belong to a Jalan locale list page'});
});

// Page retries cannot pause the provider without an access response, a clear
// bot challenge, or an explicit source Retry-After reported by the updater.
// robots_http_: an updater from before C08 (2026-10-21), which read robots.txt.
export function providerCooldown(update:z.infer<typeof crawlUpdate>){
 if(!['retry','failed'].includes(update.status))return 0;
 const code=update.error?.match(/^(?:http_|robots_http_)(403|429)$/)?.[1];
 if(code||update.error==='source_access_bot_challenge')return Math.max(code==='429'?21600:86400,update.providerCooldownSeconds??0,update.retryAfterSeconds??0);
 return update.providerWaitReason==='retry_after'?Math.max(update.providerCooldownSeconds??0,update.retryAfterSeconds??0):0;
}
