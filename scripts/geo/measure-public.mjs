// Measures D06 map positions on the public snapshot (GET only, no key, no D1):
// how many hotels get a point at each grade, and the error of the geocoder and
// of Wikidata against the payload coordinates of hotels that have them.
// The public files carry no address field: the address is read back from
// text.json context (location.label + location.address come first), so the
// input is close to, not the same as, what the deploy build sends.
// Usage: node scripts/geo/measure-public.mjs --db-dir <installed dictionary>
//   [--python venv/bin/python] [--origin https://yukemuri.jihune.workers.dev] [--json out.json]
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from '../build-search-snapshot.mjs';
import {addGeo,loadWikidata,dictionaryGeocoder,GRADE,GRADE_NAMES} from '../snapshot-geo.mjs';

const argv=process.argv.slice(2),arg=(name,fallback=null)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
const origin=arg('--origin','https://yukemuri.jihune.workers.dev'),dbDir=arg('--db-dir');
if(!dbDir)throw new Error('--db-dir is required');
const get=async path=>{const r=await fetch(origin+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(path+' HTTP '+r.status);return r.json()};
const manifest=await get('/snapshot/manifest.json');
const [core,cards,text]=await Promise.all(['core','cards','text'].map(n=>get(manifest.files[n])));
const temp=mkdtempSync(join(tmpdir(),'yukemuri-geo-measure-'));
try{
 const places=createRequire(import.meta.url)(compileLib(temp,'lib/japan-place-labels.ts',['lib/hotel-types.ts']));
 const PREFS=createRequire(import.meta.url)(join(temp,'lib/hotel-types.js')).PREFECTURES;
 const n=core.ids.length;
 // Address read back from the context: everything before the formatted label,
 // from the last place the prefecture's Japanese name starts (a label can be that name).
 const inputs=core.ids.map((id,i)=>{
  const context=text.context[i]??'',formatted=text.location[i]??'';
  let address=formatted?context.slice(0,Math.max(0,context.indexOf(' '+formatted+' ',1))):'';
  const ja=PREFS.find(p=>p.id===core.prefecture[i]||p.id===core.region[i])?.ja;
  if(ja&&address.includes(ja))address=address.slice(address.lastIndexOf(ja));
  return places.geocodeInput({prefecture:core.prefecture[i],regionId:core.region[i],location:{label:cards[i].location.label,address},names:{ja:cards[i].names.ja??''}});
 });
 const started=performance.now();
 const answers=await dictionaryGeocoder({dbDir,python:arg('--python','python3')})(inputs);
 const seconds=((performance.now()-started)/1000).toFixed(1);
 // Coverage as the deploy build would make it.
 const geo={grade:core.lat.map(v=>v===null?GRADE.none:GRADE.source),lat:[...core.lat],lng:[...core.lng]};
 const wikidata=loadWikidata();
 const summary=await addGeo({ids:core.ids,geo,inputs:inputs.map((x,i)=>core.lat[i]===null?x:null),wikidata,geocode:async list=>{const wanted=core.ids.flatMap((_,i)=>geo.grade[i]===GRADE.none?[i]:[]);if(wanted.length!==list.length)throw new Error('order');return wanted.map(i=>answers[i])}});
 const provider=id=>id.startsWith('jalan-')?'jalan':id.startsWith('trip-')?'trip':'curated';
 const byProvider={};core.ids.forEach((id,i)=>{const p=provider(id);byProvider[p]??=GRADE_NAMES.map(()=>0);byProvider[p][geo.grade[i]]++});
 // Errors against payload coordinates (the reference is itself not ground truth).
 const rad=d=>d*Math.PI/180,metres=(a,b,c,d)=>{const x=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 2*6371008.8*Math.asin(Math.sqrt(x))};
 const q=(sorted,p)=>sorted.length?Math.round(sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)+0.5))]):null;
 const stats=list=>{const s=[...list].sort((a,b)=>a-b);return{count:s.length,median:q(s,.5),p75:q(s,.75),p90:q(s,.9),p95:q(s,.95),within500:s.filter(v=>v<=500).length,over5km:s.filter(v=>v>5000).length}};
 const errors={},reference=core.ids.flatMap((id,i)=>core.lat[i]!==null&&id.startsWith('jalan-')?[i]:[]);
 for(const i of reference){const a=answers[i];if(!a)continue;(errors[a[2]]??=[]).push(metres(core.lat[i],core.lng[i],a[0],a[1]))}
 const wd=core.ids.flatMap((id,i)=>{const p=core.lat[i]!==null&&/^trip-\d+$/.test(id)?wikidata.get(id.slice(5)):null;return p?[metres(core.lat[i],core.lng[i],p[0],p[1])]:[]});
 const result={snapshot:manifest.id,generatedAt:manifest.generatedAt,hotels:n,geocoderSeconds:Number(seconds),counts:summary.counts,byProvider,
  reference:{hotels:reference.length,unmatched:reference.filter(i=>!answers[i]).length,byGrade:Object.fromEntries(Object.entries(errors).map(([g,v])=>[GRADE_NAMES[g],stats(v)])),all:stats(Object.values(errors).flat())},
  wikidataVsPayload:stats(wd)};
 if(arg('--json'))writeFileSync(arg('--json'),JSON.stringify(result,null,1)+'\n');
 const pct=v=>(100*v/n).toFixed(1)+'%';
 console.log(`Snapshot ${manifest.id} (${manifest.generatedAt}), ${n} hotels; geocoder ${seconds}s for ${n} inputs.`);
 console.log('| 등급 | 숙소 | 비율 | Jalan | Trip | 큐레이션 |\n|---|---|---|---|---|---|');
 GRADE_NAMES.forEach((name,g)=>console.log(`| ${g} ${name} | ${summary.counts[g]} | ${pct(summary.counts[g])} | ${byProvider.jalan?.[g]??0} | ${byProvider.trip?.[g]??0} | ${byProvider.curated?.[g]??0} |`));
 console.log(`\n기준: Jalan 출처 좌표 ${reference.length}곳(지오코더 미매칭 ${result.reference.unmatched}곳)\n| 지오코더 등급 | 표본 | 중앙값 | 75% | 90% | 95% | 500m 안 | 5km 초과 |\n|---|---|---|---|---|---|---|---|`);
 for(const [name,s] of [...Object.entries(result.reference.byGrade),['전체',result.reference.all],['Wikidata 대 출처(Trip)',result.wikidataVsPayload]])console.log(`| ${name} | ${s.count} | ${s.median}m | ${s.p75}m | ${s.p90}m | ${s.p95}m | ${s.within500} | ${s.over5km} |`);
}finally{rmSync(temp,{recursive:true,force:true})}
