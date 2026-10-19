// The static search snapshot against the built Worker's own answers on a
// temporary D1: search columns, cards, name-search text, coverage and the
// collection status, and the data status fill (U06) counted apart. Also: the generator never writes, the Cloudflare API
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
 // A Trip.com hotel named in kana with its Latin name, whose item has only an English label: the
 // English name becomes the title, and the name column follows it (Codex P2 on PR #145).
 const mixed='成田東武ホテルエアポート(Narita Tobu Hotel Airport)';
 assert.equal((await db.prepare("UPDATE hotels SET name=?,payload=json_set(payload,'$.names',json(?)) WHERE id='trip-703896'").bind(mixed,JSON.stringify({ko:mixed,ja:mixed,en:mixed})).run()).meta.changes,1);
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.latitude','35.1') WHERE id=(SELECT id FROM hotels WHERE json_type(payload,'$.location.latitude')='real' ORDER BY id LIMIT 1)").run();

 // U06 data status: places and pages in every state the screen tells apart. A Jalan detail read
 // with the current rule (v3) without bath or room facts (absent at the source), one with a room
 // count, a Trip.com hotel with years, one whose Korean page gave no Korean name, two whose
 // Korean name was looked for in vain, a current and an earlier translation, an empty
 // description, and pages to retry, failed and checked within the last day.
 const pick=async(sql,count)=>{const ids=(await db.prepare(sql+' ORDER BY id LIMIT '+count).all()).results.map(r=>r.id);assert.equal(ids.length,count,sql);return ids};
 const [absent,rooms]=await pick("SELECT id FROM hotels WHERE id GLOB 'jalan-*' AND json_extract(payload,'$.sources[0].label') LIKE '%상세%'",2);
 await db.prepare("UPDATE hotels SET bath_known=0,payload=json_set(json_remove(payload,'$.rooms','$.roomTypes'),'$.sources[0].bathDataVersion','v3') WHERE id=?").bind(absent).run();
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.sources[0].bathDataVersion','v3','$.rooms',json(?)) WHERE id=?").bind(JSON.stringify({total:12,sourceId:rooms,verifiedAt:'2026-10-11',note:'check'}),rooms).run();
 // A curated place (no provider prefix) whose linked Jalan observation is that v3 detail
 // without room facts: the detail shows it, so the place is detailed and its rooms are absent
 // at the source (Codex P2, twice).
 const group=await db.prepare("SELECT hotel_id,jalan_hotel_id FROM hotel_source_groups WHERE jalan_hotel_id IS NOT NULL AND hotel_id NOT GLOB 'jalan-*' AND hotel_id NOT GLOB 'trip-*' AND hotel_id NOT IN (SELECT value FROM json_each(?)) ORDER BY hotel_id LIMIT 1").bind(JSON.stringify([curated])).first();
 assert(group,'a curated group with a Jalan id');
 const peer=JSON.parse((await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(absent).first()).payload);
 peer.id=group.jalan_hotel_id;peer.sources[0].sourceId=group.jalan_hotel_id;peer.description='れんけいしたかんそくのせつめいです。';
 await db.prepare('INSERT INTO hotel_source_observations (id,payload,observed_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(group.jalan_hotel_id,JSON.stringify(peer),peer.sources[0].retrievedAt).run();
 const [years,noKorean]=await pick("SELECT id FROM hotels WHERE id GLOB 'trip-*' AND json_extract(payload,'$.names.ko') NOT GLOB '*[가-힣]*'",2);
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.facilityYears',json(?)) WHERE id=?").bind(JSON.stringify({opened:1990,sourceId:years,verifiedAt:'2026-10-11',note:'check'}),years).run();
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.sources[0].nameLocaleUrl','https://kr.trip.com/hotels/check-hotel-detail-1/x/') WHERE id=?").bind(noKorean).run();
 const [looked1,looked2,current,earlier,blank]=await pick("SELECT id FROM hotels WHERE id GLOB 'jalan-*' AND json_extract(payload,'$.names.ko') NOT GLOB '*[가-힣]*' AND length(json_extract(payload,'$.description'))>0 AND json_extract(payload,'$.description') NOT GLOB '*[가-힣]*'",5);
 for(const id of [looked1,looked2])await db.prepare("INSERT INTO hotel_name_localizations (hotel_id,payload,checked_at) VALUES (?,NULL,'2026-10-11T00:00:00Z')").bind(id).run();
 await db.prepare("INSERT INTO hotel_description_translations (hotel_id,source_text,text_ko,translated_at) SELECT id,json_extract(payload,'$.description'),'번역','2026-10-11T00:00:00Z' FROM hotels WHERE id=?").bind(current).run();
 await db.prepare("INSERT INTO hotel_description_translations (hotel_id,source_text,text_ko,translated_at) VALUES (?,'바뀌기 전 원문','옛 번역','2026-10-11T00:00:00Z')").bind(earlier).run();
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.description','') WHERE id=?").bind(blank).run();
 await db.prepare("UPDATE crawl_jobs SET status='retry' WHERE url=(SELECT url FROM crawl_jobs WHERE provider='jalan' AND kind='detail' AND status='pending' ORDER BY url LIMIT 1)").run();
 await db.prepare("UPDATE crawl_jobs SET status='failed' WHERE url=(SELECT url FROM crawl_jobs WHERE provider='trip' AND kind='list' AND status='pending' ORDER BY url LIMIT 1)").run();
 await db.prepare("UPDATE crawl_jobs SET fetched_at='2026-10-11T12:00:00Z' WHERE url=(SELECT url FROM crawl_jobs WHERE provider='jalan' AND kind='detail' AND status='done' ORDER BY url LIMIT 1)").run();
 // U06 trend: rows the collector's end-of-run read keeps (UTC day), three inside the build's last
 // 30 days (2026-09-13 to 2026-10-12) and one on each side.
 const daily=[['2026-09-12',1],['2026-09-13',2],['2026-10-11',3],['2026-10-12',4],['2026-10-13',5]],dayRow=seq=>({records:1000+seq,pages:{jalan:{done:10*seq,total:100},trip:{done:5*seq,total:50}}});
 for(const [date,seq] of daily)await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('daily-progress:'+date,JSON.stringify({seq,...dayRow(seq)})).run();
 // D08 PR 6: the seed holds no reviewed pair (D08 PR 5) with both records stored. Store the
 // Trip.com record of one, under a Latin name its Jalan record lacks, and save the pair again
 // through the maintenance API, as a pair is saved once both are stored.
 {
  const p=JSON.parse((await db.prepare('SELECT payload FROM hotel_source_groups WHERE hotel_id=jalan_hotel_id AND trip_hotel_id NOT IN (SELECT id FROM hotels) ORDER BY hotel_id LIMIT 1').first()).payload);
  const template=await db.prepare("SELECT * FROM hotels WHERE id GLOB 'trip-*' AND trip_score IS NOT NULL ORDER BY id LIMIT 1").first(),jalan=JSON.parse((await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(p.hotelId).first()).payload);
  const h={...JSON.parse(template.payload),id:p.tripHotelId,names:{ko:p.matchedName,ja:p.matchedName,en:'Merged Check Ryokan'},aliases:[],prefecture:jalan.prefecture,regionId:jalan.regionId};
  h.ratings=h.ratings.map(r=>({...r,sourceId:p.tripHotelId}));h.sources=h.sources.map((s,i)=>i?s:{...s,sourceId:p.tripHotelId});
  const row={...template,id:p.tripHotelId,region:jalan.regionId,prefecture:jalan.prefecture,name:p.matchedName,payload:JSON.stringify(h)},cols=Object.keys(row);
  await db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run();
  const saved=await mf.dispatchFetch('http://localhost/api/hotel-source-groups',{method:'PUT',headers:{'X-Yukemuri-Crawl-Key':KEY,'Content-Type':'application/json'},body:JSON.stringify({...p,checkedAt:new Date(Date.parse(p.checkedAt)+1000).toISOString()})});
  assert.equal(saved.status,200,await saved.text());
 }
 const tables=['hotels','hotel_names','hotel_lifecycle','hotel_source_groups','hotel_source_observations','hotel_name_localizations','hotel_description_translations','catalog_meta','crawl_jobs','visitor_favorites','hotel_result_sessions'];
 const fingerprint=async()=>{const out={};for(const t of tables)out[t]=JSON.stringify((await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results);return out};
 const before=await fingerprint();
 const local=join(temp,'local');mkdirSync(local,{recursive:true});writeFileSync(join(local,'index.html'),'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
 const built=await buildSnapshot({db,out:local,now:new Date('2026-10-12T00:00:00Z')});
 assert.deepEqual(await fingerprint(),before,'building the snapshot changed D1');
 const manifest=read(local,'manifest.json'),dir=join(local,'snapshot','v',manifest.id),file=name=>JSON.parse(readFileSync(join(dir,name+'.json'),'utf8'));
 const core=file('core'),cards=file('cards'),text=file('text'),status=file('status');
 // A page loaded before mergedInto (D08 PR 6) reads these files with the same SNAPSHOT_FORMAT, and
 // its openSnapshot (lib/static-search.ts) refuses a core field that is not a column of every hotel:
 // mergedInto stays in the manifest, which such a page does not read beyond its known fields.
 assert(Object.values(core).every(column=>Array.isArray(column)&&column.length===core.ids.length)&&cards.length===core.ids.length,'core holds hotel columns only');
 assert.equal(manifest.format,Number(readFileSync('lib/search-snapshot.ts','utf8').match(/^export const SNAPSHOT_FORMAT=(\d+);$/m)[1]),'manifest format is lib SNAPSHOT_FORMAT');assert.equal(manifest.generatedAt,'2026-10-12T00:00:00.000Z');
 for(const [name,path] of Object.entries(manifest.files))assert.equal(path,`/snapshot/v/${manifest.id}/${name}.json`);

 // D08 PR 6: in a group whose own hotel is one of its provider records (the reviewed pairs the
 // seed holds, D08 PR 5), the other provider record leaves every part of the snapshot when both
 // rows are stored; its names search for the group's hotel, mergedInto sends its id there.
 const merged=new Map((await db.prepare("SELECT p.id,g.hotel_id AS base FROM hotel_source_groups g JOIN hotels p ON p.id=CASE WHEN g.hotel_id=g.jalan_hotel_id THEN g.trip_hotel_id WHEN g.hotel_id=g.trip_hotel_id THEN g.jalan_hotel_id END WHERE EXISTS (SELECT 1 FROM hotels WHERE id=g.hotel_id)").all()).results.map(r=>[r.id,r.base]));
 assert(merged.size>0,'the seed reaches the reviewed pairs: '+merged.size+' of '+(await db.prepare('SELECT COUNT(*) AS n FROM hotel_source_groups WHERE hotel_id=jalan_hotel_id OR hotel_id=trip_hotel_id').first()).n);assert.deepEqual(manifest.mergedInto,Object.fromEntries(merged));
 assert(core.ids.every(id=>!merged.has(id))&&[...merged.values()].every(id=>core.ids.includes(id)),'merged records leave, their cards stay');
 const peers=base=>[...merged].filter(([,b])=>b===base).map(([id])=>id);
 // Search columns: the hotels table, in id order, with the former map rule for
 // coordinates and the lifecycle state.
 const rows=(await db.prepare(`SELECT h.id,region,prefecture,name,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,natural,bath_features,bath_known,search_text,CASE WHEN json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real') THEN json_extract(payload,'$.location.latitude') END AS lat,CASE WHEN json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real') THEN json_extract(payload,'$.location.longitude') END AS lng,l.state FROM hotels h LEFT JOIN hotel_lifecycle l ON l.hotel_id=h.id ORDER BY h.id`).all()).results.filter(r=>!merged.has(r.id));
 assert.equal(manifest.hotels,rows.length);assert.equal(core.ids.length,rows.length);
 // Wikidata names (D07): which hotels get them is the rule's (scripts/check-wikidata-names.mjs);
 // here, that they take the name column, join the name search and match the Worker's hotels.
 const {withWikidataNames}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'wikidata-')),'lib/wikidata-names.ts')),added=new Map();
 const items=new Map(JSON.parse(readFileSync('data/wikidata-trip-names.json','utf8')).hotels.map(([trip,item])=>['trip-'+trip,item]));
 for(const r of (await db.prepare("SELECT id,json_extract(payload,'$.names') AS names FROM hotels").all()).results.filter(r=>!merged.has(r.id))){
  const names=JSON.parse(r.names),w=withWikidataNames({id:r.id,names,aliases:[],sources:[]}).names,item=items.get(r.id);
  const ko=w.ko!==names.ko?w.ko:null,en=w.en!==names.en?w.en:null;
  if(ko||en)added.set(r.id,{item,ko,en,names:[ko,en].filter(Boolean),shown:w,was:{...(ko?{ko:names.ko}:{}),...(en?{en:names.en}:{})}});
 }
 assert([...added.values()].some(a=>a.ko),'the seed reaches a Trip.com hotel that gets a Wikidata Korean name');
 assert.deepEqual([added.get('trip-703896')?.ko,added.get('trip-703896')?.en],[null,'Narita Tobu Hotel Airport'],'and one that gets an English name only');
 const {normalizeSearch,displayNames,hotelNames}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'names-')),'lib/hotel-names.ts'));
 // A merged record's names, Wikidata ones included, as its card searches them.
 const payloads=new Map((await db.prepare('SELECT id,payload FROM hotels WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...merged.keys()])).all()).results.map(r=>[r.id,JSON.parse(r.payload)]));
 const absorbed=base=>peers(base).flatMap(id=>hotelNames(withWikidataNames(payloads.get(id))));
 const columns={region:'region',prefecture:'prefecture',name:'name',kind:'kind',tripScore:'trip_score',tripReviews:'trip_reviews',jalanScore:'jalan_score',jalanReviews:'jalan_reviews',natural:'natural',features:'bath_features',known:'bath_known',lat:'lat',lng:'lng',state:'state'};
 assert.equal(core.name[core.ids.indexOf('trip-703896')],'Narita Tobu Hotel Airport','the name column is the English title');
 rows.forEach((row,i)=>{assert.equal(core.ids[i],row.id);for(const [k,c] of Object.entries(columns))assert.equal(core[k][i],k==='name'&&added.has(row.id)?displayNames(added.get(row.id).shown).title:row[c],row.id+' '+k)});
 assert(core.lat.some(v=>v!==null)&&core.lat.filter(v=>v!==null).length<rows.length-1,'some, not all, coordinates');
 const states=new Set(core.state);for(const s of ['closed','temporarily_closed','operating','unverified',null])assert(states.has(s),'state '+s);

 // Name search: the substring columns and the former index, as the Worker built
 // it until P03 (lib/hotel-repository.ts catalogueSearchIndex): hotels not
 // closed, in id order, names from the stored payload then the aliases.
 const names=(await db.prepare('SELECT hotel_id,name_key FROM hotel_names ORDER BY hotel_id,name_key').all()).results;
 rows.forEach((row,i)=>{assert.equal(text.searchText[i],row.search_text+[...added.get(row.id)?.names??[],...absorbed(row.id)].map(normalizeSearch).join(''));assert.deepEqual(text.nameKeys[i],[row.id,...peers(row.id)].flatMap(id=>names.filter(n=>n.hotel_id===id).map(n=>n.name_key)))});
 const places=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'places-')),'lib/japan-place-labels.ts'));
 const aliasRows=(await db.prepare('SELECT hotel_id,name FROM hotel_names ORDER BY hotel_id,name_key').all()).results;
 const index=(await db.prepare("SELECT id,region,prefecture,kind,trip_score,trip_reviews,jalan_score,jalan_reviews,bath_features,bath_known,json_extract(payload,'$.names') AS names,json_extract(payload,'$.location') AS location FROM hotels WHERE NOT EXISTS (SELECT 1 FROM hotel_lifecycle l WHERE l.hotel_id=hotels.id AND l.state IN ('closed','temporarily_closed')) ORDER BY id").all()).results.filter(r=>!merged.has(r.id)).map(r=>{
  const n=JSON.parse(r.names),place={prefecture:r.prefecture,regionId:r.region,location:JSON.parse(r.location),names:n};
  return{id:r.id,names:[...new Set([n.ko,n.ja,n.en,...[r.id,...peers(r.id)].flatMap(id=>aliasRows.filter(a=>a.hotel_id===id).map(a=>a.name)),...(added.get(r.id)?.names??[]),...absorbed(r.id)].filter(Boolean))],location:places.formatHotelLocation(place),context:places.hotelPlaceSearchText(place),region:r.region,prefecture:r.prefecture,kind:r.kind,features:Number(r.bath_features??0),knownFeatures:Number(r.bath_known??0),tripScore:r.trip_score,tripReviews:r.trip_reviews,jalanScore:r.jalan_score,jalanReviews:r.jalan_reviews};
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
 assert.equal(cards.length,rows.length);const workerHotels=new Map();
 for(let i=0;i<core.ids.length;i+=4){
  const {hotels}=await api('/api/hotel-comparison?ids='+core.ids.slice(i,i+4).join(','));
  // A card the rule named also notes the item and the names the added ones replaced.
  hotels.forEach((h,n)=>{const a=added.get(h.id);assert.deepEqual(cards[i+n],a?{...summary(h),wikidataNames:{item:a.item,was:a.was}}:summary(h),h.id);workerHotels.set(h.id,h)});
 }
 // The Worker's hotels carry the same Wikidata names, with the item among the sources; the
 // detail API too.
 for(const [id,a] of added){
  const h=workerHotels.get(id),url='https://www.wikidata.org/wiki/'+a.item,source=h.sources.find(s=>s.sourceId==='wikidata-name:'+id);
  if(a.ko)assert.equal(h.names.ko,a.ko,id);if(a.en)assert.equal(h.names.en,a.en,id);
  assert.deepEqual([source?.url,source?.nameLocaleUrl,source?.verifiedAt],[url,a.ko?url:undefined,null],id+' Wikidata source');
 }
 {const [id,a]=[...added].find(([,a])=>a.ko);assert.equal((await api('/api/hotels/'+id)).names.ko,a.ko,'the detail API shows the Wikidata Korean name')}
 for(const h of workerHotels.values())if(!added.has(h.id))assert(!h.sources.some(s=>s.sourceId.startsWith('wikidata-name:')),h.id+' has no Wikidata name');
 assert(cards.some(c=>c.lifecycle?.evidence?.openedAt)&&cards.some(c=>c.lifecycle?.reviewNeeded)&&cards.some(c=>c.photoCandidates),'cards carry opening dates, review flags and linked photos');
 // A merged pair's card (the Worker's composed hotel, above) shows both providers, and a name only
 // the merged record has finds that card through the page's own search.
 {
  const {openSnapshot,addSnapshotText,searchSnapshot}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'search-')),'lib/static-search.ts'));
  const {DEFAULT_FILTERS}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'types-')),'lib/hotel-types.ts'));
  const snapshot=openSnapshot(manifest,core,cards);addSnapshotText(snapshot,text);
  assert([...merged.values()].some(base=>cards[core.ids.indexOf(base)].ratings.map(r=>r.provider).sort().join()==='jalan,trip'),'a merged card shows the ratings of both providers');
  const own=new Map(rows.map(r=>[r.id,r.search_text])),searched=[];
  for(const [id,base] of merged)for(const name of hotelNames(withWikidataNames(payloads.get(id))).filter(n=>!own.get(base).includes(normalizeSearch(n)))){
   const r=searchSnapshot(snapshot,{...DEFAULT_FILTERS,query:name},'recommended');
   assert(r.order.map(i=>core.ids[i]).includes(base),`${name} (${id}) finds ${base}`);searched.push(name);
  }
  assert(searched.length>0,'the seed reaches a merged record with a name of its own');
 }

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
  const usage={measuredAt:'2026-10-12T00:00:00.000Z',date:'2026-10-12',limits:{rowsRead:5000000,rowsWritten:100000,requests:100000},account:{rowsRead:1,rowsWritten:2,requests:null}};
  const located=await buildSnapshot({db,out,now:new Date('2026-10-12T00:00:00Z'),usage,geocode:async list=>{asked.push(...list);return list.map((_,n)=>n%3===2?null:[35+n*1e-5,139+n*1e-5,n%3?3:2])}});
  const m=read(out,'manifest.json'),g=JSON.parse(readFileSync(join(out,'snapshot','v',m.id,'geo.json'),'utf8'));
  assert.notEqual(m.id,manifest.id,'geocoded points make a new snapshot version');
  assert.deepEqual(JSON.parse(readFileSync(join(out,'snapshot','v',m.id,'status.json'),'utf8')).fill.usage,usage,'today\'s Cloudflare usage goes into status.json as given');
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
 // The Worker counts stored records; the snapshot counts cards, so the merged records less.
 const counted=(await api('/api/crawl?provider=jalan&kind=detail&limit=1',{headers:{'X-Yukemuri-Crawl-Key':KEY}})).coverage;
 assert.deepEqual(manifest.coverage,{...counted,records:counted.records-merged.size,crawledRecords:counted.crawledRecords-merged.size});
 // That read keeps the day's trend row (UTC day) from the counts it took; a later run the same
 // day replaces it.
 {
  const key='daily-progress:'+new Date().toISOString().slice(0,10),row=async()=>JSON.parse((await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first()).value);
  const jobs=(await db.prepare("SELECT provider,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,COUNT(*) AS total FROM crawl_jobs WHERE kind='detail' AND status!='skipped' GROUP BY provider").all()).results;
  const first=await row();
  assert.deepEqual({records:first.records,pages:first.pages},{records:(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n,pages:Object.fromEntries(['jalan','trip'].map(p=>{const j=jobs.find(r=>r.provider===p);return[p,{done:j?.done??0,total:j?.total??0}]}))},'the end-of-run read keeps the day row');
  await api('/api/crawl?provider=jalan&kind=detail&limit=1',{headers:{'X-Yukemuri-Crawl-Key':KEY}});
  assert((await row()).seq>first.seq,'a later run the same day replaces the row');
 }
 const live=await api('/api/collection-status',{headers:{'X-Yukemuri-Crawl-Key':KEY}});
 const {fill,...shared}=status;
 {
  const {BATH_FEATURE_MASK}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'mask-')),'lib/hotel-bath-facts.ts'));
  const less=await db.prepare(`SELECT COUNT(*) AS records,COALESCE(SUM(CASE WHEN json_extract(payload,'$.sources[0].label') LIKE '%상세%' THEN 1 ELSE 0 END),0) AS detailRecords,COALESCE(SUM(CASE WHEN (bath_known & ${BATH_FEATURE_MASK})>0 THEN 1 ELSE 0 END),0) AS bathKnownRecords,COALESCE(SUM(CASE WHEN natural=1 THEN 1 ELSE 0 END),0) AS naturalOnsenRecords,COALESCE(SUM(CASE WHEN room_onsen=1 THEN 1 ELSE 0 END),0) AS roomOnsenRecords FROM hotels WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify([...merged.keys()])).first();
  assert.equal(less.records,merged.size);
  assert.deepEqual({...shared,measuredAt:undefined},{...live,quality:Object.fromEntries(Object.entries(live.quality).map(([k,v])=>[k,v-less[k]])),measuredAt:undefined});
 }
 assert.equal(live.fill,undefined,'the API has no data status fill');
 // The data status fill (U06), counted here apart from lib/search-snapshot-build.ts: the stored
 // payload from SQL, what the card and detail show from the Worker's own hotels (above), the
 // name and translation tables, map grades from geo.json, pages from crawl_jobs.
 {
  const {needsKoreanDescription}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'desc-')),'lib/hotel-description.ts'));
  const {BATH_FEATURE_MASK}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(temp,'bath-')),'lib/hotel-bath-facts.ts'));
  const places=(await db.prepare(`SELECT h.id,h.bath_known,json_extract(h.payload,'$.sources[0].label') AS label,json_extract(h.payload,'$.sources[0].bathDataVersion') AS version,
   json_extract(h.payload,'$.description') AS description,EXISTS(SELECT 1 FROM json_each(h.payload,'$.sources') s WHERE json_extract(s.value,'$.nameLocaleUrl') IS NOT NULL) AS locale,
   EXISTS(SELECT 1 FROM hotel_name_localizations n WHERE n.hotel_id=h.id AND n.payload IS NULL) AS looked,
   (SELECT t.source_text=json_extract(h.payload,'$.description') FROM hotel_description_translations t WHERE t.hotel_id=h.id) AS translation FROM hotels h ORDER BY h.id`).all()).results.filter(p=>!merged.has(p.id));
  const ROWS=['detail','bath','rooms','years','rating','photo','nameKo','descKo'];
  const scope=()=>({records:0,rows:Object.fromEntries(ROWS.map(k=>[k,{filled:0,none:0,empty:0}])),geo:[0,0,0,0,0,0,0,0],staleTranslations:0});
  const want={scopes:{all:scope(),jalan:scope(),trip:scope()}};
  places.forEach((p,i)=>{
   const h=workerHotels.get(p.id),provider=p.id.startsWith('jalan-')?'jalan':p.id.startsWith('trip-')?'trip':null;
   // As the detail shows it: a curated place's detail and v3 among its sources (a linked one
   // too), and its description.
   const detail=provider?/상세/.test(p.label??''):!!h&&h.sources.some(s=>/상세/.test(s.label));
   const v3=!!h&&h.sources.some(s=>s.bathDataVersion==='v3'&&/상세/.test(s.label)),linked=!!h&&h.description!==p.description;
   const translated=linked?!!h.descriptionTranslation:p.translation===1,stale=!linked&&p.translation===0,description=linked?h.description:p.description;
   assert(h,p.id+' from the Worker');assert.equal(core.ids[i],p.id);
   const state={detail:detail?'filled':'empty',bath:(p.bath_known??0)&BATH_FEATURE_MASK?'filled':v3?'none':'empty',
    rooms:h.rooms||h.roomTypes?.some(t=>t.items.length)?'filled':v3?'none':'empty',years:h.facilityYears?'filled':provider==='jalan'?'none':'empty',
    rating:h.ratings.some(r=>!r.isMock)?'filled':'none',photo:h.image.url?'filled':'none',
    nameKo:/[가-힣]/.test(h.names.ko)?'filled':p.looked||p.locale?'none':'empty',
    descKo:!(description??'').trim()?'none':!needsKoreanDescription(description)||translated?'filled':'empty'};
   for(const s of provider?[want.scopes.all,want.scopes[provider]]:[want.scopes.all]){s.records++;for(const k of ROWS)s.rows[k][state[k]]++;if(stale&&state.descKo==='empty')s.staleTranslations++;s.geo[geo.grade[i]]++}
  });
  const zero=()=>({done:0,pending:0,retry:0,failed:0}),pages={jalan:{detail:zero(),list:zero(),detailChecked24h:0},trip:{detail:zero(),list:zero(),detailChecked24h:0}};
  const STATE={done:'done',pending:'pending',running:'pending',retry:'retry',failed:'failed'};
  for(const r of (await db.prepare("SELECT provider,kind,status,COUNT(*) AS n,SUM(CASE WHEN fetched_at>'2026-10-11T00:00:00Z' THEN 1 ELSE 0 END) AS recent FROM crawl_jobs GROUP BY provider,kind,status").all()).results){
   if(!pages[r.provider]||!['detail','list'].includes(r.kind)||!STATE[r.status])continue;
   pages[r.provider][r.kind][STATE[r.status]]+=r.n;if(r.kind==='detail'&&r.status==='done')pages[r.provider].detailChecked24h+=r.recent;
  }
  const trend=daily.filter(([date])=>date>='2026-09-13'&&date<='2026-10-12').map(([date,seq])=>({date,...dayRow(seq)}));
  assert.deepEqual(fill,{...want,pages,trend},'status.json fill');
  const all=fill.scopes.all.rows;
  for(const [k,part] of [['bath','none'],['rooms','filled'],['rooms','none'],['years','filled'],['years','none'],['nameKo','none'],['descKo','none'],['descKo','filled']])assert(all[k][part]>0,`the check reaches ${k} ${part}`);
  const curatedOnly=(k,part)=>fill.scopes.all.rows[k][part]-fill.scopes.jalan.rows[k][part]-fill.scopes.trip.rows[k][part];
  assert(curatedOnly('rooms','none')>0,'a curated place with a linked v3 Jalan detail and no rooms counts as absent at the source');
  assert(curatedOnly('detail','filled')>0,'a curated place with a linked Jalan detail counts as detailed');
  assert(fill.scopes.all.staleTranslations>0&&fill.pages.jalan.detail.retry>0&&fill.pages.trip.list.failed>0&&fill.pages.jalan.detailChecked24h>0,'the check reaches stale translations, retries, failures and the last day');
  for(const s of Object.values(fill.scopes))for(const k of ROWS){const c=s.rows[k];assert.equal(c.filled+c.none+c.empty,s.records,k)}
 }
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
 const pageOf=()=>readFileSync(join(local,'index.html'),'utf8'),titles=html=>[...html.matchAll(/class="card-title"[^>]*><h3[^>]*>([^<]*)<\/h3>/g)].map(m=>m[1].replaceAll('&amp;','&').replaceAll('&#x27;',"'").replaceAll('&quot;','"'));
 // A card is named in Korean, else English, else the original (U07, lib/hotel-names.ts).
 const html=pageOf();
 assert(html.includes(`data-first-page="${manifest.id}"`),'static page marks its snapshot');
 assert.deepEqual(titles(html),first.hotels.map(h=>displayNames(h.names).title),'static page renders the first page cards in order');
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
 console.log(`Search snapshot passed: ${rows.length} hotels (${open.length} in the name index), core/text columns equal the table and the former index, ${cards.length} cards equal the Worker's hotels, coverage and collection status equal their APIs, the data status fill equals counts from SQL and the Worker's hotels, no D1 change, read-only guard, API source identical, idempotent rebuild. Sizes raw/gzip: ${Object.entries(built.sizes).map(([k,v])=>`${k} ${kb(v.raw)}/${kb(v.gzip)}`).join(', ')}; ${built.rowsRead} rows read in ${built.queries} queries.`);
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
