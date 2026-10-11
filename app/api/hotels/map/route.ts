import {hotelRepository} from '@/lib/hotel-repository';
import {parseHotelQuery} from '@/lib/hotel-query';
import {visitorFavoriteIds} from '@/lib/visitor-favorites';
// bbox=west,south,east,north in degrees. The same conditions as /api/hotels.
export async function GET(request:Request){
 const started=performance.now();
 const params=new URL(request.url).searchParams,query=parseHotelQuery(params);
 // Plain decimal degrees only: Number() would read '' and ' ' as 0 and accept 0x82 or 1e2.
 const parts=(params.get('bbox')??'').split(','),box=parts.every(p=>/^-?\d+(?:\.\d+)?$/.test(p))?parts.map(Number):[];
 const [west,south,east,north]=box;
 if(!query)return Response.json({error:'검색 조건을 확인하세요.'},{status:400});
 if(box.length!==4||!box.every(Number.isFinite)||south<-90||north>90||west<-180||east>180||south>=north||west>=east)return Response.json({error:'지도 범위를 확인하세요.'},{status:400});
 try{
  await hotelRepository.ready();const savedIds=query.savedOnly?await visitorFavoriteIds(request):[];
  return Response.json(await hotelRepository.mapArea(query.filters,{west,south,east,north},query.savedOnly,savedIds),{headers:{'Cache-Control':'no-store','Server-Timing':`catalog;dur=${(performance.now()-started).toFixed(1)}`}});
 }catch(error){console.error('Map area query failed',error);return Response.json({error:'지도 범위의 숙소를 불러오지 못했습니다. 다시 시도해 주세요.'},{status:503})}
}
