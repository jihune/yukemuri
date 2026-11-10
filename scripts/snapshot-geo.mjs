// Map positions of the search snapshot (D06): for hotels without payload
// coordinates, a Wikidata point (Trip.com hotel ID P10425, exact match) and
// otherwise the offline geocoder (scripts/geo/geocode.py with the jageocoder
// dictionary pinned in scripts/geo/pins.json). Then an approximate point
// (grades 3-6) moves to its Overture Maps place (D08, data/overture-geo.json)
// when the move stays within its grade's range. Nothing here reads or writes D1.
// A geocoder that is missing or fails leaves those hotels as they were: the
// snapshot is built and deployed without its points, and the summary says why.
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const WIKIDATA_FILE=join(ROOT,'data/wikidata-trip-hotels.json');
export const OVERTURE_FILE=join(ROOT,'data/overture-geo.json');
// The geocoder: its script, the dictionary pins and the package pins.
export const GEOCODER_DIR=join(ROOT,'scripts/geo');
// lib/search-snapshot.ts GEO_GRADE (compiled there; repeated for the plain script).
export const GRADE={none:0,source:1,block:2,oaza:3,city:4,prefecture:5,wikidata:6,overture:7};
export const GRADE_NAMES=['없음','출처','街区','大字','시정촌','도도부현','Wikidata','Overture'];
// How far an Overture point may move an approximate point (docs/D08-20261019.md 11.6).
export const OVERTURE_MOVE={[GRADE.oaza]:5000,[GRADE.city]:20000,[GRADE.prefecture]:20000,[GRADE.wikidata]:20000};
// The collector's bounds for a coordinate in Japan (lib/crawl-contract.ts).
const inJapan=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=20&&lat<=46.5&&lng>=122&&lng<=154;
const round=v=>Math.round(v*1e6)/1e6;
const meters=(a,b,c,d)=>{const r=Math.PI/180,h=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742000*Math.asin(Math.sqrt(h))};

// Trip.com hotel id -> [lat, lng] from the committed Wikidata extract.
export function loadWikidata(file=WIKIDATA_FILE){
 const data=JSON.parse(readFileSync(file,'utf8'));
 if(data.license!=='CC0-1.0'||!Array.isArray(data.hotels))throw new Error('Unexpected Wikidata extract: '+file);
 const points=new Map();
 for(const [trip,,lat,lng] of data.hotels)if(/^\d+$/.test(trip)&&inJapan(lat,lng))points.set(trip,[lat,lng]);
 return points;
}

// Hotel id -> [lat, lng] from the committed Overture extract (scripts/geo/update-overture.py).
// Every row's first source needs a license the site serves the text of (CC0 needs none);
// otherwise the whole extract is refused and the snapshot is built without it.
export function loadOverture(file=OVERTURE_FILE){
 const data=JSON.parse(readFileSync(file,'utf8'));
 const served=license=>license==='CC0-1.0'||!!data.licenseTexts?.[license];
 if(!Array.isArray(data.hotels)||!data.hotels.every(r=>served(data.sources?.[r[5]])))throw new Error('Unexpected Overture extract: '+file);
 const points=new Map();
 for(const [id,,lat,lng] of data.hotels)if(inJapan(lat,lng))points.set(id,[lat,lng]);
 return points;
}

// The geocoder as a function of the inputs; throws when it cannot run or its
// answer is not one entry per input.
export function dictionaryGeocoder({dbDir,python='python3',timeout=600000}){
 return async inputs=>{
  if(!existsSync(join(dbDir,'README.md')))throw new Error('no installed dictionary in '+dbDir);
  const r=spawnSync(python,['-I',join(GEOCODER_DIR,'geocode.py'),'--db-dir',dbDir],{input:JSON.stringify(inputs),encoding:'utf8',maxBuffer:64*1024*1024,timeout});
  if(r.error)throw new Error('geocoder did not run: '+r.error.code);
  if(r.status!==0)throw new Error('geocoder exit '+r.status+': '+String(r.stderr).trim().split('\n').at(-1)?.slice(0,200));
  return JSON.parse(r.stdout);
 };
}

// Adds approximate points to geo (grade/lat/lng in core order) where the
// grade is none: Wikidata first, then the geocoder; then Overture moves those
// at grades 3-6. geocode: a function as dictionaryGeocoder returns, or null
// with skipReason. overture: hotel id -> point (loadOverture).
export async function addGeo({ids,geo,inputs,wikidata=new Map(),geocode=null,skipReason='no geocoder dictionary',overture=new Map()}){
 const open=i=>geo.grade[i]===GRADE.none,unplaced=ids.map((_,i)=>open(i));
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
 // A payload point never moves; an approximate one only within its grade's range.
 let moved=0,tooFar=0;
 ids.forEach((id,i)=>{
  const point=unplaced[i]&&OVERTURE_MOVE[geo.grade[i]]?overture.get(id):undefined;
  if(!point)return;
  if(meters(geo.lat[i],geo.lng[i],point[0],point[1])>OVERTURE_MOVE[geo.grade[i]]){tooFar++;return}
  set(i,point[0],point[1],GRADE.overture);moved++;
 });
 const counts=GRADE_NAMES.map(()=>0);for(const g of geo.grade)counts[g]++;
 return{status,reason,asked:wanted.length,rejected,counts,overture:{moved,tooFar,points:overture.size}};
}

export function geoSummary(s){
 const total=s.counts.reduce((a,b)=>a+b,0),placed=total-s.counts[GRADE.none];
 const pct=n=>total?(100*n/total).toFixed(1)+'%':'0%';
 const lines=[`  map positions: ${placed}/${total} (${pct(placed)}) — `+GRADE_NAMES.map((name,g)=>`${g} ${name} ${s.counts[g]}`).join(', ')];
 lines.push(s.status==='ok'?`  geocoder: ${s.asked} asked${s.rejected?`, ${s.rejected} answers out of range ignored`:''}`:`  geocoder ${s.status}, snapshot built without its points: ${s.reason}`);
 lines.push(`  Overture: ${s.overture.moved} approximate points moved (${s.overture.points} in the Overture extract${s.overture.tooFar?`, ${s.overture.tooFar} left beyond their grade's range`:''})`);
 return lines.join('\n');
}
