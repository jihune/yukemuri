// Replays the published snapshot's geo through addGeo: payload points stay, the
// published Wikidata and geocoder answers are fed back, then Overture runs.
// Usage: node docs/evidence/d08-20261019/pr4/replay-public-geo.mjs <folder with the public core.json and geo.json>
import {readFileSync} from 'node:fs';
import {addGeo,loadOverture,GRADE} from '../../../../scripts/snapshot-geo.mjs';
const dir=process.argv[2];
const core=JSON.parse(readFileSync(dir+'/core.json','utf8')),pub=JSON.parse(readFileSync(dir+'/geo.json','utf8'));
const ids=core.ids,payload=ids.map((_,i)=>core.lat[i]!==null);
const geo={grade:pub.grade.map((g,i)=>payload[i]?g:0),lat:pub.lat.map((v,i)=>payload[i]?v:null),lng:pub.lng.map((v,i)=>payload[i]?v:null)};
const wikidata=new Map(ids.flatMap((id,i)=>!payload[i]&&pub.grade[i]===GRADE.wikidata?[[id.slice(5),[pub.lat[i],pub.lng[i]]]]:[]));
const inputs=ids.map((_,i)=>payload[i]?null:{address:'',prefecture:null,places:[]});
const answers=new Map(ids.flatMap((id,i)=>!payload[i]&&pub.grade[i]>=2&&pub.grade[i]<=5?[[i,[pub.lat[i],pub.lng[i],pub.grade[i]]]]:[]));
const s=await addGeo({ids,geo,inputs,wikidata,geocode:async list=>{const wanted=ids.flatMap((_,i)=>geo.grade[i]===0&&!payload[i]?[i]:[]);if(wanted.length!==list.length)throw new Error('order');return wanted.map(i=>answers.get(i)??null)},overture:loadOverture()});
const same=ids.filter((_,i)=>geo.grade[i]!==GRADE.overture&&(geo.grade[i]!==pub.grade[i]||geo.lat[i]!==pub.lat[i])).length;
console.log('published counts',[0,1,2,3,4,5,6].map(g=>pub.grade.filter(x=>x===g).length).join(','));
console.log('replayed counts ',s.counts.join(','),'| overture',JSON.stringify(s.overture),'| rows changed other than grade 7:',same);
