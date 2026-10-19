import type {Hotel} from './hotel-types';
import list from '../data/jta-registered.json';
import prefectures from '../data/prefectures.json';
// D08 PR 1: hotels and ryokan registered with the Japan Tourism Agency under the International
// Tourism Hotel Act (data/jta-registered.json, scripts/update-jta-registered.py, PDL1.0). A stay
// shows the registration only when its own name and address agree with a row of the lists; a
// similar name alone links nothing (AGENTS.md). Our records carry no phone number, so the
// lists' phones are not compared. Linked once over every stay when the search snapshot is built
// (a row two stays could take is decided across them), carried on the cards and shown by the
// card and the detail sheet; never written to D1, never read by the Worker.
export type JtaRegistration={kind:'hotel'|'ryokan';number:string;name:string};

const PREFECTURE=new Map(prefectures.map(p=>[p.ja,p.id]));
// A capital named after its prefecture with the prefecture left out (岡山市北区駅元町1番5).
const CAPITAL=new Map(prefectures.map(p=>[p.ja.replace(/[都道府県]$/,'')+'市',p.id]));
const PREFECTURE_NAME=new RegExp('('+[...PREFECTURE.keys()].join('|')+')','g');
const KANJI='一二三四五六七八九';
const JAPANESE=/[\u3040-\u30ff\u4e00-\u9fff]/;
// Readings, taglines and notes in brackets (Jalan: ～和歌山の旬と絶景露天の宿～, (25年3月24日オープン)).
const BRACKETS=/\([^)]*\)|\[[^\]]*\]|【[^】]*】|「[^」]*」|~[^~]*~|〜[^〜]*〜|<[^>]*>|〈[^〉]*〉/g;
const key=(s:string)=>s.toLowerCase().replace(/[\s・･·\-‐ー―/&.,、。!'"’]/g,'');
// A name's parts between spaces and brackets, each as a comparable key: 長良川温泉　岐阜グランドホテル
// is [長良川温泉, 岐阜グランドホテル].
export function nameParts(name:string){
 return name.normalize('NFKC').replace(BRACKETS,' ').split(/\s+/).map(key).filter(Boolean);
}
// Some consecutive parts of one name spell the whole of the other: a tagline or an area before
// the name (長良川温泉　岐阜グランドホテル, 旅館　清少納言), a building after it (品川プリンスホテル メインタワー).
// Never inside a word: 金沢ニューグランドホテルプレステージ is not 金沢ニューグランドホテル.
function spells(parts:string[],whole:string){
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<=parts.length;j++)if((i>0||j<parts.length)&&parts.slice(i,j).join('')===whole)return true;
 return false;
}
const digit=(c:string)=>c?KANJI.indexOf(c)+1:0;
const kanjiNumber=(t:string)=>{if(!t.includes('十'))return String(digit(t));const [tens,ones]=t.split('十');return String((tens?digit(tens):1)*10+digit(ones))};
// The prefecture, the municipality, the place in it before the first number and the lot numbers of a
// Japanese address, both lists' way and the collected way: 札幌市中央区北一条西4丁目2番地 and
// 札幌市中央区北1条西4丁目 give 札幌市, 中央区北条西 and 1, 4(, 2).
export function addressParts(address:string){
 let s=address.normalize('NFKC').replace(/\s/g,'');
 const found=[...s.matchAll(PREFECTURE_NAME)].at(-1);
 if(found)s=s.slice(found.index+found[0].length);
 s=s.replace(/(?<=\d)[\u2010-\u2015\u2212\u30fc\u2500](?=\d)/g,'-').replace(/([一二三四五六七八九十]{1,3})(?=丁目|条|線|番|号)/g,(_,t:string)=>kanjiNumber(t))
  .replace(/大字|字/g,'').replace(/^[^市区町村]{1,4}郡/,'').replace(/丁目|番地|番|号|の/g,'-');
 const capital=found?undefined:[...CAPITAL].find(([city])=>s.startsWith(city))?.[1],city=/^(.+?[市区町村])/.exec(s)?.[1]??null;
 return{prefecture:found?PREFECTURE.get(found[0])!:capital??null,city,place:city?s.slice(city.length).replace(/\d[\s\S]*$/,'').replace(/-/g,''):'',numbers:s.match(/\d+/g)??[],japanese:JAPANESE.test(address)};
}
type Row={number:string;name:string;key:string;parts:string[];city:string|null;place:string;numbers:string[]};
let rows:Map<string,Row[]>|null=null;
function byPrefecture(){
 if(rows)return rows;
 rows=new Map();
 for(const [number,name,address] of list.rows as [string,string,string,string][]){
  const a=addressParts(address),parts=nameParts(name);
  if(!a.prefecture)continue;
  const row:Row={number,name,key:parts.join(''),parts,city:a.city,place:a.place,numbers:a.numbers};
  rows.set(a.prefecture,[...(rows.get(a.prefecture)??[]),row]);
 }
 return rows;
}
const sameCity=(a:string,b:string)=>a===b||a.endsWith(b)||b.endsWith(a);
// How a row agrees with a stay: 'exact' or 'part' by name, null when it does not. The name: the
// same key, or one name's consecutive parts spell the other (part, at least 4 letters). The
// address, in the row's prefecture:
// - a Japanese address in the same municipality (河口湖町 is now 富士河口湖町) whose lot numbers
//   agree as far as both go; exact names also when the stay's address has none and one place
//   begins the other (屈斜路温泉 and 屈斜路, not 美留和; Codex review on PR #199), parts only with
//   the same first three numbers;
// - an address in Latin letters (Trip.com) holding every lot number of the row, postal code left
//   out; exact names only.
type Stay={keys:Set<string>;parts:string[][];address:ReturnType<typeof addressParts>;latin:Map<string,number>|null};
const count=(xs:string[])=>xs.reduce((m,x)=>m.set(x,(m.get(x)??0)+1),new Map<string,number>());
function agreement(row:Row,{keys,parts,address,latin}:Stay):'exact'|'part'|null{
 const exact=keys.has(row.key);
 if(!exact&&!(row.key.length>=4&&parts.some(p=>spells(p,row.key)))&&![...keys].some(k=>k.length>=4&&spells(row.parts,k)))return null;
 if(address.city){
  if(!row.city||!sameCity(address.city,row.city))return null;
  const n=Math.min(3,address.numbers.length,row.numbers.length),agree=address.numbers.slice(0,n).join('-')===row.numbers.slice(0,n).join('-');
  const place=!!address.place&&!!row.place&&(address.place.startsWith(row.place)||row.place.startsWith(address.place));
  if(exact)return(n===0?place:agree)?'exact':null;
  return n>0&&address.numbers.slice(0,3).join('-')===row.numbers.slice(0,3).join('-')?'part':null;
 }
 return exact&&latin&&row.numbers.length&&[...count(row.numbers)].every(([n,c])=>(latin.get(n)??0)>=c)?'exact':null;
}
export type JtaCandidate={number:string;how:'exact'|'part'};
// Every row that agrees with one stay.
export function jtaCandidates(hotel:Pick<Hotel,'names'|'aliases'|'prefecture'|'location'>):JtaCandidate[]{
 const rows=hotel.prefecture?byPrefecture().get(hotel.prefecture):undefined;
 if(!rows)return[];
 const names=[...new Set([...Object.values(hotel.names),...(hotel.aliases??[])].filter(Boolean))];
 const parts=names.map(nameParts),keys=new Set(parts.map(p=>p.join('')).filter(Boolean));
 const raw=(hotel.location.address??'').normalize('NFKC'),address=addressParts(raw);
 // Lot numbers of an address in Latin letters, the postal code left out.
 const latin=address.japanese?null:count(raw.replace(/\b\d{3}-\d{4}\b/g,' ').match(/\d+/g)??[]);
 return rows.flatMap(row=>{const how=agreement(row,{keys,parts,address,latin});return how?[{number:row.number,how}]:[]});
}
// The registrations of every stay, from each stay's candidates. A part link stands only when no
// other stay of the same source links the row: 白玉の湯　華鳳　別邸　越の里 (an annex) does not take
// 白玉の湯 華鳳's row from 白玉の湯　華鳳 on Jalan, while the Jalan record of a hotel whose Trip.com
// record has the exact name keeps its link. A stay with several rows shows the exact one, then
// the lower number (苗場プリンスホテル is registered twice, by building).
export function resolveJtaLinks(candidates:Map<string,JtaCandidate[]>){
 const source=(id:string)=>/^(jalan|trip)-/.exec(id)?.[1]??'curated',byRow=new Map<string,string[]>();
 for(const [id,found] of candidates)for(const c of found)byRow.set(c.number,[...(byRow.get(c.number)??[]),id]);
 const rowName=new Map(list.rows.map(r=>[r[0],r[1]]));
 const links=new Map<string,JtaRegistration>();
 for(const [id,found] of candidates){
  const kept=found.filter(c=>c.how==='exact'||!byRow.get(c.number)!.some(other=>other!==id&&source(other)===source(id)));
  const best=kept.sort((a,b)=>Number(b.how==='exact')-Number(a.how==='exact')||a.number.localeCompare(b.number))[0];
  if(best)links.set(id,{kind:best.number.startsWith('R')?'ryokan':'hotel',number:best.number,name:rowName.get(best.number)!});
 }
 return links;
}
