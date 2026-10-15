// Component DOM regression checks. This is not a browser/layout/assistive-tech test.
// Install the isolated test dependency as documented in docs/ui-u01-20261008.md.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require(path.resolve('.sites-runtime/u01-dom/node_modules/jsdom'));
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const name of Object.getOwnPropertyNames(dom.window).filter(name=>/^HTML.*Element$/.test(name)||['DocumentFragment','SVGElement'].includes(name)))global[name]=dom.window[name];
for(const name of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLFormElement','HTMLSelectElement','Element','Node','NodeFilter','MutationObserver','CustomEvent','Event','KeyboardEvent','MouseEvent','getComputedStyle'])global[name]=typeof dom.window[name]==='function'&&name==='getComputedStyle'?dom.window[name].bind(dom.window):dom.window[name];
global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
global.IS_REACT_ACT_ENVIRONMENT=true;
global.history=window.history;global.localStorage=window.localStorage;
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
const cache=new Map(),stubs=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(stubs.has(name))return stubs.get(name);
  if(name.startsWith('@/')||name.startsWith('.')){
   const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);
   const found=['','.tsx','.ts','.json','.js'].map(ext=>base+ext).find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
   if(found)return load(found);
  }
  return require(name);
 },module,module.exports);return module.exports;
}
const blank={__esModule:true,default:()=>null};
for(const name of ['./stay-map','./retry-image','./hotel-photo','./hotel-lifecycle-note','./google-place-rating','./hotel-description','./hotel-autocomplete'])stubs.set(name,blank);
const hotels=JSON.parse(fs.readFileSync('lib/hotels.real.json','utf8')).slice(0,4);
let statusMode='success',held=[],comparisonMode='success',calls=[];
const status={measuredAt:'2026-10-08T17:00:00Z',quality:{records:4,detailRecords:4,bathKnownRecords:2,naturalOnsenRecords:1,roomOnsenRecords:0},providers:['jalan','trip'].map(provider=>({provider,lastSuccessAt:null,completedDetailPages:0,pendingPages:0,retryPages:0,failedPages:0,activePages:0,waitingUntil:null,issues:[]})),google:{connected:false,mode:'on_demand'}};
// The data status fill (U06): one place filled in each row, the rest not yet filled.
const fillScope=records=>({records,rows:Object.fromEntries(['detail','bath','rooms','years','rating','photo','nameKo','descKo'].map(k=>[k,{filled:1,none:0,empty:records-1}])),geo:[0,records,0,0,0,0,0],staleTranslations:0});
const pagesOf=()=>({detail:{done:1,pending:1,retry:0,failed:0},list:{done:1,pending:0,retry:0,failed:0},detailChecked24h:0});
status.fill={scopes:{all:fillScope(4),jalan:fillScope(2),trip:fillScope(2)},pages:{jalan:pagesOf(),trip:pagesOf()}};
stubs.set('@/lib/api-client',{apiJson:async(url,options={})=>{
 calls.push(url);let value;
 if(url==='/api/collection-status'){
  if(statusMode==='hold')return new Promise((resolve,reject)=>{held.push(resolve);options.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})});
  if(statusMode==='error')throw new Error('controlled failure');
  value=structuredClone(status);if(statusMode==='empty'){for(const key of Object.keys(value.quality))value.quality[key]=0;for(const scope of Object.values(value.fill.scopes)){scope.records=0;for(const row of Object.values(scope.rows))Object.assign(row,{filled:0,none:0,empty:0});scope.geo=scope.geo.map(()=>0)}}
 }else if(url.startsWith('/api/hotel-comparison')){
  if(comparisonMode==='error')throw new Error('controlled comparison failure');
  const ids=new URL(url,'http://localhost').searchParams.get('ids').split(',');
  value={hotels:hotels.filter(h=>ids.includes(h.id)),missingIds:ids.filter(id=>!hotels.some(h=>h.id===id)),measuredAt:status.measuredAt};
 }else if(url.startsWith('/api/hotels/'))value=hotels.find(h=>h.id===decodeURIComponent(url.split('/').pop()));
 else if(url==='/api/favorites')value={ids:[]};
 else throw new Error('Unexpected test request '+url);
 return value;
}});
// The list hooks return the fixed page below (the snapshot is not loaded here).
stubs.set('./use-search-snapshot',{useSearchSnapshot:()=>({snapshot:{manifest:{coverage:initial.coverage,files:{}},position:new Map(),cards:[]},loading:false,error:null,textReady:false,textError:null,wantText(){},refresh(){}})});
// The panel reads the snapshot's status.json (P03); the same controlled modes answer it.
stubs.set('@/lib/snapshot-client',{loadSnapshot:async()=>({}),loadSnapshotText:async s=>s,loadSnapshotGeo:async()=>null,loadSnapshotStatus:(_s,signal)=>stubs.get('@/lib/api-client').apiJson('/api/collection-status',{signal})});
stubs.set('./use-hotel-results',{useHotelResults:()=>({response:initial,loading:false,searchError:'',reopenSearch:false,hasMore:false,loadMore(){}})});
const Explorer=load('components/hotel-explorer.tsx').default,{DEFAULT_FILTERS}=load('lib/hotel-types.ts');
const initial={hotels,total:4,page:1,pageSize:24,featureCounts:{},ryokanCount:4,alternatives:[],coverage:{prefectures:1,records:4,discoveredDetailUrls:4,completedDetailPages:4,pending:0,failed:0,updatedAt:status.measuredAt}};
const root=createRoot(document.getElementById('root'));
const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
async function render(){await act(async()=>{root.render(React.createElement(Explorer));await wait()})}
async function click(element){assert(element,'Expected control');await act(async()=>{element.focus();element.click()});await act(async()=>{await wait()})}
async function key(element,key,shift=false){await act(async()=>{element.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey:shift,bubbles:true}))});await act(async()=>{await wait()})}
function button(label){return [...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===label)}
const baseline=process.argv.includes('--baseline'),results=[];
async function check(name,fn){console.error('Checking: '+name);try{await fn();results.push({name,passed:true})}catch(error){results.push({name,passed:false,reason:error.message});if(!baseline)throw error}}
(async()=>{
 console.error('Rendering explorer');await render();console.error('Rendered explorer');
 await check('card add/remove and four-candidate selection',async()=>{
  await click(button(hotels[0].names.ko+' 비교 담기'));assert.equal(button(hotels[0].names.ko+' 비교에서 빼기').getAttribute('aria-pressed'),'true');
  await click(button(hotels[0].names.ko+' 비교에서 빼기'));assert(button(hotels[0].names.ko+' 비교 담기'));
  for(const hotel of hotels)await click(button(hotel.names.ko+' 비교 담기'));
  assert(button('숙소 비교 열기, 4곳 선택'));
 });
 await click(button('숙소 비교 열기, 4곳 선택'));
 await check('open focus and backward Tab wrap',async()=>{
  const close=button('숙소 비교 닫기');assert(document.activeElement===close,"Close control has focus");
  await key(close,'Tab',true);assert(document.querySelector('.hotel-comparison').contains(document.activeElement));assert(document.activeElement!==close,"Backward Tab leaves first control");
 });
 await check('comparison -> detail -> comparison and exact opener focus',async()=>{
  const scroll=document.querySelector('.comparison-scroll'),table=document.querySelector('.comparison-table-region');scroll.scrollTop=175;table.scrollLeft=220;
  const opener=document.querySelector('.comparison-hotel-name');await click(opener);
  assert(button('숙소 상세 닫기'));await key(button('숙소 상세 닫기'),'Escape');
  assert(button('숙소 비교 닫기'),'Comparison must remain open after detail closes');assert(document.activeElement===opener,"Detail returns focus to the exact comparison name");
  assert.equal(scroll.scrollTop,175);assert.equal(table.scrollLeft,220);
 });
 await check('detail close button and browser history return to comparison',async()=>{
  const opener=document.querySelector('.comparison-hotel-name');await click(opener);await click(button('숙소 상세 닫기'));
  assert(button('숙소 비교 닫기'));assert(document.activeElement===opener,'Close button restores comparison name');
  await click(opener);await act(async()=>{window.history.back();await wait()});await act(async()=>{await wait()});
  assert(!button('숙소 상세 닫기'));assert(button('숙소 비교 닫기'));assert(document.activeElement===opener,'History back restores comparison name');
 });
 // Reopen for independent baseline checks if the old navigation closed it.
 if(!button('숙소 비교 닫기'))await click(button('숙소 비교 열기, 4곳 선택'));
 await check('remove candidate retains focus on adjacent remove control',async()=>{
  const remove=document.querySelectorAll('.comparison-remove')[1];await click(remove);
  const next=document.querySelectorAll('.comparison-remove')[1];assert(document.activeElement===next,"Removed control hands focus to adjacent remove control");
 });
 await check('comparison table responds to horizontal arrow keys',async()=>{
  const region=document.querySelector('.comparison-table-region');region.scrollLeft=0;region.focus();await key(region,'ArrowRight');assert(region.scrollLeft>0);await key(region,'ArrowLeft');assert.equal(region.scrollLeft,0);
  const link=region.querySelector('a');link.focus();await key(link,'ArrowRight');assert.equal(region.scrollLeft,0,'Keys on a cell link do not scroll the region');
 });
 await check('clear focuses persistent close control and empty selection',async()=>{
  await click([...document.querySelectorAll('.comparison-toolbar button')].find(el=>el.textContent.includes('모두 비우기')));
  assert(document.body.textContent.includes('숙소 목록에서'));assert(document.activeElement===button('숙소 비교 닫기'),"Clearing retains focus on close control");
 });
 await check('close restores persistent listing opener after dock disappears',async()=>{
  await key(button('숙소 비교 닫기'),'Escape');assert(document.activeElement===button('숙소 비교 열기, 0곳 선택'),"Closing restores listing comparison opener");
 });
 await check('removing the last candidate focuses close and dock close falls back to listing opener',async()=>{
  await click(button(hotels[0].names.ko+' 비교 담기'));await click([...document.querySelectorAll('.comparison-dock button')][0]);
  await click(document.querySelector('.comparison-remove'));assert(document.activeElement===button('숙소 비교 닫기'),'Last removal focuses close');
  await click(button('숙소 비교 닫기'));assert(document.activeElement===button('숙소 비교 열기, 0곳 선택'),'Removed dock opener falls back to listing control');
 });
 // The data status screen (U06): loading, the rows, closing back to its opener, failure and
 // retry, and an empty collection.
 const opener=document.querySelector('.data-status-link');
 const reopen=async()=>{if(button('자료 현황 닫기'))await key(button('자료 현황 닫기'),'Escape');await click(opener)};
 statusMode='hold';await click(opener);
 await check('data status loading state',async()=>{assert(document.querySelector('.u06-sheet [role="status"]').textContent.includes('불러오는 중'));assert(!document.querySelector('.u06-row'))});
 await act(async()=>{held.splice(0).forEach(resolve=>resolve(structuredClone(status)));await wait()});
 await check('data status rows and focus on close',async()=>{assert.equal(document.querySelectorAll('.u06-row').length,8);assert.equal(document.activeElement,button('자료 현황 닫기'))});
 await check('Escape closes the data status and returns focus to its opener',async()=>{await key(button('자료 현황 닫기'),'Escape');assert(!document.querySelector('.u06-sheet'));assert.equal(document.activeElement,opener)});
 statusMode='error';await click(opener);
 await check('first failure shows an alert and no rows',async()=>{assert(document.querySelector('.u06-sheet [role="alert"]'));assert(!document.querySelector('.u06-row'))});
 statusMode='success';
 await check('retry recovers, clears the alert and focuses the first heading',async()=>{await click([...document.querySelectorAll('.u06-sheet button')].find(b=>b.textContent.includes('다시 시도')));assert(!document.querySelector('.u06-sheet [role="alert"]'));assert.equal(document.querySelectorAll('.u06-row').length,8);assert.equal(document.activeElement?.id,'u06-detail')});
 statusMode='empty';await reopen();
 await check('zero-record collection result explains empty state',async()=>{assert(document.body.textContent.includes('아직 저장된 수집 기록이 없습니다.'))});
 await key(button('자료 현황 닫기'),'Escape');
 await act(async()=>{root.unmount();await wait()});
 console.log(JSON.stringify({kind:'simulated-component-DOM',browserLayoutTested:false,results},null,2));
 if(results.some(result=>!result.passed)&&!baseline)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>dom.window.close());
