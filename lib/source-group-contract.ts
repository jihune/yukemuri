import {z} from 'zod';
const hotelId=z.string().regex(/^[a-zA-Z0-9-]{1,120}$/);
export const sourceGroupPatch=z.object({
 hotelId,tripHotelId:z.string().regex(/^trip-\d+$/).optional(),jalanHotelId:z.string().regex(/^jalan-\d+$/).optional(),googlePlaceId:z.string().regex(/^[A-Za-z0-9_-]{10,250}$/).optional(),
 matchedName:z.string().min(1).max(400),sourceUrl:z.string().url().max(1500).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password}),sourceLabel:z.string().min(2).max(200),
 identityEvidence:z.string().min(20).max(2000),sameInventory:z.literal(true),checkedAt:z.string().datetime({offset:true}),
}).strict().refine(p=>!!(p.tripHotelId||p.jalanHotelId||p.googlePlaceId),'Verified provider identity required').refine(p=>Date.parse(p.checkedAt)<=Date.now()+60000);
export type SourceGroupPatch=z.infer<typeof sourceGroupPatch>;
