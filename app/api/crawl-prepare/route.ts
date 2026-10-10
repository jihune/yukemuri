import {hasCrawlAccess} from '@/lib/crawl-access';
import {prepareOnsenCatalog} from '@/lib/hotel-repository';

export async function POST(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{return Response.json(await prepareOnsenCatalog(),{headers:{'Cache-Control':'no-store'}})}
 catch(error){console.error('Catalog preparation failed',error);return Response.json({error:'Preparation unavailable; retry safely'},{status:503})}
}
