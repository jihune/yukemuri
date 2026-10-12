import { hotelRepository } from '@/lib/hotel-repository';
// A read never writes D1 (P03): the description translation queue is filled
// outside this path when D03 resumes.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;const hotel=await hotelRepository.get(id);if(!hotel)return Response.json({error:'숙소를 찾을 수 없습니다.'},{status:404});
  return Response.json(hotel,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Hotel load failed',error);return Response.json({error:'숙소 상세를 불러오지 못했습니다.'},{status:503})}
}
