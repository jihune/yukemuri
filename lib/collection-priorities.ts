import seeds from '../data/priority-source-seeds.json';
import plan from '../data/collection-priorities.json';
import type {Hotel} from './hotel-types';
import {favoritesDb} from './favorites-db';
export {plan as collectionPlan};
export function collectionPriority(prefecture:string|null,url:string,hotel?:Pick<Hotel,'names'|'location'>){
 const text=hotel?Object.values(hotel.names).join(' ')+' '+hotel.location.label+' '+hotel.location.address:url;
 for(const town of plan.towns)if(prefecture===town.prefecture&&(town.listPrefix&&url.startsWith(town.listPrefix)||town.terms.some(term=>text.toLowerCase().includes(term.toLowerCase()))))return town.priority;
 return plan.primaryPrefectures.includes(prefecture??'')?20:plan.secondaryPrefectures.includes(prefecture??'')?40:plan.tertiaryPrefectures.includes(prefecture??'')?60:90;
}
export function refreshDays(priority:number){return priority<=10?plan.refreshDays.onsen:priority<=20?plan.refreshDays.primary:priority<=40?plan.refreshDays.secondary:priority<=60?plan.refreshDays.tertiary:plan.refreshDays.national}
export const refreshIntervalSql=`CASE WHEN j.priority<=10 THEN ${plan.refreshDays.onsen*86400} WHEN j.priority<=20 THEN ${plan.refreshDays.primary*86400} WHEN j.priority<=40 THEN ${plan.refreshDays.secondary*86400} WHEN j.priority<=60 THEN ${plan.refreshDays.tertiary*86400} ELSE ${plan.refreshDays.national*86400} END`;
// The primary-key join uses raw names/address, never prefecture-wide search
// aliases (which contain many other towns and would falsely boost every hotel).
export async function prepareCollectionPriorities(){
 const db=favoritesDb(),key='collection-priority:'+plan.version;
 const state=await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first<{value:string}>();
 if(state?.value==='done')return {done:true,processed:0,cursor:'done'};
 const cursor=state?.value??'';
 if(!cursor){
  const input=seeds.map(seed=>({...seed,priority:collectionPriority(seed.prefecture,seed.url)}));
  await db.prepare("INSERT INTO crawl_jobs(url,provider,kind,prefecture,status,attempts,next_at,priority) SELECT json_extract(value,'$.url'),'jalan',json_extract(value,'$.kind'),json_extract(value,'$.prefecture'),'pending',0,0,json_extract(value,'$.priority') FROM json_each(?) WHERE 1 ON CONFLICT(url) DO NOTHING").bind(JSON.stringify(input)).run();
 }
 const rows=await db.prepare(`SELECT j.url,COALESCE(j.prefecture,h.prefecture) AS prefecture,json_extract(h.payload,'$.names') AS names,json_extract(h.payload,'$.location') AS location FROM crawl_jobs j LEFT JOIN hotels h ON h.id=CASE WHEN j.provider='jalan' THEN 'jalan-'||substr(j.url,26,instr(substr(j.url,26),'/')-1) ELSE 'trip-'||substr(j.url,instr(j.url,'-hotel-detail-')+14,instr(substr(j.url,instr(j.url,'-hotel-detail-')+14),'/')-1) END WHERE j.url>? ORDER BY j.url LIMIT 500`).bind(cursor).all<{url:string;prefecture:string|null;names:string|null;location:string|null}>();
 const changes=rows.results.map(r=>({url:r.url,priority:collectionPriority(r.prefecture,r.url,r.names&&r.location?{names:JSON.parse(r.names),location:JSON.parse(r.location)}:undefined)}));
 const next=rows.results.length<500?'done':rows.results.at(-1)!.url;
 const update=db.prepare("WITH changes AS (SELECT json_extract(value,'$.url') AS url,json_extract(value,'$.priority') AS priority FROM json_each(?)) UPDATE crawl_jobs SET priority=(SELECT priority FROM changes WHERE changes.url=crawl_jobs.url) WHERE url IN (SELECT url FROM changes)").bind(JSON.stringify(changes));
 const progress=db.prepare("INSERT INTO catalog_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE catalog_meta.value!='done' AND (excluded.value='done' OR catalog_meta.value<excluded.value)").bind(key,next);
 const statements=changes.length?[update]:[];
 if(next==='done')statements.push(db.prepare("UPDATE crawl_jobs SET next_at=? WHERE status='failed' AND next_at=0").bind(Date.now()/1000));
 statements.push(progress);await db.batch(statements);
 return {done:next==='done',processed:rows.results.length,cursor:next};
}
