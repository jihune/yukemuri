import {hasCrawlAccess} from '@/lib/crawl-access';
import {needsKoreanDescription} from '@/lib/hotel-description';
import {descriptionUpdates} from '@/lib/description-contract';
import {hotelRepository,saveDescriptionTranslations} from '@/lib/hotel-repository';
import {favoritesDb} from '@/lib/favorites-db';
import type {Hotel} from '@/lib/hotel-types';
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const limit=Number(new URL(request.url).searchParams.get('limit')??40);
 if(!Number.isInteger(limit)||limit<1||limit>40)return Response.json({error:'Invalid limit'},{status:400});
 try{
  await hotelRepository.ready();
  const hotels:{id:string;names:Hotel['names'];sourceText:string;sourceUrl:string|null;requestedAt:string|null}[]=[];let sourceCharacters=0;
  // Eligibility is language-independent, including short Japanese/Chinese
  // prose and mixed-language descriptions. Scan past already-Korean prose.
  for(let offset=0;;offset+=200){
  const rows=await favoritesDb().prepare(`SELECT h.id,json_extract(h.payload,'$.names') AS names,json_extract(h.payload,'$.description') AS description,json_extract(h.payload,'$.sources[0].url') AS source_url,r.requested_at FROM hotels h
   LEFT JOIN crawl_jobs j ON j.url=json_extract(h.payload,'$.links[0].url')
   LEFT JOIN hotel_description_translations t ON t.hotel_id=h.id AND t.source_text=json_extract(h.payload,'$.description')
   LEFT JOIN hotel_description_requests r ON r.hotel_id=h.id AND r.source_text=json_extract(h.payload,'$.description')
   WHERE t.hotel_id IS NULL AND length(json_extract(h.payload,'$.description'))>0
   ORDER BY CASE WHEN r.hotel_id IS NULL THEN 1 ELSE 0 END,r.requested_at,COALESCE(j.priority,90),MAX(COALESCE(h.trip_reviews,0),COALESCE(h.jalan_reviews,0)) DESC,h.id LIMIT 200 OFFSET ?`).bind(offset).all<{id:string;names:string;description:string;source_url:string|null;requested_at:string|null}>();
  for(const row of rows.results){if(!needsKoreanDescription(row.description)||hotels.some(h=>h.id===row.id))continue;
   if(hotels.length===limit||sourceCharacters+row.description.length>60000)return Response.json({hotels,sourceCharacters},{headers:{'Cache-Control':'no-store'}});
   hotels.push({id:row.id,names:JSON.parse(row.names),sourceText:row.description,sourceUrl:row.source_url,requestedAt:row.requested_at});sourceCharacters+=row.description.length;
  }
  if(hotels.length===limit||rows.results.length<200)break;
  }
  return Response.json({hotels,sourceCharacters},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Description queue unavailable',error);return Response.json({error:'Description queue unavailable'},{status:503})}
}
export async function PUT(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw:unknown;try{const text=await request.text();if(text.length>400000)return Response.json({error:'Update too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const parsed=descriptionUpdates.safeParse(raw);if(!parsed.success)return Response.json({error:'Invalid Korean descriptions'},{status:400});
 try{await hotelRepository.ready();return Response.json({accepted:await saveDescriptionTranslations(parsed.data.patches)})}catch(error){console.error('Description translation save failed',error);return Response.json({error:'Source description changed; read current descriptions before retrying'},{status:409})}
}
