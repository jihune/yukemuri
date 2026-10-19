// Refreshes data/commons-trip-photos.json (D08 PR 2): the image (P18) of Wikidata
// items in Japan with a Trip.com hotel ID (P10425), the exact identifier the D07
// names use (scripts/update-wikidata-names.mjs), with the author and licence that
// Wikimedia Commons states for each file (imageinfo extmetadata). One SPARQL GET,
// then one imageinfo GET per 50 files, one at a time and 5 seconds apart
// (Wikimedia robot policy, Action API rules); a 429 is waited out once by its
// Retry-After. Run by hand, then commit. --save keeps the responses with their time,
// --from reads them again.
// Usage: node scripts/update-commons-photos.mjs [--save responses.json | --from responses.json]
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const OUT=resolve(ROOT,'data/commons-trip-photos.json');
export const QUERY='SELECT ?item ?trip ?image WHERE { ?item wdt:P10425 ?trip ; wdt:P17 wd:Q17 ; wdt:P18 ?image . }';
// A bot name with contact (Wikimedia User-Agent policy). From a shared address the
// generic updater name drew a 429 on the first request (2026-10-19T12:31:38Z).
const AGENT='YukemuriCommonsPhotoBot/1.0 (https://github.com/jihune/yukemuri)';
// 960 is one of the standard thumbnail widths; a hotlink of any other width is refused.
export const WIDTH=960;
// Licences whose terms a credit beside the photo meets: the author, the licence name
// linked to its deed and the file page. Public domain files are kept too, on Commons's
// own fields only (PUBLIC_DOMAIN); GFDL-only files (the licence text must go along),
// files without licence information and anything else are left out.
export const LICENCE=/^(CC BY(-SA)? \d\.\d( [A-Za-z-]+)?|CC0)$/;
export const PUBLIC_DOMAIN='Public domain';
const IMAGE_HOST=/^(upload|thumb)\.wikimedia\.org$/;

// HTML of an extmetadata value -> plain text.
export function plain(html){
 const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
 return String(html??'').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):named[e.toLowerCase()]??m).replace(/\s+/g,' ').trim();
}
// The file name a P18 value names (…/Special:FilePath/<encoded name>).
export const fileName=value=>decodeURIComponent(String(value).split('/Special:FilePath/').pop()).replace(/_/g,' ');

// SPARQL bindings -> one file per Trip id. A Trip id on two items, or an item with
// two images, is left out.
export function files(bindings){
 const byTrip=new Map();
 for(const b of bindings){
  const trip=b.trip?.value,qid=b.item?.value?.split('/').pop(),file=b.image?.value?fileName(b.image.value):'';
  if(!/^\d+$/.test(trip??'')||!/^Q\d+$/.test(qid??'')||!file)continue;
  const list=byTrip.get(trip)??[];list.push({qid,file});byTrip.set(trip,list);
 }
 const rows=[],dropped=[];
 for(const [trip,list] of byTrip){
  if(new Set(list.map(x=>x.qid)).size>1||new Set(list.map(x=>x.file)).size>1){dropped.push([trip,'two items or images']);continue}
  rows.push({trip,item:list[0].qid,file:list[0].file});
 }
 return{rows,dropped};
}

// imageinfo responses -> file name -> the photo or why it is left out.
export function infos(responses){
 const byFile=new Map();
 for(const body of responses){
  const q=body.query??{},renamed=new Map([...(q.normalized??[]),...(q.redirects??[])].map(r=>[r.to,r.from]));
  const original=title=>{let t=title;for(let i=0;i<3&&renamed.has(t);i++)t=renamed.get(t);return t.replace(/^File:/,'').replace(/_/g,' ')};
  for(const page of q.pages??[]){
   const file=original(page.title),info=page.imageinfo?.[0],meta=info?.extmetadata??{};
   if(page.missing||!info){byFile.set(file,{reason:'missing'});continue}
   // A user signature's talk link is not part of the name.
   const author=plain(meta.Artist?.value).replace(/\s*\(\s*talk\s*\)/gi,''),licence=plain(meta.LicenseShortName?.value),licenceUrl=plain(meta.LicenseUrl?.value).replace(/^(https?:)?\/\//,'https://');
   let url=null;try{const u=new URL(info.thumburl??info.url);for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_'))u.searchParams.delete(key);url=u.protocol==='https:'&&IMAGE_HOST.test(u.hostname)?u.href:null}catch{}
   // ‘Own work’ in the author field names no one (Credit says it, not Artist).
   const named=!!author&&!/^(unknown( author)?|own work)$/i.test(author),restrictions=plain(meta.Restrictions?.value);
   // Public domain as Commons states it: the licence name, its code and not copyrighted. It
   // has no deed to link, and its author is shown when the file names one (parent session
   // decision, 2026-10-19T13:34Z). A use restriction (trademark, personality rights) on a
   // public domain or CC0 file leaves it out.
   const pd=licence===PUBLIC_DOMAIN&&plain(meta.License?.value)==='pd'&&plain(meta.Copyrighted?.value)==='False';
   const reason=!pd&&!named?'no author':!pd&&!LICENCE.test(licence)?'licence '+(licence||'missing'):(pd||licence==='CC0')&&restrictions?'restricted '+restrictions:!pd&&!/^https:\/\/creativecommons\.org\//.test(licenceUrl)?'no licence link':!url?'no image address':!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(info.descriptionurl??'')?'no file page':null;
   byFile.set(file,reason?{reason}:{url,page:info.descriptionurl,author:named?author:null,licence,licenceUrl:pd?null:licenceUrl});
  }
 }
 return byFile;
}

// Both steps -> sorted rows [tripId, item, image url, file page, author, licence, licence url]
// (author null for a public domain file that names none, licence url null for public domain)
// and the Trip ids left out with the reason.
export function extract(bindings,responses){
 const {rows,dropped}=files(bindings),byFile=infos(responses),out=[];
 for(const r of rows){
  const photo=byFile.get(r.file);
  if(!photo||photo.reason){dropped.push([r.trip,photo?.reason??'no file information']);continue}
  out.push([r.trip,r.item,photo.url,photo.page,photo.author,photo.licence,photo.licenceUrl]);
 }
 const byNumber=(a,b)=>Number(a[0])-Number(b[0]);
 return{rows:out.sort(byNumber),dropped:dropped.sort(byNumber)};
}

async function get(url,accept){
 for(let attempt=0;;attempt++){
  const response=await fetch(url,{headers:{Accept:accept,'Accept-Encoding':'gzip','User-Agent':AGENT},signal:AbortSignal.timeout(120000)});
  const wait=Number(response.headers.get('Retry-After'));
  if(response.status===429&&attempt===0&&wait>0&&wait<=120){console.log(`429, waiting ${wait} s as asked`);await new Promise(r=>setTimeout(r,wait*1000));continue}
  if(!response.ok)throw new Error(new URL(url).hostname+' HTTP '+response.status+(wait?', Retry-After '+wait:''));
  return response.json();
 }
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null,from=arg('--from'),save=arg('--save');
 let sparql,responses=[],retrievedAt;
 if(from)({sparql,imageinfo:responses,retrievedAt}=JSON.parse(readFileSync(from,'utf8')));
 else{
  sparql=await get('https://query.wikidata.org/sparql?query='+encodeURIComponent(QUERY),'application/sparql-results+json');
  const names=[...new Set(files(sparql.results.bindings).rows.map(r=>r.file))];
  for(let i=0;i<names.length;i+=50){
   if(i)await new Promise(r=>setTimeout(r,5000));
   const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',redirects:'1',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:String(WIDTH),iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl|License|Restrictions|Copyrighted',iiextmetadatalanguage:'en',titles:names.slice(i,i+50).map(n=>'File:'+n).join('|')});
   responses.push(await get('https://commons.wikimedia.org/w/api.php?'+params,'application/json'));
  }
  retrievedAt=new Date().toISOString();
  if(save)writeFileSync(save,JSON.stringify({retrievedAt,sparql,imageinfo:responses}));
 }
 const {rows,dropped}=extract(sparql.results.bindings,responses);
 const data={source:'https://query.wikidata.org/sparql + https://commons.wikimedia.org/w/api.php (imageinfo)',query:QUERY,retrievedAt,
  license:'Wikidata CC0-1.0; each photo under the licence in its row',
  note:'Trip.com hotel ID (P10425) of an item in Japan -> its image (P18) on Wikimedia Commons. Columns: tripId, item, image url (960 px thumbnail), file page, author (null: a public domain file names none), licence, licence url (null: public domain). lib/commons-photos.ts shows a photo only beside its credit, on a record whose names the item agrees with. Left out: Trip ids on two items or images, files without image address or licence information, licences other than CC BY, CC BY-SA, CC0 and public domain (as Commons states it: name, code pd, not copyrighted), CC files without author or deed, public domain and CC0 files with a use restriction.',
  dropped,hotels:rows};
 writeFileSync(OUT,'{\n'+Object.entries(data).map(([k,v])=>' '+JSON.stringify(k)+':'+(k==='hotels'||k==='dropped'?'[\n'+v.map(r=>'  '+JSON.stringify(r)).join(',\n')+'\n ]':JSON.stringify(v))).join(',\n')+'\n}\n');
 const reasons=Object.entries(dropped.reduce((a,[,r])=>({...a,[r]:(a[r]??0)+1}),{})).map(([r,n])=>n+' '+r).join(', ');
 console.log(`Commons photos: ${sparql.results.bindings.length} bindings, ${rows.length} Trip ids written, ${dropped.length} left out (${reasons||'none'}).`);
}
