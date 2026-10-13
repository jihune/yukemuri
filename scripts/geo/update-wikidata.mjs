// Refreshes data/wikidata-trip-hotels.json (D06): Wikidata items in Japan with
// a Trip.com hotel ID (P10425) and a coordinate (P625), with the Korean label
// when there is one. Wikidata is CC0. One SPARQL GET; run by hand, then commit.
// Usage: node scripts/geo/update-wikidata.mjs [--from saved-results.json]
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const OUT=resolve(ROOT,'data/wikidata-trip-hotels.json');
export const QUERY='SELECT ?item ?trip ?coord ?ko WHERE { ?item wdt:P10425 ?trip ; wdt:P17 wd:Q17 ; wdt:P625 ?coord . OPTIONAL { ?item rdfs:label ?ko FILTER(LANG(?ko)="ko") } }';
// Two coordinates of one item further apart than this (degrees, about 200 m)
// make that Trip id unusable, as does a Trip id on two items.
const SPREAD=0.002;

// SPARQL JSON bindings -> sorted rows [tripId, qid, lat, lng, koLabel|null].
export function extract(bindings){
 const byTrip=new Map();
 for(const b of bindings){
  const trip=b.trip?.value,qid=b.item?.value?.split('/').pop(),m=/^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(b.coord?.value??'');
  if(!/^\d+$/.test(trip??'')||!/^Q\d+$/.test(qid??'')||!m)continue;
  const list=byTrip.get(trip)??[];list.push({qid,lat:Number(m[2]),lng:Number(m[1]),ko:b.ko?.value??null});byTrip.set(trip,list);
 }
 const rows=[],dropped=[];
 for(const [trip,list] of byTrip){
  const items=new Set(list.map(x=>x.qid)),lats=list.map(x=>x.lat),lngs=list.map(x=>x.lng);
  if(items.size>1||Math.max(...lats)-Math.min(...lats)>SPREAD||Math.max(...lngs)-Math.min(...lngs)>SPREAD){dropped.push(trip);continue}
  const mean=v=>Math.round(v.reduce((a,b)=>a+b,0)/v.length*1e6)/1e6;
  rows.push([trip,list[0].qid,mean(lats),mean(lngs),list.find(x=>x.ko)?.ko??null]);
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
  if(!response.ok)throw new Error('Wikidata SPARQL HTTP '+response.status);
  body=await response.json();
 }
 const {rows,dropped}=extract(body.results.bindings);
 const data={source:'https://query.wikidata.org/sparql',query:QUERY,retrievedAt:new Date().toISOString(),license:'CC0-1.0',
  note:'Trip.com hotel ID (P10425) -> Wikidata point. Columns: tripId, item, lat, lng, Korean label (unverified, not shown). Trip ids on two items or with coordinates over about 200 m apart are left out.',
  dropped,hotels:rows};
 writeFileSync(OUT,'{\n'+Object.entries(data).map(([k,v])=>' '+JSON.stringify(k)+':'+(k==='hotels'?'[\n'+v.map(r=>'  '+JSON.stringify(r)).join(',\n')+'\n ]':JSON.stringify(v))).join(',\n')+'\n}\n');
 console.log(`Wikidata: ${body.results.bindings.length} bindings, ${rows.length} Trip ids written, ${dropped.length} left out, ${rows.filter(r=>r[4]).length} with a Korean label.`);
}
