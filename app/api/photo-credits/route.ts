import { favoritesDb } from '@/lib/favorites-db';
import { RECORD_COUNTER } from '@/lib/hotel-repository';
import type { Hotel } from '@/lib/hotel-types';
import { displayNames } from '@/lib/hotel-names';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
// Photo sources, 40 hotels at a time in id order. A page is read by the primary
// key after the cursor and the total is the collector's record counter, so any
// page reads about 41 rows (P03); the former OFFSET read every row before it.
// `page=1` (the former first page) is still accepted.
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,after=params.get('after')??'';
 if([...params.keys()].some(key=>key!=='after'&&!(key==='page'&&params.get('page')==='1'&&!params.has('after')))||params.getAll('after').length>1||after&&!/^[a-zA-Z0-9-]{1,120}$/.test(after))return Response.json({error:'Invalid cursor; follow `next`'},{status:400,headers});
 try{
  const db=favoritesDb();
  const [counter,rows]=await db.batch([db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(RECORD_COUNTER),db.prepare('SELECT id,payload FROM hotels WHERE id>? ORDER BY id LIMIT 41').bind(after)]);
  const found=rows.results as {id:string;payload:string}[],page=found.slice(0,40),count=(counter.results as {value:string}[])[0]?.value;
  return Response.json({
   // null until the collector's first full count sets the counter.
   total:count===undefined?null:Number(count),
   next:found.length>40?'/api/photo-credits?after='+encodeURIComponent(page.at(-1)!.id):null,
   items:page.map(r=>{const h=JSON.parse(r.payload) as Hotel,s=h.sources.find(s=>s.sourceId===h.image.sourceId);return{hotelId:h.id,name:displayNames(h.names).title,imageUrl:h.image.url,sourceUrl:s?.url??null,credit:s?.label??null,retrievedAt:s?.retrievedAt??null,rights:'사진 저작권은 원출처에 있습니다.'}}),
  },{headers});
 }catch(error){console.error('Photo credits failed',error);return Response.json({error:'Photo sources unavailable'},{status:503,headers})}
}
