import type {Hotel} from './hotel-types';
import {displayNames} from './hotel-names';
import extract from '../data/wikidata-trip-names.json';
// D07: Korean and English names from Wikidata (CC0) for a Trip.com record whose exact
// Trip.com hotel ID (P10425) an item in Japan carries (scripts/update-wikidata-names.mjs).
// A label only fills a name the collected record lacks: Korean when no name has Hangul,
// English when no name reads as English. The record's own names stay as aliases and the
// item is listed among the sources. Applied where hotels are read (the search snapshot,
// the detail and comparison API), never written to D1.
const HANGUL=/[가-힣]/;
// displayNames' English rule (Latin letters, no Hangul, kana or kanji) for one name.
const english=(name:string)=>displayNames({ko:'',ja:'',en:name}).titleLang==='en';
// Latin words of a name, accents dropped (Frésa is Fresa), generic ones left out.
const GENERIC=new Set(['hotel','hotels','the','and','inn','resort','spa','by','of','collection']);
const words=(name:string)=>new Set(name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(w=>!GENERIC.has(w))??[]);
// The item still names this hotel: the Latin words of its English label and of one of the
// record's names contain one another. A Trip.com id keeps its hotel through a rename while the
// item keeps the old name (15 of the 296 records the extract reached on 2026-10-18, as
// Hotel Unizo -> Four Points Flex), so a label that disagrees is not used; nor is one with
// nothing to compare. Spellings that split a word (Nishi-Shinjuku, Nishishinjuku) are refused too.
function agrees(label:string|null,names:string[]){
 const theirs=words(label??'');
 return theirs.size>0&&names.some(name=>{const mine=words(name),[few,many]=mine.size<=theirs.size?[mine,theirs]:[theirs,mine];return few.size>0&&[...few].every(w=>many.has(w))});
}
const byTrip=new Map((extract.hotels as [string,string,string|null,string|null][]).map(([trip,item,ko,en])=>[trip,{item,ko,en}]));
export function withWikidataNames(hotel:Hotel):Hotel{
 const row=/^trip-\d+$/.test(hotel.id)?byTrip.get(hotel.id.slice(5)):undefined,own=Object.values(hotel.names);
 if(!row||!agrees(row.en,own))return hotel;
 const ko=row.ko&&HANGUL.test(row.ko)&&!own.some(n=>HANGUL.test(n))?row.ko:null;
 const en=row.en&&english(row.en)&&!own.some(english)?row.en:null;
 if(!ko&&!en)return hotel;
 const url='https://www.wikidata.org/wiki/'+row.item;
 return{...hotel,names:{...hotel.names,...(ko?{ko}:{}),...(en?{en}:{})},aliases:[...new Set([...(hotel.aliases??[]),...own].filter(Boolean))],
  sources:[...hotel.sources,{sourceId:'wikidata-name:'+hotel.id,sourceType:'web',label:'Wikidata 숙소 이름(CC0)',retrievedAt:extract.retrievedAt,verifiedAt:null,url,isMock:false,...(ko?{nameLocaleUrl:url}:{})}]};
}
