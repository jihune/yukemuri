'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {DEFAULT_FILTERS,type HotelFilters} from '@/lib/hotel-types';
import type {SortOrder} from '@/lib/hotel-search';
import {searchSnapshot,resultPage,pageSimilar,needsText,mayNeedAlternatives,PAGE_SIZE,type FirstPage,type SearchResponse,type SearchResult} from '@/lib/static-search';
import type {SnapshotCoverage} from '@/lib/search-snapshot';
import type {SnapshotState} from './use-search-snapshot';

const noMore=()=>{};
const DEFAULT_KEY=JSON.stringify(Object.entries(DEFAULT_FILTERS).sort());
const EMPTY_COVERAGE:SnapshotCoverage={records:0,prefectures:0,crawledRecords:0,curatedRecords:0,inventoryComplete:false,discoveredDetailUrls:0,completedDetailPages:0,pending:0,failed:0,updatedAt:'',providers:{jalan:{discovered:0,completed:0},trip:{discovered:0,completed:0}}};
// The list of the current conditions, computed in the browser from the
// snapshot. More pages are slices of the same order, so they never fail or
// change while the snapshot stays the same.
export function useHotelResults(snap:SnapshotState,filters:HotelFilters,sort:SortOrder,savedOnly:boolean,favorites:string[],favoritesReady:boolean,first:FirstPage|null){
 const s=snap.snapshot,favoriteKey=[...favorites].sort().join(',');
 const textNeeded=needsText(filters);
 useEffect(()=>{if(textNeeded)snap.wantText()},[textNeeded,snap.wantText]);
 const textReady=snap.textReady,key=JSON.stringify([filters,sort,savedOnly,savedOnly?favoriteKey:'']);
 const result=useMemo<SearchResult|'text'|null>(()=>{
  if(!s||textNeeded&&!textReady||savedOnly&&!favoritesReady)return null;
  // No match and conditions set: the alternatives rank over the name index.
  try{return searchSnapshot(s,filters,sort,savedOnly,favorites)}catch(error){if(!textReady&&mayNeedAlternatives(filters))return'text';throw error}
  // favorites enter through favoriteKey; textReady changes when the index arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[s,key,textReady,favoritesReady]);
 useEffect(()=>{if(result==='text')snap.wantText()},[result,snap.wantText]);
 // Loaded pages belong to one list: new conditions or a new snapshot start at page 1.
 const list=key+(s?.manifest.id??''),[paging,setPaging]=useState({list,pages:1}),pages=paging.list===list?paging.pages:1;
 const response=useMemo<SearchResponse>(()=>{
  if(!s||!result||result==='text')return{hotels:[],total:0,unknownExcluded:0,page:1,pageSize:PAGE_SIZE,featureCounts:{} as SearchResponse['featureCounts'],ryokanCount:0,coverage:s?.manifest.coverage??EMPTY_COVERAGE,similarCount:0,similarHotelIds:[],alternatives:[]};
  const last=resultPage(s,result,pages);
  if(pages===1)return last;
  const hotels=result.order.slice(0,last.page*PAGE_SIZE).map(i=>s.cards[i]);
  return{...last,hotels,similarHotelIds:pageSimilar(result,hotels)};
 },[s,result,pages]);
 // Until the snapshot arrives, the default view shows the first page rendered
 // into the static page (built from the same snapshot).
 const preview=!s&&!!first&&sort==='recommended'&&!savedOnly&&JSON.stringify(Object.entries(filters).sort())===DEFAULT_KEY?first.response:null;
 const hasMore=response.page*response.pageSize<response.total;
 const loadMore=useCallback(()=>{if(hasMore)setPaging({list,pages:pages+1})},[hasMore,list,pages]);
 const error=snap.error??(textNeeded||result==='text'?snap.textError:null);
 if(preview)return{response:preview,preview:true,loading:false,searchError:snap.error?.message??'',reopenSearch:!!snap.error?.reload,loadMore:noMore,hasMore:false};
 return{response,preview:false,loading:!error&&(!result||result==='text'),searchError:error?.message??'',reopenSearch:!!error?.reload,loadMore,hasMore};
}
