import type {Hotel} from './hotel-types';

function destination(value:string|null|undefined){
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  if(['www.trip.com','kr.trip.com'].includes(url.hostname))return{url:value,provider:'trip' as const,id:url.pathname.match(/^\/hotels\/[a-z0-9-]+-hotel-detail-(\d+)\/[^/]+\/?$/)?.[1]??null};
  if(url.hostname==='www.jalan.net')return{url:value,provider:'jalan' as const,id:url.pathname.match(/^\/yad(\d+)(?:\/|$)/)?.[1]??null};
  return{url:value,provider:null,id:null};
 }catch{return null}
}

// The collection URL remains the evidence source. A facility button must open
// this property's page, never the city/prefecture list that discovered it.
export function hotelFacilityUrl(hotel:Hotel,sourceId:string):string|null{
 const source=hotel.sources.find(s=>s.sourceId===sourceId);
 if(!source)return null;
 const original=destination(source.url),identity=sourceId.match(/^(trip|jalan)-(\d+)$/);
 if(original&&!original.provider)return original.url;
 if(original?.id&&(!identity||(original.provider===identity[1]&&original.id===identity[2])))return original.url;
 if(!identity)return null;
 for(const link of hotel.links){
  if(link.kind!=='property'||link.provider!==identity[1])continue;
  const target=destination(link.url);
  if(target?.provider===identity[1]&&target.id===identity[2])return target.url;
 }
 return null;
}
