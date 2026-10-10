import {favoritesDb} from './favorites-db';

export async function visitorKey(request:Request){
 const token=request.headers.get('X-Yukemuri-Visitor');
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function visitorFavoriteIds(request:Request){
 const key=await visitorKey(request);if(!key)return [];
 const rows=await favoritesDb().prepare('SELECT v.hotel_id FROM visitor_favorites v JOIN hotels h ON h.id=v.hotel_id WHERE v.visitor_key=? ORDER BY v.created_at DESC,v.hotel_id').bind(key).all<{hotel_id:string}>();
 return rows.results.map(row=>row.hotel_id);
}
