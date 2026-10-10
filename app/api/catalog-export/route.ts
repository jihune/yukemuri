import {hasCrawlAccess} from '@/lib/crawl-access';
import {hotelRepository} from '@/lib/hotel-repository';
import {EXPORT_TABLES,exportManifest,exportTablePage,type ExportTable} from '@/lib/catalog-export';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403,headers});
 const params=new URL(request.url).searchParams,table=params.get('table'),limit=Number(params.get('limit')??100);
 if(table!==null&&!Object.hasOwn(EXPORT_TABLES,table)||!Number.isInteger(limit)||limit<1||limit>1000)return Response.json({error:'Invalid export table or limit'},{status:400,headers});
 let after:string[]|undefined;
 if(params.has('after')){
  try{after=JSON.parse(params.get('after')!)}catch{return Response.json({error:'Invalid cursor'},{status:400,headers})}
  if(!table||!Array.isArray(after)||after.length!==EXPORT_TABLES[table as ExportTable].length||after.some(k=>typeof k!=='string'||k.length>2000))return Response.json({error:'Invalid cursor'},{status:400,headers});
 }
 try{await hotelRepository.ready();return Response.json(table?await exportTablePage(table as ExportTable,after,limit):await exportManifest(),{headers})}
 catch(error){console.error('Catalogue export failed',error);return Response.json({error:'Export unavailable'},{status:503,headers})}
}
