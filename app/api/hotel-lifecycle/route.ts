import {hasCrawlAccess} from '@/lib/crawl-access';
import {favoritesDb} from '@/lib/favorites-db';
import {hotelRepository,invalidateSearch} from '@/lib/hotel-repository';
import {lifecyclePatch,saveLifecyclePatch} from '@/lib/hotel-lifecycle';
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 try{await hotelRepository.ready();const db=favoritesDb();
 const candidates=await db.prepare(`SELECT h.id,h.name,h.prefecture,json_extract(h.payload,'$.location') AS location,json_extract(h.payload,'$.links') AS links,
 l.first_seen_at,l.last_seen_at,l.last_detail_at,l.missing_count,l.missing_at,l.state,l.evidence,j.priority
 FROM hotels h LEFT JOIN hotel_lifecycle l ON l.hotel_id=h.id LEFT JOIN crawl_jobs j ON j.url=json_extract(h.payload,'$.links[0].url')
 WHERE l.missing_count>0 OR (l.state='temporarily_closed' AND (json_extract(l.evidence,'$.expectedReopenAt')<=date('now') OR json_extract(l.evidence,'$.closedUntil')<date('now') OR julianday(l.checked_at)<julianday('now','-7 days')))
 ORDER BY COALESCE(j.priority,90),l.missing_at LIMIT 30`).all();
 const states=await db.prepare('SELECT state,COUNT(*) AS count FROM hotel_lifecycle GROUP BY state').all();
 return Response.json({candidates:candidates.results,states:states.results,policy:'A missing listing is a review signal, not a closure. Official evidence and property identity are required.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Lifecycle review unavailable',e);return Response.json({error:'Lifecycle review unavailable'},{status:503})}
}
export async function PUT(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw;try{const text=await request.text();if(text.length>12000)return Response.json({error:'Evidence too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const parsed=lifecyclePatch.safeParse(raw);if(!parsed.success)return Response.json({error:'Current official evidence and property identity are required'},{status:400});
 try{await hotelRepository.ready();const result=await saveLifecyclePatch(parsed.data);if(result==='unknown')return Response.json({error:'Unknown hotel'},{status:404});if(result==='stale')return Response.json({error:'Newer evidence already exists'},{status:409});invalidateSearch();return Response.json({result,hotel:await hotelRepository.get(parsed.data.id)})}catch(e){console.error('Lifecycle save failed',e);return Response.json({error:'Lifecycle save failed'},{status:503})}
}
