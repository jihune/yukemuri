// D07 Wikidata names: the rule (lib/wikidata-names.ts) on fixture labels, the extract
// (data/wikidata-trip-names.json) and its refresh (scripts/update-wikidata-names.mjs).
// With --public, the rule runs on the public snapshot: every name it adds or keeps is listed with
// the one sign the rule does not use that the Trip.com id points at another hotel on Wikidata (the
// item's point over 1 km from our source coordinates), and a control swaps two hotels' items to
// prove the sign fires. A name without that sign is counted apart as unverified, for a person to look at.
// Usage: node scripts/check-wikidata-names.mjs [--public [--dir saved-snapshot] [--json out.json]]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
import {extract,OUT} from './update-wikidata-names.mjs';

const require=createRequire(import.meta.url),argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:null;
const temp=mkdtempSync(join(tmpdir(),'yukemuri-wikidata-names-'));
const hotel=(id,ko,ja=ko,en=ko)=>({id,names:{ko,ja,en},aliases:[],sources:[{sourceId:id,sourceType:'web',label:'숙소 상세',retrievedAt:'2026-10-01T00:00:00Z',verifiedAt:'2026-10-01',url:'https://www.trip.com/hotels/x-hotel-detail-1/',isMock:false}]});
try{
 // The rule on fixture labels: the compiled module reads the extract beside it.
 const entry=compileLib(temp,'lib/wikidata-names.ts');
 const fixture={retrievedAt:'2026-10-18T00:00:00.000Z',license:'CC0-1.0',hotels:[['100','Q1','호텔 원','Hotel One'],['200','Q2',null,'ホテル弐'],['300','Q3','Hotel Three',null],['400','Q4',null,'Hotel Four Osaka'],['500','Q5','호텔 프레사','Hotel Frésa Ariake']]};
 writeFileSync(join(temp,'data/wikidata-trip-names.json'),JSON.stringify(fixture));
 const {withWikidataNames:wd}=require(entry),{displayNames}=require(join(temp,'lib/hotel-names.js'));
 // A Trip.com record named in Latin letters only (most Trip.com records without Korean).
 const one=wd(hotel('trip-100','Hotel One Tokyo'));
 assert.deepEqual(one.names,{ko:'호텔 원',ja:'Hotel One Tokyo',en:'Hotel One Tokyo'},'Korean fills a record without it; a Latin original already reads as English');
 assert.deepEqual(one.aliases,['Hotel One Tokyo'],'the record\'s own name stays as an alias');
 assert.deepEqual(one.sources.at(-1),{sourceId:'wikidata-name:trip-100',sourceType:'web',label:'Wikidata 숙소 이름(CC0)',retrievedAt:'2026-10-18T00:00:00.000Z',verifiedAt:null,url:'https://www.wikidata.org/wiki/Q1',isMock:false,nameLocaleUrl:'https://www.wikidata.org/wiki/Q1'});
 assert.equal(one.sources.length,2,'the collected source stays first');
 // A name mixing kana and Latin letters reads as neither Korean nor English: both are added.
 const mixed=wd(hotel('trip-100','ホテル壱(Hotel One)'));
 assert.deepEqual(mixed.names,{ko:'호텔 원',ja:'ホテル壱(Hotel One)',en:'Hotel One'});
 assert.deepEqual(displayNames(mixed.names),{title:'호텔 원',titleLang:'ko',en:'Hotel One',ja:'ホテル壱(Hotel One)'},'shown Korean, then English, then the original');
 // Korean beside Latin in one name counts as Korean, not English (trip-22678179's shape).
 const korean=wd(hotel('trip-100','호텔 일(Hotel One)'));
 assert.deepEqual(korean.names,{ko:'호텔 일(Hotel One)',ja:'호텔 일(Hotel One)',en:'Hotel One'},'a collected Korean name stays');
 assert.equal(korean.sources.at(-1).nameLocaleUrl,undefined,'no Korean name source when no Korean name was added');
 const both=hotel('trip-100','호텔 일','ホテル壱','Hotel One');assert.equal(wd(both),both,'nothing to add, nothing changed');
 // Exact ids only: another provider's record with the same number, a padded number, an id not in the extract.
 for(const id of ['jalan-100','trip-0100','trip-1000','trip-999','100']){const h=hotel(id,'Hotel One Tokyo');assert.equal(wd(h),h,id+' is left as it is')}
 // The item must still name this hotel: renamed since, another branch, or nothing to compare.
 for(const name of ['Hotel Uno Tokyo','ホテル壱','Hotel']){const h=hotel('trip-100',name);assert.equal(wd(h),h,name+' does not agree with Hotel One')}
 const branch=hotel('trip-400','Hotel Four Kyoto');assert.equal(wd(branch),branch,'another branch of a chain');
 assert.equal(wd(hotel('trip-400','ホテル四(Hotel Four Osaka)')).names.en,'Hotel Four Osaka','the same branch');
 assert.equal(wd(hotel('trip-500','Hotel Fresa Ariake')).names.ko,'호텔 프레사','accents do not count');
 // Labels the rule refuses: English in kana, no English label to compare.
 for(const id of ['trip-200','trip-300']){const h=hotel(id,'Hotel Two Three');assert.equal(wd(h),h,id)}
 // The refresh: one item per Trip id, Korean only with Hangul, items without labels left out.
 const b=(trip,item,ko,en)=>({trip:{value:trip},item:{value:'http://www.wikidata.org/entity/'+item},...(ko?{ko:{value:ko}}:{}),...(en?{en:{value:en}}:{})});
 const x=extract([b('1','Q1','호텔',' Hotel '),b('2','Q2',null,'A'),b('2','Q3',null,'B'),b('3','Q4','Hotel',null),b('4','Q5'),b('x','Q6','호텔','Hotel'),b('5','x','호텔','Hotel')]);
 assert.deepEqual(x.rows,[['1','Q1','호텔','Hotel']]);assert.deepEqual(x.dropped,['2'],'a Trip id on two items is left out');

 // The committed extract.
 const data=JSON.parse(readFileSync(OUT,'utf8'));
 assert.equal(data.license,'CC0-1.0');assert.match(data.query,/wdt:P10425 \?trip ; wdt:P17 wd:Q17/,'Trip.com ids of items in Japan');assert(!Number.isNaN(Date.parse(data.retrievedAt)));
 assert(data.hotels.length>1000,'about 1,900 Trip ids');assert.equal(new Set(data.hotels.map(r=>r[0])).size,data.hotels.length,'one row per Trip id');
 for(const [trip,item,ko,en] of data.hotels){
  assert.match(trip,/^\d+$/);assert.match(item,/^Q\d+$/);assert(ko||en,trip);
  if(ko)assert.match(ko,/[가-힣]/,trip);for(const v of [ko,en])if(v)assert.equal(v,v.trim(),trip);
 }
 assert(!data.hotels.some(r=>data.dropped.includes(r[0])),'dropped ids stay out');
 const real=data.hotels.length,koreans=data.hotels.filter(r=>r[2]).length;
 let audit='';
 if(argv.includes('--public'))audit=await auditPublic();
 console.log(`Wikidata names passed: exact Trip.com ids only, collected names win, Hangul and English rules, the item as source, the refresh's rules; extract ${real} Trip ids (${koreans} with a Korean label, retrieved ${data.retrievedAt}).${audit}`);
}finally{rmSync(temp,{recursive:true,force:true})}

// The public snapshot (or one saved with --dir): what the rule adds and whether any of it looks
// like another hotel's item. The verdict is computed here; read its last line.
async function auditPublic(){
 const dir=arg('--dir'),base='https://yukemuri.jihune.workers.dev';
 const get=async path=>{
  if(dir)return JSON.parse(readFileSync(join(dir,path.split('/').pop()),'utf8'));
  const r=await fetch(base+path,{headers:{'User-Agent':'YukemuriCatalogUpdater/1.0 (+https://github.com/jihune/yukemuri)'}});
  if(!r.ok)throw new Error(path+' HTTP '+r.status);return r.json();
 };
 const manifest=await get('/snapshot/manifest.json'),[cards,core,geo]=await Promise.all([get(manifest.files.cards),get(manifest.files.core),manifest.files.geo?get(manifest.files.geo):null]);
 // The real rule and extract, compiled apart from the fixture above.
 const real=mkdtempSync(join(temp,'real-')),{withWikidataNames}=require(compileLib(real,'lib/wikidata-names.ts')),{displayNames}=require(join(real,'lib/hotel-names.js'));
 const points=existsSync('data/wikidata-trip-hotels.json')?new Map(JSON.parse(readFileSync('data/wikidata-trip-hotels.json','utf8')).hotels.map(([trip,,lat,lng])=>[trip,[lat,lng]])):new Map();
 const labels=new Map(JSON.parse(readFileSync(OUT,'utf8')).hotels.map(([trip,item,ko,en])=>[trip,{item,ko,en}]));
 const km=([a,b],[c,d])=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
 const GENERIC=new Set(['hotel','hotels','the','and','inn','resort','spa','by','of','collection']);
 // Latin words of a name, accents dropped (Frésa is Fresa), generic ones left out.
 const words=s=>new Set((s??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(w=>!GENERIC.has(w))??[]);
 const within=(a,b)=>{const [few,many]=a.size<=b.size?[a,b]:[b,a];return few.size>0&&[...few].every(w=>many.has(w))};
 // The sign the rule does not use that the item is another hotel: its point over 1 km from our
 // source point. A hotel without both points is unverified. The name sign (no name of ours whose
 // Latin words and the English label's contain one another) is the rule's own condition, so it
 // never fires on a name the rule gives; it is kept for the hotels the extract reaches whose item
 // the rule refuses.
 const judge=(card,i,label,trip)=>{
  const point=points.get(trip),ours=core.lat[i]!==null?[core.lat[i],core.lng[i]]:null,distance=ours&&point?km(ours,point):null;
  const theirs=words(label.en),mine=Object.values(card.names).map(words).filter(w=>w.size);
  const named=theirs.size&&mine.length?mine.some(w=>within(w,theirs)):null;
  return{distance:distance===null?null:Math.round(distance*1000),named,suspicious:distance!==null&&distance>1,unverified:distance===null};
 };
 const shown=list=>({ko:list.filter(c=>displayNames(c.names).titleLang==='ko').length,en:list.filter(c=>{const d=displayNames(c.names);return d.titleLang==='en'||d.en!==null}).length});
 const same=(a,b)=>a.ko===b.ko&&a.ja===b.ja&&a.en===b.en;
 // Which names the rule added is on the card: a snapshot built with the rule gives a card it
 // named wikidataNames, the item and the values the added names replaced (lib/search-snapshot-build.ts).
 // Every other name is the hotel's own. Each card is put back to its own names and named again
 // with the current extract: a name the next deploy keeps or adds ('shows', 'adds') is judged,
 // one it drops ('drops') is listed.
 const after=[],added=[],dropped=[];
 cards.forEach((card,i)=>{
  const mark=card.wikidataNames,base=mark?{...card,names:{...card.names,...mark.was}}:card;
  const trip=/^trip-\d+$/.test(card.id)?card.id.slice(5):null,label=trip&&labels.get(trip);
  const h=label?withWikidataNames({...base,aliases:[],sources:[]}):base;
  after.push({...card,names:h.names});
  if(h.names!==base.names)added.push({id:card.id,item:label.item,state:mark&&same(h.names,card.names)?'shows':'adds',before:base.names,ko:h.names.ko!==base.names.ko?h.names.ko:null,en:h.names.en!==base.names.en?h.names.en:null,labelEn:label.en,grade:geo?.grade[i]??null,...judge(base,i,label,trip)});
  else if(mark)dropped.push({id:card.id,item:mark.item,shown:card.names,next:base.names});
 });
 // Control: two Trip.com hotels with both points over 1 km apart, each judged against the other's
 // item, must be flagged.
 const [pi,qi]=core.ids.flatMap((id,i)=>/^trip-\d+$/.test(id)&&labels.has(id.slice(5))&&points.has(id.slice(5))&&core.lat[i]!==null?[i]:[]).filter((i,n,all)=>n===0||judge(cards[all[0]],all[0],labels.get(core.ids[i].slice(5)),core.ids[i].slice(5)).distance>1000);
 assert(pi!==undefined&&qi!==undefined,'two hotels over 1 km apart to swap');
 const swap=(i,j)=>judge(cards[i],i,labels.get(core.ids[j].slice(5)),core.ids[j].slice(5));
 const byPoint=[swap(pi,qi),swap(qi,pi)];
 const control=byPoint.every(s=>s.suspicious);
 const before=shown(cards),now=shown(after),suspicious=added.filter(a=>a.suspicious),unverified=added.filter(a=>a.unverified);
 // Every Trip.com hotel the extract reaches, named or not: how often its item looks like another hotel.
 const matched=core.ids.flatMap((id,i)=>/^trip-\d+$/.test(id)&&labels.has(id.slice(5))?[{id,...judge(cards[i],i,labels.get(id.slice(5)),id.slice(5))}]:[]);
 const odd=matched.filter(m=>m.suspicious||m.named===false);
 const report={snapshot:manifest.id,generatedAt:manifest.generatedAt,hotels:cards.length,checkedAt:new Date().toISOString(),koreanTitles:{before:before.ko,after:now.ko},englishNames:{before:before.en,after:now.en},added,dropped,suspicious:suspicious.map(a=>a.id),unverified:unverified.map(a=>a.id),matched:{count:matched.length,withPoints:matched.filter(m=>m.distance!==null).length,odd},control:{byPoint:{pair:[core.ids[pi],core.ids[qi]],judged:byPoint}}};
 if(arg('--json'))writeFileSync(arg('--json'),JSON.stringify(report,null,1)+'\n');
 const sign=a=>a.distance===null?'no point to compare':a.distance+' m';
 for(const a of added)console.log(`  ${a.suspicious?'SUSPICIOUS ':a.unverified?'UNVERIFIED ':''}${a.state} ${a.id} ${a.item}: ${a.ko??'-'} / ${a.en??'-'} (was ${a.before.ko}; Wikidata en ${a.labelEn}; ${sign(a)})`);
 for(const d of dropped)console.log(`  drops ${d.id} ${d.item}: ${d.shown.ko} / ${d.shown.en} (a name the current extract no longer gives)`);
 for(const m of odd)console.log(`  note: ${m.id} reached by the extract looks like another item (${sign(m)}; names agree ${m.named})`);
 const pass=control&&suspicious.length===0,checked=added.length-unverified.length;
 console.log(`Wikidata names audit on snapshot ${manifest.id} (${cards.length} hotels): ${added.filter(a=>a.state==='adds').length} hotels get names, ${added.filter(a=>a.state==='shows').length} keep them, ${dropped.length} lose them (Korean titles ${before.ko} -> ${now.ko}, English names ${before.en} -> ${now.en}); checked by point ${checked}, ${suspicious.length} suspicious, ${unverified.length} unverified and not covered by this verdict (of all ${matched.length} Trip.com hotels the extract reaches, ${odd.length} look odd); control: swapped points ${byPoint.filter(s=>s.suspicious).length}/2 flagged -> ${pass?'PASS':'FAIL'}`);
 if(!pass)process.exitCode=1;
 return` Public audit: ${checked} checked, ${suspicious.length} suspicious, ${unverified.length} unverified, ${pass?'PASS':'FAIL'}.`;
}
