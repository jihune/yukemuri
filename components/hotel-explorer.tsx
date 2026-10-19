'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Waves, Search, MapPin, SlidersHorizontal, ShieldCheck, X, List, Map, RotateCcw, Info, AlertCircle, ArrowLeftRight, BarChart3 } from 'lucide-react';
import { Hotel, HotelFilters, DEFAULT_FILTERS, FEATURE_LABELS, FeatureKey, REGIONS, RegionId, isVerifiedCriteria } from '@/lib/hotel-types';
import { SortOrder } from '@/lib/hotel-search';
import { providerRating, displayRating, meetsVerifiedCriteria } from '@/lib/hotel-ratings';
import type { HotelSummary } from '@/lib/search-snapshot';
import {searchSnapshot,needsText,PAGE_SIZE,type FirstPage} from '@/lib/static-search';
import {loadSnapshot,loadSnapshotText,loadSnapshotStatus} from '@/lib/snapshot-client';
import Picker from './picker';
import {displayNames} from '@/lib/hotel-names';
import FilterPanel from './hotel-filters';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';
import HotelDetail from './hotel-detail';
import StayMap from './stay-map';
import { hasCoordinates } from '@/lib/hotel-location';
import RetryImage from './retry-image';
import collectionPlan from '@/data/collection-priorities.json';
import {parseHotelQuery,listingUrl} from '@/lib/hotel-query';
import {DEFAULT_BOOKING,parseBookingQuery,type BookingQuery} from '@/lib/booking-query';
import { apiJson, ApiError } from '@/lib/api-client';
import HotelAutocomplete from './hotel-autocomplete';
import MapStayList,{scoreLabel} from './map-stay-list';
import {useResultMap} from './use-result-map';
import type {ViewGroups} from '@/lib/map-groups';
import type {GeoColumns} from '@/lib/static-search';
import HotelCard from './hotel-card';
import CollectionStatusSheet from './collection-status-sheet';
import HotelComparison from './hotel-comparison';
import {COMPARISON_STORAGE_KEY,storedComparisonIds,toggleComparisonId} from '@/lib/hotel-comparison';
import {useHotelResults} from './use-hotel-results';
import {useMapArea} from './use-map-area';
import {openStayHistory,closeStayHistory,openStatusHistory,closeStatusHistory,restoreListingPosition,type ListingPosition} from '@/lib/stay-detail-navigation';
import type {PreparedSearchIndex} from '@/lib/hotel-search-index';
import {useSearchSnapshot} from './use-search-snapshot';
import {POPSTATE} from '@/lib/history-events';
import {GEO_ATTRIBUTION,GEO_NOTE,GEO_LINKS,OVERTURE_ATTRIBUTION,OVERTURE_NOTE,OVERTURE_LINKS} from '@/lib/geo-attribution';
import {JTA_ATTRIBUTION,JTA_NOTE,JTA_LINKS} from '@/lib/jta-attribution';
const NO_INDEX:PreparedSearchIndex=[];
function writeBookingUrl(q:BookingQuery){const url=new URL(window.location.href);for(const [k,v] of Object.entries(q)){if(v)url.searchParams.set(k,String(v));else url.searchParams.delete(k)}history.replaceState(history.state,'',url.pathname+url.search+url.hash)}
// U05 list: one place to choose where. Onsen towns are the first group (a town sets its
// prefecture and its name as the search word), then all of Japan, prefectures and areas.
const TOWN_PREFIX='town:';
const PLACE_GROUPS=[
 {label:'온천마을',options:collectionPlan.towns.map(t=>({value:TOWN_PREFIX+t.name,label:t.name}))},
 {label:'지역',options:REGIONS.map(r=>({value:r.id,label:r.name}))},
];
// The quick conditions on the chip bar: the bath conditions people pick most.
const QUICK_FEATURES:{key:FeatureKey;label:string}[]=[{key:'natural',label:'천연온천'},{key:'outdoor',label:'노천탕'},{key:'roomOnsen',label:'객실 온천'},{key:'privateBath',label:'전세탕'},{key:'nigori',label:'니고리유'},{key:'freeFlow',label:'카케나가시'}];
// The page is a static asset: conditions come from the address once mounted,
// and every list, search and map result from the static search snapshot.
export default function HotelExplorer({firstPage=null}:{firstPage?:FirstPage|null}){
 const snap=useSearchSnapshot(firstPage?.manifest);
 // The collection status of the snapshot the list is computed from (before it
 // loads, the one the static page was built with): no second copy of the list files.
 const statusManifest=snap.snapshot?.manifest??firstPage?.manifest;
 const loadStatus=useCallback((signal:AbortSignal)=>statusManifest?loadSnapshotStatus(statusManifest,signal):Promise.reject(new Error('no snapshot')),[statusManifest]);
 const preparedIndex=snap.textReady?snap.snapshot!.index!.prepared:NO_INDEX,indexReady=snap.textReady,indexFailed=!!snap.textError;
 const [booking,setBooking]=useState<BookingQuery>(DEFAULT_BOOKING);
 const bookingRef=useRef<BookingQuery>(DEFAULT_BOOKING);
 const [filters,setFilterState]=useState<HotelFilters>(DEFAULT_FILTERS),[draft,setDraft]=useState(''),[sort,setSort]=useState<SortOrder>('recommended');
 const [urlRead,setUrlRead]=useState(false);
 const [dismissSuggestions,setDismissSuggestions]=useState(0);
 function setFilters(value:HotelFilters|((previous:HotelFilters)=>HotelFilters)){setFilterState(value)}

 const [savedIds,setSavedIds]=useState<string[]>([]),[savedOnly,setSavedOnly]=useState(false),[favoritesReady,setFavoritesReady]=useState(false),[favoritesError,setFavoritesError]=useState(''),[pending,setPending]=useState<string[]>([]);
 // D08 PR 6: an id saved, compared or shared before its record joined another stay's card
 // (mergedInto) stands for that card.
 const mergedInto=snap.snapshot?.manifest.mergedInto,favorites=useMemo(()=>[...new Set(savedIds.map(id=>mergedInto?.[id]??id))],[savedIds,mergedInto]);
 const {response,preview,loading,searchError,reopenSearch,loadMore,hasMore,order}=useHotelResults(snap,filters,sort,savedOnly,favorites,favoritesReady,!!favoritesError,firstPage);
 // The saved list cannot be shown without the favourites: the error banner and its retry say so.
 const favoritesBlocked=savedOnly&&!favoritesReady&&!!favoritesError;
 const geoRef=useRef<GeoColumns|null>(null);
 const mapArea=useMapArea(snap,filters,savedOnly,favorites,geoRef),[areaHotel,setAreaHotel]=useState<HotelSummary|null>(null);
 // Suggestions read the name-search part of the snapshot; fetch it once typing starts.
 useEffect(()=>{if(draft.trim())snap.wantText()},[draft,snap.wantText]);
 const results=response.hotels,alternatives=response.alternatives??[];
 const displayHotels=useMemo(()=>[...response.hotels,...(response.alternatives??[]).map(a=>a.hotel)],[response.hotels,response.alternatives]);
 const located=useMemo(()=>results.filter(hasCoordinates).length,[results]),notLoaded=Math.max(0,response.total-results.length),unknownExcluded=response.unknownExcluded??0;
 const ratingFor=(h:HotelSummary)=>providerRating(h,filters.ratingProvider)??displayRating(h);
 const [mode,setMode]=useState('split'),[activeId,setActiveId]=useState<string|null>(null),[detailId,setDetailId]=useState<string|null>(null),[mapFocusId,setMapFocusId]=useState<string|null>(null),[filterOpen,setFilterOpen]=useState(false),[toast,setToast]=useState('');
 const [isMobile,setIsMobile]=useState(false);
 // U05 map mode: the whole result is on the map (or counted as location unknown), never only
 // the loaded pages; with no match, the alternatives are. The list beside the map shows the
 // stays in view, a group's stays, or the stays without a point.
 const altRows=useMemo(()=>{const s=snap.snapshot;return s&&order&&order.length===0&&alternatives.length?alternatives.map(a=>s.position.get(a.hotel.id)).filter((i):i is number=>i!==undefined):null},[snap.snapshot,order,alternatives]);
 const resultMap=useResultMap(snap,altRows??order,!isMobile||mode==='map');
 geoRef.current=resultMap.geo;
 const [mapView,setMapView]=useState<ViewGroups|null>(null),[mapList,setMapList]=useState<{title:string;rows:number[]}|null>(null);
 const mapResult=useMemo(()=>{const s=snap.snapshot;if(!s||!resultMap.positions)return null;return{positions:resultMap.positions,rowOf:(id:string)=>s.position.get(id),stay:(row:number)=>{const h=s.cards[row];return{id:h.id,label:scoreLabel(h,filters.ratingProvider)??'숙소',title:displayNames(h.names).title}}}},[snap.snapshot,resultMap.positions,filters.ratingProvider]);
 // New conditions start from the stays in view again.
 useEffect(()=>{setMapList(null)},[resultMap.positions]);
 const view=mapArea.area||!mapResult?null:mapView;
 // An area search replaces the markers; a group or location-unknown list of the result closes.
 const [listArea,setListArea]=useState(mapArea.area);
 if(listArea!==mapArea.area){setListArea(mapArea.area);if(mapArea.area)setMapList(null)}
 const listRows=mapArea.area?null:mapList?.rows??view?.inView??null,listStays=listRows&&snap.snapshot?listRows.map(r=>snap.snapshot!.cards[r]):null;
 // However the phone map opens (its button, a card, view=map in the address), put the map
 // column with its counts and load-more button at the top, clear of the floating list button.
 // Once more when the first snapshot arrives: the summary above the map grows then.
 const shown=!!snap.snapshot;
 useEffect(()=>{if(isMobile&&mode==='map')document.querySelector('.map-column')?.scrollIntoView({block:'start',behavior:'instant'})},[isMobile,mode,shown]);
 const [detail,setDetail]=useState<Hotel|null>(null),[detailLoading,setDetailLoading]=useState(false),[detailFallback,setDetailFallback]=useState<HotelSummary|null>(null),[detailAttempt,setDetailAttempt]=useState(0);
 const [comparisonIds,setComparisonIds]=useState<string[]>([]),[comparisonReady,setComparisonReady]=useState(false),[comparisonOpen,setComparisonOpen]=useState(false);
 const comparisonButton=useRef<HTMLButtonElement>(null),comparisonOpener=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  try{setComparisonIds(storedComparisonIds(localStorage.getItem(COMPARISON_STORAGE_KEY)))}catch{}
  setComparisonReady(true);
  const changed=(event:StorageEvent)=>{if(event.key===COMPARISON_STORAGE_KEY)setComparisonIds(storedComparisonIds(event.newValue))};
  window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
 },[]);
 useEffect(()=>{if(comparisonReady)try{localStorage.setItem(COMPARISON_STORAGE_KEY,JSON.stringify(comparisonIds))}catch{}},[comparisonIds,comparisonReady]);
 // A compared or shared stay that joined another card opens as that card, also when another
 // tab stores its id later (Codex P2 on PR #209); the address is replaced, not pushed, so the
 // back button leaves as before.
 useEffect(()=>{if(mergedInto&&comparisonIds.some(id=>mergedInto[id]))setComparisonIds([...new Set(comparisonIds.map(id=>mergedInto[id]??id))])},[mergedInto,comparisonIds]);
 useEffect(()=>{
  const base=detailId?mergedInto?.[detailId]:undefined;
  if(base){const url=new URL(window.location.href);url.hash='stay/'+encodeURIComponent(base);window.history.replaceState(window.history.state,'',url);setDetailId(base)}
 },[mergedInto,detailId]);
 function compare(id:string){
  if(!comparisonIds.includes(id)&&comparisonIds.length>=4)setToast('최대 4곳까지 비교할 수 있습니다. 기존 후보를 빼고 선택하세요.');
  setComparisonIds(previous=>toggleComparisonId(previous,id)??previous);
 }
 function showComparison(){comparisonOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:comparisonButton.current;setComparisonOpen(true)}
 function restoreComparisonFocus(){const opener=comparisonOpener.current;((opener?.isConnected?opener:null)??comparisonButton.current)?.focus({preventScroll:true})}
 const stateRef=useRef({filters,sort,savedOnly,favorites,results,total:response.total});stateRef.current={filters,sort,savedOnly,favorites,results,total:response.total};
 const active=displayHotels.find(h=>h.id===activeId)??(areaHotel?.id===activeId?areaHotel:null);
 const previewName=useRef<HTMLButtonElement>(null),previewPending=useRef<string|null>(null),previewOpener=useRef<string|null>(null),previewReturn=useRef<string|null>(null);
 useEffect(()=>{if(active&&previewPending.current===active.id){previewPending.current=null;previewName.current?.focus()}},[active]);
 // The map redraws its markers before this runs, so the marker for the hotel is already there.
 // If the map moved it out of view meanwhile, the map itself takes focus so it stays visible.
 useEffect(()=>{
  const id=previewReturn.current;previewReturn.current=null;if(activeId||!id)return;
  const marker=document.querySelector<HTMLElement>(`.leaflet-marker-icon[data-stay-ids~="${CSS.escape(id)}"]`);
  (marker?.tabIndex===0?marker:document.querySelector<HTMLElement>('.map-canvas'))?.focus({preventScroll:true});
 },[activeId]);
 function closePreview(){previewReturn.current=previewOpener.current;previewOpener.current=null;setActiveId(null)}
 // A preview opened on purpose (a card's map button, a marker) stays when the pointer leaves a card;
 // hovering another card shows that one only while the pointer is on it.
 const pinnedId=useRef<string|null>(null);
 useEffect(()=>{if(activeId===null)pinnedId.current=null},[activeId]);
 // A stay opened from a map-bounds point stays only while that point is in the current area result
 // (new conditions clear or redo the area search).
 const areaIds=mapArea.area?.data.points;
 // In map mode a stay of the current result (on the map or without a point) stays too.
 useEffect(()=>{
  if(!areaHotel||areaIds?.some(p=>p.id===areaHotel.id))return;
  const at=snap.snapshot?.position.get(areaHotel.id),p=resultMap.positions;
  if(at!==undefined&&p&&(p.rows.includes(at)||p.unknown.includes(at)))return;
  setAreaHotel(null);
 },[areaIds,areaHotel,resultMap.positions,snap.snapshot]);
 // A pinned stay that leaves the results (a filter, the saved view) is no longer pinned or previewed.
 useEffect(()=>{const id=pinnedId.current;if(id&&!displayHotels.some(h=>h.id===id)&&areaHotel?.id!==id){pinnedId.current=null;setActiveId(current=>current===id?null:current)}},[displayHotels,areaHotel]);
 const hoverCard=(id:string|null)=>setActiveId(id??pinnedId.current);
 const regionName=REGIONS.find(r=>r.id===filters.region)?.name??'일본 전국';
 const listEnd=useRef<HTMLDivElement>(null),listingPosition=useRef<ListingPosition|null>(null);
 // Closing the filter sheet puts focus back on the chip that opened it (a tap does not focus it).
 const filterButton=useRef<HTMLButtonElement>(null);
 // The favorites screen with nothing saved explains the heart instead of a 0-result list (U05 7).
 const findNav=useRef<HTMLButtonElement>(null),noneSaved=savedOnly&&!favorites.length;
 // Any condition that narrows the result (region and query included; the rating scale only displays).
 const narrowed=(Object.keys(DEFAULT_FILTERS) as (keyof HotelFilters)[]).some(k=>k!=='ratingProvider'&&JSON.stringify(filters[k])!==JSON.stringify(DEFAULT_FILTERS[k]));
 // U06: the data status opens as its own screen (#status) from the list, the header and the
 // footer; the list does not load more behind it.
 const [statusOpen,setStatusOpen]=useState(false),statusOpener=useRef<HTMLElement|null>(null);
 // Closing gives focus back to the button that opened it (a tap does not focus it).
 function openStatus(event:{currentTarget:HTMLElement}){statusOpener.current=event.currentTarget;openStatusHistory();setStatusOpen(true)}
 function closeStatus(){setStatusOpen(false);closeStatusHistory()}
 useEffect(()=>{
  if(!hasMore||loading||statusOpen||detailId||filterOpen||comparisonOpen||mode==='map'||!listEnd.current||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))loadMore()},{rootMargin:'500px 0px'});
  observer.observe(listEnd.current);return()=>observer.disconnect();
 },[hasMore,loading,statusOpen,loadMore,detailId,filterOpen,comparisonOpen,mode,response.page]);
 useEffect(()=>{
  // Cards carry list fields only; the sheet opens with the hotel the API returns. When the
  // API cannot answer (anything but 404: a Worker or network failure, 429, 503, 403) the sheet
  // shows the stay's card from the list or snapshot instead, with a retry; a 404 means the
  // stay is gone, so the sheet closes and the snapshot is checked again. A stay opened by its
  // address before the snapshot arrived waits for it (the loader hands back the snapshot the
  // page loads, or its preloaded files) rather than closing.
  setDetail(null);if(!detailId){setDetailLoading(false);return}
  const controller=new AbortController();setDetailLoading(true);
  apiJson<Hotel>('/api/hotels/'+encodeURIComponent(detailId),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setDetail(data)}).catch(async e=>{if(controller.signal.aborted)return;
   const gone=e instanceof ApiError&&e.status===404;
   let card=gone?undefined:displayHotels.find(h=>h.id===detailId)??(areaHotel?.id===detailId?areaHotel:undefined)??alternatives.find(a=>a.hotel.id===detailId)?.hotel;
   if(!gone&&!card){const s=snap.snapshot??await loadSnapshot(controller.signal,firstPage?.manifest).catch(()=>null),at=s?.position.get(detailId);card=at===undefined?undefined:s!.cards[at]}
   if(controller.signal.aborted)return;
   if(card){setDetailFallback(card);return}
   setToast(e instanceof Error?e.message:'상세 정보를 불러오지 못했습니다.');closeDetail();if(gone)snap.refresh()}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false)});
  return()=>controller.abort();
 },[detailId,detailAttempt]);

 async function loadFavorites(){setFavoritesError('');try{const data=await apiJson<{ids:string[]}>('/api/favorites');setSavedIds(data.ids);setFavoritesReady(true)}catch(e){setFavoritesError(e instanceof Error?e.message:'즐겨찾기를 불러오지 못했습니다.')}}
 async function saveFavorite(id:string,saved?:boolean){
  if(!favoritesReady||pending.includes(id))return;
  // Unsaving a card unsaves the ids that stand for it too.
  const next=saved??!favorites.includes(id),ids=next?[id]:[id,...savedIds.filter(k=>k!==id&&mergedInto?.[k]===id)];setPending(p=>[...p,id]);
  try{for(const hotelId of ids)await apiJson('/api/favorites',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotelId,saved:next})});setSavedIds(f=>next?[...new Set([...f,id])]:f.filter(k=>!ids.includes(k)));setToast(next?'즐겨찾기에 저장했어요.':'즐겨찾기에서 해제했어요.')}catch(e){setToast(e instanceof Error?e.message:'저장하지 못했습니다. 다시 시도해 주세요.')}finally{setPending(p=>p.filter(k=>k!==id))}
 }
 const shownFallback=detailFallback&&detailFallback.id===detailId?detailFallback:null,detailShown=detail??shownFallback;
 // The detail API does not carry the registration (D08): the stay's card does, in the snapshot or,
 // while the snapshot files have not loaded, among the cards shown (the static first page included).
 const detailAt=detailId?snap.snapshot?.position.get(detailId):undefined;
 const detailJta=detailId?(detailAt!==undefined?snap.snapshot!.cards[detailAt]:displayHotels.find(h=>h.id===detailId)??(areaHotel?.id===detailId?areaHotel:undefined)??shownFallback)?.jta:undefined;
 function openDetail(id:string){if(!detailId)listingPosition.current={x:window.scrollX,y:window.scrollY,opener:document.activeElement instanceof HTMLElement?document.activeElement:null};openStayHistory(id,!!detailId);setDetailId(id)}
 function closeDetail(){setDetailId(null);closeStayHistory()}
 function restoreDetailFocus(){restoreListingPosition(listingPosition.current)}
 function chooseRegion(id:RegionId){setFilters(f=>({...f,region:id,query:''}));setDraft('');setActiveId(null)}
 const town=collectionPlan.towns.find(t=>filters.query===t.query&&filters.region===t.prefecture),placeValue=town?TOWN_PREFIX+town.name:filters.region;
 function choosePlace(value:string){
  const t=value.startsWith(TOWN_PREFIX)?collectionPlan.towns.find(x=>TOWN_PREFIX+x.name===value):null;
  if(!t){chooseRegion(value as RegionId);return}
  setFilters(f=>({...f,region:t.prefecture,query:t.query}));setDraft(t.query);setSavedOnly(false);setActiveId(null);
 }
 // A map-bounds point may be outside the loaded list; its card is in the snapshot.
 // A marker opened from the keyboard hands focus to the preview; closing it gives focus back.
 function selectOnMap(id:string,keyboard=false){
  pinnedId.current=id;
  previewPending.current=previewOpener.current=keyboard?id:null;
  focusHotel(id);
  const at=snap.snapshot?.position.get(id);
  if(!displayHotels.some(h=>h.id===id)&&areaHotel?.id!==id){if(at===undefined)setToast('숙소 정보를 불러오지 못했습니다. 다시 눌러 주세요.');else setAreaHotel(snap.snapshot!.cards[at])}
 }
 function focusHotel(id:string){setActiveId(id);if(!isMobile)document.getElementById('card-'+id)?.scrollIntoView({behavior:'smooth',block:'center'})}
 useEffect(()=>{
  loadFavorites();
  const mq=window.matchMedia('(max-width: 900px)');const resize=()=>setIsMobile(mq.matches);resize();mq.addEventListener('change',resize);
  const hash=()=>{try{const id=decodeURIComponent(window.location.hash.replace(/^#stay\//,''));setDetailId(/^[a-zA-Z0-9-]{1,120}$/.test(id)&&window.location.hash.startsWith('#stay/')?id:null)}catch{setDetailId(null)}const status=window.location.hash==='#status';if(status)statusOpener.current=null;setStatusOpen(status)};hash();window.addEventListener('hashchange',hash);window.addEventListener(POPSTATE,hash);
  return()=>{mq.removeEventListener('change',resize);window.removeEventListener('hashchange',hash);window.removeEventListener(POPSTATE,hash)};
 },[]);
 useEffect(()=>{
  const read=()=>{
   const params=new URLSearchParams(window.location.search),query=parseHotelQuery(params);
   if(query){setFilterState(query.filters);setDraft(query.filters.query);setSort(query.sort);setSavedOnly(query.savedOnly)}
   const view=params.get('view');if(view&&['split','list','map'].includes(view))setMode(view);
  };
  const restore=()=>{
   read();
   // Closing a stay goes back to the list entry written before the dates were
   // chosen; keep the chosen conditions and put them back into that entry.
   writeBookingUrl(bookingRef.current);
  };
  // From here the state follows the address; the head script's mark that hid
  // the static first page for an address with conditions is no longer needed.
  read();setUrlRead(true);document.documentElement.removeAttribute('data-conditions');
  const initial=parseBookingQuery(new URLSearchParams(window.location.search));bookingRef.current=initial;setBooking(initial);
  window.addEventListener(POPSTATE,restore);return()=>window.removeEventListener(POPSTATE,restore);
 },[]);
 useEffect(()=>{
  // Not before the address was read, or the defaults would overwrite it.
  if(!urlRead)return;
  const next=listingUrl(window.location.href,{filters,sort,savedOnly,page:1},mode);
  if(next!==window.location.pathname+window.location.search+window.location.hash)history.replaceState(history.state,'',next);
 },[filters,sort,savedOnly,mode,urlRead]);
 // Booking dates live in the page URL (listingUrl keeps them) so a shared or
 // reloaded page opens the same dated booking links.
 function onBooking(q:BookingQuery){bookingRef.current=q;setBooking(q);writeBookingUrl(q)}
 function refreshResults(){snap.refresh();document.querySelector('.results-section')?.scrollIntoView({behavior:'instant',block:'start'})}
 // The sticky desktop filter panel sizes itself to end above the footer (globals.css --yk-footer-h).
 useEffect(()=>{
  const footer=document.querySelector('.site-footer');if(!footer||typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--yk-footer-h',Math.ceil(footer.getBoundingClientRect().height)+'px'));
  observer.observe(footer);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t)}},[toast]);
 // Optional browser-agent interface; no dependency on WebMCP for normal use.
 useEffect(()=>{
  type Registry={registerTool:(tool:unknown,options:{signal:AbortSignal})=>Promise<void>|void};
  const context=(document as Document&{modelContext?:Registry}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools=[
   {name:'search_stays',description:'Search the real Japan hotel catalogue with the same filters as the visible interface (computed in the browser from the published catalogue snapshot).',inputSchema:{type:'object',properties:{query:{type:'string'},region:{type:'string',enum:REGIONS.map(r=>r.id)},verifiedOnly:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{const p=input as Record<string,unknown>;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['query','region','verifiedOnly'].includes(k))||p.query!==undefined&&typeof p.query!=='string'||p.region!==undefined&&!REGIONS.some(r=>r.id===p.region)||p.verifiedOnly!==undefined&&typeof p.verifiedOnly!=='boolean')throw new Error('Invalid search input');const f={...DEFAULT_FILTERS,query:(p.query as string)??'',region:(p.region as RegionId)??'all',minRating:p.verifiedOnly?9:0,minReviews:p.verifiedOnly?50:0};setFilters(f);setDraft(f.query);setSavedOnly(false);setMode('split');const snapshot=await loadSnapshot();if(needsText(f))await loadSnapshotText(snapshot);return{count:searchSnapshot(snapshot,f,'recommended',false,[],false).total,pageSize:PAGE_SIZE}}},
   {name:'read_visible_stays',description:'Read the current page of filtered hotel results with original provider scales and favorites.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected empty object');const s=stateRef.current;return{total:s.total,hotels:s.results.map(h=>{const r=providerRating(h,s.filters.ratingProvider)??displayRating(h);return{id:h.id,name:displayNames(h.names).title,score:r?.score??null,scale:r?.scale??null,reviewCount:r?.reviewCount??null,ratingProvider:r?.provider??null,saved:s.favorites.includes(h.id),isMock:false}})}}},
   {name:'open_stay_detail',description:'Open hotel details without creating a reservation.',inputSchema:{type:'object',properties:{hotelId:{type:'string'}},required:['hotelId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{const p=input as {hotelId?:string};if(!p||Object.keys(p).some(k=>k!=='hotelId')||typeof p.hotelId!=='string'||!/^[a-zA-Z0-9-]{1,120}$/.test(p.hotelId))throw new Error('Invalid hotel ID');await apiJson<Hotel>('/api/hotels/'+encodeURIComponent(p.hotelId));openDetail(p.hotelId);return{hotelId:p.hotelId,opened:true}}},
  ];
  for(const t of tools)try{Promise.resolve(context.registerTool(t,{signal:lifecycle.signal})).catch(()=>{})}catch{}
  return()=>lifecycle.abort();
 },[]);
 const renderCard=(h:HotelSummary,unmetConditions?:string[])=><HotelCard key={h.id} hotel={h} active={activeId===h.id} saved={favorites.includes(h.id)} pending={pending.includes(h.id)} canSave={favoritesReady} provider={filters.ratingProvider} onActive={hoverCard} onDetail={openDetail} onFavorite={id=>saveFavorite(id)} compared={comparisonIds.includes(h.id)} onCompare={compare} similar={response.similarHotelIds?.includes(h.id)} unmetConditions={unmetConditions} onMap={hotel=>{pinnedId.current=hotel.id;setActiveId(hotel.id);setMapFocusId(hotel.id);if(hotel.location.latitude===null){openDetail(hotel.id);return}setMode(isMobile?'map':'split')}}/>;
 const chips:{label:string;clear:()=>void}[]=[...filters.features.map(key=>({label:FEATURE_LABELS[key],clear:()=>setFilters(f=>({...f,features:f.features.filter(k=>k!==key)}))})),...(filters.ryokanOnly?[{label:'료칸',clear:()=>setFilters(f=>({...f,ryokanOnly:false}))}]:[]),...(filters.minRating?[{label:`평점 ${filters.minRating.toFixed(1)}+`,clear:()=>setFilters(f=>({...f,minRating:0}))}]:[]),...(filters.minReviews?[{label:`리뷰 ${filters.minReviews}개+`,clear:()=>setFilters(f=>({...f,minReviews:0}))}]:[]),...(filters.query?[{label:`검색: ${filters.query}`,clear:()=>{setFilters(f=>({...f,query:''}));setDraft('')}}]:[])];
 return <>
 <header className="site-header"><div className="header-inner"><h1 className="sr-only">일본 온천, 나에게 맞는 곳</h1><button className="brand" onClick={()=>{setSavedOnly(false);chooseRegion('all');setFilters(DEFAULT_FILTERS)}} aria-label="유케무리 전체 숙소"><span className="brand-icon"><Waves size={22}/></span><span>유케무리</span></button>
  <form className="search-form" role="search" onSubmit={e=>{e.preventDefault();setFilters(f=>({...f,query:draft}));setActiveId(null);setDismissSuggestions(n=>n+1)}}><div className="region-picker"><MapPin size={17}/><Picker label="검색 지역 · 온천마을" value={placeValue} onChange={choosePlace} groups={PLACE_GROUPS}/></div><HotelAutocomplete value={draft} onChange={setDraft} filters={filters} savedOnly={savedOnly} favorites={favorites} searchIndex={preparedIndex} indexReady={indexReady} indexFailed={indexFailed} onRetry={snap.refresh} dismissKey={dismissSuggestions} onSelect={hotel=>{setDraft(hotel.name);setFilters(f=>({...f,query:hotel.name}));setActiveId(null);setDismissSuggestions(n=>n+1)}} onClear={()=>{setDraft('');setFilters(f=>({...f,query:''}))}}/><button type="submit" className="search-button">검색</button></form>
  <nav aria-label="주 메뉴"><button ref={findNav} className={!savedOnly?'nav-active':''} aria-current={!savedOnly?'page':undefined} onClick={()=>{setSavedOnly(false)}}>숙소 찾기</button><button className={savedOnly?'nav-active':''} aria-current={savedOnly?'page':undefined} onClick={()=>{setSavedOnly(true)}}><Heart size={18} fill={savedOnly?'currentColor':'none'}/>즐겨찾기 <span>{favorites.length}</span></button><button type="button" className="u06-nav" onClick={openStatus}><BarChart3 size={18}/>자료 현황</button></nav></div></header>
 <div className="chip-bar" role="group" aria-label="빠른 조건"><button ref={filterButton} className="mobile-filter" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={16}/>필터{chips.length>0&&<span>{chips.length}</span>}</button><button className={'verified-chip'+(isVerifiedCriteria(filters)?' active':'')} aria-pressed={isVerifiedCriteria(filters)} onClick={()=>setFilters(f=>({...f,ratingProvider:'trip',minRating:isVerifiedCriteria(f)?0:9,minReviews:isVerifiedCriteria(f)?0:50}))}><ShieldCheck size={16}/>내 기준 9.0+ · 리뷰 50+</button>{QUICK_FEATURES.map(q=>{const on=filters.features.includes(q.key);return <button key={q.key} className={on?'active':''} aria-pressed={on} onClick={()=>setFilters(f=>({...f,features:on?f.features.filter(k=>k!==q.key):[...new Set([...f.features,q.key])]}))}>{q.label}</button>})}</div>
 {searchError&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{searchError}</span><button onClick={snap.refresh}>다시 시도</button>{reopenSearch&&<button onClick={()=>window.location.reload()}>페이지 다시 열기</button>}</div>}
 {favoritesError&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{favoritesError}</span><button onClick={loadFavorites}>다시 시도</button></div>}
 <main className={`workspace view-${mode}`} data-first-page={preview?firstPage?.snapshot:undefined}>
  <aside className="desktop-filters"><FilterPanel filters={filters} setFilters={setFilters} counts={response.featureCounts} ryokanCount={response.ryokanCount}/></aside>
  <section className="results-section" aria-label="숙소 검색 결과" aria-busy={loading}>
   {preview&&<p className="conditions-pending" role="status">주소의 조건을 적용하는 중…</p>}
   <div className="results-header"><div><h2>{savedOnly?'즐겨찾기':regionName}{!favoritesBlocked&&<> <span>{response.total.toLocaleString()}곳</span></>}</h2></div><div className="result-actions"><button ref={comparisonButton} className="compare-open" onClick={showComparison} aria-label={"숙소 비교 열기, "+comparisonIds.length+"곳 선택"}><ArrowLeftRight size={17}/><span className="compare-word">비교 </span>{comparisonIds.length}/4</button><Picker label="숙소 정렬" value={sort} onChange={v=>{setSort(v as SortOrder)}} options={[{value:'recommended',label:filters.query?'관련성 높은 순':'온천 확인 우선'},{value:'rating',label:'평점 높은 순'},{value:'reviews',label:'리뷰 많은 순'},{value:'name',label:'이름순'}]}/></div></div>
   {chips.length>0&&<div className="active-filters">{chips.map(c=><button key={c.label} onClick={c.clear}>{c.label}<X size={14}/></button>)}</div>}
   {!loading&&!searchError&&unknownExcluded>0&&<p className="unknown-excluded" role="note"><Info size={15}/><span>선택한 조건 중 확인되지 않은 정보가 있어 제외한 숙소가 <b>{unknownExcluded.toLocaleString()}곳</b> 더 있습니다. 미확인 정보는 추정하지 않습니다. 해당 조건을 해제하면 함께 볼 수 있습니다.</span></p>}
   <div className="result-subtitle"><p className="bath-legend"><span><b className="is-yes" aria-hidden="true">✓</b>있음</span><span><b className="is-no" aria-hidden="true">–</b>없음</span><span><b className="is-unknown" aria-hidden="true">?</b>확인 전</span></p>{(loading||filters.query)&&<span>{loading?'숙소를 검색하는 중…':`이름·지역·오타의 관련성 순입니다.${response.similarCount?' 비슷한 이름 '+response.similarCount+'곳 포함.':''}`}</span>}<button type="button" className="data-status-link" onClick={openStatus}><Info size={15}/>자료 현황</button><span className="result-count sr-only" aria-live="polite">{favoritesBlocked?'':response.total.toLocaleString()+'개 결과'}</span></div>
   {savedOnly&&!favoritesBlocked&&results.length>0&&<p className="saved-browser-note"><Info size={15}/><span>이 브라우저에만 저장됩니다. 다른 브라우저와 동기화되지 않고, 사이트 데이터를 지우면 목록이 사라집니다.</span></p>}
   <div className="hotel-list">{results.map(h=>renderCard(h))}</div>
   {!loading&&!searchError&&!favoritesBlocked&&results.length===0&&(noneSaved
    ?<div className="empty-state is-saved"><Heart size={32} aria-hidden="true"/><h3>아직 저장한 숙소가 없어요</h3><p>숙소 카드나 상세의 하트를 누르면 여기에 모입니다.<br/>저장은 이 브라우저에만 남고, 다른 브라우저와 동기화되지 않습니다.</p><button onClick={()=>{setSavedOnly(false);findNav.current?.focus()}}><Search size={16}/>숙소 찾기</button></div>
    :<div className="empty-state"><Search size={32}/><h3>{savedOnly?(narrowed?`저장한 ${favorites.length.toLocaleString()}곳 중 조건에 맞는 숙소가 없어요`:'저장한 숙소를 지금 목록에서 찾지 못했어요'):'조건에 맞는 숙소가 없어요'}</h3><p>{savedOnly?(narrowed?'조건을 풀면 저장한 숙소를 모두 볼 수 있어요. 확인 전인 조건은 ‘있음’으로 치지 않습니다.':'목록에서 빠진 숙소일 수 있습니다.'):chips.length?'위의 조건을 하나씩 풀어 보세요. 확인 전인 조건은 ‘있음’으로 치지 않습니다.':'다른 지역이나 이름으로 찾아보세요.'}</p>{(!savedOnly||narrowed)&&<button onClick={()=>{setFilters(DEFAULT_FILTERS);setDraft('')}}><RotateCcw size={16}/>조건 모두 풀기</button>}</div>)}
   {loading&&<div className="catalog-loading" role="status">숙소를 찾는 중…</div>}
   <div ref={listEnd} className="catalog-sentinel" aria-hidden="true"/>
   {!loading&&hasMore&&<div className="catalog-load-more" role="status"><button onClick={loadMore}>숙소 더 불러오기</button></div>}
   {!loading&&!searchError&&alternatives.length>0&&<section className="alternative-results" aria-label="조건을 일부 바꾼 추천 숙소"><div className="alternative-heading"><span>다른 후보</span><h3>조건을 일부 바꾸면 찾을 수 있는 숙소</h3><p>{filters.query&&!alternatives.some(a=>a.queryMatched)?'검색어에 해당하는 숙소는 확인하지 못했습니다. 선택한 지역·시설 조건과 가까운 후보를 보여드립니다.':'이름·지역·시설의 관련성이 높은 후보입니다. 선택한 조건을 모두 충족하는 결과는 아닙니다.'} 각 숙소에서 맞지 않거나 확인되지 않은 조건을 확인하세요.</p></div><div className="hotel-list">{alternatives.map(a=>renderCard(a.hotel,a.unmetConditions))}</div></section>}
   {!loading&&!searchError&&!favoritesBlocked&&!(savedOnly&&results.length===0)&&<p className="list-end">{results.length.toLocaleString()} / {response.total.toLocaleString()}곳 불러옴{!hasMore&&results.length>0?' · 목록 끝':''}<br/>{mapResult?'지도에는 검색 결과 전체를 표시하고, 위치를 확인하지 못한 숙소는 ‘위치 미확인’으로 따로 셉니다.':'지도에는 불러온 숙소 중 위치가 확인된 항목을 표시합니다.'} 같은 숙소가 예약 사이트별로 표시될 수 있습니다.</p>}
  </section>
  <aside className="map-column" aria-label="지도와 숙소"><div className="map-sticky">{!loading&&!searchError&&!favoritesBlocked&&<div className="map-coverage" role="status" data-bbox={mapArea.area?.bbox}>{mapArea.error?<><span role="alert">{mapArea.error}</span><button onClick={mapArea.retry}>다시 검색</button><button onClick={mapArea.clear}>검색 결과 지도로 돌아가기</button></>:mapArea.area?<><span>이 지역 <b>{mapArea.area.data.inBounds.toLocaleString()}곳</b></span><span>범위 밖 {mapArea.area.data.outOfBounds.toLocaleString()}곳</span><span>위치 미확인 {mapArea.area.data.withoutCoordinates.toLocaleString()}곳</span><span>조건에 맞는 전체 {mapArea.area.data.total.toLocaleString()}곳</span>{mapArea.area.data.cells.length>0&&<span>숙소가 {mapArea.area.data.limit.toLocaleString()}곳보다 많아 구역별 개수로 표시합니다. 구역을 누르면 확대합니다.</span>}<button onClick={mapArea.clear}>검색 결과 지도로 돌아가기</button></>:view?<>
<span>이 화면 <b>{view.inView.length.toLocaleString()}곳</b></span>
<span>화면 밖 {view.outOfView.toLocaleString()}곳</span>
{view.unknown>0?<button onClick={()=>setMapList({title:'위치 미확인',rows:resultMap.positions?.unknown??[]})}>위치 미확인 {view.unknown.toLocaleString()}곳 목록</button>:<span>위치 미확인 0곳</span>}
<span>{results.length===0&&alternatives.length?'다른 후보':'검색 결과'} {view.total.toLocaleString()}곳</span>
{resultMap.geoLoading&&<span>대략 위치를 불러오는 중…</span>}
{resultMap.geoFailed&&<><span>대략 위치를 불러오지 못해 출처 좌표만 표시합니다.</span><button onClick={resultMap.retryGeo}>대략 위치 다시 불러오기</button></>}
</>:results.length===0?<span>{alternatives.length?`조건을 모두 충족한 숙소가 없어 다른 후보 ${displayHotels.filter(hasCoordinates).length}곳의 위치를 표시합니다.`:'지도에 표시할 숙소가 없습니다.'}</span>:located===response.total?<span>검색 결과 <b>{response.total.toLocaleString()}곳</b>을 모두 지도에 표시합니다.</span>:<><span>검색 결과 <b>{response.total.toLocaleString()}곳</b> 중 지도에 <b>{located.toLocaleString()}곳</b> 표시</span><span>불러온 {results.length.toLocaleString()}곳 중 위치 미확인 {(results.length-located).toLocaleString()}곳</span>{notLoaded>0&&<span>아직 불러오지 않음 {notLoaded.toLocaleString()}곳</span>}{hasMore&&<button onClick={loadMore}>{`${Math.min(response.pageSize,notLoaded)}곳 더 불러와 지도에 표시`}</button>}</>}</div>}<div className="map-heading"><span><Map size={17}/> 지도로 둘러보기</span><div className="view-switch" role="group" aria-label="보기 방식">{([['split','목록 + 지도'],['map','지도 크게'],['list','목록만']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={(mode==='list'||mode==='map'?mode:'split')===value} onClick={()=>setMode(value)}>{label}</button>)}</div></div><div className="map-frame">{(!isMobile||mode==='map')&&<StayMap hotels={displayHotels} activeId={activeId} onSelect={selectOnMap} focusId={mapFocusId} points={mapArea.area?mapArea.area.data.points:null} cells={mapArea.area?.data.cells} onSearchArea={mapArea.search} areaBusy={mapArea.busy} areaFailed={!!mapArea.error} result={mapArea.area?null:mapResult} onView={setMapView} onOpenGroup={rows=>setMapList({title:'이 묶음',rows})}/>}{active&&<div className="map-preview"><RetryImage src={active.image.url} alternatives={active.image.alternatives} alt={active.image.alt}/><div><small>{active.location.label}</small><button ref={previewName} onClick={()=>openDetail(active.id)}>{displayNames(active.names).title}</button><span><b>{ratingFor(active)?.score.toFixed(1)??'미확인'}</b> · {ratingFor(active)?.provider==='jalan'?'Jalan /5':'Trip.com /10'} · 리뷰 {ratingFor(active)?.reviewCount??'미확인'}개</span></div><button className="icon-button" aria-label="지도 숙소 선택 해제" onClick={closePreview}><X size={17}/></button></div>}</div><div className="map-tip"><span className="map-dot">9.0</span><p>{mapResult?'표지 숫자는 Trip.com 10점, ‘4.6/5’처럼 /5가 붙으면 Jalan 5점입니다. 점선 표지는 주소로 찾은 대략 위치입니다. ‘N곳’ 묶음을 누르면 확대하고, 한 곳에 겹친 숙소는 목록으로 엽니다.':'평점은 각 예약 사이트의 원래 척도입니다. 겹친 숫자를 눌러 확대하세요.'}</p></div>
{listStays&&<MapStayList sheet={isMobile&&mode==='map'} title={mapList?.title??'이 화면'} stays={listStays} provider={filters.ratingProvider} activeId={activeId} onBack={mapList?()=>setMapList(null):undefined} empty={mapList?'숙소가 없습니다.':'지도를 옮기거나 축소하면 이 화면의 숙소가 여기에 나옵니다.'} onSelect={id=>{const at=snap.snapshot?.position.get(id);if(at!==undefined&&resultMap.positions?.unknown.includes(at))openDetail(id);else selectOnMap(id)}}/>}
</div></aside>
  {mode==='list'&&<button className="restore-map" onClick={()=>setMode('split')}><Map size={17}/>지도 함께 보기</button>}
 </main>
 {!(noneSaved&&!loading&&mode!=='map')&&<button className="mobile-map-toggle" onClick={()=>setMode(mode==='map'?'list':'map')}>{mode==='map'?<List size={18}/>:<Map size={18}/>} {mode==='map'?'목록 보기':'지도 보기'}<span>{response.total.toLocaleString()}</span></button>}
 {/* U05 filter: on a phone the filters come up from the bottom (vaul); drag down, the close button or Escape closes it. */}
 <Drawer open={filterOpen} onOpenChange={setFilterOpen} direction="bottom" autoFocus><DrawerContent className="filter-drawer" onCloseAutoFocus={e=>{e.preventDefault();filterButton.current?.focus()}}><div className="mobile-sheet-title"><div><DrawerTitle>숙소 필터</DrawerTitle><DrawerDescription>{favoritesBlocked?'즐겨찾기를 불러오지 못했어요':`조건에 맞는 ${response.total.toLocaleString()}곳`}</DrawerDescription></div><DrawerClose asChild><button className="icon-button" aria-label="필터 닫기"><X size={22}/></button></DrawerClose></div><div className="mobile-sheet-body"><FilterPanel filters={filters} setFilters={setFilters} counts={response.featureCounts} ryokanCount={response.ryokanCount} sheet/></div><div className="filter-drawer-actions"><button type="button" className="filter-reset" onClick={()=>setFilters({...DEFAULT_FILTERS,region:filters.region,query:filters.query})}>초기화</button><DrawerClose asChild><button className="apply-filters">{favoritesBlocked?'목록으로 돌아가기':response.total.toLocaleString()+'곳 보기'}</button></DrawerClose></div></DrawerContent></Drawer>
 {comparisonIds.length>0&&!comparisonOpen&&!detailId&&<div className="comparison-dock"><button onClick={showComparison}><ArrowLeftRight size={17}/>{comparisonIds.length}곳 비교</button><button onClick={()=>setComparisonIds([])} aria-label="비교 후보 모두 비우기"><X size={18}/></button></div>}
 <HotelComparison open={comparisonOpen} ids={comparisonIds} onClose={()=>setComparisonOpen(false)} onRemove={id=>setComparisonIds(previous=>previous.filter(item=>item!==id))} onClear={()=>setComparisonIds([])} onRestoreFocus={restoreComparisonFocus} onDetail={openDetail}/>
 {statusOpen&&<CollectionStatusSheet onClose={closeStatus} load={loadStatus} opener={statusOpener}/>}
 <HotelDetail hotel={detail} fallback={detail?null:shownFallback} jta={detailJta} loading={detailLoading} onRetry={()=>setDetailAttempt(n=>n+1)} onClose={closeDetail} onRestoreFocus={restoreDetailFocus} favorite={!!detailShown&&favorites.includes(detailShown.id)} onFavorite={()=>detailShown&&saveFavorite(detailShown.id)} pending={!!detailShown&&pending.includes(detailShown.id)} canSave={favoritesReady} compared={!!detailShown&&comparisonIds.includes(detailShown.id)} onCompare={()=>detailShown&&compare(detailShown.id)} booking={booking} onBooking={onBooking}/>
 {detailLoading&&!shownFallback&&<div className="toast-message" role="status">숙소 상세를 불러오는 중…</div>}
 {toast&&<div className="toast-message" role="status">{toast}</div>}
 <footer className="site-footer"><section className="data-status" id="data-status" aria-labelledby="data-status-title"><h2 id="data-status-title" tabIndex={-1}>자료 현황</h2>{snap.snapshot||preview?<><p><b>{response.coverage.prefectures}개 도도부현 · 숙소 {response.coverage.records.toLocaleString()}개 항목</b> · 최근 출처 확인 {response.coverage.updatedAt.slice(0,10)} · 전국 정보 보강 중</p><button className="result-refresh" onClick={refreshResults} disabled={loading} aria-label="새로 배포된 숙소 자료가 있는지 확인하고 목록에 반영"><RotateCcw size={15}/>최신 자료 확인</button><button type="button" className="u06-open" onClick={openStatus}><BarChart3 size={15}/>수집 현황 자세히 보기</button></>:<p>{snap.loading?'숙소 정보를 불러오는 중…':'숙소 정보를 불러오지 못했습니다.'}</p>}</section><span>유케무리 · 일본 온천 탐색</span><span><a href="/api/photo-credits" target="_blank" rel="noopener noreferrer">사진 출처</a></span><p className="geo-credit" data-geo-credit><span>{GEO_NOTE}</span> <span lang="ja">{GEO_ATTRIBUTION}</span> {GEO_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===GEO_LINKS.length-1?')':''}</span>)}</p><p className="geo-credit" data-overture-credit><span>{OVERTURE_NOTE}</span> <span lang="en">{OVERTURE_ATTRIBUTION}</span> {OVERTURE_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===OVERTURE_LINKS.length-1?')':''}</span>)}</p><p className="geo-credit" data-jta-credit><span>{JTA_NOTE}</span> <span lang="ja">{JTA_ATTRIBUTION}</span> {JTA_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===JTA_LINKS.length-1?')':''}</span>)}</p></footer>
 </>
}
