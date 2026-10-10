'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Waves, Search, MapPin, SlidersHorizontal, ShieldCheck, X, List, Map, RotateCcw, Info, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { Hotel, HotelFilters, DEFAULT_FILTERS, FEATURE_LABELS, FEATURE_GROUPS, FeatureKey, REGIONS, RegionId, isVerifiedCriteria } from '@/lib/hotel-types';
import { SortOrder } from '@/lib/hotel-search';
import { providerRating, displayRating, meetsVerifiedCriteria } from '@/lib/hotel-ratings';
import type { SearchResponse } from '@/lib/hotel-repository';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HotelDetail from './hotel-detail';
import StayMap from './stay-map';
import { hasCoordinates } from '@/lib/hotel-location';
import RetryImage from './retry-image';
import collectionPlan from '@/data/collection-priorities.json';
import {parseHotelQuery,listingUrl,type HotelQuery} from '@/lib/hotel-query';
import { apiJson } from '@/lib/api-client';
import HotelAutocomplete from './hotel-autocomplete';
import HotelCard from './hotel-card';
import CollectionStatusPanel from './collection-status-panel';
import HotelComparison from './hotel-comparison';
import {COMPARISON_STORAGE_KEY,storedComparisonIds,toggleComparisonId} from '@/lib/hotel-comparison';
import {useHotelResults} from './use-hotel-results';
import {useMapArea} from './use-map-area';
import {openStayHistory,closeStayHistory,restoreListingPosition,type ListingPosition} from '@/lib/stay-detail-navigation';
import { type SearchIndexHotel } from '@/lib/hotel-search-index';
import {useHotelSearchIndex} from './use-hotel-search-index';
function Picker({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string}){
 return <Select value={value} onValueChange={onChange}><SelectTrigger className="picker" aria-label={label}><SelectValue/></SelectTrigger><SelectContent position="popper">{options.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
}
function Filters({filters,setFilters,counts,ryokanCount}:{filters:HotelFilters;setFilters:(f:HotelFilters)=>void;counts:SearchResponse['featureCounts'];ryokanCount:number}){
 const chosen=isVerifiedCriteria(filters);
 const ratingOptions=filters.ratingProvider==='trip'?[8,8.5,9,9.5]:[4,4.2,4.5,4.8];
 return <div className="filter-content">
  <div className="filter-title"><h2>숙소 필터</h2><button onClick={()=>setFilters({...DEFAULT_FILTERS,region:filters.region,query:filters.query})}>초기화</button></div>
  <label className={`criteria-box check-row ${chosen?'chosen':''}`}><Checkbox checked={chosen} onCheckedChange={checked=>setFilters({...filters,ratingProvider:'trip',minRating:checked===true?9:0,minReviews:checked===true?50:0})}/><span className="criteria-copy"><b><ShieldCheck size={20}/>내 검증 기준</b><span>Trip.com 9.0+ · 리뷰 50개+</span></span></label>
  <p className="filter-hint bath-filter-intro">확인된 조건을 모두 갖춘 숙소만 표시합니다.</p>{FEATURE_GROUPS.map(group=><fieldset key={group.label}><legend>{group.label}</legend>{group.keys.map(key=><label className="check-row" key={key}><Checkbox checked={filters.features.includes(key)} onCheckedChange={checked=>setFilters({...filters,features:checked===true?[...new Set([...filters.features,key])]:filters.features.filter(k=>k!==key)})}/><span>{FEATURE_LABELS[key]}</span><small>{counts[key]??0}</small></label>)}{group.keys.includes('natural' as never)&&<p className="filter-hint">대욕탕만 확인된 숙소는 천연온천 조건에 포함하지 않습니다.</p>}{group.keys.includes('freeFlow' as never)&&<p className="filter-hint">카케나가시는 원천을 흘려보내는 방식입니다. 가수·가온 없음과는 별개입니다.</p>}</fieldset>)}
  <fieldset><legend>숙소 유형·등급</legend><label className="check-row"><Checkbox checked={filters.features.includes('jalanHighClass')} onCheckedChange={checked=>setFilters({...filters,features:checked===true?[...new Set([...filters.features,'jalanHighClass' as const])]:filters.features.filter(k=>k!=='jalanHighClass')})}/><span>자란 하이클래스</span><small>{counts.jalanHighClass??0}</small></label><p className="filter-hint">자란에서 해당 숙소의 하이클래스 표시를 확인한 경우만 포함합니다.</p><label className="check-row"><Checkbox checked={filters.ryokanOnly} onCheckedChange={checked=>setFilters({...filters,ryokanOnly:checked===true})}/><span>료칸만 보기</span><small>{ryokanCount}</small></label></fieldset>
  <fieldset><legend>평점과 리뷰</legend><label className="filter-select">평점 출처<Picker label="평점 출처" value={filters.ratingProvider} onChange={v=>setFilters({...filters,ratingProvider:v as HotelFilters['ratingProvider'],minRating:0,minReviews:0})} options={[{value:'trip',label:'Trip.com · 10점 만점'},{value:'jalan',label:'Jalan · 5점 만점'}]}/></label><label className="filter-select">최소 평점<Picker label="최소 평점" value={String(filters.minRating)} onChange={v=>setFilters({...filters,minRating:Number(v)})} options={[{value:'0',label:'제한 없음'},...ratingOptions.map(v=>({value:String(v),label:v.toFixed(1)+' 이상'}))]}/></label><label className="filter-select">최소 리뷰 수<Picker label="최소 리뷰 수" value={String(filters.minReviews)} onChange={v=>setFilters({...filters,minReviews:Number(v)})} options={[{value:'0',label:'제한 없음'},{value:'50',label:'50개 이상'},{value:'100',label:'100개 이상'},{value:'300',label:'300개 이상'},{value:'500',label:'500개 이상'}]}/></label></fieldset>
  <div className="filter-footnote"><Info size={16}/><p>선택한 출처의 원래 평점으로 필터합니다. 확인된 시설만 포함하며, 객실탕은 해당 객실 타입을 예약해야 이용할 수 있습니다.</p></div>
 </div>
}
export default function HotelExplorer({initial,initialSearchIndex,initialQuery,initialView}:{initial:SearchResponse;initialSearchIndex:SearchIndexHotel[];initialQuery:HotelQuery;initialView:string}){
 const {prepared:preparedIndex,ready:indexReady,failed:indexFailed}=useHotelSearchIndex(initialSearchIndex);
 const [filters,setFilterState]=useState<HotelFilters>(initialQuery.filters),[draft,setDraft]=useState(initialQuery.filters.query),[sort,setSort]=useState<SortOrder>(initialQuery.sort);
 const [retry,setRetry]=useState(0);
 const [dismissSuggestions,setDismissSuggestions]=useState(0);
 function setFilters(value:HotelFilters|((previous:HotelFilters)=>HotelFilters)){setFilterState(value)}

 const [favorites,setFavorites]=useState<string[]>([]),[savedOnly,setSavedOnly]=useState(initialQuery.savedOnly),[favoritesReady,setFavoritesReady]=useState(false),[favoritesError,setFavoritesError]=useState(''),[pending,setPending]=useState<string[]>([]);
 const favoriteKey=[...favorites].sort().join(',');
 const {response,loading,loadingMore,searchError,moreError,reopenSearch,refreshRequired,loadMore,hasMore}=useHotelResults(initial,filters,sort,savedOnly,favoriteKey,retry);
 const mapArea=useMapArea(filters,savedOnly,favoriteKey),[areaHotel,setAreaHotel]=useState<Hotel|null>(null);
 const results=response.hotels,alternatives=response.alternatives??[];
 const displayHotels=useMemo(()=>[...response.hotels,...(response.alternatives??[]).map(a=>a.hotel)],[response.hotels,response.alternatives]);
 const located=useMemo(()=>results.filter(hasCoordinates).length,[results]),notLoaded=Math.max(0,response.total-results.length),unknownExcluded=response.unknownExcluded??0;
 const ratingFor=(h:Hotel)=>providerRating(h,filters.ratingProvider)??displayRating(h);
 const [mode,setMode]=useState(initialView),[activeId,setActiveId]=useState<string|null>(null),[detailId,setDetailId]=useState<string|null>(null),[mapFocusId,setMapFocusId]=useState<string|null>(null),[filterOpen,setFilterOpen]=useState(false),[toast,setToast]=useState('');
 const [isMobile,setIsMobile]=useState(false);
 const [detail,setDetail]=useState<Hotel|null>(null),[detailLoading,setDetailLoading]=useState(false);
 const [comparisonIds,setComparisonIds]=useState<string[]>([]),[comparisonReady,setComparisonReady]=useState(false),[comparisonOpen,setComparisonOpen]=useState(false);
 const comparisonButton=useRef<HTMLButtonElement>(null),comparisonOpener=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  try{setComparisonIds(storedComparisonIds(localStorage.getItem(COMPARISON_STORAGE_KEY)))}catch{}
  setComparisonReady(true);
  const changed=(event:StorageEvent)=>{if(event.key===COMPARISON_STORAGE_KEY)setComparisonIds(storedComparisonIds(event.newValue))};
  window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
 },[]);
 useEffect(()=>{if(comparisonReady)try{localStorage.setItem(COMPARISON_STORAGE_KEY,JSON.stringify(comparisonIds))}catch{}},[comparisonIds,comparisonReady]);
 function compare(id:string){
  if(!comparisonIds.includes(id)&&comparisonIds.length>=4)setToast('최대 4곳까지 비교할 수 있습니다. 기존 후보를 빼고 선택하세요.');
  setComparisonIds(previous=>toggleComparisonId(previous,id)??previous);
 }
 function showComparison(){comparisonOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:comparisonButton.current;setComparisonOpen(true)}
 function restoreComparisonFocus(){const opener=comparisonOpener.current;((opener?.isConnected?opener:null)??comparisonButton.current)?.focus({preventScroll:true})}
 const stateRef=useRef({filters,sort,savedOnly,favorites,results,total:response.total});stateRef.current={filters,sort,savedOnly,favorites,results,total:response.total};
 const active=displayHotels.find(h=>h.id===activeId)??(areaHotel?.id===activeId?areaHotel:null);
 const regionName=REGIONS.find(r=>r.id===filters.region)?.name??'일본 전국';
 const listEnd=useRef<HTMLDivElement>(null),listingPosition=useRef<ListingPosition|null>(null);
 useEffect(()=>{
  if(!hasMore||loading||loadingMore||moreError||detailId||filterOpen||comparisonOpen||mode==='map'||!listEnd.current||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))loadMore()},{rootMargin:'500px 0px'});
  observer.observe(listEnd.current);return()=>observer.disconnect();
 },[hasMore,loading,loadingMore,moreError,loadMore,detailId,filterOpen,comparisonOpen,mode,response.page]);
 useEffect(()=>{
  const cached=displayHotels.find(h=>h.id===detailId);setDetail(cached??null);if(!detailId){setDetailLoading(false);return}
  const controller=new AbortController();setDetailLoading(true);
  apiJson<Hotel>('/api/hotels/'+encodeURIComponent(detailId),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setDetail(data)}).catch(e=>{if(!controller.signal.aborted){setToast(e instanceof Error?e.message:'상세 정보를 불러오지 못했습니다.');if(!cached)closeDetail()}}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false)});
  return()=>controller.abort();
 },[detailId]);

 async function loadFavorites(){setFavoritesError('');try{const data=await apiJson<{ids:string[]}>('/api/favorites');setFavorites(data.ids);setFavoritesReady(true)}catch(e){setFavoritesError(e instanceof Error?e.message:'즐겨찾기를 불러오지 못했습니다.')}}
 async function saveFavorite(id:string,saved?:boolean){
  if(!favoritesReady||pending.includes(id))return;
  const next=saved??!favorites.includes(id);setPending(p=>[...p,id]);
  try{await apiJson('/api/favorites',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotelId:id,saved:next})});setFavorites(f=>next?[...new Set([...f,id])]:f.filter(k=>k!==id));setToast(next?'즐겨찾기에 저장했어요.':'즐겨찾기에서 해제했어요.')}catch(e){setToast(e instanceof Error?e.message:'저장하지 못했습니다. 다시 시도해 주세요.')}finally{setPending(p=>p.filter(k=>k!==id))}
 }
 function openDetail(id:string){if(!detailId)listingPosition.current={x:window.scrollX,y:window.scrollY,opener:document.activeElement instanceof HTMLElement?document.activeElement:null};openStayHistory(id,!!detailId);setDetailId(id)}
 function closeDetail(){setDetailId(null);closeStayHistory()}
 function restoreDetailFocus(){restoreListingPosition(listingPosition.current)}
 function chooseRegion(id:RegionId){setFilters(f=>({...f,region:id,query:''}));setDraft('');setActiveId(null)}
 // A map-bounds point may be outside the loaded list; fetch it for the same preview.
 function selectOnMap(id:string){
  focusHotel(id);
  if(!displayHotels.some(h=>h.id===id)&&areaHotel?.id!==id)apiJson<Hotel>('/api/hotels/'+encodeURIComponent(id)).then(setAreaHotel).catch(()=>setToast('숙소 정보를 불러오지 못했습니다. 다시 눌러 주세요.'));
 }
 function focusHotel(id:string){setActiveId(id);if(!isMobile)document.getElementById('card-'+id)?.scrollIntoView({behavior:'smooth',block:'center'})}
 useEffect(()=>{
  loadFavorites();
  const mq=window.matchMedia('(max-width: 900px)');const resize=()=>setIsMobile(mq.matches);resize();mq.addEventListener('change',resize);
  const hash=()=>{try{const id=decodeURIComponent(window.location.hash.replace(/^#stay\//,''));setDetailId(/^[a-zA-Z0-9-]{1,120}$/.test(id)&&window.location.hash.startsWith('#stay/')?id:null)}catch{setDetailId(null)}};hash();window.addEventListener('hashchange',hash);window.addEventListener('popstate',hash);
  return()=>{mq.removeEventListener('change',resize);window.removeEventListener('hashchange',hash);window.removeEventListener('popstate',hash)};
 },[]);
 useEffect(()=>{
  const restore=()=>{
   const params=new URLSearchParams(window.location.search),query=parseHotelQuery(params);
   if(query){setFilterState(query.filters);setDraft(query.filters.query);setSort(query.sort);setSavedOnly(query.savedOnly)}
   const view=params.get('view');if(view&&['split','list','map'].includes(view))setMode(view);
  };
  window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[]);
 useEffect(()=>{
  const next=listingUrl(window.location.href,{filters,sort,savedOnly,page:1},mode);
  if(next!==window.location.pathname+window.location.search+window.location.hash)history.replaceState(history.state,'',next);
 },[filters,sort,savedOnly,mode]);
 function refreshResults(){setRetry(r=>r+1);document.querySelector('.results-section')?.scrollIntoView({behavior:'instant',block:'start'})}
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t)}},[toast]);
 // Optional browser-agent interface; no dependency on WebMCP for normal use.
 useEffect(()=>{
  type Registry={registerTool:(tool:unknown,options:{signal:AbortSignal})=>Promise<void>|void};
  const context=(document as Document&{modelContext?:Registry}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools=[
   {name:'search_stays',description:'Search the real Japan hotel catalogue; the same server filters as the visible interface.',inputSchema:{type:'object',properties:{query:{type:'string'},region:{type:'string',enum:REGIONS.map(r=>r.id)},verifiedOnly:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{const p=input as Record<string,unknown>;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['query','region','verifiedOnly'].includes(k))||p.query!==undefined&&typeof p.query!=='string'||p.region!==undefined&&!REGIONS.some(r=>r.id===p.region)||p.verifiedOnly!==undefined&&typeof p.verifiedOnly!=='boolean')throw new Error('Invalid search input');const f={...DEFAULT_FILTERS,query:(p.query as string)??'',region:(p.region as RegionId)??'all',minRating:p.verifiedOnly?9:0,minReviews:p.verifiedOnly?50:0};setFilters(f);setDraft(f.query);setSavedOnly(false);setMode('split');const data=await apiJson<SearchResponse>('/api/hotels?'+new URLSearchParams({q:f.query,region:f.region,rating:String(f.minRating),reviews:String(f.minReviews)}));return{count:data.total,pageSize:data.pageSize}}},
   {name:'read_visible_stays',description:'Read the current page of filtered hotel results with original provider scales and favorites.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected empty object');const s=stateRef.current;return{total:s.total,hotels:s.results.map(h=>{const r=providerRating(h,s.filters.ratingProvider)??displayRating(h);return{id:h.id,name:h.names.ko,score:r?.score??null,scale:r?.scale??null,reviewCount:r?.reviewCount??null,ratingProvider:r?.provider??null,saved:s.favorites.includes(h.id),isMock:false}})}}},
   {name:'open_stay_detail',description:'Open hotel details without creating a reservation.',inputSchema:{type:'object',properties:{hotelId:{type:'string'}},required:['hotelId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{const p=input as {hotelId?:string};if(!p||Object.keys(p).some(k=>k!=='hotelId')||typeof p.hotelId!=='string'||!/^[a-zA-Z0-9-]{1,120}$/.test(p.hotelId))throw new Error('Invalid hotel ID');await apiJson<Hotel>('/api/hotels/'+encodeURIComponent(p.hotelId));openDetail(p.hotelId);return{hotelId:p.hotelId,opened:true}}},
  ];
  for(const t of tools)try{Promise.resolve(context.registerTool(t,{signal:lifecycle.signal})).catch(()=>{})}catch{}
  return()=>lifecycle.abort();
 },[]);
 const renderCard=(h:Hotel,unmetConditions?:string[])=><HotelCard key={h.id} hotel={h} active={activeId===h.id} saved={favorites.includes(h.id)} pending={pending.includes(h.id)} canSave={favoritesReady} provider={filters.ratingProvider} onActive={setActiveId} onDetail={openDetail} onFavorite={id=>saveFavorite(id)} compared={comparisonIds.includes(h.id)} onCompare={compare} similar={response.similarHotelIds?.includes(h.id)} unmetConditions={unmetConditions} onMap={hotel=>{setActiveId(hotel.id);setMapFocusId(hotel.id);if(hotel.location.latitude===null){openDetail(hotel.id);return}setMode(isMobile?'map':'split')}}/>;
 const chips:{label:string;clear:()=>void}[]=[...filters.features.map(key=>({label:FEATURE_LABELS[key],clear:()=>setFilters(f=>({...f,features:f.features.filter(k=>k!==key)}))})),...(filters.ryokanOnly?[{label:'료칸',clear:()=>setFilters(f=>({...f,ryokanOnly:false}))}]:[]),...(filters.minRating?[{label:`평점 ${filters.minRating.toFixed(1)}+`,clear:()=>setFilters(f=>({...f,minRating:0}))}]:[]),...(filters.minReviews?[{label:`리뷰 ${filters.minReviews}개+`,clear:()=>setFilters(f=>({...f,minReviews:0}))}]:[]),...(filters.query?[{label:`검색: ${filters.query}`,clear:()=>{setFilters(f=>({...f,query:''}));setDraft('')}}]:[])];
 return <>
 <header className="site-header"><div className="header-inner"><button className="brand" onClick={()=>{setSavedOnly(false);chooseRegion('all');setFilters(DEFAULT_FILTERS)}} aria-label="유케무리 전체 숙소"><span className="brand-icon"><Waves size={26}/></span><span>유케무리<small>YUKEMURI</small></span></button><nav aria-label="주 메뉴"><button className={!savedOnly?'nav-active':''} onClick={()=>{setSavedOnly(false)}}>숙소 찾기</button><button className={savedOnly?'nav-active':''} onClick={()=>{setSavedOnly(true)}}><Heart size={18} fill={savedOnly?'currentColor':'none'}/>즐겨찾기 <span>{favorites.length}</span></button></nav><span className="version">JAPAN <b>v0.5</b></span></div></header>
 <div className="search-zone"><div className="search-inner"><div className="search-title"><h1>일본 온천, 나에게 맞는 곳</h1><p>전통 온천마을부터 섬의 온천 숙소까지, 탕과 온천수 조건으로 찾아보세요.</p></div><form className="search-form" onSubmit={e=>{e.preventDefault();setFilters(f=>({...f,query:draft}));setActiveId(null);setDismissSuggestions(n=>n+1)}}><div className="region-picker"><MapPin size={19}/><Picker label="검색 지역" value={filters.region} onChange={v=>chooseRegion(v as RegionId)} options={REGIONS.map(r=>({value:r.id,label:r.name}))}/></div><HotelAutocomplete value={draft} onChange={setDraft} filters={filters} savedOnly={savedOnly} favorites={favorites} searchIndex={preparedIndex} indexReady={indexReady} indexFailed={indexFailed} dismissKey={dismissSuggestions} onSelect={hotel=>{setDraft(hotel.name);setFilters(f=>({...f,query:hotel.name}));setActiveId(null);setDismissSuggestions(n=>n+1)}} onClear={()=>{setDraft('');setFilters(f=>({...f,query:''}))}}/><button type="submit" className="search-button">검색</button></form></div></div>
 <div className="onsen-town-nav" aria-label="온천마을 바로 찾기"><span><Waves size={16}/>온천마을</span>{collectionPlan.towns.filter(t=>['하코네','유후인','구로카와','벳푸','노보리베츠','조잔케이','아리마','기노사키'].includes(t.name)).map(t=><button key={t.name} className={filters.query===t.query&&filters.region===t.prefecture?'active':''} onClick={()=>{setFilters(f=>({...f,region:t.prefecture,query:t.query}));setDraft(t.query);setSavedOnly(false);setActiveId(null)}}>{t.name}</button>)}</div>
 <div className="region-nav" aria-label="빠른 지역 검색">{['all','pref-fukuoka','pref-kumamoto','pref-ooita','pref-hokkaido','pref-okinawa','pref-oosaka','pref-hyogo','pref-tokyo','pref-kanagawa'].map(id=>REGIONS.find(r=>r.id===id)!).map(r=><button key={r.id} className={filters.region===r.id?'active':''} aria-pressed={filters.region===r.id} onClick={()=>chooseRegion(r.id)}>{r.name}</button>)}</div>
 <div className="demo-banner"><Info size={15}/><p><b>{response.coverage.prefectures}개 도도부현 · 숙소 {response.coverage.records.toLocaleString()}개 항목</b> · 최근 출처 확인 {response.coverage.updatedAt.slice(0,10)} · 전국 정보 보강 중</p></div><CollectionStatusPanel coverage={response.coverage}/>
 {searchError&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{searchError}</span><button onClick={()=>setRetry(r=>r+1)}>다시 시도</button>{reopenSearch&&<button onClick={()=>window.location.reload()}>페이지 다시 열기</button>}</div>}
 {favoritesError&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{favoritesError}</span><button onClick={loadFavorites}>다시 시도</button></div>}
 <main className={`workspace view-${mode}`}>
  <aside className="desktop-filters"><Filters filters={filters} setFilters={setFilters} counts={response.featureCounts} ryokanCount={response.ryokanCount}/></aside>
  <section className="results-section" aria-label="숙소 검색 결과" aria-busy={loading}>
   <div className="results-header"><div><div className="eyebrow">{savedOnly?'MY SAVED STAYS':'EXPLORE JAPAN'}</div><h2>{savedOnly?'즐겨찾기':regionName} <span>{response.total.toLocaleString()}곳</span></h2></div><div className="result-actions"><button ref={comparisonButton} className="compare-open" onClick={showComparison} aria-label={"숙소 비교 열기, "+comparisonIds.length+"곳 선택"}><ArrowLeftRight size={17}/>비교 {comparisonIds.length}/4</button><button className="mobile-filter" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={17}/>필터{chips.length>0&&<span>{chips.length}</span>}</button><Picker label="숙소 정렬" value={sort} onChange={v=>{setSort(v as SortOrder)}} options={[{value:'recommended',label:filters.query?'관련성 높은 순':'온천 확인 우선'},{value:'rating',label:'평점 높은 순'},{value:'reviews',label:'리뷰 많은 순'},{value:'name',label:'이름순'}]}/></div></div>
   <div className="mobile-quick"><button className={isVerifiedCriteria(filters)?'active':''} aria-pressed={isVerifiedCriteria(filters)} onClick={()=>setFilters(f=>({...f,ratingProvider:'trip',minRating:isVerifiedCriteria(f)?0:9,minReviews:isVerifiedCriteria(f)?0:50}))}><ShieldCheck size={16}/>내 검증 기준</button><button onClick={()=>setFilterOpen(true)}><Waves size={16}/>온천 조건</button></div>
   {chips.length>0&&<div className="active-filters">{chips.map(c=><button key={c.label} onClick={c.clear}>{c.label}<X size={14}/></button>)}</div>}
   {!loading&&!searchError&&unknownExcluded>0&&<p className="unknown-excluded" role="note"><Info size={15}/><span>선택한 조건 중 확인되지 않은 정보가 있어 제외한 숙소가 <b>{unknownExcluded.toLocaleString()}곳</b> 더 있습니다. 미확인 정보는 추정하지 않습니다. 해당 조건을 해제하면 함께 볼 수 있습니다.</span></p>}
   <div className="result-subtitle"><span>{loading?'숙소를 검색하는 중…':filters.query?`숙소명·지역·오타의 관련성으로 검색합니다.${response.similarCount?' 비슷한 이름 '+response.similarCount+'곳 포함.':''}`:'온천 특징을 비교하고, 마음에 드는 곳을 저장하세요.'}</span><button className="result-refresh" onClick={refreshResults} disabled={loading} aria-label="현재 조건으로 숙소 목록 새로고침"><RotateCcw size={15}/>목록 새로고침</button><span className="result-count" aria-live="polite">{response.total.toLocaleString()}개 결과</span></div>
   {savedOnly&&<p className="saved-browser-note">이 브라우저에서 저장한 숙소입니다. 다른 브라우저와 동기화되지 않으며, 사이트 저장소를 지우면 연결이 초기화됩니다.</p>}
   <div className="hotel-list">{results.map(h=>renderCard(h))}</div>
   {!loading&&!searchError&&results.length===0&&<div className="empty-state"><Search size={32}/><h3>{savedOnly&&!favorites.length?'아직 저장한 숙소가 없어요':'조건에 맞는 숙소가 없어요'}</h3><p>{savedOnly&&!favorites.length?'마음에 드는 숙소의 하트를 눌러 저장하세요.':'온천 조건이나 평점 기준을 조금 낮춰 보세요.'}</p><button onClick={()=>{setFilters(DEFAULT_FILTERS);setDraft('');if(savedOnly&&!favorites.length)setSavedOnly(false)}}><RotateCcw size={16}/>{savedOnly&&!favorites.length?'숙소 둘러보기':'필터 초기화'}</button></div>}
   {loading&&<div className="catalog-loading" role="status">조건에 맞는 숙소를 찾는 중…</div>}
   <div ref={listEnd} className="catalog-sentinel" aria-hidden="true"/>
   {!loading&&hasMore&&<div className="catalog-load-more" role="status">{loadingMore?<span>숙소를 더 불러오는 중…</span>:moreError?<><p>{moreError}</p><button onClick={refreshRequired?refreshResults:loadMore}>{refreshRequired?'목록 새로고침':'추가 로딩 다시 시도'}</button></>:<button onClick={loadMore}>숙소 더 불러오기</button>}</div>}
   {!loading&&!searchError&&alternatives.length>0&&<section className="alternative-results" aria-label="조건을 일부 바꾼 추천 숙소"><div className="alternative-heading"><span>다른 후보</span><h3>조건을 일부 바꾸면 찾을 수 있는 숙소</h3><p>{filters.query&&!alternatives.some(a=>a.queryMatched)?'검색어에 해당하는 숙소는 확인하지 못했습니다. 선택한 지역·시설 조건과 가까운 후보를 보여드립니다.':'이름·지역·시설의 관련성이 높은 후보입니다. 선택한 조건을 모두 충족하는 결과는 아닙니다.'} 각 숙소에서 맞지 않거나 확인되지 않은 조건을 확인하세요.</p></div><div className="hotel-list">{alternatives.map(a=>renderCard(a.hotel,a.unmetConditions))}</div></section>}
   {!loading&&!searchError&&<p className="list-end">{results.length.toLocaleString()} / {response.total.toLocaleString()}곳 불러옴{!hasMore&&results.length>0?' · 목록 끝':''}<br/>지도에는 불러온 숙소 중 위치가 확인된 항목을 표시합니다. 같은 숙소가 예약 사이트별로 표시될 수 있습니다.</p>}
  </section>
  <aside className="map-column" aria-label="지도와 숙소"><div className="map-sticky">{!loading&&!searchError&&<div className="map-coverage" role="status">{mapArea.error?<><span role="alert">{mapArea.error}</span><button onClick={mapArea.retry}>다시 검색</button><button onClick={mapArea.clear}>불러온 목록 위치로 돌아가기</button></>:mapArea.area?<><span>이 지역 <b>{mapArea.area.data.inBounds.toLocaleString()}곳</b></span><span>범위 밖 {mapArea.area.data.outOfBounds.toLocaleString()}곳</span><span>위치 미확인 {mapArea.area.data.withoutCoordinates.toLocaleString()}곳</span><span>조건에 맞는 전체 {mapArea.area.data.total.toLocaleString()}곳</span>{mapArea.area.data.cells.length>0&&<span>숙소가 {mapArea.area.data.limit.toLocaleString()}곳보다 많아 구역별 개수로 표시합니다. 구역을 누르면 확대합니다.</span>}<button onClick={mapArea.clear}>불러온 목록 위치로 돌아가기</button></>:results.length===0?<span>{alternatives.length?`조건을 모두 충족한 숙소가 없어 다른 후보 ${displayHotels.filter(hasCoordinates).length}곳의 위치를 표시합니다.`:'지도에 표시할 숙소가 없습니다.'}</span>:located===response.total?<span>검색 결과 <b>{response.total.toLocaleString()}곳</b>을 모두 지도에 표시합니다.</span>:<><span>검색 결과 <b>{response.total.toLocaleString()}곳</b> 중 지도에 <b>{located.toLocaleString()}곳</b> 표시</span><span>불러온 {results.length.toLocaleString()}곳 중 위치 미확인 {(results.length-located).toLocaleString()}곳</span>{notLoaded>0&&<span>아직 불러오지 않음 {notLoaded.toLocaleString()}곳</span>}{hasMore&&<>{moreError&&!loadingMore&&<span className="map-more-state" role="alert">{moreError}</span>}<button aria-disabled={loadingMore||undefined} onClick={()=>{if(!loadingMore)(moreError&&refreshRequired?refreshResults:loadMore)()}}>{loadingMore?'숙소를 더 불러오는 중…':moreError?(refreshRequired?'목록 새로고침':'다시 불러오기'):`${Math.min(response.pageSize,notLoaded)}곳 더 불러와 지도에 표시`}</button></>}</>}</div>}<div className="map-heading"><span><Map size={17}/> 지도로 둘러보기</span><Tabs value={mode==='list'?'list':'split'} onValueChange={setMode}><TabsList><TabsTrigger value="split">목록 + 지도</TabsTrigger><TabsTrigger value="list">목록만</TabsTrigger></TabsList></Tabs></div>{(!isMobile||mode==='map')&&<StayMap hotels={displayHotels} activeId={activeId} onSelect={selectOnMap} focusId={mapFocusId} points={mapArea.area?mapArea.area.data.points:null} cells={mapArea.area?.data.cells} onSearchArea={mapArea.search} areaBusy={mapArea.busy} areaFailed={!!mapArea.error}/>}{active&&<div className="map-preview"><RetryImage src={active.image.url} alternatives={active.image.alternatives} alt={active.image.alt}/><div><small>{active.location.label}</small><button onClick={()=>openDetail(active.id)}>{active.names.ko}</button><span><b>{ratingFor(active)?.score.toFixed(1)??'미확인'}</b> · {ratingFor(active)?.provider==='jalan'?'Jalan /5':'Trip.com /10'} · 리뷰 {ratingFor(active)?.reviewCount??'미확인'}개</span></div><button className="icon-button" aria-label="지도 숙소 선택 해제" onClick={()=>setActiveId(null)}><X size={17}/></button></div>}<div className="map-tip"><span className="map-dot">9.0</span><p>평점은 각 예약 사이트의 원래 척도입니다. 겹친 숫자를 눌러 확대하세요.</p></div></div></aside>
  {mode==='list'&&<button className="restore-map" onClick={()=>setMode('split')}><Map size={17}/>지도 함께 보기</button>}
 </main>
 <button className="mobile-map-toggle" onClick={()=>setMode(mode==='map'?'list':'map')}>{mode==='map'?<List size={18}/>:<Map size={18}/>} {mode==='map'?'목록 보기':'지도 보기'}<span>{results.length}</span></button>
 <Sheet open={filterOpen} onOpenChange={setFilterOpen}><SheetContent side="left" showCloseButton={false} className="mobile-filter-sheet !w-[min(92vw,360px)] !max-w-[360px] !gap-0"><div className="mobile-sheet-title"><div><SheetTitle>숙소 필터</SheetTitle><SheetDescription>조건에 맞는 {response.total.toLocaleString()}곳</SheetDescription></div><SheetClose asChild><button className="icon-button" aria-label="필터 닫기"><X size={22}/></button></SheetClose></div><div className="mobile-sheet-body"><Filters filters={filters} setFilters={setFilters} counts={response.featureCounts} ryokanCount={response.ryokanCount}/></div><SheetClose asChild><button className="apply-filters">{response.total.toLocaleString()}곳 보기</button></SheetClose></SheetContent></Sheet>
 {comparisonIds.length>0&&!comparisonOpen&&!detailId&&<div className="comparison-dock"><button onClick={showComparison}><ArrowLeftRight size={17}/>{comparisonIds.length}곳 비교</button><button onClick={()=>setComparisonIds([])} aria-label="비교 후보 모두 비우기"><X size={18}/></button></div>}
 <HotelComparison open={comparisonOpen} ids={comparisonIds} onClose={()=>setComparisonOpen(false)} onRemove={id=>setComparisonIds(previous=>previous.filter(item=>item!==id))} onClear={()=>setComparisonIds([])} onRestoreFocus={restoreComparisonFocus} onDetail={openDetail}/>
 <HotelDetail hotel={detail} onClose={closeDetail} onRestoreFocus={restoreDetailFocus} favorite={!!detail&&favorites.includes(detail.id)} onFavorite={()=>detail&&saveFavorite(detail.id)} pending={!!detail&&pending.includes(detail.id)} canSave={favoritesReady}/>
 {detailLoading&&<div className="toast-message" role="status">숙소 상세를 불러오는 중…</div>}
 {toast&&<div className="toast-message" role="status">{toast}</div>}
 <footer className="site-footer"><span>유케무리 · 일본 온천 탐색</span><span>v0.5 · <a href="/api/photo-credits" target="_blank" rel="noopener noreferrer">사진 출처</a></span></footer>
 </>
}
