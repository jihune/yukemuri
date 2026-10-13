// The claim POST must pick the same job as the single-query selection it
// replaced (main 274f687, lib/crawl-queue.ts), for every provider, phase, lane
// and kind, over random queue states in a disposable D1. The reference query
// below is that former selection, copied verbatim, except that its baths
// condition follows the current Jalan parser version (v3 since D05).
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const plan=JSON.parse(readFileSync('data/collection-priorities.json','utf8'));
const refreshIntervalSql=`CASE WHEN j.priority<=10 THEN ${plan.refreshDays.onsen*86400} WHEN j.priority<=20 THEN ${plan.refreshDays.primary*86400} WHEN j.priority<=40 THEN ${plan.refreshDays.secondary*86400} WHEN j.priority<=60 THEN ${plan.refreshDays.tertiary*86400} ELSE ${plan.refreshDays.national*86400} END`;
function formerSelection(claim,now){
 const kind=claim.phase==='refresh'?(claim.kind??'any'):['names','baths'].includes(claim.phase)?'detail':claim.phase;
 const kindWhere=kind==='any'?"j.kind IN ('list','detail')":'j.kind=?';
 const kinds=kind==='any'?[]:[kind];
 const extra=claim.phase==='names'?"AND EXISTS (SELECT 1 FROM hotels h WHERE h.id='trip-'||substr(j.url,instr(j.url,'-hotel-detail-')+14,instr(substr(j.url,instr(j.url,'-hotel-detail-')+14),'/')-1) AND json_extract(h.payload,'$.links[0].url')=j.url AND json_extract(h.payload,'$.sources[0].nameLocaleUrl') IS NULL)":claim.phase==='baths'?"AND EXISTS (SELECT 1 FROM hotels h WHERE h.id='jalan-'||substr(j.url,26,instr(substr(j.url,26),'/')-1) AND json_extract(h.payload,'$.links[0].url')=j.url AND json_extract(h.payload,'$.sources[0].bathDataVersion') IS NOT 'v3' AND h.id NOT IN (SELECT value FROM json_each(?)))":'';
 const statuses=claim.phase==='refresh'?"('done','failed')":['names','baths'].includes(claim.phase)?"('done','pending','retry')":"('pending','retry')";
 const refresh=claim.phase==='refresh'?`AND ((j.status='done' AND COALESCE(unixepoch(j.fetched_at),0)+(${refreshIntervalSql})<=${now}) OR (j.status='failed' AND j.next_at>0))`:'';
 const missingLinkedDetail="CASE WHEN j.kind='detail' AND EXISTS (SELECT 1 FROM hotel_source_groups g LEFT JOIN hotels h ON h.id=CASE WHEN j.provider='trip' THEN g.trip_hotel_id ELSE g.jalan_hotel_id END WHERE (j.provider='trip' AND instr(j.url,'-hotel-detail-'||substr(g.trip_hotel_id,6)||'/')>0 OR j.provider='jalan' AND j.url='https://www.jalan.net/yad'||substr(g.jalan_hotel_id,7)||'/') AND (h.id IS NULL OR json_extract(h.payload,'$.sources[0].label') NOT LIKE '%상세%')) THEN 0 ELSE 1 END";
 const order=claim.lane==='national'?"CASE WHEN j.status='retry' THEN 0 ELSE 1 END,COALESCE(unixepoch(j.fetched_at),0),j.next_at,j.attempts,j.url":'j.priority,'+missingLinkedDetail+',COALESCE(unixepoch(j.fetched_at),0),j.attempts,j.url';
 return{sql:`SELECT j.url,${missingLinkedDetail} AS missing FROM crawl_jobs j WHERE j.provider=? AND ${kindWhere} AND j.status IN ${statuses} AND j.next_at<=? AND j.lease_until<=? ${extra} ${refresh} ${claim.url?'AND j.url=?':''} ORDER BY ${order} LIMIT 1`,
  args:[claim.provider,...kinds,now,now,...(claim.phase==='baths'?['[]']:[]),...(claim.url?[claim.url]:[])]};
}
// Deterministic states (mulberry32), so a failure can be replayed.
let seed=Number(process.env.CLAIM_ORDER_SEED??20261011);
const random=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};
const pick=list=>list[Math.floor(random()*list.length)];
const temp=mkdtempSync(join(tmpdir(),'yukemuri-claim-order-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'claim-order'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'claim-order-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const post=async claim=>{
  const r=await runtime.dispatchFetch('http://localhost/api/crawl',{method:'POST',headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':'claim-order-only'},body:JSON.stringify(claim)});
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body.jobs;
 };
 assert.equal((await runtime.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':'claim-order-only'}})).status,200);
 const ids=Array.from({length:14},(_,i)=>9100000+i*37),cities=['tokyo','osaka','hakone'];
 let claims=0,selected=0,missingWins=0,twoMarkers=0,blockedStates=0;
 for(let state=0;state<60;state++){
  const now=Date.now()/1000;
  await db.batch([db.prepare('DELETE FROM crawl_jobs'),db.prepare('DELETE FROM hotel_source_groups'),db.prepare("DELETE FROM hotels WHERE id GLOB '*-91[0-9][0-9][0-9][0-9][0-9]'"),db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'crawl-provider-ready:%'")]);
  const jobs=new Map(),hotels=new Map();
  const blocked=random()<0.08;if(blocked)blockedStates++;
  for(let n=0;n<70;n++){
   const provider=pick(['jalan','trip']),kind=random()<0.7?'detail':'list',id=pick(ids);
   const url=kind==='list'?(provider==='jalan'?`https://www.jalan.net/${100000+Math.floor(random()*9)*10000}/LRG_${100000+n}/`:`https://www.trip.com/hotels/${pick(cities)}-hotels-list-${n}/`)
    :provider==='jalan'?`https://www.jalan.net/yad${id}/`
    :random()<0.12?`https://www.trip.com/hotels/a-hotel-detail-${pick(ids)}-hotel-detail-${id}/x-hotel-detail-${pick(ids)}/`:`https://www.trip.com/hotels/${pick(cities)}-hotel-detail-${id}/${pick(['s','t'])}/`;
   if(jobs.has(url))continue;
   const daysAgo=random()*60,at=new Date((now-daysAgo*86400)*1000);
   const fetched=pick([null,null,at.toISOString(),at.toISOString().replace('Z','+00:00'),at.toISOString().slice(0,19)+'+09:00','not a time']);
   jobs.set(url,{url,provider,kind,status:pick(['pending','pending','retry','done','done','failed','skipped','running']),priority:pick([0,10,10,20,40,60,90,90,55]),fetched_at:fetched,attempts:Math.floor(random()*4),next_at:pick([0,0,now-100-random()*5000,now+100+random()*5000]),lease_until:pick([0,0,now-100-random()*500])});
   if(kind==='detail'&&random()<0.6){
    const hotelId=provider+'-'+(url.match(/yad(\d+)\//)?.[1]??url.match(/-hotel-detail-(\d+)\/[^/]+\/$/)?.[1]);
    const source={label:random()<0.5?'숙소 상세':'숙소 목록',...(random()<0.5?{bathDataVersion:pick(['v1','v2','v3'])}:{}),...(random()<0.5?{nameLocaleUrl:'https://kr.trip.com/hotels/x-hotel-detail-1/y/'}:{})};
    hotels.set(hotelId,{id:hotelId,payload:JSON.stringify({links:[{url:random()<0.85?url:url+'other/'}],sources:[source]})});
   }
  }
  if(blocked){const first=[...jobs.values()][0];first.lease_until=now+300}
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,status,priority,fetched_at,attempts,next_at,lease_until) SELECT json_extract(value,'$.url'),json_extract(value,'$.provider'),json_extract(value,'$.kind'),json_extract(value,'$.status'),json_extract(value,'$.priority'),json_extract(value,'$.fetched_at'),json_extract(value,'$.attempts'),json_extract(value,'$.next_at'),json_extract(value,'$.lease_until') FROM json_each(?)").bind(JSON.stringify([...jobs.values()])).run();
  await db.prepare("INSERT OR IGNORE INTO hotels (id,region,name,search_text,kind,payload) SELECT json_extract(value,'$.id'),'all','x','x','hotel',json_extract(value,'$.payload') FROM json_each(?)").bind(JSON.stringify([...hotels.values()])).run();
  const groups=Array.from({length:6},(_,i)=>({hotel_id:'claim-group-'+i,trip_hotel_id:random()<0.7?'trip-'+ids[(i*2)%ids.length]:null,jalan_hotel_id:random()<0.7?'jalan-'+ids[(i*2+1)%ids.length]:null}));
  await db.prepare("INSERT INTO hotel_source_groups (hotel_id,trip_hotel_id,jalan_hotel_id,payload,checked_at) SELECT json_extract(value,'$.hotel_id'),json_extract(value,'$.trip_hotel_id'),json_extract(value,'$.jalan_hotel_id'),'{}','2026-10-11T00:00:00Z' FROM json_each(?)").bind(JSON.stringify(groups)).run();
  const urls=[...jobs.keys()].filter(u=>!u.includes('-hotel-detail-')||!/-hotel-detail-.*-hotel-detail-/.test(u));
  for(const provider of ['jalan','trip'])for(const phase of ['detail','list','refresh','refresh-list','refresh-detail',provider==='jalan'?'baths':'names'])for(const lane of ['priority','national']){
   const claim={provider,phase:phase.startsWith('refresh')?'refresh':phase,lane,token:randomUUID(),...(phase.startsWith('refresh-')?{kind:phase.slice(8)}:{})};
   if(random()<0.15)claim.url=pick(urls.filter(u=>u.includes(provider==='jalan'?'jalan.net':'trip.com'))??[]);
   if(!claim.url)delete claim.url;
   const before=formerSelection(claim,Date.now()/1000);
   const reference=await db.prepare(before.sql).bind(...before.args).first();
   const active=await db.prepare('SELECT 1 FROM crawl_jobs WHERE provider=? AND lease_until>?').bind(provider,Date.now()/1000).first();
   const leased=await post(claim);claims++;
   const expected=active?null:reference?.url??null;
   assert.equal(leased[0]?.url??null,expected,`state ${state} ${JSON.stringify(claim)}`);
   if(expected){
    selected++;if(reference.missing===0)missingWins++;if(/-hotel-detail-.*-hotel-detail-/.test(expected))twoMarkers++;
    const job=jobs.get(expected);
    await db.prepare('UPDATE crawl_jobs SET lease_token=NULL,lease_until=? WHERE url=?').bind(job.lease_until,expected).run();
   }
  }
 }
 // Fixed state: the only missing linked detail is a Trip URL whose verified id
 // follows its second detail marker, behind other jobs of the same priority.
 {
  await db.batch([db.prepare('DELETE FROM crawl_jobs'),db.prepare('DELETE FROM hotel_source_groups')]);
  const odd='https://www.trip.com/hotels/a-hotel-detail-9100001-hotel-detail-9100002/x-hotel-detail-9100003/';
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,status,priority,attempts,next_at) VALUES (?,'trip','detail','pending',20,0,0),('https://www.trip.com/hotels/a-hotel-detail-9100000/s/','trip','detail','pending',20,0,0)").bind(odd).run();
  await db.prepare("INSERT INTO hotel_source_groups (hotel_id,trip_hotel_id,payload,checked_at) VALUES ('claim-group-odd','trip-9100003','{}','2026-10-11T00:00:00Z')").run();
  const claim={provider:'trip',phase:'detail',lane:'priority',token:randomUUID()},before=formerSelection(claim,Date.now()/1000);
  const reference=await db.prepare(before.sql).bind(...before.args).first();
  assert.deepEqual([reference.url,reference.missing],[odd,0]);
  assert.equal((await post(claim))[0]?.url,odd,'Trip missing detail named after a second detail marker');
  claims++;
 }
 // The states must exercise the parts of the order this check is about.
 assert.ok(selected>=300&&missingWins>=20&&twoMarkers>=1&&blockedStates>=1,JSON.stringify({selected,missingWins,twoMarkers,blockedStates}));
 console.log(`Claim order checks passed: ${claims} claims over 60 random queue states picked the former selection (${selected} jobs, ${missingWins} by a missing linked detail, ${twoMarkers} Trip URL with two detail markers, ${blockedStates} states with an active lease).`);
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
