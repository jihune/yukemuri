import { hotelRepository,requestDescriptionTranslation } from '@/lib/hotel-repository';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;const hotel=await hotelRepository.get(id);if(!hotel)return Response.json({error:'숙소를 찾을 수 없습니다.'},{status:404});
  // A failed queue write must never prevent the original detail from opening.
  try{await requestDescriptionTranslation(hotel)}catch(error){console.error('Description priority queue unavailable',error)}
  return Response.json(hotel,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Hotel load failed',error);return Response.json({error:'숙소 상세를 불러오지 못했습니다.'},{status:503})}
}
