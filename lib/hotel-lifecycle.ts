import {lifecyclePatch,type LifecyclePatch} from './lifecycle-contract';
export {lifecyclePatch};
export type {LifecyclePatch};
import {favoritesDb} from './favorites-db';
import type {Hotel,HotelLifecycle} from './hotel-types';
export async function observeHotelPresence(hotels:Hotel[],detail:boolean){
 if(!hotels.length)return;
 // Presence on an OTA proves source presence only. It never reopens a closed
 // property, or proves the original opening date.
 const rows=hotels.map(h=>({id:h.id,at:h.sources[0].retrievedAt,detail:detail?h.sources[0].retrievedAt:null}));
 await favoritesDb().prepare(`INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,last_detail_at)
  SELECT json_extract(value,'$.id'),json_extract(value,'$.at'),json_extract(value,'$.at'),json_extract(value,'$.detail') FROM json_each(?) WHERE 1
  ON CONFLICT(hotel_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,last_detail_at=CASE WHEN excluded.last_detail_at IS NOT NULL THEN excluded.last_detail_at ELSE hotel_lifecycle.last_detail_at END,
  missing_count=CASE WHEN excluded.last_detail_at IS NOT NULL THEN 0 ELSE hotel_lifecycle.missing_count END,missing_at=CASE WHEN excluded.last_detail_at IS NOT NULL THEN NULL ELSE hotel_lifecycle.missing_at END
  WHERE julianday(excluded.last_seen_at)>=julianday(hotel_lifecycle.last_seen_at)`).bind(JSON.stringify(rows)).run();
}
export async function observeMissingSource(id:string,token:string){
 // 404/410 are review signals. Preserve hotel/favorites and any official state.
 const db=favoritesDb(),at=new Date().toISOString(),eventId='missing:'+token;
 await db.batch([
 db.prepare(`INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,missing_count,missing_at)
 SELECT id,COALESCE(json_extract(payload,'$.sources[0].retrievedAt'),?),COALESCE(json_extract(payload,'$.sources[0].retrievedAt'),?),1,? FROM hotels WHERE id=? AND NOT EXISTS (SELECT 1 FROM hotel_lifecycle_events WHERE id=?)
 ON CONFLICT(hotel_id) DO UPDATE SET missing_count=hotel_lifecycle.missing_count+1,missing_at=excluded.missing_at`).bind(at,at,at,id,eventId),
 db.prepare("INSERT INTO hotel_lifecycle_events(id,hotel_id,checked_at,payload) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM hotels WHERE id=?) ON CONFLICT(id) DO NOTHING").bind(eventId,id,at,JSON.stringify({kind:'source_missing',id,checkedAt:at}),id),
 ]);
}
export async function attachLifecycle(hotels:Hotel[]):Promise<Hotel[]>{
 if(!hotels.length)return hotels;
 const rows=await favoritesDb().prepare('SELECT * FROM hotel_lifecycle WHERE hotel_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(hotels.map(h=>h.id))).all<Record<string,unknown>>();
 const byId=new Map(rows.results.map(r=>[r.hotel_id,r]));
 return hotels.map(h=>withLifecycle(h,byId.get(h.id)));
}
// A hotel with its hotel_lifecycle row, or as it is without one. The snapshot
// builder reads the rows by id range and attaches them the same way (P04).
export function withLifecycle(h:Hotel,r:Record<string,unknown>|undefined):Hotel{
 if(!r)return h;
 return{...h,lifecycle:{state:r.state as HotelLifecycle['state'],firstSeenAt:String(r.first_seen_at),lastSeenAt:String(r.last_seen_at),lastDetailAt:r.last_detail_at as string|null,reviewNeeded:Number(r.missing_count)>0,checkedAt:r.checked_at as string|null,...(r.evidence?{evidence:JSON.parse(String(r.evidence))}: {})}};
}
export async function saveLifecyclePatch(patch:LifecyclePatch){
 const db=favoritesDb(),hotel=await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(patch.id).first<{payload:string}>();
 if(!hotel)return'unknown';
 const current=await db.prepare('SELECT checked_at,evidence FROM hotel_lifecycle WHERE hotel_id=?').bind(patch.id).first<{checked_at:string|null;evidence:string|null}>();
 const payload=JSON.stringify(patch);
 if(current?.checked_at&&Date.parse(current.checked_at)>=Date.parse(patch.checkedAt))return current.evidence===payload?'replayed':'stale';
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
 const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const firstSeen=(JSON.parse(hotel.payload) as Hotel).sources[0].retrievedAt;
 const updates=await db.batch([
 db.prepare(`INSERT INTO hotel_lifecycle(hotel_id,first_seen_at,last_seen_at,state,checked_at,evidence) VALUES (?,?,?,?,?,?)
 ON CONFLICT(hotel_id) DO UPDATE SET state=excluded.state,checked_at=excluded.checked_at,evidence=excluded.evidence
 WHERE hotel_lifecycle.checked_at IS NULL OR julianday(excluded.checked_at)>julianday(hotel_lifecycle.checked_at)`).bind(patch.id,firstSeen,firstSeen,patch.state,patch.checkedAt,payload),
 db.prepare(`INSERT INTO hotel_lifecycle_events(id,hotel_id,checked_at,payload) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM hotel_lifecycle WHERE hotel_id=? AND evidence=?) ON CONFLICT(id) DO NOTHING`).bind(id,patch.id,patch.checkedAt,payload,patch.id,payload),
 ]);
 return updates[0].meta.changes?'saved':'stale';
}
