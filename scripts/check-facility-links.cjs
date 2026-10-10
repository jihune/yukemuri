const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,dependencies={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>dependencies[name]??require(name.startsWith('.')?path.resolve(path.dirname(file),name):name),module,module.exports);
 return module.exports;
}
const types=load('lib/hotel-types.ts');
const facilities=load('lib/hotel-facility-link.ts');
const {hotelFacilityUrl}=facilities;
const originals=JSON.parse(fs.readFileSync('lib/hotels.real.json','utf8'));
const list='https://www.trip.com/hotels/urayasu-hotels-list-35751/';
const property='https://www.trip.com/hotels/urayasu-hotel-detail-2611722/tokyo-disney-hotel-r/';
// Reduced from the reported live record, including its unverified facilities.
const hotel={...originals[0],id:'trip-2611722',names:{ko:'Tokyo Disneyland Hotel',ja:'Tokyo Disneyland Hotel',en:'Tokyo Disneyland Hotel'},aliases:[],ratings:[],location:{label:'지바',address:'',latitude:null,longitude:null,isApproximate:false},sources:[{sourceId:'trip-2611722',sourceType:'web',label:'Trip.com 숙소 목록',retrievedAt:'2026-10-04T00:56:20+00:00',verifiedAt:'2026-10-04',url:list,isMock:false}],links:[{provider:'trip',url:property,kind:'property',label:'숙소 페이지'}],features:Object.fromEntries(Object.keys(types.FEATURE_LABELS).map(key=>[key,{value:null,sourceId:'trip-2611722',verifiedAt:null}]))};
const before=JSON.stringify(hotel);
assert.equal(hotelFacilityUrl(hotel,'trip-2611722'),property);
assert.equal(hotelFacilityUrl({...hotel,links:[]},'trip-2611722'),null);
assert.equal(hotelFacilityUrl({...hotel,links:[{...hotel.links[0],url:property.replace('2611722','842622')}]},'trip-2611722'),null);
assert.equal(hotelFacilityUrl({...hotel,links:[{...hotel.links[0],kind:'search'}]},'trip-2611722'),null);
assert.equal(hotelFacilityUrl({...hotel,links:[{...hotel.links[0],url:'https://www.jalan.net/yad2611722/'}]},'trip-2611722'),null);
assert.equal(hotelFacilityUrl(hotel,'missing-source'),null);
const direct={...hotel,sources:[{...hotel.sources[0],url:property+'?locale=en-US#facilities'}]};
assert.equal(hotelFacilityUrl(direct,'trip-2611722'),direct.sources[0].url);
const jalan={...hotel,sources:[{...hotel.sources[0],sourceId:'jalan-307416',url:'https://www.jalan.net/130000/LRG_137100/'}],links:[{provider:'jalan',url:'https://www.jalan.net/yad307416/',kind:'property',label:'宿'}]};
assert.equal(hotelFacilityUrl(jalan,'jalan-307416'),'https://www.jalan.net/yad307416/');
assert.equal(JSON.stringify(hotel),before,'Source URL and unknown facts must be unchanged');
// Preserve all previously verified official bath/room URLs.
for(const h of originals)for(const fact of Object.values(h.features)){
 const source=h.sources.find(s=>s.sourceId===fact.sourceId);
 if(source?.url)assert.equal(hotelFacilityUrl(h,fact.sourceId),source.url);
}
const passthrough=({children})=>React.createElement(React.Fragment,null,children);
const empty=()=>null;
const Detail=load('components/hotel-detail.tsx',{
 '@/lib/hotel-types':types,
 '@/lib/hotel-bath-facts':load('lib/hotel-bath-facts.ts',{'./hotel-types':types}),
 '@/lib/hotel-facility-link':facilities,
 '@/lib/hotel-ratings':load('lib/hotel-ratings.ts'),
 '@/lib/hotel-location':load('lib/hotel-location.ts'),
 '@/lib/booking-query':load('lib/booking-query.ts'),
 '@/components/ui/sheet':Object.fromEntries(['Sheet','SheetContent','SheetTitle','SheetDescription','SheetClose'].map(name=>[name,passthrough])),
 './stay-map':empty,'./retry-image':empty,'./hotel-prices':empty,'./hotel-description':empty,
}).default;
const render=h=>renderToStaticMarkup(React.createElement(Detail,{hotel:h,onClose:empty,onRestoreFocus:empty,favorite:false,onFavorite:empty,pending:false,canSave:true,booking:{checkIn:'',checkOut:'',adults:2},onBooking:empty,roomPriceMode:'any'}));
const html=render(hotel),buttons=[...html.matchAll(/class="fact-source" href="([^"]+)"/g)];
assert.equal(buttons.length,Object.keys(types.FEATURE_LABELS).length);
assert(buttons.every(m=>m[1]===property),'Every facility button opens the requested property');
assert(html.includes(list),'Actual collection URL remains in provenance');
assert(html.includes('확인 필요')&&!html.includes('feature-fact available'));
assert(!render({...hotel,links:[]}).includes('class="fact-source"'),'No city-list fallback when the property URL is missing');
// Audit the existing snapshot as well as the reported later live record.
let redirected=0;
for(const h of JSON.parse(fs.readFileSync('lib/hotels.crawled.json','utf8')))for(const source of h.sources){
 if(source.url?.includes('hotels-list-')||source.url?.includes('/LRG_')){
  const href=hotelFacilityUrl(h,source.sourceId);
  assert(href&&!href.includes('hotels-list-')&&!href.includes('/LRG_'));
  redirected++;
 }
}
console.log(`Facility-link checks passed: Tokyo Disneyland rendered buttons, source preserved, missing/wrong-property rejection, original 20 official URLs unchanged; ${redirected} snapshot list sources resolve to their own property.`);
