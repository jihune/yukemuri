// D07 Wikidata names: the rule (lib/wikidata-names.ts) on fixture labels, the extract
// (data/wikidata-trip-names.json) and its refresh (scripts/update-wikidata-names.mjs).
// With --public, the rule runs on the public snapshot: every name it would add is listed with
// two signs that the Trip.com id points at another hotel on Wikidata (its point over 1 km from
// our source coordinates, or its English label sharing no word with our names), and a control
// pairs one hotel with another hotel's item to prove those signs fire.
// Usage: node scripts/check-wikidata-names.mjs [--public [--dir saved-snapshot] [--previous extract.json] [--json out.json]]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
import {extract,OUT} from './update-wikidata-names.mjs';

const require=createRequire(import.meta.url),argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:null;
const temp=mkdtempSync(join(tmpdir(),'yukemuri-wikidata-names-'));
// Trip.com cards that show their item's label as their own name, though the item disagrees with
// them, each checked by hand: the public snapshot named here was built before lib/wikidata-names.ts.
const OWN_NAMES=new Map([
 ['trip-993398','2026-10-18: 삿포로 엑셀 호텔 도큐 in snapshot 2004e2cb8ddb5a06 (before the rule); the item\'s English label is misspelt "Sappro Excel Hotel Tokyu"'],
]);
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
 // Signs that the item is another hotel: its point over 1 km from our source point, or no
 // name of ours whose Latin words and its English label's contain one another (a chain
 // hotel elsewhere differs in its place word). Nothing to compare gives no sign.
 const judge=(card,i,label,point)=>{
  const ours=core.lat[i]!==null?[core.lat[i],core.lng[i]]:null,distance=ours&&point?km(ours,point):null;
  const theirs=words(label.en),mine=Object.values(card.names).map(words).filter(w=>w.size);
  const named=theirs.size&&mine.length?mine.some(w=>within(w,theirs)):null;
  return{distance:distance===null?null:Math.round(distance*1000),named,suspicious:distance!==null&&distance>1||named===false};
 };
 const shown=list=>({ko:list.filter(c=>displayNames(c.names).titleLang==='ko').length,en:list.filter(c=>{const d=displayNames(c.names);return d.titleLang==='en'||d.en!==null}).length});
 // The cards show names some extract's rule added (Codex P2 on PR #145, rounds 1-3). --previous is
 // the extract the shown snapshot was built with: by default the one on origin/main, which every
 // merge deploys, else the current one. A card that rule named is put back to the names it had
 // before (its original in place of the added name), then named again with the current extract:
 // a name the next deploy keeps or adds ('shows', 'adds') is judged, one it drops ('drops') is
 // listed. A shown label no rule explains whose item disagrees with the hotel fails, unless
 // OWN_NAMES records that the hotel showed that name before the rule existed (a match by chance).
 const previousText=arg('--previous')?readFileSync(arg('--previous'),'utf8'):(()=>{try{return execFileSync('git',['show','origin/main:data/wikidata-trip-names.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch{return readFileSync(OUT,'utf8')}})();
 const previousDir=mkdtempSync(join(temp,'previous-')),previousEntry=compileLib(previousDir,'lib/wikidata-names.ts');
 writeFileSync(join(previousDir,'data/wikidata-trip-names.json'),previousText);
 const {withWikidataNames:previousRule}=require(previousEntry);
 const previous=JSON.parse(previousText),previousLabels=new Map(previous.hotels.map(([trip,item,ko,en])=>[trip,{item,ko,en}]));
 const same=(a,b)=>a.ko===b.ko&&a.ja===b.ja&&a.en===b.en;
 const after=[],added=[],dropped=[],coincident=[];
 cards.forEach((card,i)=>{
  const trip=/^trip-\d+$/.test(card.id)?card.id.slice(5):null,label=trip&&labels.get(trip),old=trip&&previousLabels.get(trip);
  if(!label&&!old){after.push(card);return}
  const fromOld={ko:old?.ko&&card.names.ko===old.ko,en:old?.en&&card.names.en===old.en&&card.names.en!==card.names.ja};
  const reverted={...card.names,...(fromOld.ko?{ko:card.names.ja}:{}),...(fromOld.en?{en:card.names.ja}:{})};
  const explained=(fromOld.ko||fromOld.en)&&same(previousRule({...card,names:reverted,aliases:[],sources:[]}).names,card.names);
  const base=explained?{...card,names:reverted}:card,h=withWikidataNames({...base,aliases:[],sources:[]});
  after.push({...card,names:h.names});
  if(h.names!==base.names){
   added.push({id:card.id,item:label.item,state:same(h.names,card.names)?'shows':'adds',before:base.names,ko:h.names.ko!==base.names.ko?h.names.ko:null,en:h.names.en!==base.names.en?h.names.en:null,labelEn:label.en,grade:geo?.grade[i]??null,...judge(base,i,label,points.get(trip))});
   return;
  }
  if(explained){dropped.push({id:card.id,item:old.item,shown:card.names,next:reverted});return}
  const ko=label?.ko&&card.names.ko===label.ko?label.ko:null,en=label?.en&&card.names.en===label.en&&card.names.en!==card.names.ja?label.en:null;
  if(!ko&&!en)return;
  const j=judge(card,i,label,points.get(trip));
  if(j.named!==false)return;
  if(OWN_NAMES.has(card.id)){coincident.push({id:card.id,item:label.item,ko,en,labelEn:label.en,reviewed:OWN_NAMES.get(card.id),...j});return}
  added.push({id:card.id,item:label.item,state:'unexplained',before:card.names,ko,en,labelEn:label.en,grade:geo?.grade[i]??null,...j});
 });
 // Controls: each hotel judged against another hotel's item must be flagged. By point: two
 // Trip.com hotels with both points over 1 km apart. By name: the hotels above, each against
 // the next one's label.
 const [pi,qi]=core.ids.flatMap((id,i)=>/^trip-\d+$/.test(id)&&labels.has(id.slice(5))&&points.has(id.slice(5))&&core.lat[i]!==null?[i]:[]).filter((i,n,all)=>n===0||judge(cards[all[0]],all[0],labels.get(core.ids[i].slice(5)),points.get(core.ids[i].slice(5))).distance>1000);
 assert(pi!==undefined&&qi!==undefined,'two hotels over 1 km apart to swap');assert(added.length>=2,'two named hotels to swap labels');
 const swap=(i,j)=>judge(cards[i],i,labels.get(core.ids[j].slice(5)),points.get(core.ids[j].slice(5)));
 const byPoint=[swap(pi,qi),swap(qi,pi)],at=added.map(a=>core.ids.indexOf(a.id));
 const byName=at.map((i,n)=>({id:core.ids[i],label:labels.get(core.ids[at[(n+1)%at.length]].slice(5)).en,...judge(cards[i],i,labels.get(core.ids[at[(n+1)%at.length]].slice(5)),null)}));
 const missed=byName.filter(c=>!c.suspicious),control=byPoint.every(s=>s.suspicious)&&missed.length===0;
 const before=shown(cards),now=shown(after),suspicious=added.filter(a=>a.suspicious);
 // Every Trip.com hotel the extract reaches, named or not: how often its item looks like another hotel.
 const matched=core.ids.flatMap((id,i)=>/^trip-\d+$/.test(id)&&labels.has(id.slice(5))?[{id,...judge(cards[i],i,labels.get(id.slice(5)),points.get(id.slice(5)))}]:[]);
 const odd=matched.filter(m=>m.suspicious);
 const report={snapshot:manifest.id,generatedAt:manifest.generatedAt,hotels:cards.length,checkedAt:new Date().toISOString(),koreanTitles:{before:before.ko,after:now.ko},englishNames:{before:before.en,after:now.en},added,dropped,coincident,previousExtract:previous.retrievedAt,suspicious:suspicious.map(a=>a.id),matched:{count:matched.length,withPoints:matched.filter(m=>m.distance!==null).length,suspicious:odd},control:{byPoint:{pair:[core.ids[pi],core.ids[qi]],judged:byPoint},byName}};
 if(arg('--json'))writeFileSync(arg('--json'),JSON.stringify(report,null,1)+'\n');
 for(const a of added)console.log(`  ${a.suspicious?'SUSPICIOUS ':''}${a.state} ${a.id} ${a.item}: ${a.ko??'-'} / ${a.en??'-'} (was ${a.before.ko}; Wikidata en ${a.labelEn}; ${a.distance===null?'no point to compare':a.distance+' m'}; names agree ${a.named})`);
 for(const c of missed)console.log(`  CONTROL MISSED ${c.id} against ${c.label}`);
 for(const d of dropped)console.log(`  drops ${d.id} ${d.item}: ${d.shown.ko} / ${d.shown.en} (an older extract's name the current one no longer gives)`);
 for(const c of coincident)console.log(`  note: ${c.id} shows ${c.ko??c.en}, the label of ${c.item}, which disagrees with it (${c.labelEn}); its own name by OWN_NAMES: ${c.reviewed}`);
 for(const m of odd)console.log(`  note: ${m.id} reached by the extract but not named here looks like another item (${m.distance===null?'no point':m.distance+' m'}; names agree ${m.named})`);
 const pass=control&&suspicious.length===0;
 console.log(`Wikidata names audit on snapshot ${manifest.id} (${cards.length} hotels): ${added.filter(a=>a.state==='adds').length} hotels get names, ${added.filter(a=>a.state==='shows').length} already show them, ${dropped.length} lose an older extract's name (previous extract ${previous.retrievedAt}; Korean titles ${before.ko} -> ${now.ko}, English names ${before.en} -> ${now.en}); ${suspicious.length} suspicious (of all ${matched.length} Trip.com hotels the extract reaches, ${odd.length} look odd); controls: swapped points ${byPoint.filter(s=>s.suspicious).length}/2, swapped labels ${byName.length-missed.length}/${byName.length} flagged -> ${pass?'PASS':'FAIL'}`);
 if(!pass)process.exitCode=1;
 return` Public audit: ${added.length} hotels, ${suspicious.length} suspicious, ${pass?'PASS':'FAIL'}.`;
}
