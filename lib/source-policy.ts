import type {Hotel,FeatureKey} from './hotel-types';
import {normalizeHotelImage} from './hotel-images';
import {FEATURE_KEYS,hotelFeature} from './hotel-bath-facts';

export const SOURCE_POLICY={ratings:['trip','google','jalan','rakuten'],facilities:['jalan','official','trip'],photos:['trip','google','jalan','official']} as const;
export type PhotoCandidate={url:string;sourceId:string;provider:'trip'|'google'|'jalan'|'official'|'unknown'};
export function photoProvider(url:string):PhotoCandidate['provider']{
 try{const host=new URL(url).hostname;if(/(^|\.)tripcdn\.com$/.test(host))return'trip';if(/(^|\.)googleusercontent\.com$/.test(host))return'google';if(/(^|\.)jalan\.(jp|net)$/.test(host))return'jalan';return'unknown'}catch{return'unknown'}
}
export function preferredPhotos(hotels:Hotel[]):PhotoCandidate[]{
 const items=hotels.flatMap(h=>[h.image.url,...(h.image.alternatives??[])].map(url=>{
  const clean=normalizeHotelImage(url),provider=photoProvider(clean);
  const source=h.sources.find(s=>!s.isMock&&(provider==='trip'?s.url?.includes('trip.com/hotels/'):provider==='jalan'?s.url?.includes('jalan.net/yad'):s.sourceId===h.image.sourceId));
  return{url:clean,sourceId:source?.sourceId??h.image.sourceId,provider,at:Date.parse(source?.retrievedAt??'')||0};
 })).filter(p=>p.url&&p.provider!=='google');
 // Google images are transient API results with attribution, never catalog assets.
 return items.sort((a,b)=>rankPhoto(a.provider)-rankPhoto(b.provider)||b.at-a.at).filter((p,i,all)=>all.findIndex(x=>x.url===p.url)===i).map(({at,...p})=>p);
}
const rankPhoto=(provider:PhotoCandidate['provider'])=>{const i=(SOURCE_POLICY.photos as readonly string[]).indexOf(provider);return i<0?10:i};
const sourceProvider=(h:Hotel,key:FeatureKey)=>{const f=hotelFeature(h,key),s=h.sources.find(s=>s.sourceId===f.sourceId&&!s.isMock);if(!s)return'unknown';if(s.url?.includes('jalan.net/yad'))return'jalan';if(s.url?.includes('trip.com/hotels/'))return'trip';return'official'};
const stamp=(h:Hotel,sourceId:string,date:string|null)=>Date.parse(h.sources.find(s=>s.sourceId===sourceId)?.retrievedAt??date??'')||0;
export function composePreferredHotel(base:Hotel,linked:Hotel[]):Hotel{
 const all=[base,...linked],ratings=new Map<string,{rating:Hotel['ratings'][number];at:number}>();
 for(const h of all)for(const r of h.ratings){
  if(!r.provider||r.provider==='google'||r.isMock||!r.verifiedAt||r.scale!==(r.provider==='trip'?10:5)||!Number.isFinite(r.score)||r.score<=0||r.score>r.scale||!Number.isInteger(r.reviewCount)||r.reviewCount<0)continue;
  const prior=ratings.get(r.provider),at=stamp(h,r.sourceId,r.verifiedAt);if(!prior||at>prior.at)ratings.set(r.provider,{rating:r,at});
 }
 const features={...base.features};
 for(const key of FEATURE_KEYS){
  const candidates=all.filter(h=>hotelFeature(h,key).value!==null&&hotelFeature(h,key).verifiedAt).sort((a,b)=>{
   const ap=sourceProvider(a,key),bp=sourceProvider(b,key),ar=(SOURCE_POLICY.facilities as readonly string[]).indexOf(ap),br=(SOURCE_POLICY.facilities as readonly string[]).indexOf(bp);
   return(ar<0?10:ar)-(br<0?10:br)||stamp(b,hotelFeature(b,key).sourceId,hotelFeature(b,key).verifiedAt)-stamp(a,hotelFeature(a,key).sourceId,hotelFeature(a,key).verifiedAt);
  });
  if(candidates[0])features[key]=hotelFeature(candidates[0],key);
 }
 // A stated room count follows the facility order too (D05).
 const roomRank=(h:Hotel)=>{const url=h.sources.find(s=>s.sourceId===h.rooms?.sourceId&&!s.isMock)?.url??'',i=(SOURCE_POLICY.facilities as readonly string[]).indexOf(url.includes('jalan.net/yad')?'jalan':url.includes('trip.com/hotels/')?'trip':'official');return i<0?10:i};
 const rooms=all.filter(h=>h.rooms).sort((a,b)=>roomRank(a)-roomRank(b)||stamp(b,b.rooms!.sourceId,b.rooms!.verifiedAt)-stamp(a,a.rooms!.sourceId,a.rooms!.verifiedAt))[0]?.rooms;
 // Room photos of every linked source, in the photo order (Trip.com first),
 // one set per source: a group can list the base hotel among its peers.
 const roomPhotoRank=(set:{sourceId:string})=>rankPhoto(set.sourceId.startsWith('trip-')?'trip':set.sourceId.startsWith('jalan-')?'jalan':'unknown');
 const roomTypes=all.flatMap(h=>h.roomTypes??[]).sort((a,b)=>roomPhotoRank(a)-roomPhotoRank(b)||b.verifiedAt.localeCompare(a.verifiedAt)).filter((set,i,sets)=>sets.findIndex(s=>s.sourceId===set.sourceId)===i);
 const jalan=all.find(h=>h.sources.some(s=>!s.isMock&&s.url?.includes('jalan.net/yad')&&s.label.includes('상세'))&&h.id.startsWith('jalan-'));
 const photos=preferredPhotos(all),image=photos[0]?{...base.image,url:photos[0].url,sourceId:photos[0].sourceId,alternatives:photos.slice(1).map(p=>p.url)}:base.image;
 const sources=new Map(base.sources.map(s=>[s.sourceId,s]));for(const h of linked)for(const s of h.sources){const old=sources.get(s.sourceId);if(!old||Date.parse(s.retrievedAt)>Date.parse(old.retrievedAt))sources.set(s.sourceId,s)}
 const links=new Map(base.links.map(l=>[l.provider,l]));for(const h of linked)for(const l of h.links)if(!links.has(l.provider))links.set(l.provider,l);
 return{...base,features,...(rooms?{rooms}:{}),...(roomTypes.length?{roomTypes}:{}),spring:jalan?.spring??base.spring,image,photoCandidates:photos,ratings:[...ratings.values()].map(r=>r.rating).sort((a,b)=>(SOURCE_POLICY.ratings as readonly string[]).indexOf(a.provider!)-(SOURCE_POLICY.ratings as readonly string[]).indexOf(b.provider!)),sources:[...sources.values()],links:[...links.values()],...(jalan?{description:jalan.description,descriptionTranslation:jalan.descriptionTranslation}:{})};
}
