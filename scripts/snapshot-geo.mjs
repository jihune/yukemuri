// Map positions of the search snapshot (D06): for hotels without payload
// coordinates, a Wikidata point (Trip.com hotel ID P10425, exact match) and
// otherwise the offline geocoder (scripts/geo/geocode.py with the jageocoder
// dictionary pinned in scripts/geo/pins.json). Nothing here reads or writes D1.
// A geocoder that is missing or fails leaves those hotels as they were: the
// snapshot is built and deployed without its points, and the summary says why.
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const WIKIDATA_FILE=join(ROOT,'data/wikidata-trip-hotels.json');
// lib/search-snapshot.ts GEO_GRADE (compiled there; repeated for the plain script).
export const GRADE={none:0,source:1,block:2,oaza:3,city:4,prefecture:5,wikidata:6};
export const GRADE_NAMES=['없음','출처','街区','大字','시정촌','도도부현','Wikidata'];
// The collector's bounds for a coordinate in Japan (lib/crawl-contract.ts).
const inJapan=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=20&&lat<=46.5&&lng>=122&&lng<=154;
const round=v=>Math.round(v*1e6)/1e6;

// Trip.com hotel id -> [lat, lng] from the committed Wikidata extract.
export function loadWikidata(file=WIKIDATA_FILE){
 const data=JSON.parse(readFileSync(file,'utf8'));
 if(data.license!=='CC0-1.0'||!Array.isArray(data.hotels))throw new Error('Unexpected Wikidata extract: '+file);
 const points=new Map();
 for(const [trip,,lat,lng] of data.hotels)if(/^\d+$/.test(trip)&&inJapan(lat,lng))points.set(trip,[lat,lng]);
 return points;
}

// The geocoder as a function of the inputs; throws when it cannot run or its
// answer is not one entry per input.
export function dictionaryGeocoder({dbDir,python='python3',timeout=600000}){
 return async inputs=>{
  if(!existsSync(join(dbDir,'README.md')))throw new Error('no installed dictionary in '+dbDir);
  const r=spawnSync(python,['-I',join(ROOT,'scripts/geo/geocode.py'),'--db-dir',dbDir],{input:JSON.stringify(inputs),encoding:'utf8',maxBuffer:64*1024*1024,timeout});
  if(r.error)throw new Error('geocoder did not run: '+r.error.code);
  if(r.status!==0)throw new Error('geocoder exit '+r.status+': '+String(r.stderr).trim().split('\n').at(-1)?.slice(0,200));
  return JSON.parse(r.stdout);
 };
}

// Adds approximate points to geo (grade/lat/lng in core order) where the
// grade is none: Wikidata first, then the geocoder. geocode: a function as
// dictionaryGeocoder returns, or null with skipReason.
export async function addGeo({ids,geo,inputs,wikidata=new Map(),geocode=null,skipReason='no geocoder dictionary'}){
 const open=i=>geo.grade[i]===GRADE.none;
 const set=(i,lat,lng,grade)=>{geo.lat[i]=round(lat);geo.lng[i]=round(lng);geo.grade[i]=grade};
 for(let i=0;i<ids.length;i++){
  const point=open(i)&&/^trip-\d+$/.test(ids[i])?wikidata.get(ids[i].slice(5)):undefined;
  if(point)set(i,point[0],point[1],GRADE.wikidata);
 }
 const wanted=ids.flatMap((_,i)=>open(i)&&inputs[i]?[i]:[]);
 let status='skipped',reason=skipReason,rejected=0;
 if(geocode&&wanted.length){
  try{
   const found=await geocode(wanted.map(i=>inputs[i]));
   if(!Array.isArray(found)||found.length!==wanted.length)throw new Error('geocoder answered '+(Array.isArray(found)?found.length:typeof found)+' entries for '+wanted.length);
   wanted.forEach((i,n)=>{
    const f=found[n];if(f===null)return;
    const [lat,lng,grade]=Array.isArray(f)?f:[];
    if(inJapan(lat,lng)&&Number.isInteger(grade)&&grade>=GRADE.block&&grade<=GRADE.prefecture)set(i,lat,lng,grade);else rejected++;
   });
   status='ok';reason=null;
  }catch(error){status='failed';reason=String(error.message??error).slice(0,300)}
 }else if(geocode){status='ok';reason=null}
 const counts=GRADE_NAMES.map(()=>0);for(const g of geo.grade)counts[g]++;
 return{status,reason,asked:wanted.length,rejected,counts};
}

export function geoSummary(s){
 const total=s.counts.reduce((a,b)=>a+b,0),placed=total-s.counts[GRADE.none];
 const pct=n=>total?(100*n/total).toFixed(1)+'%':'0%';
 const lines=[`  map positions: ${placed}/${total} (${pct(placed)}) — `+GRADE_NAMES.map((name,g)=>`${g} ${name} ${s.counts[g]}`).join(', ')];
 lines.push(s.status==='ok'?`  geocoder: ${s.asked} asked${s.rejected?`, ${s.rejected} answers out of range ignored`:''}`:`  geocoder ${s.status}, snapshot built without its points: ${s.reason}`);
 return lines.join('\n');
}
