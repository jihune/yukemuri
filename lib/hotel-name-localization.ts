import {z} from 'zod';
import type {Hotel} from './hotel-types';
const sourceUrl=z.string().max(2000).url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password},'Public HTTPS source required');
export const hotelNamePatch=z.object({
 id:z.string().min(1).max(100),nameKo:z.string().trim().min(2).max(180).regex(/[가-힣]/),
 aliases:z.array(z.string().trim().min(1).max(180)).max(12).default([]),
 matchedName:z.string().min(2).max(400),verifiedAt:z.string().datetime(),
 sourceUrl,sourceLabel:z.string().min(2).max(120),
 identityEvidence:z.string().min(10).max(600),
}).strict();
export const hotelNameUpdates=z.object({patches:z.array(hotelNamePatch).max(20).default([]),unavailableIds:z.array(z.string().min(1).max(100)).max(20).default([])}).strict().refine(value=>{const ids=[...value.patches.map(p=>p.id),...value.unavailableIds];return ids.length>0&&ids.length<=20&&new Set(ids).size===ids.length},'Invalid or duplicate hotel IDs');
export type HotelNamePatch=z.infer<typeof hotelNamePatch>;
export function applyNamePatch(hotel:Hotel,patch?:HotelNamePatch):Hotel{
 if(!patch)return hotel;
 const sourceId='ko-name:'+hotel.id;
 return{...hotel,names:{...hotel.names,ko:patch.nameKo},aliases:[...new Set([...(hotel.aliases??[]),...Object.values(hotel.names),...patch.aliases].filter(Boolean))],sources:[...hotel.sources.filter(s=>s.sourceId!==sourceId),{sourceId,sourceType:'web',label:patch.sourceLabel,retrievedAt:patch.verifiedAt,verifiedAt:patch.verifiedAt,url:patch.sourceUrl,nameLocaleUrl:patch.sourceUrl,isMock:false}]};
}
