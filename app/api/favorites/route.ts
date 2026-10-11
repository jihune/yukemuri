import { favoritesDb } from '@/lib/favorites-db';
import { hotelRepository } from '@/lib/hotel-repository';
import {visitorFavoriteIds,visitorKey} from '@/lib/visitor-favorites';
import {hasCrawlAccess} from '@/lib/crawl-access';
export async function GET(request:Request){
 try{
  // Keep the legacy owner collection readable to the maintenance service only.
  const ids=hasCrawlAccess(request)?(await favoritesDb().prepare('SELECT favorites.hotel_id FROM favorites INNER JOIN hotels ON hotels.id=favorites.hotel_id ORDER BY favorites.created_at DESC').all<{hotel_id:string}>()).results.map(r=>r.hotel_id):await visitorFavoriteIds(request);
  return Response.json({ids},{headers:{'Cache-Control':'no-store'}});
 }
 catch(error){console.error('Favorite load failed',error);return Response.json({error:'즐겨찾기를 불러오지 못했습니다. 다시 시도해 주세요.'},{status:503})}
}
export async function PUT(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'요청 출처를 확인할 수 없습니다.'},{status:403});
 const key=await visitorKey(request);
 if(!key)return Response.json({error:'즐겨찾기를 저장하려면 이 브라우저에서 사이트 저장소를 허용해 주세요.'},{status:400});
 let payload:{hotelId?:unknown;saved?:unknown};
 try{payload=await request.json()}catch{return Response.json({error:'잘못된 요청입니다.'},{status:400})}
 if(!payload||typeof payload.hotelId!=='string'||typeof payload.saved!=='boolean')return Response.json({error:'유효한 숙소와 저장 상태가 필요합니다.'},{status:400});
 try{
  if(!(await hotelRepository.get(payload.hotelId)))return Response.json({error:'유효한 숙소와 저장 상태가 필요합니다.'},{status:400});
  const db=favoritesDb();
  if(payload.saved)await db.prepare('INSERT INTO visitor_favorites (visitor_key,hotel_id) VALUES (?,?) ON CONFLICT(visitor_key,hotel_id) DO NOTHING').bind(key,payload.hotelId).run();
  else await db.prepare('DELETE FROM visitor_favorites WHERE visitor_key=? AND hotel_id=?').bind(key,payload.hotelId).run();
  return Response.json({hotelId:payload.hotelId,saved:payload.saved});
 }catch(error){console.error('Favorite write failed',error);return Response.json({error:'즐겨찾기를 저장하지 못했습니다. 다시 시도해 주세요.'},{status:503})}
}
