// The static search snapshot against the built Worker's own answers on a
// temporary D1: search columns, cards, name-search text, coverage and the
// collection status. Also: the generator never writes, the Cloudflare API
// source gives the same files, and rebuilding is idempotent.
// Usage: node scripts/check-search-snapshot-worker.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildSnapshot,readOnly,remoteSource,retryWait,MAX_RETRY_WAIT,HEADERS_RULE,compileLib} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='snapshot-check-only';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-snapshot-check-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'snapshot-check'},d1Persist:join(temp,'d1'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const api=async(path,init={})=>{const r=await mf.dispatchFetch('http://localhost'+path,init);assert.equal(r.status,200,path+' '+r.status);return r.json()};
const read=(dir,name)=>JSON.parse(readFileSync(join(dir,'snapshot',name),'utf8'));
try{
 const db=await mf.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 // Seed through the maintenance path, as the collector does before a run.
 await api('/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});
 // Lifecycle states (closed ones leave the index, opening dates show on cards),
 // extra aliases (shared name keys) and one coordinate stored as text.
 await db.prepare("INSERT INTO hotel_lifecycle (hotel_id,first_seen_at,last_seen_at,state,missing_count,evidence) SELECT id,'2026-10-01','2026-10-01',CASE rowid%28 WHEN 0 THEN 'closed' WHEN 7 THEN 'temporarily_closed' WHEN 14 THEN 'operating' ELSE 'unverified' END,CASE WHEN rowid%21=0 THEN 1 ELSE 0 END,CASE WHEN rowid%14=0 THEN json_object('openedAt','2025-04-01') END FROM hotels WHERE rowid%7=0").run();
 await db.prepare("INSERT OR IGNORE INTO hotel_names (hotel_id,name_key,name) SELECT id,'aliasx'||substr(id,-2),'Alias '||id FROM hotels WHERE rowid%15=0").run();
 // A curated hotel whose stored name differs from its curated one: the index
 // reads the stored payload, the card the enriched hotel.
 const curated=JSON.parse(readFileSync('lib/hotels.verified.json','utf8'))[0].id;
 assert.equal((await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.names.en','Stored English name') WHERE id=?").bind(curated).run()).meta.changes,1);
 await db.prepare('DELETE FROM hotel_lifecycle WHERE hotel_id=?').bind(curated).run();
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.latitude','35.1') WHERE id=(SELECT id FROM hotels WHERE json_type(payload,'$.location.latitude')='real' ORDER BY id LIMIT 1)").run();
 const tables=['hotels','hotel_names','hotel_lifecycle','hotel_source_groups','hotel_source_observations','catalog_meta','crawl_jobs','visitor_favorites','hotel_result_sessions'];
 const fingerprint=async()=>{const out={};for(const t of tables)out[t]=JSON.stringify((await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results);return out};
 const before=await fingerprint();
 const local=join(temp,'local');mkdirSync(local,{recursive:true});writeFileSync(join(local,'index.html'),'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
 const built=await buildSnapshot({db,out:local,now:new Date('2026-10-12T00:00:00Z')});
 assert.deepEqual(await fingerprint(),before,'building the snapshot changed D1');
 const manifest=read(local,'manifest.json'),dir=join(local,'snapshot','v',manifest.id),file=name=>JSON.parse(readFileSync(join(dir,name+'.json'),'utf8'));
 const core=file('core'),cards=file('cards'),text=file('text'),status=file('status');
 assert.equal(manifest.format,Number(readFileSync('lib/search-snapshot.ts','utf8').match(/^export const SNAPSHOT_FORMAT=(\d+);$/m)[1]),'manifest format is lib SNAPSHOT_FORMAT');assert.equal(manifest.generatedAt,'2026-10-12T00:00:00.000Z');
 for(const [name,path] of Object.entries(manifest.files))assert.equal(path,`/snapshot/v/${manifest.id}/${name}.json`);

 // Search columns: the hotels table, in id order, with the former map rule for
 // coordinates and the lifecycle state.
 const rows=(await db.prepare(`SELECT h.id,region,prefecture,name,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,bath_features,bath_known,search_text,CASE WHEN json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real') THEN json_extract(payload,'$.location.latitude') END AS lat,CASE WHEN json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real') THEN json_extract(payload,'$.location.longitude') END AS lng,l.state FROM hotels h LEFT JOIN hotel_lifecycle l ON l.hotel_id=h.id ORDER BY h.id`).all()).results;
 assert.equal(manifest.hotels,rows.length);assert.equal(core.ids.length,rows.length);
 const columns={region:'region',prefecture:'prefecture',name:'name',kind:'kind',tripScore:'trip_score',tripReviews:'trip_reviews',jalanScore:'jalan_score',jalanReviews:'jalan_reviews',natural:'natural',features:'bath_features',known:'bath_known',lat:'lat',lng:'lng',state:'state'};
 rows.forEach((row,i)=>{assert.equal(core.ids[i],row.id);for(const [k,c] of Object.entries(columns))assert.equal(core[k][i],row[c],row.id+' '+k)});
 assert(core.lat.some(v=>v!==null)&&core.lat.filter(v=>v!==null).length<rows.length-1,'some, not all, coordinates');
 const states=new Set(core.state);for(const s of ['closed','temporarily_closed','operating','unverified',null])assert(states.has(s),'state '+s);

 // Name search: the substring columns and the former index, as the Worker built
 // it until P03 (lib/hotel-repository.ts catalogueSearchIndex): hotels not
 // closed, in id order, names from the stored payload then the aliases.
 const names=(await db.prepare('SELECT hotel_id,name_key FROM hotel_names ORDER BY hotel_id,name_key').all()).results;
 rows.forEach((row,i)=>{assert.equal(text.searchText[i],row.search_text);assert.deepEqual(text.nameKeys[i],names.filter(n=>n.hotel_id===row.id).map(n=>n.name_key))});
 const places=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'places-')),'lib/japan-place-labels.ts'));
 const aliasRows=(await db.prepare('SELECT hotel_id,name FROM hotel_names ORDER BY hotel_id,name_key').all()).results;
 const index=(await db.prepare("SELECT id,region,prefecture,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,bath_features,bath_known,json_extract(payload,'$.names') AS names,json_extract(payload,'$.location') AS location FROM hotels WHERE NOT EXISTS (SELECT 1 FROM hotel_lifecycle l WHERE l.hotel_id=hotels.id AND l.state IN ('closed','temporarily_closed')) ORDER BY id").all()).results.map(r=>{
  const n=JSON.parse(r.names),place={prefecture:r.prefecture,regionId:r.region,location:JSON.parse(r.location),names:n};
  return{id:r.id,names:[...new Set([n.ko,n.ja,n.en,...aliasRows.filter(a=>a.hotel_id===r.id).map(a=>a.name)].filter(Boolean))],location:places.formatHotelLocation(place),context:places.hotelPlaceSearchText(place),region:r.region,prefecture:r.prefecture,kind:r.kind,features:Number(r.bath_features??0),knownFeatures:Number(r.bath_known??0),tripScore:r.trip_score,tripReviews:r.trip_reviews,jalanScore:r.jalan_score,jalanReviews:r.jalan_reviews};
 });
 const open=core.ids.flatMap((id,i)=>text.names[i]===null?[]:[i]);
 assert.deepEqual(open.map(i=>core.ids[i]),index.map(h=>h.id),'index rows: every hotel not closed, in id order');
 index.forEach((h,n)=>{const i=open[n];assert.deepEqual([text.names[i],text.location[i],text.context[i],core.region[i],core.prefecture[i],core.kind[i],core.features[i]??0,core.known[i]??0,core.tripScore[i],core.tripReviews[i],core.jalanScore[i],core.jalanReviews[i]],[h.names,h.location,h.context,h.region,h.prefecture,h.kind,h.features,h.knownFeatures,h.tripScore,h.tripReviews,h.jalanScore,h.jalanReviews],h.id)});
 core.ids.forEach((id,i)=>{if(text.names[i]===null){assert(['closed','temporarily_closed'].includes(core.state[i]),id);assert.equal(text.location[i],null);assert.equal(text.context[i],null)}});

 // Cards: the card fields of the Worker's own hotels (enriched, linked sources,
 // lifecycle), read through the comparison API four at a time.
 const summary=h=>{
  const features={};for(const [k,f] of Object.entries(h.features))if(f&&f.value!==null)features[k]=f.scope===undefined?{value:f.value}:{value:f.value,scope:f.scope};
  const life=h.lifecycle;
  return JSON.parse(JSON.stringify({id:h.id,names:h.names,kind:h.kind,location:{label:h.location.label,latitude:h.location.latitude,longitude:h.location.longitude},image:{url:h.image.url,alt:h.image.alt,sourceId:h.image.sourceId,alternatives:h.image.alternatives},photoCandidates:h.photoCandidates,features,ratings:h.ratings.filter(r=>!r.isMock).map(r=>({provider:r.provider,score:r.score,scale:r.scale,reviewCount:r.reviewCount})),lifecycle:life&&{state:life.state,reviewNeeded:life.reviewNeeded,evidence:life.evidence?.openedAt?{openedAt:life.evidence.openedAt}:undefined}}));
 };
 assert.equal(cards.length,rows.length);
 for(let i=0;i<core.ids.length;i+=4){
  const {hotels}=await api('/api/hotel-comparison?ids='+core.ids.slice(i,i+4).join(','));
  hotels.forEach((h,n)=>assert.deepEqual(cards[i+n],summary(h),h.id));
 }
 assert(cards.some(c=>c.lifecycle?.evidence?.openedAt)&&cards.some(c=>c.lifecycle?.reviewNeeded)&&cards.some(c=>c.photoCandidates),'cards carry opening dates, review flags and linked photos');

 // Map positions (D06): geo.json in core order; payload coordinates are grade 1
 // (4 when the payload marks them approximate) with the same values as core.
 // Without a geocoder nothing else is added but Wikidata points for Trip ids.
 const geo=file('geo'),approximate=new Map((await db.prepare("SELECT id,json_extract(payload,'$.location.isApproximate') AS a FROM hotels").all()).results.map(r=>[r.id,!!r.a]));
 assert.deepEqual(Object.keys(geo),['grade','lat','lng']);for(const k of ['grade','lat','lng'])assert.equal(geo[k].length,rows.length,k);
 core.ids.forEach((id,i)=>{
  if(core.lat[i]!==null){assert.equal(geo.grade[i],approximate.get(id)?4:1,id);assert.deepEqual([geo.lat[i],geo.lng[i]],[core.lat[i],core.lng[i]],id)}
  else assert([0,6].includes(geo.grade[i])&&(geo.grade[i]===6)===(geo.lat[i]!==null),id+' without a geocoder: Wikidata or nothing');
 });
 assert.equal(built.geo.status,'skipped');assert.equal(built.manifest.bytes.geo,Buffer.byteLength(JSON.stringify(geo)));
 // With the geocoder (a fixture): points only where there were none, core untouched.
 {
  const asked=[],out=join(temp,'geocoded');mkdirSync(out,{recursive:true});
  const located=await buildSnapshot({db,out,now:new Date('2026-10-12T00:00:00Z'),geocode:async list=>{asked.push(...list);return list.map((_,n)=>n%3===2?null:[35+n*1e-5,139+n*1e-5,n%3?3:2])}});
  const m=read(out,'manifest.json'),g=JSON.parse(readFileSync(join(out,'snapshot','v',m.id,'geo.json'),'utf8'));
  assert.notEqual(m.id,manifest.id,'geocoded points make a new snapshot version');
  assert.deepEqual(JSON.parse(readFileSync(join(out,'snapshot','v',m.id,'core.json'),'utf8')),core,'core.json (list and search) unchanged');
  const open=geo.grade.flatMap((v,i)=>v===0?[i]:[]);
  assert.equal(asked.length,open.length,'every hotel with no point, and only those, is asked');
  assert(asked.every(a=>typeof a.address==='string'&&Array.isArray(a.places)));
  open.forEach((i,n)=>{assert.equal(g.grade[i],n%3===2?0:n%3?3:2,core.ids[i]);assert.equal(g.lat[i],n%3===2?null:Math.round((35+n*1e-5)*1e6)/1e6)});
  geo.grade.forEach((v,i)=>{if(v!==0)assert.deepEqual([g.grade[i],g.lat[i],g.lng[i]],[v,geo.lat[i],geo.lng[i]],core.ids[i])});
  assert.equal(located.geo.status,'ok');assert.deepEqual(await fingerprint(),before,'geocoding wrote nothing to D1');
 }

 // Coverage as the list showed it; collection status as its API returned it.
 // The collector's end-of-run read counts the same aggregate.
 assert.deepEqual(manifest.coverage,(await api('/api/crawl?provider=jalan&kind=detail&limit=1',{headers:{'X-Yukemuri-Crawl-Key':KEY}})).coverage);
 const live=await api('/api/collection-status',{headers:{'X-Yukemuri-Crawl-Key':KEY}});
 assert.deepEqual({...status,measuredAt:undefined},{...live,measuredAt:undefined});
 assert.equal(status.measuredAt,'2026-10-12T00:00:00.000Z','status describes the build time');

 // The guard refuses anything but a read before it reaches the database.
 const guard=readOnly(db).db;
 for(const sql of ['INSERT INTO catalog_meta VALUES (1,2)','DELETE FROM hotels','SELECT 1; DELETE FROM hotels','PRAGMA writable_schema=1',' UPDATE hotels SET name=1','WITH x AS (SELECT 1) DELETE FROM hotels RETURNING id','with x as (select 1) insert into catalog_meta select 1,2','WITH x AS (SELECT 1) UPDATE hotels SET name=1','with/**/x as (select 1) replace into catalog_meta values (1,2)',"SELECT 'a' -- x\n; DELETE FROM hotels",
  // A quote inside a comment, or a comment marker inside a string, hides nothing.
  "WITH x AS (SELECT 1) /* it's */ DELETE FROM hotels WHERE name<>'zz'","SELECT 1 -- it's\n; DELETE FROM hotels WHERE name='a'","SELECT 'a /* b' AS c, 1 DELETE FROM hotels"])assert.throws(()=>guard.prepare(sql),/read-only/,sql);
 // Words inside literals and comments are text, not writes.
 assert.doesNotThrow(()=>guard.prepare("SELECT 'DELETE FROM hotels' AS a -- UPDATE\n"));
 for(const sql of ["SELECT 'it''s DELETE' AS a",'SELECT "UPDATE", [INSERT], `DROP` FROM hotels','SELECT 1 /* DELETE */ FROM hotels -- UPDATE','SELECT "a""DELETE" FROM hotels'])assert.doesNotThrow(()=>guard.prepare(sql),sql);
 await assert.rejects(guard.prepare('SELECT 1').run(),/read-only/);

 // The Cloudflare API source: same files from the same rows, string parameters,
 // one retry after 429 that waits as long as Retry-After asks, and failures
 // that never carry the token or account.
 const calls=[],waits=[];let throttled=false;
 const fake=async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url,auth:init.headers.Authorization,body});
  if(!throttled){throttled=true;return new Response('{}',{status:429,headers:{'Retry-After':'7'}})}
  assert(body.params.every(p=>typeof p==='string'),'params are strings');
  const result=await db.prepare(body.sql).bind(...body.params).all();
  return Response.json({success:true,errors:[],result:[{success:true,results:result.results,meta:result.meta}]});
 };
 const remote=join(temp,'remote');
 const fromApi=await buildSnapshot({db:remoteSource({token:'tok-secret',account:'acct-secret',database:'128a3c5b-8e5f-470a-a901-d899d396cae1',fetchImpl:fake,sleep:async ms=>{waits.push(ms)}}),out:remote,now:new Date('2026-10-12T00:00:00Z')});
 assert.deepEqual(waits,[7000],'waited as long as Retry-After asked');
 assert.equal(fromApi.manifest.id,manifest.id,'API source builds the same snapshot');
 assert(calls.every(c=>c.url==='https://api.cloudflare.com/client/v4/accounts/acct-secret/d1/database/128a3c5b-8e5f-470a-a901-d899d396cae1/query'&&c.auth==='Bearer tok-secret'));
 assert(calls.every(c=>/^\s*(SELECT|WITH)\b/i.test(c.body.sql)),'only reads are sent');
 const denied=remoteSource({token:'tok-secret',account:'acct-secret',database:'128a3c5b-8e5f-470a-a901-d899d396cae1',fetchImpl:async()=>Response.json({success:false,errors:[{code:10000,message:'Authentication error'}],result:null},{status:403})});
 await assert.rejects(denied.prepare('SELECT 1').all(),e=>/HTTP 403/.test(e.message)&&!/tok-secret|acct-secret/.test(e.message));
 const at=Date.parse('2026-10-12T00:00:00Z'),asking=value=>new Response('{}',{status:429,headers:value===null?{}:{'Retry-After':value}});
 assert.equal(retryWait(asking(null),0,at),2000);assert.equal(retryWait(asking(null),2,at),8000);assert.equal(retryWait(asking('1'),1,at),4000);
 assert.equal(retryWait(asking('Mon, 12 Oct 2026 00:00:30 GMT'),0,at),30000);assert.equal(retryWait(asking('soon'),0,at),2000);
 // A wait beyond the limit fails at once: no early retries, no sleep.
 const slept=[],limited=remoteSource({token:'tok-secret',account:'acct-secret',database:'128a3c5b-8e5f-470a-a901-d899d396cae1',sleep:async ms=>{slept.push(ms)},fetchImpl:async()=>asking(String(MAX_RETRY_WAIT/1000+1))});
 await assert.rejects(limited.prepare('SELECT 1').all(),e=>/asks to wait 301s/.test(e.message)&&!/tok-secret|acct-secret/.test(e.message));assert.deepEqual(slept,[]);
 assert.throws(()=>remoteSource({token:'',account:'a',database:'128a3c5b-8e5f-470a-a901-d899d396cae1'}),/needs/);

 // The static page, rendered again with its first page: the default view (no
 // conditions, recommended order) of this snapshot, the former recommended
 // ORDER BY over hotels not closed, as cards in the HTML.
 const openRows=rows.filter(r=>r.state!=='closed'&&r.state!=='temporarily_closed');
 const nat=r=>(r.natural===1?2:0)+(r.trip_score!==null&&r.trip_score>=9&&r.trip_reviews!==null&&r.trip_reviews>=50?1:0),num=v=>v===null?-Infinity:v;
 const expectedOrder=[...openRows].sort((a,b)=>nat(b)-nat(a)||num(b.trip_score)-num(a.trip_score)||num(b.trip_reviews)-num(a.trip_reviews)||(a.id<b.id?-1:1)).slice(0,40).map(r=>r.id);
 const first=built.data.first;
 assert.equal(first.total,openRows.length);assert.equal(first.page,1);
 assert.deepEqual(first.hotels.map(h=>h.id),expectedOrder);
 assert.deepEqual(first.hotels,expectedOrder.map(id=>cards[core.ids.indexOf(id)]));assert.deepEqual(first.coverage,manifest.coverage);
 const pageOf=()=>readFileSync(join(local,'index.html'),'utf8'),titles=html=>[...html.matchAll(/class="card-title"[^>]*><h3>([^<]*)<\/h3>/g)].map(m=>m[1].replaceAll('&amp;','&').replaceAll('&#x27;',"'").replaceAll('&quot;','"'));
 const html=pageOf();
 assert(html.includes(`data-first-page="${manifest.id}"`),'static page marks its snapshot');
 assert.deepEqual(titles(html),first.hotels.map(h=>h.names.ko),'static page renders the first page cards in order');
 assert(new RegExp(first.total.toLocaleString('ko-KR')+'(?:<!-- -->)?곳').test(html),'static page shows the total');
 // Rebuilding replaces the version folder and adds the cache rule once.
 const again=await buildSnapshot({db,out:local,now:new Date('2026-10-12T00:00:00Z')});
 assert.equal(again.manifest.id,manifest.id);
 assert.deepEqual(readdirSync(join(local,'snapshot','v')),[manifest.id]);
 assert.equal(readFileSync(join(local,'_headers'),'utf8').split(HEADERS_RULE).length,2);
 assert(existsSync(join(local,'snapshot','manifest.json')));
 assert.equal(pageOf().split('data-first-page=').length,2,'rebuild renders one first page');
 // CLI on an unprepared catalogue (migrations only): --require-prepared fails and
 // leaves no report, so deploy.yml never reads an id for that snapshot.
 {
  const {DatabaseSync}=await import('node:sqlite');
  const file=join(temp,'unprepared.sqlite'),empty=new DatabaseSync(file);
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())empty.exec(readFileSync(join('drizzle',f),'utf8').replaceAll('--> statement-breakpoint',''));
  empty.close();
  const cli=args=>spawnSync(process.execPath,['scripts/build-search-snapshot.mjs','--sqlite',file,'--out',join(temp,'cli'),'--report',join(temp,'cli-report.json'),...args],{encoding:'utf8'});
  writeFileSync(join(temp,'cli-report.json'),'{"stale":true}');
  let r=cli(['--require-prepared']);
  assert.notEqual(r.status,0,'--require-prepared fails on an unprepared catalogue');
  assert(!existsSync(join(temp,'cli-report.json')),'no report (not even a stale one) after --require-prepared fails');
  r=cli([]);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/geocoder skipped, snapshot built without its points: no --geocoder-db given/);
  // A dictionary that is not there: the snapshot is still built, the reason printed.
  r=cli(['--geocoder-db',join(temp,'no-dictionary')]);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/geocoder skipped, snapshot built without its points: no installed dictionary/);
  r=cli(['--geocoder-skip','dictionary download failed']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/geocoder skipped, snapshot built without its points: dictionary download failed/);
  assert(JSON.parse(readFileSync(join(temp,'cli-report.json'),'utf8')).unprepared.length>0,'without the flag the report lists the unprepared steps');
 }
 const kb=n=>(n/1024).toFixed(0)+'KiB';
 console.log(`Search snapshot passed: ${rows.length} hotels (${open.length} in the name index), core/text columns equal the table and the former index, ${cards.length} cards equal the Worker's hotels, coverage and collection status equal their APIs, no D1 change, read-only guard, API source identical, idempotent rebuild. Sizes raw/gzip: ${Object.entries(built.sizes).map(([k,v])=>`${k} ${kb(v.raw)}/${kb(v.gzip)}`).join(', ')}; ${built.rowsRead} rows read in ${built.queries} queries.`);
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
