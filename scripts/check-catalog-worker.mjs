// Exercise the built production Worker and D1, without a development server.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-catalog-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'catalog-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'catalog-test-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 const api=async(path,init,expected=200)=>{const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers:{...init?.headers,'X-Yukemuri-Visitor':'a'.repeat(64),...(path.startsWith('/api/crawl')?{'X-Yukemuri-Crawl-Key':'catalog-test-only'}:{})}});const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));return body};
 const search=q=>api('/api/hotels?'+new URLSearchParams({q}));
 // An existing live row has no new mask columns or bath facts. Derive only
 // explicit Jalan water information, without replacing its payload/favorites.
 const legacyBase=JSON.parse(readFileSync('lib/hotels.real.json','utf8'))[0];
 const legacy={...legacyBase,id:'qa-legacy-baths',names:{ko:'기존 온천 자료',ja:'既存温泉資料',en:'Legacy Bath Data'},aliases:[],features:Object.fromEntries(Object.keys(legacyBase.features).map(key=>[key,{value:null,sourceId:'qa-legacy-baths',verifiedAt:null}])),spring:{types:[],waterNotes:'天然温泉100% 温泉掛け流し ※人工温泉含まず にごり湯',useNotes:''},sources:[{sourceId:'qa-legacy-baths',sourceType:'web',label:'Jalan 숙소 상세',retrievedAt:'2026-10-04T05:30:00Z',verifiedAt:'2026-10-04',url:'https://www.jalan.net/yad300454/',isMock:false}]};
 await db.prepare('INSERT INTO hotels (id,region,prefecture,name,search_text,kind,payload) VALUES (?,?,?,?,?,?,?)').bind(legacy.id,'pref-hokkaido','pref-hokkaido',legacy.names.ko,'기존온천자료','hotel',JSON.stringify(legacy)).run();
 // Production already completed name migration. Keep that independent
 // migration out of this assertion about the new bath-only backfill.
 await db.prepare('INSERT INTO catalog_meta (key,value) VALUES (?,?)').bind('multilingual-index-v1','done').run();
 const first=await api('/api/hotels'),next=await api('/api/hotels?page=2');assert(first.total>1600);assert.equal(first.hotels.length,40);assert(!first.hotels.some(h=>next.hotels.some(x=>x.id===h.id)));
 // An address that literally equals a typo must not outrank the relevant
 // property name, even when that unrelated hotel has a higher rating.
 const fixtureBase=await db.prepare("SELECT * FROM hotels WHERE id='takinoya'").first(),fixtureColumns=Object.keys(fixtureBase);
 const fixturePayload={...JSON.parse(fixtureBase.payload),id:'qa-location-only',names:{ko:'별개의 도시 호텔',ja:'Unrelated City Hotel',en:'Unrelated City Hotel'},aliases:[],regionId:'pref-okinawa',prefecture:'pref-okinawa',location:{label:'Naha',address:'Sozankoy',latitude:null,longitude:null,isApproximate:true}};
 const fixtureRow={...fixtureBase,id:fixturePayload.id,region:'pref-okinawa',prefecture:'pref-okinawa',name:fixturePayload.names.ko,search_text:'sozankoy',trip_score:10,trip_reviews:100000,payload:JSON.stringify(fixturePayload)};
 await db.prepare(`INSERT INTO hotels (${fixtureColumns.join(',')}) VALUES (${fixtureColumns.map(()=>'?').join(',')})`).bind(...fixtureColumns.map(k=>fixtureRow[k])).run();
 await db.prepare('INSERT INTO hotel_names (hotel_id,name_key,name) VALUES (?,?,?)').bind(fixturePayload.id,'unrelatedcityhotel','Unrelated City Hotel').run();
 const boundaryPayload={...fixturePayload,id:'qa-word-boundary',names:{ko:'마리나 하코다테',ja:'Marina Hakodate',en:'Marina Hakodate'},regionId:'pref-hokkaido',prefecture:'pref-hokkaido',location:{...fixturePayload.location,label:'하코다테',address:'Hakodate'}};
 const boundaryRow={...fixtureRow,id:boundaryPayload.id,region:'pref-hokkaido',prefecture:'pref-hokkaido',name:boundaryPayload.names.ko,search_text:'마리나하코다테 marinahakodate',payload:JSON.stringify(boundaryPayload)};
 await db.prepare(`INSERT INTO hotels (${fixtureColumns.join(',')}) VALUES (${fixtureColumns.map(()=>'?').join(',')})`).bind(...fixtureColumns.map(k=>boundaryRow[k])).run();
 for(const [key,name] of [['마리나하코다테','마리나 하코다테'],['marinahakodate','Marina Hakodate']])await db.prepare('INSERT INTO hotel_names (hotel_id,name_key,name) VALUES (?,?,?)').bind(boundaryPayload.id,key,name).run();
 for(const q of ['소잔쿄','Sozankyo','SOZAN-KYO','Ｓｏｚａｎｋｙｏ','蘇山郷','阿蘇内牧温泉 蘇山郷','蘇る山と故郷　阿蘇内牧温泉　蘇山郷']){const r=await search(q);assert.equal(r.total,1,q);assert.equal(r.hotels[0].id,'jalan-327522')}
 const suggest=(q,extra={})=>api('/api/hotels/suggestions?'+new URLSearchParams({q,...extra}));
 for(const q of ['Sozankoy','Soznkyo','소잔코','소잔쿄오','蘇山鄕']){
  const r=await search(q);assert(r.hotels.some(h=>h.id==='jalan-327522'),q);assert(r.similarCount>0);assert(r.similarHotelIds.includes('jalan-327522'));
  const predictions=await suggest(q);assert.equal(predictions.suggestions[0].id,'jalan-327522',q);assert.equal(predictions.suggestions[0].similar,true);
 }
 const ranked=await search('Sozankoy');assert.equal(ranked.hotels[0].id,'jalan-327522');assert(ranked.hotels.some(h=>h.id==='qa-location-only'));
 for(const q of ['호텔 소잔쿄','아소 소잔쿄','Sozankyo Aso','소잔쿄 아소'])assert.equal((await search(q)).hotels[0].id,'jalan-327522',q);
 const compact=await api('/api/hotels/search-index');assert.equal(compact.hotels.length,first.total+2);assert(compact.hotels.every(h=>!('image' in h)&&!('sources' in h)&&!('description' in h)));
 const legacyRead=await api('/api/hotels/qa-legacy-baths');assert.equal(legacyRead.features.natural.value,true);assert.equal(legacyRead.features.nigori.value,true);assert.equal(legacyRead.features.freeFlow.value,true);
 assert.equal((await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(legacy.id).first()).payload,JSON.stringify(legacy),'Bath backfill must not replace historic payload');
 for(const key of ['communalOutdoor','privateOutdoor','roomOutdoorOnsen','freeFlow','jalanHighClass']){
  const filtered=await api('/api/hotels?'+new URLSearchParams({features:key}));assert(filtered.total>0,key);assert(filtered.hotels.every(h=>h.features[key]?.value===true),key);
 }
 const indoor=await api('/api/hotels?features=roomIndoorOnsen');assert(indoor.hotels.some(h=>h.id==='bourou-noboribetsu'));
 const impossible=await api('/api/hotels?'+new URLSearchParams({q:'소잔쿄',rating:'10',reviews:'100000',features:'natural,roomOutdoorOnsen'}));assert.equal(impossible.total,0);assert.equal(impossible.hotels.length,0);assert.equal(impossible.alternatives[0].hotel.id,'jalan-327522');assert(impossible.alternatives[0].unmetConditions.some(t=>t.includes('평점')));assert(impossible.alternatives[0].unmetConditions.some(t=>t.includes('리뷰')));
 const noName=await search('xzqvjkzz');assert.equal(noName.total,0);assert(noName.alternatives.length>0);assert(noName.alternatives.every(h=>h.unmetConditions.includes('검색어 일치 없음')));
 const noSaved=await api('/api/hotels?saved=1&q=xzqvjkzz');assert.equal(noSaved.total,0);assert.equal(noSaved.alternatives.length,0);
 assert.equal(compact.hotels.find(h=>h.id==='trip-67309116').location,'나하 · 오키나와');
 assert.equal((await api('/api/hotels/trip-67309116')).location.label,'나하 · 오키나와');
 assert.equal((await api('/api/hotels/takinoya')).location.label,'노보리베츠 온천 · 홋카이도');
 assert((await search('나하')).hotels.some(h=>h.id==='trip-67309116'),'Korean city names must search existing untranslated records');
 assert((await search('나하')).hotels[0].location.label.includes('나하'),'Naha must rank above coincidental name word joins');
 assert((await search('Naha')).hotels[0].location.label.includes('나하'),'English Naha must rank above coincidental name word joins');
 assert((await search('나하')).hotels.some(h=>h.id==='qa-word-boundary'),'Lower-ranked legacy broad text matches remain available');
 for(const q of ['Sozan','소잔','蘇山郷','ＳＯＺＡＮ']){const r=await suggest(q);assert.equal(r.suggestions[0].id,'jalan-327522',q);assert.equal(r.suggestions[0].similar,false)}
 assert((await search('Taknioya')).hotels.some(h=>h.id==='takinoya'));
 assert(!(await search('소운쿄')).hotels.some(h=>h.id==='jalan-327522'),'Different Korean place names must remain distinct');
 assert.equal((await suggest('')).suggestions.length,0);assert.equal((await suggest('xzqvjk')).suggestions.length,0);
 assert((await suggest('hotel')).suggestions.length<=8);
 assert.equal((await suggest('Sozankoy',{region:'pref-hokkaido'})).suggestions.length,0);
 assert.equal((await api('/api/hotels?q=Sozankoy&region=pref-hokkaido')).total,0);
 assert.equal((await suggest('Sozankoy',{region:'pref-kumamoto',features:'natural,roomOutdoor'})).suggestions[0].id,'jalan-327522');
 assert.equal((await suggest('Sozankoy',{region:'pref-kumamoto',rating:'10',reviews:'100000'})).suggestions.length,0);
 assert.equal((await suggest('Sozankoy',{saved:'1'})).suggestions.length,0);
 await api('/api/hotels/suggestions?q='+encodeURIComponent('x'.repeat(201)),undefined,400);
 await api('/api/hotels/suggestions?features=not-a-feature',undefined,400);
 const sozankyo=await api('/api/hotels/jalan-327522');assert.equal(sozankyo.names.ko,'소잔쿄');assert.equal(sozankyo.features.roomOutdoor.scope,'someRooms');assert.deepEqual(new Set(sozankyo.ratings.map(r=>r.provider)),new Set(['jalan','trip']));
 assert.equal((await api('/api/hotels?region=pref-kumamoto&features=natural,roomOutdoor&q=Sozankyo')).total,1);
 const curated=JSON.parse(readFileSync('lib/hotels.real.json','utf8'));
 for(const h of curated){const actual=await api('/api/hotels/'+h.id);for(const [key,fact] of Object.entries(h.features))assert.deepEqual(actual.features[key],fact);assert.deepEqual(actual.ratings,h.ratings)}
 const hotel=await api('/api/hotels/konosumika'),original=await db.prepare('SELECT * FROM hotels WHERE id=?').bind(hotel.id).first();
 // The same native property name links the Korean/English search to its OTA
 // record only inside the same prefecture. Neither record nor score is merged.
 const columns=Object.keys(original),sql=`INSERT INTO hotels (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;
 for(const [id,prefecture] of [['qa-shared-name',original.prefecture],['qa-other-prefecture','pref-tokyo']]){
  const payload={...hotel,id,names:{ko:hotel.names.ja,ja:hotel.names.ja,en:hotel.names.ja},aliases:[],prefecture};
  const row={...original,id,prefecture,name:hotel.names.ja,search_text:'qa',payload:JSON.stringify(payload)};
  await db.prepare(sql).bind(...columns.map(k=>row[k])).run();
  const key=hotel.names.ja.normalize('NFKC').toLocaleLowerCase().replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-96)).replace(/[\s\p{P}\p{S}]/gu,'');
  await db.prepare('INSERT INTO hotel_names (hotel_id,name_key,name) VALUES (?,?,?)').bind(id,key,hotel.names.ja).run();
 }
 const linked=await search(hotel.names.ko);assert(linked.hotels.some(h=>h.id==='qa-shared-name'));assert(!linked.hotels.some(h=>h.id==='qa-other-prefecture'));
 const broken='https://ak-d.tripcdn.com/images//aw-d.tripcdn.com/images//0220x12000evnt92e2843_R_300_225_R5.jpg';
 const changed={...hotel,id:'qa-image',image:{...hotel.image,url:broken}};const photoRow={...original,id:changed.id,payload:JSON.stringify(changed)};await db.prepare(sql).bind(...columns.map(k=>photoRow[k])).run();
 assert.equal((await api('/api/hotels/qa-image')).image.url,'https://aw-d.tripcdn.com/images/0220x12000evnt92e2843_R_300_225_R5.jpg');
 assert.equal((await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind('multilingual-index-v1').first()).value,'done');
 assert((await search('소운쿄')).total>0);assert((await search('層雲峡')).total>0);
 await api('/api/crawl?provider=jalan&kind=detail&names=1',undefined,400);
 await api('/api/crawl?provider=trip&kind=detail&baths=1',undefined,400);
 const bathJobs=await api('/api/crawl?provider=jalan&kind=detail&baths=1&limit=40');assert(!bathJobs.jobs.some(j=>j.url==='https://www.jalan.net/yad327522/'));
 const nameJobs=await api('/api/crawl?provider=trip&kind=detail&names=1&limit=40');
 const protectedUrls=new Set(curated.flatMap(h=>h.links.filter(l=>l.provider==='trip').map(l=>l.url)));
 assert(!nameJobs.jobs.some(j=>protectedUrls.has(j.url)),'Already verified properties must not be re-enriched');
 const put={method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotelId:hotel.id,saved:true})};await api('/api/favorites',put);assert((await api('/api/favorites')).ids.includes(hotel.id));assert.equal((await api('/api/hotels?saved=1')).total,1);
 assert.equal((await suggest(hotel.names.ko,{saved:'1'})).suggestions[0].id,hotel.id);
 console.log(`Production Worker/D1 passed: ${first.total} records, advanced bath/High Class filters, unchanged legacy payload after bath backfill, separate alternatives with unmet conditions, multilingual relevance/autocomplete, favorites, nonoverlapping pages and original 20 properties.`);
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
