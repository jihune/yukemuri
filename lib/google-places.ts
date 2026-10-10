// Request-scoped Google data. Do not insert ratings, reviews, photo names or
// photo URIs into the catalog, search index, checkpoints or an application cache.
export type GooglePlaceData={placeId:string;mapsUrl:string;score:number|null;scale:5;reviewCount:number|null;checkedAt:string;photo?:{url:string;mapsUrl:string;authors:{name:string;url:string;avatar:string}[]}};
export class GooglePlaceError extends Error{constructor(public code:'budget'|'provider'|'identity'){super(code)}}
export const GOOGLE_FIELDS='id,rating,userRatingCount,googleMapsUri,photos';
const httpsUrl=(value:unknown,hosts:string[])=>{try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:''}catch{return''}};
export async function readGooglePlace(placeId:string,key:string,includePhoto:boolean,reserve:()=>Promise<boolean>,request:typeof fetch=fetch):Promise<GooglePlaceData>{
 if(!/^[A-Za-z0-9_-]{10,250}$/.test(placeId))throw new GooglePlaceError('identity');
 if(!await reserve())throw new GooglePlaceError('budget');
 const response=await request('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':GOOGLE_FIELDS},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new GooglePlaceError('provider');
 const d=await response.json() as {id?:string;rating?:number;userRatingCount?:number;googleMapsUri?:string;photos?:{name:string;googleMapsUri?:string;authorAttributions?:{displayName?:string;uri?:string;photoUri?:string}[]}[]};
 if(d.id!==placeId)throw new GooglePlaceError('identity');
 const result:GooglePlaceData={placeId,mapsUrl:httpsUrl(d.googleMapsUri,['google.com','google.co.jp','maps.app.goo.gl'])||'https://www.google.com/maps/search/?api=1&query=hotel&query_place_id='+encodeURIComponent(placeId),score:typeof d.rating==='number'&&d.rating>=1&&d.rating<=5?d.rating:null,scale:5,reviewCount:Number.isInteger(d.userRatingCount)&&d.userRatingCount!>=0?d.userRatingCount!:null,checkedAt:new Date().toISOString()};
 const photo=d.photos?.[0];
 if(includePhoto&&photo&&photo.name.startsWith('places/'+placeId+'/photos/')&&/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)&&await reserve()){
  // The API key is server-only. Return the resolved media URI, never the API
  // endpoint or a photo resource name; each lookup uses a fresh photo name.
  const media=new URL('https://places.googleapis.com/v1/'+photo.name+'/media');media.searchParams.set('key',key);media.searchParams.set('maxWidthPx','1400');media.searchParams.set('skipHttpRedirect','true');
  try{const response=await request(media,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.ok){const data=await response.json() as {photoUri?:string};const url=httpsUrl(data.photoUri,['googleusercontent.com']);if(url)result.photo={url,mapsUrl:httpsUrl(photo.googleMapsUri,['google.com','google.co.jp','maps.app.goo.gl'])||result.mapsUrl,authors:(photo.authorAttributions??[]).map(a=>({name:a.displayName??'',url:httpsUrl(a.uri,['google.com','google.co.jp']),avatar:httpsUrl(a.photoUri,['googleusercontent.com'])})).filter(a=>a.name)}}}catch{/* A failed photo lookup must not discard a valid rating. */}
 }
 return result;
}
