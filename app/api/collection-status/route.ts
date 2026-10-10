import {hotelRepository} from '@/lib/hotel-repository';
import {readCollectionStatus} from '@/lib/read-collection-status';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){
 try{
  await hotelRepository.ready();
  return Response.json(await readCollectionStatus(),{headers});
 }catch(error){
  console.error('Collection status read failed',error);
  return Response.json({error:'수집 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'},{status:503,headers});
 }
}
