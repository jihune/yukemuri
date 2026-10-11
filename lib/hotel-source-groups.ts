import {favoritesDb} from './favorites-db';
import type {Hotel,FeatureKey} from './hotel-types';
import {enrichHotel} from './hotel-enrichment';
import {composePreferredHotel} from './source-policy';
import {sourceGroupPatch,type SourceGroupPatch} from './source-group-contract';
import {normalizeSearch,hotelNames} from './hotel-names';
import {featureMasks,hotelFeature,enrichBathFacts} from './hotel-bath-facts';
import {providerRating} from './hotel-ratings';
export {sourceGroupPatch};
type Group={hotel_id:string;trip_hotel_id:string|null;jalan_hotel_id:string|null;google_place_id:string|null;payload:string;checked_at:string};
const idsFor=(g:Group)=>[g.hotel_id,g.trip_hotel_id,g.jalan_hotel_id].filter(Boolean) as string[];
export async function sourceGroupsFor(ids:string[]){
 if(!ids.length)return[];
 const json=JSON.stringify(ids);
 return(await favoritesDb().prepare('SELECT * FROM hotel_source_groups WHERE hotel_id IN (SELECT value FROM json_each(?)) OR trip_hotel_id IN (SELECT value FROM json_each(?)) OR jalan_hotel_id IN (SELECT value FROM json_each(?))').bind(json,json,json).all<Group>()).results;
}
export async function attachSourceGroups(hotels:Hotel[]):Promise<Hotel[]>{
 if(!hotels.length)return hotels;
 const groups=await sourceGroupsFor(hotels.map(h=>h.id)),ids=[...new Set(groups.flatMap(idsFor))];
 const rows=ids.length?(await favoritesDb().prepare("SELECT h.id,h.payload,t.text_ko,t.translated_at FROM hotels h LEFT JOIN hotel_description_translations t ON t.hotel_id=h.id AND t.source_text=json_extract(h.payload,'$.description') WHERE h.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all<{id:string;payload:string;text_ko:string|null;translated_at:string|null}>()).results:[];
 const observations=ids.length?(await favoritesDb().prepare('SELECT id,payload FROM hotel_source_observations WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{id:string;payload:string}>()).results:[];
 const byId=new Map(rows.map(row=>{const h=enrichBathFacts(JSON.parse(row.payload) as Hotel);if(row.text_ko&&row.translated_at)h.descriptionTranslation={text:row.text_ko,translatedAt:row.translated_at};return[row.id,h]}));
 for(const row of observations)byId.set(row.id,enrichBathFacts(JSON.parse(row.payload) as Hotel));
 return hotels.map(h=>{const g=groups.find(g=>idsFor(g).includes(h.id));const linked=g?idsFor(g).flatMap(id=>{const peer=byId.get(id);return peer?[peer]:[]}):[];const result=composePreferredHotel(h,linked);return g?.google_place_id?{...result,googlePlaceId:g.google_place_id}:result});
}
export async function writeLinkedSourceObservations(observations:Hotel[]){
 if(!observations.length)return{accepted:0,hotelIds:[] as string[]};
 const groups=await sourceGroupsFor(observations.map(h=>h.id));
 // Only previously verified exact provider IDs may update a curated property.
 const linked=observations.filter(h=>groups.some(g=>g.hotel_id!==h.id&&(g.trip_hotel_id===h.id||g.jalan_hotel_id===h.id)));
 const db=favoritesDb();let accepted=0;const updated:string[]=[];
 for(const h of linked){
  const at=h.sources[0].retrievedAt;
  const result=await db.prepare("INSERT INTO hotel_source_observations(id,payload,observed_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,observed_at=excluded.observed_at WHERE julianday(excluded.observed_at)>=julianday(hotel_source_observations.observed_at) AND (json_extract(hotel_source_observations.payload,'$.sources[0].label') NOT LIKE '%상세%' OR json_extract(excluded.payload,'$.sources[0].label') LIKE '%상세%')").bind(h.id,JSON.stringify(h),at).run();
  if(result.meta.changes){accepted++;updated.push(h.id)}
 }
 if(updated.length)await refreshSourceGroupIndexes(updated);
 return{accepted,hotelIds:[...new Set(groups.filter(g=>updated.includes(g.trip_hotel_id??'')||updated.includes(g.jalan_hotel_id??'')).map(g=>g.hotel_id))]};
}
// Only materialized search columns change. Original provider observations,
// descriptions, IDs, source dates and favorites stay in their own rows.
export async function refreshSourceGroupIndexes(ids:string[],force=false){
 const groups=await sourceGroupsFor(ids),members=[...new Set([...ids,...groups.flatMap(idsFor)])];
 if(!members.length||!groups.length&&!force)return;
 const rows=await favoritesDb().prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(members)).all<{id:string;payload:string}>();
 const hotels=await attachSourceGroups(rows.results.map(r=>enrichHotel(JSON.parse(r.payload) as Hotel)));
 const core={natural:'natural',largeBath:'large_bath',outdoor:'outdoor',privateBath:'private_bath',roomOnsen:'room_onsen',roomOutdoor:'room_outdoor'};
 await favoritesDb().batch(hotels.map((h,i)=>{
  const trip=providerRating(h,'trip'),jalan=providerRating(h,'jalan'),mask=featureMasks(h);
  const assignments=['trip_score=?','trip_reviews=?','jalan_score=?','jalan_reviews=?','bath_features=?','bath_known=?',...Object.values(core).map(c=>c+'=?')];
  const values=[trip?.score??null,trip?.reviewCount??null,jalan?.score??null,jalan?.reviewCount??null,mask.features,mask.knownFeatures,...Object.keys(core).map(k=>{const value=hotelFeature(h,k as FeatureKey).value;return value===null?null:Number(value)})];
  return favoritesDb().prepare('UPDATE hotels SET '+assignments.join(',')+' WHERE id=? AND payload=?').bind(...values,h.id,rows.results[i].payload);
 }));
}
export async function importVerifiedSourceGroups(){
 const db=favoritesDb(),key='verified-source-groups-v1';
 if(await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first())return;
 const {catalogHotels}=await import('./hotel-catalog');
 const groups=catalogHotels.flatMap(h=>{
  const trip=h.links.find(l=>l.provider==='trip')?.url?.match(/-hotel-detail-(\d+)\//)?.[1],jalan=h.links.find(l=>l.provider==='jalan')?.url?.match(/\/yad(\d+)\//)?.[1];
  if(!trip||!jalan)return[];
  const source=h.sources.find(s=>s.url&&s.verifiedAt&&!s.isMock);
  if(!source?.url)return[];
  const p:SourceGroupPatch={hotelId:h.id,tripHotelId:'trip-'+trip,jalanHotelId:'jalan-'+jalan,matchedName:h.names.ja,sourceUrl:source.url,sourceLabel:'기존 검증 숙소의 공급자별 상세 링크',identityEvidence:'기존 검증 숙소에 저장된 이름·주소와 두 공급자의 정확한 숙소 상세 ID를 사용합니다. 이름 유사도만으로 연결하지 않습니다.',sameInventory:true,checkedAt:source.retrievedAt};
  return[{hotelId:h.id,tripHotelId:p.tripHotelId,jalanHotelId:p.jalanHotelId,payload:JSON.stringify(p),checkedAt:p.checkedAt}];
 });
 await db.prepare("INSERT INTO hotel_source_groups(hotel_id,trip_hotel_id,jalan_hotel_id,payload,checked_at) SELECT json_extract(value,'$.hotelId'),json_extract(value,'$.tripHotelId'),json_extract(value,'$.jalanHotelId'),json_extract(value,'$.payload'),json_extract(value,'$.checkedAt') FROM json_each(?) WHERE json_extract(value,'$.hotelId') IN (SELECT id FROM hotels) ON CONFLICT DO NOTHING").bind(JSON.stringify(groups)).run();
 await refreshSourceGroupIndexes(groups.map(g=>g.hotelId));
 await db.prepare('INSERT INTO catalog_meta(key,value) VALUES (?,?) ON CONFLICT DO NOTHING').bind(key,'done').run();
}
export async function saveSourceGroup(p:SourceGroupPatch){
 const db=favoritesDb(),base=await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(p.hotelId).first<{payload:string}>();
 if(!base)return'unknown';
 const hotel=JSON.parse(base.payload) as Hotel;
 if(!hotelNames(hotel).some(n=>normalizeSearch(n)===normalizeSearch(p.matchedName)))return'identity';
 const current=await db.prepare('SELECT * FROM hotel_source_groups WHERE hotel_id=?').bind(p.hotelId).first<Group>();
 if(current&&Date.parse(current.checked_at)>=Date.parse(p.checkedAt))return current.payload===JSON.stringify(p)?'replayed':'stale';
 const others=await sourceGroupsFor([p.hotelId,...[p.tripHotelId,p.jalanHotelId].filter(Boolean) as string[]]);
 if(others.some(g=>g.hotel_id!==p.hotelId))return'conflict';
 const peers=await db.prepare('SELECT payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([p.tripHotelId,p.jalanHotelId].filter(Boolean))).all<{payload:string}>();
 if(peers.results.some(r=>{const peer=JSON.parse(r.payload) as Hotel;return hotel.prefecture&&peer.prefecture&&hotel.prefecture!==peer.prefecture}))return'identity';
 try{
  const saved=await db.prepare('INSERT INTO hotel_source_groups(hotel_id,trip_hotel_id,jalan_hotel_id,google_place_id,payload,checked_at) VALUES (?,?,?,?,?,?) ON CONFLICT(hotel_id) DO UPDATE SET trip_hotel_id=excluded.trip_hotel_id,jalan_hotel_id=excluded.jalan_hotel_id,google_place_id=excluded.google_place_id,payload=excluded.payload,checked_at=excluded.checked_at WHERE julianday(excluded.checked_at)>julianday(hotel_source_groups.checked_at)').bind(p.hotelId,p.tripHotelId??null,p.jalanHotelId??null,p.googlePlaceId??null,JSON.stringify(p),p.checkedAt).run();
  if(!saved.meta.changes)return'stale';
 }catch(e){if(String(e).includes('UNIQUE constraint'))return'conflict';throw e}
 await refreshSourceGroupIndexes([...idsFor(current??{hotel_id:p.hotelId,trip_hotel_id:null,jalan_hotel_id:null} as Group),p.tripHotelId??p.hotelId,p.jalanHotelId??p.hotelId]);
 await db.batch([db.prepare('DELETE FROM hotel_result_sessions'),db.prepare('DELETE FROM hotel_search_results')]);return'saved';
}
