// L01 PR 3: list labels (formatHotelLocation) before and after this change for
// every record of a public search snapshot. Public files only, no key. Usage:
//   D=$(mktemp -d); mkdir -p $D/snap   # put core.json, cards.json, text.json of the
//   # snapshot there (/snapshot/manifest.json lists them), then compile both versions:
//   T="node node_modules/typescript/bin/tsc lib/japan-place-labels.ts --module commonjs --target es2022 --moduleResolution node --resolveJsonModule --esModuleInterop --skipLibCheck"
//   $T --outDir $D/new; git show b85e6c4:lib/japan-place-labels.ts > lib/japan-place-labels.ts; $T --outDir $D/old; git checkout lib/japan-place-labels.ts
//   node docs/evidence/l01-labels-20261015/label-diff.js $D
// The stored label and address are the start of the snapshot's search context
// (before the list label), split at the leading 'A · B' run.
const S=process.argv[2];
const oldL=require(S+'/old/lib/japan-place-labels.js'),newL=require(S+'/new/lib/japan-place-labels.js');
const core=require(S+'/snap/core.json'),cards=require(S+'/snap/cards.json'),text=require(S+'/snap/text.json');
const changes={},examples={};let n=0,uncut=0;
for(let i=0;i<core.ids.length;i++){
 const ctx=text.context[i]||'',lab=cards[i].location.label||'',at=lab?ctx.indexOf(lab+' '+lab.split(' · ').at(-1)):-1;
 if(at<0){uncut++;continue}
 const stored=ctx.slice(0,at).trim(),m=stored.match(/^((?:[^·]+ · )+[^\s·]+) ?(.*)$/);
 const hotel={prefecture:core.prefecture[i],regionId:core.region[i],location:{label:m?m[1]:'',address:m?m[2]:stored},names:{ja:cards[i].names.ja||''}};
 n++;const a=oldL.formatHotelLocation(hotel),b=newL.formatHotelLocation(hotel);
 if(a!==b){const k=a+' -> '+b;changes[k]=(changes[k]||0)+1;(examples[k]??=[]).length<2&&examples[k].push(core.ids[i]+' | '+hotel.location.label+' | '+hotel.location.address.slice(0,40))}
}
console.log(JSON.stringify({records:n,uncut,changed:Object.values(changes).reduce((x,y)=>x+y,0),changes,examples},null,1));
