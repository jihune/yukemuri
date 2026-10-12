import {hasCrawlAccess} from '@/lib/crawl-access';
import {readCollectionStatus} from '@/lib/read-collection-status';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
// Reads the whole queue, so it is maintenance only (P03). Visitors see the
// status the search snapshot computed (status.json).
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403,headers});
 try{
  return Response.json(await readCollectionStatus(),{headers});
 }catch(error){
  console.error('Collection status read failed',error);
  return Response.json({error:'수집 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'},{status:503,headers});
 }
}
