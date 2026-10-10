import { hotelRepository } from '@/lib/hotel-repository';
import { parseHotelQuery } from '@/lib/hotel-query';
import {ResultSessionError} from '@/lib/hotel-result-session';
import {visitorKey,visitorFavoriteIds} from '@/lib/visitor-favorites';
export async function GET(request:Request){
 const started=performance.now();
 const params=new URL(request.url).searchParams,query=parseHotelQuery(params),snapshot=params.get('snapshot')??undefined;
 if(snapshot&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(snapshot))return Response.json({error:'목록 식별자를 확인하세요.'},{status:400});
 if(!query)return Response.json({error:'검색 조건을 확인하세요.'},{status:400});
 try{await hotelRepository.ready();const savedIds=query.savedOnly?await visitorFavoriteIds(request):[];return Response.json(await hotelRepository.search(query.filters,query.sort,query.page,query.savedOnly,savedIds,{stable:params.get('stable')==='1',fresh:params.get('fresh')==='1',snapshot,scope:query.savedOnly?(await visitorKey(request)??'anonymous'):''}),{headers:{'Cache-Control':'no-store','Server-Timing':`catalog;dur=${(performance.now()-started).toFixed(1)}`}})}catch(error){if(error instanceof ResultSessionError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});console.error('Catalog query failed',error);return Response.json({error:'숙소를 불러오지 못했습니다. 다시 시도해 주세요.'},{status:503})}
}
