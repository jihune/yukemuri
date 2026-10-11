import {favoritesDb} from './favorites-db';
import type {Hotel} from './hotel-types';
// The search columns of every hotel, kept in 64 rows of hotel_search_chunks by
// the triggers of migration 0014 (hotels, hotel_names, hotel_lifecycle). An
// isolate reads the 64 versions per request and only the chunks that changed,
// so list, map and name searches no longer read the catalogue table by table.
export type SnapshotCore=[region:string,prefecture:string|null,name:string,kind:string,tripScore:number|null,tripReviews:number|null,jalanScore:number|null,jalanReviews:number|null,natural:number|null,bathFeatures:number|null,bathKnown:number|null,lat:number|null,lng:number|null,state:string|null];
export type SnapshotText=[searchText:string,names:Hotel['names'],location:Hotel['location'],aliases:[nameKey:string,name:string][]|null];
export type SnapshotRow={id:string;core:SnapshotCore;text?:SnapshotText};
const CHUNKS=64;
type Chunk={version:number;core:Record<string,SnapshotCore>;text?:Record<string,SnapshotText>};
const chunks=new Map<number,Chunk>();
let rows:SnapshotRow[]|null=null,generation=0,queue:Promise<unknown>=Promise.resolve();
// SQLite BINARY order (UTF-8 bytes, i.e. code points) for ORDER BY on text.
export function compareText(a:string,b:string){
 for(let i=0,n=Math.min(a.length,b.length);i<n;i++){
  let x=a.charCodeAt(i),y=b.charCodeAt(i);if(x===y)continue;
  // Surrogate pairs encode code points above U+FFFF.
  if(x>=0xd800&&y>=0xd800){x+=x<0xe000?0x2000:-0x800;y+=y<0xe000?0x2000:-0x800}
  return x-y;
 }
 return a.length-b.length;
}
// One statement, so concurrent writers either land before it and are read, or
// after it and update the chunk rows through the triggers. A new random base
// version makes every isolate reload the rebuilt chunks.
async function build(){
 await favoritesDb().prepare(`WITH RECURSIVE c(chunk) AS (SELECT 0 UNION ALL SELECT chunk+1 FROM c WHERE chunk<${CHUNKS-1}),
  g AS MATERIALIZED (SELECT chunk,json_group_object(id,json(core)) AS core,json_group_object(id,json(text)) AS text FROM hotel_search_rows GROUP BY chunk)
  INSERT INTO hotel_search_chunks (chunk,version,core,text) SELECT c.chunk,?,COALESCE(g.core,'{}'),COALESCE(g.text,'{}') FROM c LEFT JOIN g ON g.chunk=c.chunk WHERE 1
  ON CONFLICT(chunk) DO UPDATE SET version=excluded.version,core=excluded.core,text=excluded.text`).bind(Date.now()*1000+Math.floor(Math.random()*1000)).run();
}
async function sync(withText:boolean){
 const db=favoritesDb(),read=()=>db.prepare('SELECT chunk,version FROM hotel_search_chunks').all<{chunk:number;version:number}>();
 let versions=(await read()).results;
 if(versions.length!==CHUNKS){await build();versions=(await read()).results}
 const stale=versions.filter(v=>{const c=chunks.get(v.chunk);return!c||c.version!==v.version||withText&&!c.text});
 if(!stale.length)return;
 const fetched=await db.prepare(`SELECT chunk,version,core${withText?',text':''} FROM hotel_search_chunks WHERE chunk IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(stale.map(v=>v.chunk))).all<{chunk:number;version:number;core:string;text?:string}>();
 for(const r of fetched.results)chunks.set(r.chunk,{version:r.version,core:JSON.parse(r.core),text:r.text===undefined?undefined:JSON.parse(r.text)});
 rows=null;generation++;
}
// Rows in id order, assembled in the same queued step as their sync, so a
// concurrent sync without text cannot drop text from rows a caller asked for.
export async function searchSnapshot(withText=false){
 const run=queue.then(async()=>{
  await sync(withText);
  if(!rows){
   rows=[];
   for(const c of chunks.values())for(const [id,core] of Object.entries(c.core))rows.push({id,core,text:c.text?.[id]});
   rows.sort((a,b)=>compareText(a.id,b.id));
  }
  return{rows,generation};
 });
 queue=run.catch(()=>{});
 return run;
}
