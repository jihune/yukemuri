import {hasCrawlAccess} from '@/lib/crawl-access';
import release from '@/data/collector-release.generated.json';

// Source distribution is maintenance-only, even while the catalogue is public.
// This route does not initialize or read the catalogue, queue or favorites.
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403,headers});
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(url.search||origin&&origin!==url.origin)return Response.json({error:'Invalid release request'},{status:400,headers});
 return Response.json(release,{headers});
}
