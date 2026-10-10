import {env} from 'cloudflare:workers';
import {hotelRepository} from '@/lib/hotel-repository';
import {favoritesDb} from '@/lib/favorites-db';
import {readGooglePlace,GooglePlaceError} from '@/lib/google-places';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 // Enabling this paid provider requires an explicit server setting as well as
 // a key. There is no background Google prefetch or automatic name matching.
 if(env.GOOGLE_PLACES_ENABLED!=='true'||!env.GOOGLE_PLACES_API_KEY)return Response.json({status:'not_connected'},{headers});
 const {id}=await params;if(!/^[a-zA-Z0-9-]{1,120}$/.test(id))return Response.json({status:'not_found'},{status:404,headers});
 try{
  const hotel=await hotelRepository.get(id);if(!hotel?.googlePlaceId)return Response.json({status:'not_mapped'},{headers});
  const raw=Number(env.GOOGLE_PLACES_DAILY_REQUEST_LIMIT??100),limit=Number.isInteger(raw)&&raw>=1&&raw<=1000?raw:100;
  const reserve=async()=>{const key='google-request-budget:'+new Date(Date.now()+9*3600000).toISOString().slice(0,10);const row=await favoritesDb().prepare("INSERT INTO catalog_meta(key,value) VALUES (?,'1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(catalog_meta.value AS INTEGER)+1 AS TEXT) WHERE CAST(catalog_meta.value AS INTEGER)<? RETURNING value").bind(key,limit).first();return!!row};
  const includePhoto=new URL(request.url).searchParams.get('photo')==='1';
  const data=await readGooglePlace(hotel.googlePlaceId,env.GOOGLE_PLACES_API_KEY,includePhoto,reserve);
  return Response.json({status:'ok',data},{headers});
 }catch(error){return Response.json({status:error instanceof GooglePlaceError?error.code:'unavailable'},{status:error instanceof GooglePlaceError&&error.code==='budget'?429:503,headers})}
}
