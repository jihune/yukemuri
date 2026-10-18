// Refreshes data/wikidata-trip-names.json (D07): the Korean and English labels
// of Wikidata items in Japan with a Trip.com hotel ID (P10425), the same exact
// identifier as the D06 map points (scripts/geo/update-wikidata.mjs). Wikidata
// is CC0. One SPARQL GET; run by hand, then commit.
// Usage: node scripts/update-wikidata-names.mjs [--from saved-results.json]
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const OUT=resolve(ROOT,'data/wikidata-trip-names.json');
export const QUERY='SELECT ?item ?trip ?ko ?en WHERE { ?item wdt:P10425 ?trip ; wdt:P17 wd:Q17 . OPTIONAL { ?item rdfs:label ?ko FILTER(LANG(?ko)="ko") } OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en)="en") } }';
const HANGUL=/[가-힣]/;

// SPARQL JSON bindings -> sorted rows [tripId, qid, koLabel|null, enLabel|null].
// A Trip id on two items is left out; a Korean label without Hangul is dropped;
// an item with neither label is left out.
export function extract(bindings){
 const byTrip=new Map();
 for(const b of bindings){
  const trip=b.trip?.value,qid=b.item?.value?.split('/').pop();
  if(!/^\d+$/.test(trip??'')||!/^Q\d+$/.test(qid??''))continue;
  const list=byTrip.get(trip)??[];list.push({qid,ko:b.ko?.value?.trim()||null,en:b.en?.value?.trim()||null});byTrip.set(trip,list);
 }
 const rows=[],dropped=[];
 for(const [trip,list] of byTrip){
  if(new Set(list.map(x=>x.qid)).size>1){dropped.push(trip);continue}
  const ko=list.find(x=>x.ko&&HANGUL.test(x.ko))?.ko??null,en=list.find(x=>x.en)?.en??null;
  if(ko||en)rows.push([trip,list[0].qid,ko,en]);
 }
 rows.sort((a,b)=>Number(a[0])-Number(b[0]));
 return{rows,dropped:dropped.sort((a,b)=>Number(a)-Number(b))};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const from=process.argv.includes('--from')?process.argv[process.argv.indexOf('--from')+1]:null;
 let body;
 if(from)body=JSON.parse(readFileSync(from,'utf8'));
 else{
  const url='https://query.wikidata.org/sparql?query='+encodeURIComponent(QUERY);
  const response=await fetch(url,{headers:{Accept:'application/sparql-results+json','User-Agent':'YukemuriCatalogUpdater/1.0 (+https://github.com/jihune/yukemuri)'},signal:AbortSignal.timeout(120000)});
  // A 429 asks to wait (WDQS query limits); this script does not retry on its own.
  if(!response.ok)throw new Error('Wikidata SPARQL HTTP '+response.status+(response.headers.get('Retry-After')?', Retry-After '+response.headers.get('Retry-After'):''));
  body=await response.json();
 }
 const {rows,dropped}=extract(body.results.bindings);
 const data={source:'https://query.wikidata.org/sparql',query:QUERY,retrievedAt:new Date().toISOString(),license:'CC0-1.0',
  note:'Trip.com hotel ID (P10425) of an item in Japan -> its labels. Columns: tripId, item, Korean label, English label. Labels are not official names; lib/wikidata-names.ts shows them only where the collected record has none, with the item as source. Trip ids on two items are left out.',
  dropped,hotels:rows};
 writeFileSync(OUT,'{\n'+Object.entries(data).map(([k,v])=>' '+JSON.stringify(k)+':'+(k==='hotels'?'[\n'+v.map(r=>'  '+JSON.stringify(r)).join(',\n')+'\n ]':JSON.stringify(v))).join(',\n')+'\n}\n');
 console.log(`Wikidata names: ${body.results.bindings.length} bindings, ${rows.length} Trip ids written, ${dropped.length} left out, ${rows.filter(r=>r[2]).length} with a Korean label, ${rows.filter(r=>r[3]).length} with an English label.`);
}
