import { favoritesDb } from '@/lib/favorites-db';
import { hotelRepository } from '@/lib/hotel-repository';
import type { Hotel } from '@/lib/hotel-types';
export async function GET(request:Request){
 const page=Number(new URL(request.url).searchParams.get('page')??1);if(!Number.isInteger(page)||page<1||page>100000)return Response.json({error:'Invalid page'},{status:400});
 try{await hotelRepository.ready();const db=favoritesDb();const total=await db.prepare('SELECT COUNT(*) AS count FROM hotels').first<{count:number}>();const rows=await db.prepare('SELECT payload FROM hotels ORDER BY id LIMIT 40 OFFSET ?').bind((page-1)*40).all<{payload:string}>();return Response.json({page,total:total?.count??0,next:page*40<(total?.count??0)?'/api/photo-credits?page='+(page+1):null,items:rows.results.map(r=>{const h=JSON.parse(r.payload) as Hotel,s=h.sources.find(s=>s.sourceId===h.image.sourceId);return{hotelId:h.id,name:h.names.ko,imageUrl:h.image.url,sourceUrl:s?.url??null,credit:s?.label??null,retrievedAt:s?.retrievedAt??null,rights:'사진 저작권은 원출처에 있습니다.'}})})}catch(error){console.error('Photo credits failed',error);return Response.json({error:'Photo sources unavailable'},{status:503})}
}
