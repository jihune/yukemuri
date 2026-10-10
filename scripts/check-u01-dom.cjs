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
stubs.set('./use-hotel-search-index',{useHotelSearchIndex:()=>({prepared:[],ready:true,failed:false})});
stubs.set('./use-hotel-results',{useHotelResults:initial=>({response:initial,loading:false,loadingMore:false,searchError:'',moreError:'',hasMore:false,loadMore(){}})});
const hotels=JSON.parse(fs.readFileSync('lib/hotels.real.json','utf8')).slice(0,4);
let statusMode='success',held=[],comparisonMode='success',calls=[];
const status={measuredAt:'2026-10-08T17:00:00Z',quality:{records:4,detailRecords:4,bathKnownRecords:2,naturalOnsenRecords:1,roomOnsenRecords:0},providers:['jalan','trip'].map(provider=>({provider,lastSuccessAt:null,completedDetailPages:0,pendingPages:0,retryPages:0,failedPages:0,activePages:0,waitingUntil:null,issues:[]})),google:{connected:false,mode:'on_demand'}};
stubs.set('@/lib/api-client',{apiJson:async(url,options={})=>{
 calls.push(url);let value;
 if(url==='/api/collection-status'){
  if(statusMode==='hold')return new Promise((resolve,reject)=>{held.push(resolve);options.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})});
  if(statusMode==='error')throw new Error('controlled failure');
  value=structuredClone(status);if(statusMode==='empty')for(const key of Object.keys(value.quality))value.quality[key]=0;
 }else if(url.startsWith('/api/hotel-comparison')){
  if(comparisonMode==='error')throw new Error('controlled comparison failure');
  const ids=new URL(url,'http://localhost').searchParams.get('ids').split(',');
  value={hotels:hotels.filter(h=>ids.includes(h.id)),missingIds:ids.filter(id=>!hotels.some(h=>h.id===id)),measuredAt:status.measuredAt};
 }else if(url.startsWith('/api/hotels/'))value=hotels.find(h=>h.id===decodeURIComponent(url.split('/').pop()));
 else if(url==='/api/favorites')value={ids:[]};
 else throw new Error('Unexpected test request '+url);
 return value;
}});
const Explorer=load('components/hotel-explorer.tsx').default,{DEFAULT_FILTERS}=load('lib/hotel-types.ts');
const initial={hotels,total:4,page:1,pageSize:24,featureCounts:{},ryokanCount:4,alternatives:[],coverage:{prefectures:1,records:4,discoveredDetailUrls:4,completedDetailPages:4,pending:0,failed:0,updatedAt:status.measuredAt}};
const root=createRoot(document.getElementById('root'));
const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
async function render(){await act(async()=>{root.render(React.createElement(Explorer,{initial,initialSearchIndex:[],initialQuery:{filters:DEFAULT_FILTERS,sort:'recommended',savedOnly:false},initialView:'list'}));await wait()})}
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
 const summary=document.querySelector('.coverage-panel summary'),details=summary.parentElement;
 async function toggle(open){await act(async()=>{details.open=open;details.dispatchEvent(new Event('toggle'));await wait()})}
 statusMode='hold';await toggle(true);
 await check('collection loading state and duplicate request prevention',async()=>{
  assert(document.querySelector('[role="status"]').textContent.includes('수집 기록'));const count=calls.length;
  await click(button('출처별 수집 현황 새로고침'));assert.equal(calls.length,count);
 });
 await act(async()=>{held.splice(0).forEach(resolve=>resolve(structuredClone(status)));await wait()});
 statusMode='error';await click(button('출처별 수집 현황 새로고침'));
 await check('refresh failure keeps previous result and alert',async()=>{assert(document.querySelector('[role="alert"]').textContent.includes('마지막 조회 결과'));assert(document.querySelector('.collection-table'))});
 statusMode='success';await click(button('출처별 수집 현황 새로고침'));
 await check('retry success clears alert and retains refresh focus',async()=>{assert(!document.querySelector('[role="alert"]'));assert.equal(document.activeElement,button('출처별 수집 현황 새로고침'))});
 statusMode='empty';await click(button('출처별 수집 현황 새로고침'));
 await check('zero-record collection result explains empty state',async()=>{assert(document.body.textContent.includes('아직 저장된 수집 기록이 없습니다.'))});
 await check('collection table is focusable and responds to horizontal keys',async()=>{const region=document.querySelector('.collection-table-region');assert(region);assert.equal(region.tabIndex,0);region.focus();await key(region,'ArrowRight');assert(region.scrollLeft>0)});
 await toggle(false);assert.equal(details.open,false);
 await act(async()=>{root.unmount();await wait()});
 // Initial failure must not show a successful result; retry recovers it.
 statusMode='error';const second=createRoot(document.getElementById('root'));
 await act(async()=>{second.render(React.createElement(load('components/collection-status-panel.tsx').default,{coverage:initial.coverage}));await wait()});
 const fresh=document.querySelector('details');await act(async()=>{fresh.open=true;fresh.dispatchEvent(new Event('toggle'));await wait()});
 await check('initial collection failure and explicit retry recovery',async()=>{
  assert(document.querySelector('[role="alert"]'));assert(!document.querySelector('.collection-table'));statusMode='success';await click(button('출처별 수집 현황 새로고침'));assert(document.querySelector('.collection-table'));assert(!document.querySelector('[role="alert"]'));
 });
 await act(async()=>{second.unmount();await wait()});
 console.log(JSON.stringify({kind:'simulated-component-DOM',browserLayoutTested:false,results},null,2));
 if(results.some(result=>!result.passed)&&!baseline)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>dom.window.close());
