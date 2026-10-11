// D01 audit: find checked-in Trip records whose address is empty or doubled.
// Usage: node scripts/audit-trip-addresses.mjs [output.json]
// A doubled address is addressRegion + addressLocality + streetAddress where
// streetAddress starts with addressLocality and also contains addressRegion.
// The stored label is the observed addressRegion, so the parts can be read back.
import {readFileSync,writeFileSync} from 'node:fs';
const files=['lib/hotels.real.json','lib/hotels.crawled.json','lib/hotels.verified.json'];
const hotels=files.flatMap(file=>JSON.parse(readFileSync(file,'utf8')).map(h=>({...h,file})));
const split=h=>{
 const {address,label}=h.location;
 if(!label||!address.startsWith(label))return null;
 const rest=address.slice(label.length);
 // The longest repeat wins, so a short repeat inside the locality cannot split it.
 for(let k=Math.floor(rest.length/2);k>0;k--){
  const locality=rest.slice(0,k),street=rest.slice(k);
  if(street.startsWith(locality)&&street.includes(label))return {region:label,locality,street};
 }
 return null;
};
const counts={},records=[];
for(const h of hotels){
 const provider=/^(trip|jalan)-/.exec(h.id)?.[1]??'curated',page=h.sources?.[0]?.label??'';
 const parts=h.location.address?split(h):null;
 const kind=!h.location.address?'empty':parts?'doubled':'ok';
 const key=`${provider}-${kind}`;
 counts[key]=(counts[key]??0)+1;
 if(kind!=='ok')records.push({kind,id:h.id,file:h.file,name:h.names.en||h.names.ja,label:h.location.label,page,retrievedAt:h.sources?.[0]?.retrievedAt,address:h.location.address,...(parts?{streetAddress:parts.street}:{})});
}
const report={generatedAt:new Date().toISOString(),files,hotels:hotels.length,counts,records};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,1)+'\n');
console.log(JSON.stringify(counts));
for(const r of records)console.log(r.kind,r.id,r.page,JSON.stringify(r.streetAddress??r.address));
