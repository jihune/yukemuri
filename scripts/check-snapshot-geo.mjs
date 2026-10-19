// D06 map positions without the 351MB dictionary: the geocoder's answers are
// fixtures. Checks the order (payload coordinates, Wikidata, geocoder), the
// grades, a snapshot without the geocoder when it is missing or fails, the
// geocoder input from place labels, the Wikidata extract, and the dictionary's
// credit verbatim in the page source and, with --built, in dist/client/index.html.
// Usage: node scripts/check-snapshot-geo.mjs [--built]
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {addGeo,loadWikidata,loadOverture,dictionaryGeocoder,geoSummary,GRADE,WIKIDATA_FILE,OVERTURE_FILE} from './snapshot-geo.mjs';
import {extract} from './geo/update-wikidata.mjs';
import {compileLib} from './build-search-snapshot.mjs';

const temp=mkdtempSync(join(tmpdir(),'yukemuri-geo-check-'));
try{
 const lib=createRequire(import.meta.url)(compileLib(temp,'lib/japan-place-labels.ts',['lib/search-snapshot.ts','lib/geo-attribution.ts']));
 const snapshotLib=createRequire(import.meta.url)(join(temp,'lib/search-snapshot.js'));
 assert.deepEqual(snapshotLib.GEO_GRADE,GRADE,'scripts/snapshot-geo.mjs GRADE is lib/search-snapshot.ts GEO_GRADE');

 // Order and grades. Rows: payload point, Trip with a Wikidata point,
 // Jalan geocoded to a block, Trip by postcode, Trip by city, nothing found,
 // an answer outside Japan, a payload point Wikidata also has.
 const ids=['jalan-1','trip-100','jalan-2','trip-200','trip-300','jalan-3','jalan-4','trip-400'];
 const fresh=()=>({grade:[1,0,0,0,0,0,0,1],lat:[35.1,null,null,null,null,null,null,34.5],lng:[139.1,null,null,null,null,null,null,135.5]});
 const inputs=[null,{address:'',prefecture:'東京都',places:['東京都']},{address:'長崎県諫早市天満町３６―１１',prefecture:'長崎県',places:[]},{address:'250-0407 Hakone',prefecture:'神奈川県',places:[]},{address:'',prefecture:'東京都',places:['東京都新宿区','東京都']},{address:'?',prefecture:null,places:[]},{address:'x',prefecture:'沖縄県',places:[]},null];
 const wikidata=new Map([['100',[35.6812345678,139.7654321]],['400',[1,1]]]);
 const answers=[[32.85677,130.04475,2],[35.2379,139.0385,3],[35.69389,139.70346,4],null,[10,10,3]];
 let asked;const fixture=async list=>{asked=list;return answers};
 let geo=fresh();
 let s=await addGeo({ids,geo,inputs,wikidata,geocode:fixture});
 assert.equal(s.status,'ok');assert.equal(s.asked,5);assert.equal(s.rejected,1);
 assert.deepEqual(asked,inputs.slice(2,7),'only hotels without a payload or Wikidata point are geocoded');
 assert.deepEqual(geo.grade,[1,6,2,3,4,0,0,1]);
 assert.deepEqual([geo.lat[0],geo.lng[0],geo.lat[7],geo.lng[7]],[35.1,139.1,34.5,135.5],'payload coordinates always win, even over Wikidata');
 assert.deepEqual([geo.lat[1],geo.lng[1]],[35.681235,139.765432],'Wikidata point, rounded to 6 decimals');
 assert.deepEqual([geo.lat[6],geo.lng[6]],[null,null],'an answer outside Japan is ignored');
 assert.deepEqual(s.counts,[2,2,1,1,1,0,1,0]);
 assert.match(geoSummary(s),/map positions: 6\/8 \(75\.0%\)/);
 // The geocoder cannot claim a payload or Wikidata grade, nor one it does not have.
 for(const grade of [0,1,6,7,2.5]){
  const g={grade:[0],lat:[null],lng:[null]},r=await addGeo({ids:['jalan-9'],geo:g,inputs:[inputs[2]],geocode:async()=>[[35,139,grade]]});
  assert.deepEqual([g.grade[0],r.rejected],[0,1],'grade '+grade+' from the geocoder is refused');
 }
 // Without a geocoder (dictionary missing): Wikidata only, the reason kept.
 geo=fresh();s=await addGeo({ids,geo,inputs,wikidata,geocode:null,skipReason:'dictionary download failed'});
 assert.deepEqual([s.status,s.reason],['skipped','dictionary download failed']);assert.deepEqual(geo.grade,[1,6,0,0,0,0,0,1]);
 assert.match(geoSummary(s),/geocoder skipped, snapshot built without its points: dictionary download failed/);
 // A geocoder that fails or answers the wrong number of rows adds nothing.
 for(const bad of [async()=>{throw new Error('boom')},async()=>answers.slice(1),async()=>({})]){
  geo=fresh();s=await addGeo({ids,geo,inputs,wikidata,geocode:bad});
  assert.equal(s.status,'failed');assert(s.reason);assert.deepEqual(geo.grade,[1,6,0,0,0,0,0,1]);assert.deepEqual(geo.lat.slice(2,7),[null,null,null,null,null]);
 }
 // Overture (D08): only an approximate point (grades 3-6) moves, and only within
 // 5 km (grade 3) or 20 km (grades 4-6). Rows: payload point, block, oaza 3 km,
 // oaza 6 km, city 15 km, Wikidata 10 km, prefecture 25 km, nothing found,
 // the seed's approximate payload point (grade 4), oaza without an Overture point.
 {
  const ids=['jalan-11','jalan-12','jalan-13','jalan-14','jalan-15','trip-16','jalan-17','jalan-18','jalan-19','jalan-20'];
  const start=()=>({grade:[1,0,0,0,0,0,0,0,4,0],lat:[35,null,null,null,null,null,null,null,35,null],lng:[139,null,null,null,null,null,null,null,139,null]});
  const inputs=ids.map((_,i)=>[0,8].includes(i)?null:{address:'x',prefecture:'東京都',places:[]});
  const found=[[35,139,2],[35,139,3],[35,139,3],[35,139,4],[35,139,5],null,[35,139,3]];
  const near=[['jalan-11',0.001],['jalan-12',0.001],['jalan-13',0.027],['jalan-14',0.054],['jalan-15',0.135],['trip-16',0.09],['jalan-17',0.225],['jalan-18',0.001],['jalan-19',0.001]];
  const overture=new Map(near.map(([id,d])=>[id,[35+d,139]]));
  let g=start(),r=await addGeo({ids,geo:g,inputs,wikidata:new Map([['16',[35,139]]]),geocode:async()=>found,overture});
  assert.deepEqual(g.grade,[1,2,7,3,7,7,5,0,4,3],'grades 3-6 within range move; payload, block, too far and no point stay');
  assert.deepEqual([g.lat[2],g.lat[4],g.lat[5]],[35.027,35.135,35.09]);assert.deepEqual([g.lat[0],g.lat[1],g.lat[3],g.lat[6],g.lat[8]],[35,35,35,35,35]);
  assert.deepEqual(r.overture,{moved:3,tooFar:2,points:9});assert.deepEqual(r.counts,[1,1,1,2,1,1,0,3]);
  assert.match(geoSummary(r),/Overture: 3 approximate points moved \(9 in the Overture extract, 2 left beyond their grade's range\)/);
  // Without the geocoder only the Wikidata point is approximate, and it still moves.
  g=start();r=await addGeo({ids,geo:g,inputs,wikidata:new Map([['16',[35,139]]]),geocode:null,overture});
  assert.deepEqual(g.grade,[1,0,0,0,0,7,0,0,4,0]);assert.equal(r.overture.moved,1);
  // Without Overture points nothing moves.
  g=start();r=await addGeo({ids,geo:g,inputs,wikidata:new Map([['16',[35,139]]]),geocode:async()=>found});
  assert.deepEqual(g.grade,[1,2,3,3,4,6,5,0,4,3]);assert.deepEqual(r.overture,{moved:0,tooFar:0,points:0});
 }
 // The committed Overture extract: every first source under a license whose text is
 // served (CDLA Permissive 2.0, Apache 2.0 with Foursquare's NOTICE.txt) or CC0, one
 // point per hotel in Japan, confidence 0.5 or more, every first source credited.
 const ov=JSON.parse(readFileSync(OVERTURE_FILE,'utf8')),ovPoints=loadOverture();
 assert(ov.hotels.length>1000&&ovPoints.size===ov.hotels.length,'one point per hotel, all in Japan');
 assert(ov.hotels.every(r=>/^[a-z]+-\d+$/.test(r[0])&&r[4]>=0.5),'hotel ids and confidence 0.5 or more');
 const TEXTS={'CDLA-Permissive-2.0':t=>t.startsWith('Community Data License Agreement - Permissive - Version 2.0\n')&&t.includes('makes available the text of this agreement with the shared Data'),
  'Apache-2.0':t=>/^\s*Apache License\s+Version 2\.0, January 2004/.test(t)&&t.includes('You must give any other recipients of the Work or\n          Derivative Works a copy of this License')};
 const texts=Object.fromEntries(Object.entries(ov.licenseTexts).map(([k,path])=>[k,readFileSync(path,'utf8')]));
 for(const license of new Set(Object.values(ov.sources)))assert(license==='CC0-1.0'||TEXTS[license]?.(texts[license]),'the full text of '+license);
 if(ov.sources.Foursquare){const notice=readFileSync(ov.notices.Foursquare,'utf8');assert(notice.includes('© 2026 Foursquare Labs, Inc. All rights reserved.')&&notice.includes('preserving the full content of this NOTICE.txt file')&&notice.includes('Notice of changes (Yukemuri'),'Foursquare NOTICE.txt with our change notice')}
 for(const bad of [{...ov,sources:{...ov.sources,meta:'ODbL-1.0'}},{...ov,licenseTexts:{}},{...ov,sources:undefined}]){
  const file=join(temp,'overture-bad.json');writeFileSync(file,JSON.stringify(bad));
  assert.throws(()=>loadOverture(file),/Unexpected Overture extract/,'a source without a served license text refuses the extract');
 }
 // The real geocoder runner: no installed dictionary, or a geocoder that exits.
 const empty=join(temp,'empty-db');mkdirSync(empty);
 geo=fresh();s=await addGeo({ids,geo,inputs,wikidata,geocode:dictionaryGeocoder({dbDir:empty})});
 assert.equal(s.status,'failed');assert.match(s.reason,/no installed dictionary/);
 writeFileSync(join(empty,'README.md'),'fixture');
 const fake=join(temp,'fake-python');writeFileSync(fake,'#!/bin/sh\necho "jageocoder missing" >&2\nexit 3\n');chmodSync(fake,0o755);
 geo=fresh();s=await addGeo({ids,geo,inputs,wikidata,geocode:dictionaryGeocoder({dbDir:empty,python:fake})});
 assert.equal(s.status,'failed');assert.match(s.reason,/exit 3: jageocoder missing/);
 const garbage=join(temp,'garbage-python');writeFileSync(garbage,'#!/bin/sh\ncat >/dev/null\necho "not json"\n');chmodSync(garbage,0o755);
 geo=fresh();s=await addGeo({ids,geo,inputs,wikidata,geocode:dictionaryGeocoder({dbDir:empty,python:garbage})});
 assert.equal(s.status,'failed');assert.deepEqual(geo.grade,[1,6,0,0,0,0,0,1]);

 // Geocoder input from the stored place.
 const place=(prefecture,label,address='')=>lib.geocodeInput({prefecture,regionId:prefecture,location:{label,address},names:{ja:''}});
 assert.deepEqual(place('pref-nagasaki','이사하야 · 나가사키','長崎県諫早市天満町３６―１１'),{address:'長崎県諫早市天満町３６―１１',prefecture:'長崎県',places:['長崎県諫早市','長崎県諫早町','長崎県諫早村','長崎県諫早区','長崎県諫早','長崎県']});
 assert.deepEqual(place('pref-tokyo','도쿄').places,['東京都']);
 assert.deepEqual(place('pref-tokyo','신주쿠').places.slice(0,1),['東京都新宿市'],'city names are tried with each suffix');
 assert(place('pref-kanagawa','하코네 온천 · 가나가와').places.includes('神奈川県箱根町'),'an onsen area tries its Japanese name');
 assert.deepEqual(place(null,'?'),{address:'',prefecture:null,places:[]});

 // The Wikidata extract: CC0, Trip ids unique, conflicts left out.
 const points=loadWikidata();
 const data=JSON.parse(readFileSync(WIKIDATA_FILE,'utf8'));
 assert.equal(data.license,'CC0-1.0');assert(points.size>1000&&points.size===data.hotels.length);
 assert.equal(new Set(data.hotels.map(r=>r[0])).size,data.hotels.length);
 const b=(trip,item,lng,lat,ko)=>({trip:{value:trip},item:{value:'http://www.wikidata.org/entity/'+item},coord:{value:`Point(${lng} ${lat})`},...(ko?{ko:{value:ko}}:{})});
 const x=extract([b('1','Q1',139,35,'호텔'),b('1','Q1',139.001,35.001),b('2','Q2',135,34),b('2','Q3',135,34),b('3','Q4',139,35),b('3','Q4',139.01,35),b('x','Q5',1,1)]);
 assert.deepEqual(x.rows,[['1','Q1',35.0005,139.0005,'호텔']]);assert.deepEqual(x.dropped,['2','3'],'two items, or points 1 km apart, leave a Trip id out');

 // The credit: verbatim as the dictionary's README asks, in the footer.
 const attribution=createRequire(import.meta.url)(join(temp,'lib/geo-attribution.js'));
 const REQUIRED='「位置参照情報（大字町丁目・街区レベル）令和5年」（国土交通省）、「Geolonia 住所データ」（株式会社Geolonia）、「アドレス・ベース・レジストリ」（デジタル庁）をもとに、株式会社情報試作室が加工した jageocoder 用住所データベース（街区レベル）を利用';
 assert.equal(attribution.GEO_ATTRIBUTION,REQUIRED);assert.match(attribution.GEO_NOTE,/대략 위치/);
 assert.match(readFileSync('components/hotel-explorer.tsx','utf8'),/<footer className="site-footer">.*<p className="geo-credit" data-geo-credit><span>\{GEO_NOTE\}<\/span> <span lang="ja">\{GEO_ATTRIBUTION\}<\/span>.*<\/footer>/,'the footer shows the note and the credit');
 // Overture's credit names every first source in the extract, beside the CDLA text.
 const sources=[...new Set(ov.hotels.map(r=>r[5]))];
 assert(sources.every(s=>attribution.OVERTURE_SOURCES[s]&&attribution.OVERTURE_ATTRIBUTION.includes(attribution.OVERTURE_SOURCES[s])),'every first source is credited: '+sources.join(', '));
 for(const path of [...Object.values(ov.licenseTexts),...Object.values(ov.notices)])assert(attribution.OVERTURE_LINKS.some(l=>'public'+l.url===path),'the credit links '+path);
 assert.match(readFileSync('components/hotel-explorer.tsx','utf8'),/<p className="geo-credit" data-overture-credit><span>\{OVERTURE_NOTE\}<\/span> <span lang="en">\{OVERTURE_ATTRIBUTION\}<\/span>.*<\/footer>/,'the footer shows the Overture credit');
 assert.match(readFileSync('components/collection-status-sheet.tsx','utf8'),/<h2 id="u06-credits">.*\{OVERTURE_NOTE\} <span lang="en">\{OVERTURE_ATTRIBUTION\}<\/span>/s,'and the data status screen');
 assert.match(readFileSync('components/stay-map.tsx','utf8'),/map\.attributionControl\.addAttribution\(OVERTURE_MAP_CREDIT\)/,'and the map');
 if(process.argv.includes('--built')){
  const html=readFileSync('dist/client/index.html','utf8'),footer=html.slice(html.lastIndexOf('<footer'));
  assert(footer.includes(REQUIRED),'the built page footer has the credit verbatim');assert(footer.includes(attribution.GEO_NOTE),'and the note');
  for(const link of attribution.GEO_LINKS)assert(footer.includes(`href="${link.url}"`),link.url);
  assert(footer.includes(attribution.OVERTURE_ATTRIBUTION)&&footer.includes(attribution.OVERTURE_NOTE),'the built footer has the Overture credit');
  for(const link of attribution.OVERTURE_LINKS)assert(footer.includes(`href="${link.url}"`),link.url);
  for(const path of [...Object.values(ov.licenseTexts),...Object.values(ov.notices)])assert.equal(readFileSync(path.replace(/^public\//,'dist/client/'),'utf8'),readFileSync(path,'utf8'),path+' is served');
 }
 // Python side: grades, fallbacks and the dictionary pin, with a fake jageocoder.
 const py=spawnSync('python3',['scripts/geo/check_geocode.py'],{encoding:'utf8'});
 assert.equal(py.status,0,py.stdout+py.stderr);
 // The Overture updater's join rules, with fixtures (no DuckDB, no S3).
 const pyOv=spawnSync('python3',['-I','scripts/geo/check_overture.py'],{encoding:'utf8'});
 assert.equal(pyOv.status,0,pyOv.stdout+pyOv.stderr);
 console.log(`Snapshot geo passed: payload > Wikidata > geocoder > Overture for grades 3-6 within range, grades 0-7, out-of-Japan answers ignored, no or failing geocoder builds without its points, place-label inputs, Wikidata extract (${points.size} Trip ids), Overture extract (${ovPoints.size} hotels, ${sources.join('/')}), credits${process.argv.includes('--built')?' in the built page':''}. ${py.stdout.trim()} ${pyOv.stdout.trim()}`);
}finally{rmSync(temp,{recursive:true,force:true})}
