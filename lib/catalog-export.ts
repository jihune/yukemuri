import {favoritesDb} from './favorites-db';
export const EXPORT_TABLES={
 hotel_source_groups:['hotel_id'],
 hotel_source_observations:['id'],
 hotel_lifecycle:['hotel_id'],hotel_lifecycle_events:['id'],
 hotels:['id'],hotel_names:['hotel_id','name_key'],catalog_meta:['key'],crawl_jobs:['url'],
 favorites:['hotel_id'],visitor_favorites:['visitor_key','hotel_id'],
 hotel_name_localizations:['hotel_id'],hotel_description_translations:['hotel_id'],hotel_description_requests:['hotel_id'],
} as const;
export type ExportTable=keyof typeof EXPORT_TABLES;
// Every table in db/schema.ts is exported or listed here with its reason
// (scripts/check-checkpoint.py, V02-09).
export const EXCLUDED_TABLES={
 price_quotes:'temporary price quotes, fetched again on demand',
 hotel_result_sessions:'temporary search result sessions',
 hotel_locale_names:'Korean and English names collected again from Jalan; the runner restores into its own 0012 migrations (D07 progress 5)',
} as const;
export async function exportManifest(){
 const db=favoritesDb(),tables=[];
 for(const [name,key] of Object.entries(EXPORT_TABLES)){
  const columns=await db.prepare(`PRAGMA table_info(${name})`).all<{name:string}>();
  const count=await db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).first<{count:number}>();
  tables.push({name,key,columns:columns.results.map(c=>c.name),count:count?.count??0});
 }
 return{format:'yukemuri-checkpoint',version:1,consistency:'non_atomic',schema:'0012',generatedAt:new Date().toISOString(),tables,excluded:Object.keys(EXCLUDED_TABLES),note:'Rows are read over multiple requests. Matching counts do not prove a single point-in-time snapshot.'};
}
export async function exportTablePage(table:ExportTable,after:string[]|undefined,limit:number){
 const key=EXPORT_TABLES[table],db=favoritesDb();
 const where=after?`WHERE (${key.join(',')}) > (${key.map(()=>'?').join(',')})`:'';
 // SQL names only come from the allowlist; cursor values are always bound.
 const queryLimit=table==='hotels'?Math.min(limit,250):limit;
 const result=await db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${key.join(',')} LIMIT ?`).bind(...(after??[]),queryLimit+1).all<Record<string,unknown>>();
 const rows:Record<string,unknown>[]=[],encoder=new TextEncoder();let bytes=100;
 for(const row of result.results.slice(0,queryLimit)){
  const size=encoder.encode(JSON.stringify(row)).length+1;
  if(bytes+size>900000){if(!rows.length)throw new Error('Export row exceeds the response limit');break}
  rows.push(row);bytes+=size;
 }
 const last=rows.at(-1);
 return{table,rows,next:result.results.length>rows.length&&last?key.map(k=>String(last[k])):null};
}
