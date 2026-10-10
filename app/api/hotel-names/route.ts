import {hasCrawlAccess} from '@/lib/crawl-access';
import {hotelNameUpdates} from '@/lib/hotel-name-localization';
import {hotelRepository,saveNamePatches,deferNameResearch} from '@/lib/hotel-repository';
import {favoritesDb} from '@/lib/favorites-db';
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const limit=Number(new URL(request.url).searchParams.get('limit')??20);
 if(!Number.isInteger(limit)||limit<1||limit>20)return Response.json({error:'Invalid limit'},{status:400});
 try{
  await hotelRepository.ready();
  const rows=await favoritesDb().prepare("SELECT h.id,h.payload FROM hotels h LEFT JOIN crawl_jobs j ON j.url=json_extract(h.payload,'$.links[0].url') WHERE json_extract(h.payload,'$.names.ko') NOT GLOB '*[가-힣]*' AND h.id NOT IN (SELECT hotel_id FROM hotel_name_localizations WHERE payload IS NOT NULL OR checked_at>?) ORDER BY COALESCE(j.priority,90),MAX(COALESCE(h.trip_reviews,0),COALESCE(h.jalan_reviews,0)) DESC,h.id LIMIT ?").bind(new Date(Date.now()-7*86400000).toISOString(),limit).all<{id:string;payload:string}>();
  return Response.json({hotels:rows.results.map(r=>{const h=JSON.parse(r.payload);return{id:h.id,names:h.names,aliases:h.aliases??[],prefecture:h.prefecture,location:h.location,links:h.links}})},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Missing hotel names unavailable',error);return Response.json({error:'Names unavailable'},{status:503})}
}
export async function PUT(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw:unknown;try{const text=await request.text();if(text.length>80000)return Response.json({error:'Update too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const parsed=hotelNameUpdates.safeParse(raw);if(!parsed.success)return Response.json({error:'Invalid verified Korean names'},{status:400});
 try{await hotelRepository.ready();const accepted=parsed.data.patches.length?await saveNamePatches(parsed.data.patches):0;await deferNameResearch(parsed.data.unavailableIds);return Response.json({accepted,deferred:parsed.data.unavailableIds.length})}catch(error){console.error('Korean name update failed',error);return Response.json({error:'Identity changed or save failed; read the current hotel before retrying'},{status:409})}
}
