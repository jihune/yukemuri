// D01 audit: compare checked-in hotel prefectures and display labels with addresses.
// Usage: node scripts/audit-region-labels.mjs [output.json]
import {spawnSync} from 'node:child_process';
import {appendFileSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-region-audit-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/japan-place-labels.ts','lib/hotel-region.ts','--outDir',dir,'--module','commonjs','--target','es2022','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--skipLibCheck'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 appendFileSync(join(dir,'lib/japan-place-labels.js'),'\nexports.__cities=cities;exports.__onsens=preparedOnsens;\n');
 const require=createRequire(join(dir,'audit.cjs'));
 const {formatHotelLocation,__cities:cities,__onsens:onsens}=require(join(dir,'lib/japan-place-labels.js'));
 const {sourceRegion}=require(join(dir,'lib/hotel-region.js'));
 const prefectures=JSON.parse(readFileSync('data/prefectures.json','utf8'));
 const files=['lib/hotels.real.json','lib/hotels.crawled.json','lib/hotels.verified.json'];
 // Same normalization as lib/hotel-catalog.ts before display.
 const hotels=files.flatMap(file=>JSON.parse(readFileSync(file,'utf8')).map(h=>file.includes('real')?{...h,prefecture:'pref-hokkaido'}:file.includes('crawled')?{...h,regionId:sourceRegion(h)}:h));
 const addressPrefecture=address=>{
  const native=prefectures.filter(p=>address.includes(p.ja)||address.includes(p.name.split(' · ')[0]));
  if(native.length===1)return native[0].id;
  const english=prefectures.filter(p=>new RegExp('\\b'+p.en.split(' ')[0]+'\\b','i').test(address));
  return english.length===1?english[0].id:null;
 };
 const counts={},candidates=[];
 const add=(kind,h,extra={})=>{counts[kind]=(counts[kind]??0)+1;if(!kind.endsWith('ok'))candidates.push({kind,id:h.id,prefecture:h.prefecture,display:formatHotelLocation(h),address:h.location.address,label:h.location.label,name:h.names.ja,...extra})};
 for(const h of hotels){
  const fromAddress=addressPrefecture(h.location.address);
  if(!fromAddress)add('prefecture-address-unknown',h);
  else add(fromAddress===h.prefecture?'prefecture-ok':'prefecture-mismatch',h,{addressPrefecture:fromAddress});
  const pref=prefectures.find(p=>p.id===h.prefecture),head=formatHotelLocation(h).split(' · ')[0];
  const onsen=onsens.find(o=>o.pref===pref?.slug&&o.label===head);
  const city=cities.find(c=>c[0]===pref?.slug&&c[1]===head);
  if(onsen)add(onsen.pattern.test(h.location.address)?'onsen-address-ok':'onsen-from-label-or-name',h);
  else if(city)add(h.location.address.includes(city[2])||new RegExp('\\b'+city[3]+'\\b','i').test(h.location.address)?'city-address-ok':'city-not-in-address',h);
  else add('label-without-place',h);
 }
 const report={generatedAt:new Date().toISOString(),files,hotels:hotels.length,counts,candidates};
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,1)+'\n');
 console.log(JSON.stringify({hotels:hotels.length,counts}));
}finally{rmSync(dir,{recursive:true,force:true})}
