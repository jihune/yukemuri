import {hasCrawlAccess} from '@/lib/crawl-access';
import {favoritesDb} from '@/lib/favorites-db';
import {hotelRepository,invalidateSearch} from '@/lib/hotel-repository';
import {sourceGroupPatch,saveSourceGroup,refreshSourceGroupIndexes,sourceGroupsFor} from '@/lib/hotel-source-groups';
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const after=new URL(request.url).searchParams.get('after')??'';if(after&&!/^[a-zA-Z0-9-]{1,120}$/.test(after))return Response.json({error:'Invalid cursor'},{status:400});
 await hotelRepository.ready();
 const rows=await favoritesDb().prepare('SELECT * FROM hotel_source_groups WHERE hotel_id>? ORDER BY hotel_id LIMIT 101').bind(after).all<{hotel_id:string}>();
 const groups=rows.results.slice(0,100);return Response.json({groups,next:rows.results.length>100?groups.at(-1)!.hotel_id:null},{headers:{'Cache-Control':'no-store'}});
}
export async function PUT(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw;try{const text=await request.text();if(text.length>16000)return Response.json({error:'Evidence too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const parsed=sourceGroupPatch.safeParse(raw);if(!parsed.success)return Response.json({error:'Verified same-property and inventory evidence required'},{status:400});
 try{await hotelRepository.ready();const result=await saveSourceGroup(parsed.data);if(result==='unknown')return Response.json({error:'Unknown hotel'},{status:404});if(['stale','identity','conflict'].includes(result))return Response.json({error:'Source identity conflicts or changed; review current evidence'},{status:409});invalidateSearch();return Response.json({result,hotel:await hotelRepository.get(parsed.data.hotelId)})}catch(e){console.error('Source link save failed');return Response.json({error:'Source links unavailable'},{status:503})}
}
export async function DELETE(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const id=new URL(request.url).searchParams.get('hotelId');if(!id||!/^[a-zA-Z0-9-]{1,120}$/.test(id))return Response.json({error:'Hotel ID required'},{status:400});
 await hotelRepository.ready();const groups=await sourceGroupsFor([id]),group=groups.find(g=>g.hotel_id===id);if(!group)return Response.json({error:'Unknown source group'},{status:404});
 await favoritesDb().prepare('DELETE FROM hotel_source_groups WHERE hotel_id=?').bind(id).run();
 await refreshSourceGroupIndexes([id,group.trip_hotel_id,group.jalan_hotel_id].filter(Boolean) as string[],true);
 await favoritesDb().prepare('DELETE FROM hotel_result_sessions').run();invalidateSearch();return Response.json({removed:true});
}
