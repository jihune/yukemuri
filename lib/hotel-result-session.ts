import {attachLifecycle} from './hotel-lifecycle';
import {attachSourceGroups} from './hotel-source-groups';
import {favoritesDb} from './favorites-db';
import {enrichHotel} from './hotel-enrichment';
import type {Hotel,HotelFilters} from './hotel-types';
import type {SortOrder} from './hotel-search';
import type {SearchResponse} from './hotel-repository';

const TTL_SECONDS=20*60,MAX_SESSIONS=256,MAX_IDS=50000;
export type SearchOptions={stable?:boolean;snapshot?:string;scope?:string;fresh?:boolean};
export class ResultSessionError extends Error{
 constructor(public status:number,message:string){super(message)}
}
type Metadata=Omit<SearchResponse,'hotels'|'page'|'snapshot'>;
export async function resultQueryKey(filters:HotelFilters,sort:SortOrder,savedOnly:boolean,savedIds:string[],scope=''){
 const input=JSON.stringify([{...filters,features:[...new Set(filters.features)].sort()},sort,savedOnly,savedOnly?[...new Set(savedIds)].sort():[],savedOnly?scope:'']);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function createResultSession(queryKey:string,ids:string[],metadata:Metadata){
 if(ids.length>MAX_IDS||new TextEncoder().encode(JSON.stringify(ids)+JSON.stringify(metadata)).length>1000000)throw new ResultSessionError(422,'검색 범위가 너무 넓습니다. 지역이나 조건을 선택해 주세요.');
 const now=Math.floor(Date.now()/1000),token=crypto.randomUUID(),db=favoritesDb();
 await db.batch([
  db.prepare('INSERT INTO hotel_result_sessions(token,query_key,ids,metadata,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(token,queryKey,JSON.stringify(ids),JSON.stringify(metadata),now,now+TTL_SECONDS),
  db.prepare('DELETE FROM hotel_result_sessions WHERE expires_at<=?').bind(now),
  db.prepare('DELETE FROM hotel_result_sessions WHERE token IN (SELECT token FROM hotel_result_sessions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)').bind(MAX_SESSIONS),
 ]);
 return{token,createdAt:new Date(now*1000).toISOString(),expiresAt:new Date((now+TTL_SECONDS)*1000).toISOString()};
}
export async function readResultSession(token:string,queryKey:string,page:number):Promise<SearchResponse>{
 const row=await favoritesDb().prepare('SELECT query_key,ids,metadata,created_at,expires_at FROM hotel_result_sessions WHERE token=?').bind(token).first<{query_key:string;ids:string;metadata:string;created_at:number;expires_at:number}>();
 if(!row||row.expires_at<=Date.now()/1000)throw new ResultSessionError(410,'목록 유지 시간이 끝났습니다. 목록을 새로고침해 주세요.');
 if(row.query_key!==queryKey)throw new ResultSessionError(409,'검색 조건이나 즐겨찾기가 바뀌었습니다. 목록을 새로고침해 주세요.');
 const ids=JSON.parse(row.ids) as string[],metadata=JSON.parse(row.metadata) as Metadata;
 if(page>Math.max(1,Math.ceil(ids.length/metadata.pageSize)))throw new ResultSessionError(400,'목록 범위를 벗어난 페이지입니다.');
 const pageIds=ids.slice((page-1)*metadata.pageSize,page*metadata.pageSize);
 const hotels=await hotelsInOrder(pageIds);
 if(hotels.length!==pageIds.length)throw new ResultSessionError(409,'숙소 목록이 변경되었습니다. 목록을 새로고침해 주세요.');
 return{...metadata,hotels,page,similarHotelIds:(metadata.similarHotelIds??[]).filter(id=>pageIds.includes(id)),snapshot:{token,createdAt:new Date(row.created_at*1000).toISOString(),expiresAt:new Date(row.expires_at*1000).toISOString()}};
}
export async function hotelsInOrder(ids:string[]):Promise<Hotel[]>{
 if(!ids.length)return[];
 const rows=await favoritesDb().prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{id:string;payload:string}>();
 const byId=new Map(rows.results.map(row=>[row.id,enrichHotel(JSON.parse(row.payload) as Hotel)]));
 return attachLifecycle(await attachSourceGroups(ids.flatMap(id=>{const hotel=byId.get(id);return hotel?[hotel]:[]})));
}
