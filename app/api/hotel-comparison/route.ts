import {parseComparisonIds} from '@/lib/hotel-comparison';
import {hotelRepository} from '@/lib/hotel-repository';

export async function GET(request:Request){
 const params=new URL(request.url).searchParams,ids=parseComparisonIds(params.get('ids'));
 if(!ids||params.getAll('ids').length!==1||[...params.keys()].some(key=>key!=='ids'))return Response.json({error:'비교할 숙소를 1~4곳 선택해 주세요.'},{status:400,headers:{'Cache-Control':'no-store'}});
 try{
  const hotels=await hotelRepository.getMany(ids),found=new Set(hotels.map(hotel=>hotel.id));
  return Response.json({hotels,missingIds:ids.filter(id=>!found.has(id)),measuredAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Comparison read failed',error);return Response.json({error:'비교 정보를 불러오지 못했습니다. 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
