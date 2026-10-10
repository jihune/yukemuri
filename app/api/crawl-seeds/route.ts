import {z} from 'zod';
import {publicUrl} from '@/lib/crawl-contract';
import {PREFECTURES} from '@/lib/hotel-types';
import {hasCrawlAccess} from '@/lib/crawl-access';
import {hotelRepository} from '@/lib/hotel-repository';
import {favoritesDb} from '@/lib/favorites-db';
import {collectionPriority} from '@/lib/collection-priorities';
import {jobIdentity} from '@/lib/crawl-queue';
const seed=z.object({url:publicUrl,prefecture:z.string().refine(p=>PREFECTURES.some(v=>v.id===p))}).strict();
export async function PUT(request:Request){
 if(!hasCrawlAccess(request))return Response.json({error:'Maintenance access required'},{status:403});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let raw;try{const text=await request.text();if(text.length>3000)return Response.json({error:'Seed too large'},{status:413});raw=JSON.parse(text)}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const parsed=seed.safeParse(raw);if(!parsed.success)return Response.json({error:'A verified Japanese source and prefecture are required'},{status:400});
 try{await hotelRepository.ready();const p=parsed.data;
 const inserted=await favoritesDb().prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,priority,status,attempts,next_at) VALUES (?,?,?,?,?,'pending',0,0) ON CONFLICT(url) DO NOTHING").bind(p.url,new URL(p.url).hostname==='www.jalan.net'?'jalan':'trip',jobIdentity(p.url)?'detail':'list',p.prefecture,collectionPriority(p.prefecture,p.url)).run();
 return Response.json({queued:!!inserted.meta.changes,url:p.url});
 }catch(e){console.error('Discovery seed unavailable',e);return Response.json({error:'Discovery seed unavailable'},{status:503})}
}
