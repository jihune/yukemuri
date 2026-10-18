// D07 Jalan locale names against the built Worker and a disposable D1: the 94 first pages queued
// once, a 'names' claim under the same lease and pacing as other Jalan pages, names saved only for
// stays already stored and only when they change, the other language kept, contract refusals, the
// 14-day revisit, names jobs outside the page counts and the plan's reprioritisation, and the names
// shown alike by the detail API and the search snapshot.
// Usage: node scripts/check-locale-names-worker.mjs (after scripts/run-framework.mjs build)
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildSnapshot} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='locale-names-check-only';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-locale-names-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'locale-names'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
// The collector's URL for page `page` of prefecture `code` (scripts/crawler/collect.py locale_list_url).
const page=(lang,code,n)=>`https://www.jalan.net/ui/uip1400/uiw1402.do?langCd=${lang==='ko'?'ko_KR':'en_US'}&kenCd=${String(code).padStart(2,'0')}0000&stayCount=1&roomCount=1&distCd=01&crcyCd=${lang==='ko'?'KRW':'USD'}&activeSort=1&screenId=UIW1402&idx=${n}&pageNum=${n}`;
const stay=(lang,slug)=>`https://www.jalan.net/${lang==='ko'?'kr':'en'}/japan_hotels_ryokan/Hotels/Oita_Hotels/Beppu_Hotels/Beppu_Hotels/${slug}/`;
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(path,method='GET',data,expected=200)=>{
  const r=await runtime.dispatchFetch('http://localhost'+path,{method,headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY},...(data?{body:JSON.stringify(data)}:{})});
  const body=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(body));return body;
 };
 const count=async(sql,...args)=>(await db.prepare(sql).bind(...args).first()).n;
 const prepared=await api('/api/crawl-prepare','POST');
 assert.equal(prepared.localeLists.queued,94,'47 prefectures x 2 languages queued once');
 assert.equal((await api('/api/crawl-prepare','POST')).localeLists.queued,0,'not again');
 assert.equal(await count("SELECT COUNT(*) AS n FROM crawl_jobs WHERE kind='names' AND provider='jalan' AND priority=95 AND status='pending' AND substr(url,1,44)=? AND substr(url,-16)=?",'https://www.jalan.net/ui/uip1400/uiw1402.do?','&idx=1&pageNum=1'),94);
 assert.equal(await count("SELECT COUNT(*) AS n FROM crawl_jobs WHERE url=?",page('ko',44,1)),1);
 // Three stored Jalan stays named in Japanese only, and a number not stored.
 const [a,b,c]=(await db.prepare("SELECT id FROM hotels WHERE id GLOB 'jalan-[0-9]*' AND name NOT GLOB '*[가-힣]*' AND name NOT GLOB '*[A-Za-z]*' ORDER BY id LIMIT 3").all()).results.map(r=>r.id);
 assert(a&&b&&c,'three Japanese-only Jalan stays in the seed');
 const before=await api('/api/hotels/'+a);
 // Other Jalan pages wait: one active Jalan claim at a time, across kinds.
 await db.prepare("UPDATE crawl_jobs SET status='done',fetched_at='2026-10-18T00:00:00Z' WHERE kind<>'names'").run();
 const claim=async(url,token=randomUUID())=>({token,jobs:(await api('/api/crawl','POST',{provider:'jalan',phase:'localnames',...(url?{url}:{}),token})).jobs});
 // The provider's pacing after a page (crawl-provider-ready:jalan), as if its seconds had passed.
 const paced=()=>db.prepare("DELETE FROM catalog_meta WHERE key='crawl-provider-ready:jalan'").run();
 await api('/api/crawl','POST',{provider:'trip',phase:'localnames',token:randomUUID()},400);
 const first=await claim(page('ko',44,1));
 assert.equal(first.jobs.length,1);assert.equal(first.jobs[0].kind,'names');
 assert.equal((await claim()).jobs.length,0,'a second Jalan claim waits for the lease');
 const names=[{id:a,name:'에이 온천 호텔',url:stay('ko','a_onsen_hotel')},{id:b,name:'Shiosai no yado Seikai',url:stay('ko','b')},{id:c,name:'Hotel and Resorts 시',url:stay('ko','c')},{id:'jalan-999999990',name:'없는 숙소',url:stay('ko','missing')}];
 const links=[{url:page('ko',44,2),kind:'names',prefecture:'pref-ooita'},{url:page('ko',44,3),kind:'names',prefecture:'pref-ooita'}];
 // Contract refusals: observations on a names page, a list link, another prefecture's or
 // language's page, an English stay page on the Korean list, the same stay twice.
 const put=(body,expected)=>api('/api/crawl','PUT',{url:page('ko',44,1),status:'done',claimToken:first.token,observations:[],links,localeNames:names,...body},expected);
 const observed=JSON.parse((await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(a).first()).payload);
 for(const bad of [{observations:[observed]},{links:[{url:'https://www.jalan.net/yad300000/',kind:'detail',prefecture:'pref-ooita'}]},{links:[{url:page('ko',43,2),kind:'names',prefecture:'pref-ooita'}]},{links:[{url:page('en',44,2),kind:'names',prefecture:'pref-ooita'}]},{localeNames:[{...names[0],url:stay('en','a')}]},{localeNames:[names[0],names[0]]},{localeNames:[{...names[0],url:stay('ko','a')+'?x=1'}]}])await put(bad,400);
 await api('/api/crawl','PUT',{url:'https://www.jalan.net/ikisaki/map/hokkaido/',status:'done',observations:[],links:[],localeNames:[names[0]]},400);
 const saved=await put({},200);
 assert.equal(saved.accepted,3,'three stored stays named, the unknown number left out');
 assert.equal(await count('SELECT COUNT(*) AS n FROM hotel_locale_names'),3);
 assert.equal(await count("SELECT COUNT(*) AS n FROM hotels WHERE id='jalan-999999990'"),0,'no stay is created');
 assert.equal(await count("SELECT COUNT(*) AS n FROM crawl_jobs WHERE url IN (?,?) AND kind='names' AND priority=95 AND prefecture='pref-ooita' AND status='pending'",page('ko',44,2),page('ko',44,3)),2);
 assert.equal(await count("SELECT COUNT(*) AS n FROM crawl_jobs WHERE url=? AND status='done' AND lease_token IS NULL",page('ko',44,1)),1);
 assert.deepEqual(await put({},200).then(r=>r.replayed),true,'a replay writes nothing');
 // English on its own page keeps the Korean columns; the same names again write nothing.
 assert.equal((await claim(page('en',44,1))).jobs.length,0,'the next Jalan page waits for the pacing');
 await paced();const en=await claim(page('en',44,1));assert.equal(en.jobs.length,1);
 const english=[{id:a,name:'A Onsen Hotel',url:stay('en','a_onsen_hotel')},{id:b,name:'AMANE RESORT SEIKAI',url:stay('en','b')},{id:c,name:'GRAND MERCURE BEPPU BAY RESORT SPA',url:stay('en','c')}];
 assert.equal((await api('/api/crawl','PUT',{url:page('en',44,1),status:'done',claimToken:en.token,observations:[],links:[],localeNames:english})).accepted,3);
 const rows=new Map((await db.prepare('SELECT * FROM hotel_locale_names').all()).results.map(r=>[r.hotel_id,r]));
 assert.deepEqual([rows.get(a).name_ko,rows.get(a).name_en,rows.get(a).ko_url],['에이 온천 호텔','A Onsen Hotel',stay('ko','a_onsen_hotel')]);
 await db.prepare("UPDATE crawl_jobs SET fetched_at='2026-09-01T00:00:00Z' WHERE url=?").bind(page('en',44,1)).run();
 await paced();const again=await claim(page('en',44,1));assert.equal(again.jobs.length,1,'a done page is read again after 14 days');
 assert.equal((await api('/api/crawl','PUT',{url:page('en',44,1),status:'done',claimToken:again.token,observations:[],links:[],localeNames:english})).accepted,0,'unchanged names are not written');
 await paced();assert.equal((await claim(page('en',44,1))).jobs.length,0,'and not before 14 days');
 // The refresh phase never takes a names page, however old.
 await db.prepare("UPDATE crawl_jobs SET fetched_at='2026-01-01T00:00:00Z'").run();
 await db.prepare("UPDATE crawl_jobs SET status='skipped' WHERE kind<>'names'").run();
 await paced();assert.equal((await api('/api/crawl','POST',{provider:'jalan',phase:'refresh',token:randomUUID()})).jobs.length,0,'refresh never takes a names page');
 await paced();assert.equal((await claim()).jobs.length,1,'while the names phase does');
 await db.prepare("UPDATE crawl_jobs SET status='done' WHERE kind<>'names'").run();
 // Shown names: Korean with Hangul whose Latin words are in the English name; no Hangul, or an
 // old Latin word, leaves English as the title. The record's own name stays the original.
 const shown=async id=>(await api('/api/hotels/'+id));
 const ha=await shown(a),hb=await shown(b),hc=await shown(c);
 assert.deepEqual([ha.names.ko,ha.names.ja,ha.names.en],['에이 온천 호텔',before.names.ja,'A Onsen Hotel']);
 assert.deepEqual(ha.sources.slice(0,before.sources.length),before.sources,'collected sources first');
 assert.deepEqual(ha.sources.slice(before.sources.length).map(s=>[s.sourceId,s.label,s.url,s.nameLocaleUrl??null]),[['jalan-ko-name:'+a,'Jalan 한국어 숙소명',stay('ko','a_onsen_hotel'),stay('ko','a_onsen_hotel')],['jalan-en-name:'+a,'Jalan 영어 숙소명',stay('en','a_onsen_hotel'),null]]);
 assert.equal(hb.names.en,'AMANE RESORT SEIKAI');assert.doesNotMatch(hb.names.ko,/[가-힣]/,'a Latin-only Korean page name is no Korean name');
 assert.equal(hc.names.en,'GRAND MERCURE BEPPU BAY RESORT SPA');assert.doesNotMatch(hc.names.ko,/[가-힣]/,'an old Korean name is not shown');
 // The comparison API shows the same names.
 const compared=(await api('/api/hotel-comparison?ids='+[a,b,c].join(','))).hotels;
 assert.deepEqual(compared.map(h=>h.names),[ha.names,hb.names,hc.names]);
 // Names jobs stay out of the page counts and the plan's reprioritisation.
 const coverage=(await api('/api/crawl?provider=jalan&kind=list&limit=1')).coverage;
 const pages=await count("SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS n FROM crawl_jobs WHERE provider='jalan' AND kind<>'names' AND status!='skipped'");
 assert.equal(coverage.providers.jalan.completed,pages,'collection summary counts list and detail pages only');
 await db.prepare("DELETE FROM catalog_meta WHERE key LIKE 'collection-priority:%'").run();
 for(let i=0;i<100&&!(await api('/api/crawl-prepare','POST')).done;i++);
 assert.equal(await count("SELECT COUNT(*) AS n FROM crawl_jobs WHERE kind='names' AND priority<>95"),0,'the plan does not reprioritise names pages');
 // The search snapshot shows the names the detail API shows, counts them as Korean names, and
 // keeps names jobs out of its page counts.
 const out=join(temp,'out');mkdirSync(out,{recursive:true});writeFileSync(join(out,'index.html'),'<!DOCTYPE html><html><body></body></html>');
 const built=await buildSnapshot({db,out,now:new Date('2026-10-18T00:00:00Z')});
 const card=id=>built.data.cards[built.data.core.ids.indexOf(id)];
 for(const [id,h] of [[a,ha],[b,hb],[c,hc]])assert.deepEqual(card(id).names,h.names,id);
 assert.equal(built.data.core.name[built.data.core.ids.indexOf(a)],'에이 온천 호텔','the name column follows the Korean name');
 for(const [id,h] of [[b,hb],[c,hc]])assert.equal(built.data.core.name[built.data.core.ids.indexOf(id)],h.names.en,'the name column is the English title where only English is added: '+id);
 assert(built.data.text.searchText[built.data.core.ids.indexOf(a)].endsWith('에이온천호텔aonsenhotel'),'and the name search');
 const jalanPages=built.data.status.fill.pages.jalan,listed=await count("SELECT COUNT(*) AS n FROM crawl_jobs WHERE provider='jalan' AND kind IN ('list','detail') AND status!='skipped'");
 assert.equal(Object.values(jalanPages.detail).reduce((x,y)=>x+y,0)+Object.values(jalanPages.list).reduce((x,y)=>x+y,0),listed,'data status pages: list and detail only');
 const koreans=built.data.status.fill.scopes.jalan.rows.nameKo.filled;
 assert.equal(koreans,built.data.cards.filter(card=>card.id.startsWith('jalan-')&&/[가-힣]/.test(card.names.ko)).length);
 console.log(`Locale names passed: 94 first pages queued once, one Jalan lease across kinds, names for stored stays only (${saved.accepted} of 4), unchanged names unwritten, other language kept, 7 contract refusals, 14-day revisit and no refresh claim, outside page counts and reprioritisation, detail/comparison/snapshot alike with Hangul and old-name rules.`);
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
