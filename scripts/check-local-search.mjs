import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-local-search-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/hotel-search-index.ts','lib/japan-place-labels.ts','lib/hotel-ratings.ts','--outDir',dir,'--module','commonjs','--target','es2022','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--skipLibCheck'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 const require=createRequire(join(dir,'test.cjs'));
 const {prepareSearchIndex,localHotelSuggestions,SEARCH_FEATURES}=require(join(dir,'lib/hotel-search-index.js'));
 const {formatHotelLocation,hotelPlaceSearchText}=require(join(dir,'lib/japan-place-labels.js'));
 const {providerRating}=require(join(dir,'lib/hotel-ratings.js'));
 const {DEFAULT_FILTERS}=require(join(dir,'lib/hotel-types.js'));
 const hotels=['lib/hotels.real.json','lib/hotels.crawled.json','lib/hotels.verified.json'].flatMap(path=>JSON.parse(readFileSync(path,'utf8')));
 const entries=hotels.map(h=>{
  const trip=providerRating(h,'trip'),jalan=providerRating(h,'jalan');
  return{id:h.id,names:[...new Set([...Object.values(h.names),...(h.aliases??[])])],location:formatHotelLocation(h),context:hotelPlaceSearchText(h),region:h.regionId,prefecture:h.prefecture??'pref-hokkaido',kind:h.kind,features:SEARCH_FEATURES.reduce((mask,key,i)=>mask|(h.features[key]?.value===true?1<<i:0),0),tripScore:trip?.score??null,tripReviews:trip?.reviewCount??null,jalanScore:jalan?.score??null,jalanReviews:jalan?.reviewCount??null};
 });
 assert(entries.every(h=>!/[A-Za-z\u3040-\u30ff\u3400-\u9fff]/.test(h.location)),'All display locations must be Korean');
 assert.equal(entries.find(h=>h.id==='trip-67309116').location,'나하 · 오키나와');
 assert.equal(entries.find(h=>h.id==='jalan-327522').location,'우치노마키 온천 · 아소 · 구마모토');
 assert.equal(entries.find(h=>h.id==='takinoya').location,'노보리베츠 온천 · 홋카이도');
 assert.equal(entries.find(h=>h.id==='daiichi-takimotokan').location,'노보리베츠 온천 · 홋카이도','Korean onsen labels with spaces must match');
 assert.equal(entries.find(h=>h.id==='bourou-hakodate').location,'유노카와 온천 · 하코다테 · 홋카이도','Romanized address Yunokawacho must match');
 assert.equal(entries.find(h=>h.id==='hanamomiji').location,'조잔케이 온천 · 삿포로 · 홋카이도','Romanized address Jozankeionsen must match');
 const place=(pref,address,label,name='도시 호텔')=>formatHotelLocation({prefecture:pref,regionId:pref,location:{address,label},names:{ja:name}});
 assert.equal(place('pref-shiga','滋賀県草津市西大路町1','Kusatsu'),'구사쓰 · 시가');
 assert.equal(place('pref-gunma','群馬県吾妻郡草津町草津1','Kusatsu'),'구사쓰 온천 · 군마');
 assert.equal(place('pref-hokkaido','北海道札幌市中央区北1条','삿포로 · 조잔케이 온천'),'삿포로 · 홋카이도');
 assert.equal(place('pref-oosaka','大阪府泉佐野市りんくう往来北1','Izumisano'),'이즈미사노 · 오사카');
 assert.equal(place('pref-kanagawa','神奈川県横浜市西区みなとみらい','Yokohama'),'요코하마 · 가나가와');
 assert.equal(place('pref-ooita','大分県速見郡日出町平道1','Hiji','Beppuwan Resort'),'히지 · 오이타');
 assert.equal(place('pref-kanagawa','神奈川県小田原市城山1','Odawara','Hakone Entrance Hotel'),'오다와라 · 가나가와');
 assert.equal(place('pref-hokkaido','1 Chome Yunokawara, Hakodate City, Hokkaido','Hakodate'),'하코다테 · 홋카이도','Romanized onsen names must not match inside longer words');
 // The collector's prefecture fallback label '가나가와 · 하코네' names no town (L01: Trip.com
 // Yokohama hotels); a bare English city name is an address.
 assert.equal(place('pref-kanagawa','Yokohama','가나가와 · 하코네'),'요코하마 · 가나가와');
 assert.equal(place('pref-kanagawa','','가나가와 · 하코네'),'가나가와');
 assert.equal(place('pref-aichi','Nagoya','아이치 · 나고야'),'나고야 · 아이치');
 // The same label after an earlier PUT formatted it, town first (Codex review on PR #98).
 assert.equal(place('pref-kanagawa','Yokohama','하코네 · 가나가와'),'요코하마 · 가나가와');
 assert.equal(place('pref-kanagawa','','하코네 · 가나가와'),'가나가와');
 assert(!hotelPlaceSearchText({prefecture:'pref-kanagawa',regionId:'pref-kanagawa',location:{address:'Yokohama',label:'하코네 · 가나가와'},names:{ja:'ホテル'}}).includes('하코네'),'A formatted fallback label is dropped too');
 assert.equal(place('pref-hyogo','1-1 Chuo-ku, Kobe, Hyogo','고베 · 효고'),'고베 · 효고','A town label the address supports stays');
 assert(!hotelPlaceSearchText({prefecture:'pref-kanagawa',regionId:'pref-kanagawa',location:{address:'Yokohama',label:'가나가와 · 하코네'},names:{ja:'ホテル'}}).includes('하코네'),'A Yokohama hotel is not found as 하코네');
 // Town words in the search context (L01): Kurokawa Onsen is in 南小国町, not 黒川 in Aso city.
 const townContext=(pref,address,label)=>hotelPlaceSearchText({prefecture:pref,regionId:pref,location:{address,label},names:{ja:'旅館'}});
 assert(townContext('pref-kumamoto','熊本県阿蘇郡南小国町満願寺6567','미나미오구니 · 구마모토').includes('구로카와'),'An address in Minamioguni carries the Kurokawa town words');
 assert(!townContext('pref-kumamoto','熊本県阿蘇市黒川1230','아소 · 구마모토').includes('구로카와'),'黒川 in Aso city is not Kurokawa Onsen');
 const index=prepareSearchIndex(entries),suggest=(q,extra={})=>localHotelSuggestions(index,q,{...DEFAULT_FILTERS,...extra});
 for(const q of ['소잔쿄','SOZAN-KYO','Sozankoy','소잔코','蘇山鄕','호텔 소잔쿄','아소 소잔쿄','Sozankyo Aso'])assert.equal(suggest(q)[0].id,'jalan-327522',q);
 for(const q of ['타키노아','Noboribetsu Takinoya'])assert.equal(suggest(q)[0].id,'takinoya',q);
 assert.equal(suggest('Lake Suite')[0].id,'konosumika');
 assert(suggest('나하')[0].location.includes('나하'),'Short Korean city queries must not join unrelated name words');
 assert(suggest('Naha')[0].location.includes('나하'),'Short English city queries must not join unrelated name words');
 assert.equal(suggest('Sozankoy',{region:'pref-okinawa'}).length,0);
 assert.equal(suggest('Sozankoy',{features:['natural','roomOutdoor']})[0].id,'jalan-327522');
 assert.equal(suggest('Sozankoy',{minRating:10,minReviews:100000}).length,0);
 assert.equal(localHotelSuggestions(index,'소잔쿄',DEFAULT_FILTERS,new Set()).length,0);
 assert.equal(localHotelSuggestions(index,'소잔쿄',DEFAULT_FILTERS,new Set(['jalan-327522']))[0].id,'jalan-327522');
 const large=prepareSearchIndex(Array.from({length:4},(_,batch)=>entries.map(h=>({...h,id:batch+'-'+h.id}))).flat());
 const samples=[];
 for(const q of ['소','소잔코','Sozankoy','Lake Suite','아소 소잔쿄']){
  const start=performance.now(),result=localHotelSuggestions(large,q,DEFAULT_FILTERS);const ms=performance.now()-start;
  assert(result.length>0);assert(result.length<=8);assert(ms<750,'Local autocomplete must not wait seconds: '+q+' '+ms);
  samples.push({query:q,ms:Math.round(ms)});
 }
 console.log(JSON.stringify({passed:'Korean locations, onsen/prefecture boundaries, word order, partial hotel and area names, typos, facilities, rating and favorites without network requests',records:large.length,localAutocomplete:samples}));
}finally{rmSync(dir,{recursive:true,force:true})}
