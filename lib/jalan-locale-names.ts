import type {Hotel,Provenance} from './hotel-types';
import {PREFECTURES} from './hotel-types';
import {favoritesDb} from './favorites-db';
import {english,words} from './wikidata-names';
// D07: names of a Jalan stay on Jalan's own Korean and English list pages, read by the collector
// as 'names' jobs (one page of one prefecture in one language) and stored by the Jalan number in
// hotel_locale_names, only for stays already in hotels. Shown where hotels are read, like the
// Wikidata names: the search snapshot and the detail and comparison API.
export const LOCALE_PRIORITY=95;
export type LocaleLang='ko'|'en';
export type LocaleNameRow={hotel_id:string;name_ko:string|null;ko_url:string|null;ko_checked_at:string|null;name_en:string|null;en_url:string|null;en_checked_at:string|null};
// Page `page` of prefecture `code` (1-47, JIS order as data/prefectures.json) in one language,
// as lib/crawl-contract.ts LOCALE_LIST and scripts/crawler/collect.py locale_list_url write it.
export function localeListUrl(lang:LocaleLang,code:number,page:number){
 return`https://www.jalan.net/ui/uip1400/uiw1402.do?langCd=${lang==='ko'?'ko_KR':'en_US'}&kenCd=${String(code).padStart(2,'0')}0000&stayCount=1&roomCount=1&distCd=01&crcyCd=${lang==='ko'?'KRW':'USD'}&activeSort=1&screenId=UIW1402&idx=${page}&pageNum=${page}`;
}
// The first page of every prefecture in both languages, queued once (catalog_meta key) by
// /api/crawl-prepare. The collection plan's version is not changed for it.
export async function prepareLocaleLists(){
 const db=favoritesDb(),key='jalan-locale-names-v1';
 if(await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first())return{done:true,queued:0};
 const jobs=PREFECTURES.flatMap((p,i)=>(['ko','en'] as const).map(lang=>({url:localeListUrl(lang,i+1,1),prefecture:p.id})));
 const [queued]=await db.batch([
  db.prepare(`INSERT INTO crawl_jobs (url,provider,kind,prefecture,priority,status,attempts,next_at) SELECT json_extract(value,'$.url'),'jalan','names',json_extract(value,'$.prefecture'),${LOCALE_PRIORITY},'pending',0,0 FROM json_each(?) WHERE 1 ON CONFLICT(url) DO NOTHING`).bind(JSON.stringify(jobs)),
  db.prepare("INSERT INTO catalog_meta (key,value) VALUES (?,'done') ON CONFLICT(key) DO NOTHING").bind(key),
 ]);
 return{done:true,queued:queued.meta.changes};
}
// One page's names in one language. A stay not in hotels is not created; a name and page that
// stand as stored are not written again, and the other language's columns are kept.
export async function saveLocaleNames(lang:LocaleLang,names:{id:string;name:string;url:string}[],checkedAt:string){
 if(!names.length)return 0;
 const [name,url,at]=lang==='ko'?['name_ko','ko_url','ko_checked_at']:['name_en','en_url','en_checked_at'];
 const result=await favoritesDb().prepare(`INSERT INTO hotel_locale_names (hotel_id,${name},${url},${at}) SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.url'),? FROM json_each(?) WHERE EXISTS (SELECT 1 FROM hotels h WHERE h.id=json_extract(value,'$.id'))
  ON CONFLICT(hotel_id) DO UPDATE SET ${name}=excluded.${name},${url}=excluded.${url},${at}=excluded.${at} WHERE ${name} IS NOT excluded.${name} OR ${url} IS NOT excluded.${url}`).bind(checkedAt,JSON.stringify(names)).run();
 return result.meta.changes;
}
export async function localeNamesFor(ids:string[]){
 const jalan=ids.filter(id=>id.startsWith('jalan-'));
 if(!jalan.length)return new Map<string,LocaleNameRow>();
 const rows=await favoritesDb().prepare('SELECT * FROM hotel_locale_names WHERE hotel_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(jalan)).all<LocaleNameRow>();
 return new Map(rows.results.map(r=>[r.hotel_id,r]));
}
const HANGUL=/[가-힣]/;
// A Korean name is used when it has Hangul and its Latin words are all in the English name: Jalan
// keeps some old Korean names beside a current English one ('Hotel and Resorts 벳부완' beside
// 'GRAND MERCURE BEPPU BAY RESORT SPA', Beppu list 2026-10-18). A name in Latin letters only on
// the Korean page ('Shiosai no yado Seikai') is no Korean name. English is used when it reads as
// English. Either only fills a name the stored record lacks, as the Wikidata names do.
export function withJalanLocaleNames(hotel:Hotel,row?:LocaleNameRow):Hotel{
 if(!row||!/^jalan-\d+$/.test(hotel.id))return hotel;
 const own=Object.values(hotel.names),en=row.name_en&&english(row.name_en)?row.name_en.trim():null;
 const enWords=en?words(en):new Set<string>(),ko=row.name_ko&&HANGUL.test(row.name_ko)&&[...words(row.name_ko)].every(w=>enWords.has(w))?row.name_ko.trim():null;
 const addKo=ko&&row.ko_url&&row.ko_checked_at&&!own.some(n=>HANGUL.test(n))?ko:null,addEn=en&&row.en_url&&row.en_checked_at&&!own.some(english)?en:null;
 if(!addKo&&!addEn)return hotel;
 const source=(lang:LocaleLang,url:string,at:string):Provenance=>({sourceId:`jalan-${lang}-name:${hotel.id}`,sourceType:'web',label:lang==='ko'?'Jalan 한국어 숙소명':'Jalan 영어 숙소명',retrievedAt:at,verifiedAt:at.slice(0,10),url,isMock:false,...(lang==='ko'?{nameLocaleUrl:url}:{})});
 return{...hotel,names:{...hotel.names,...(addKo?{ko:addKo}:{}),...(addEn?{en:addEn}:{})},aliases:[...new Set([...(hotel.aliases??[]),...own].filter(Boolean))],
  sources:[...hotel.sources,...(addKo?[source('ko',row.ko_url!,row.ko_checked_at!)]:[]),...(addEn?[source('en',row.en_url!,row.en_checked_at!)]:[])]};
}
