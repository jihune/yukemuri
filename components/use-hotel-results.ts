'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {HotelFilters} from '@/lib/hotel-types';
import type {SortOrder} from '@/lib/hotel-search';
import type {SearchResponse} from '@/lib/hotel-repository';
import {hotelQueryParams} from '@/lib/hotel-query';
import {apiJson,ApiError} from '@/lib/api-client';
import {appendHotelPage} from '@/lib/paged-hotel-results';

export function useHotelResults(initial:SearchResponse,filters:HotelFilters,sort:SortOrder,savedOnly:boolean,favoriteKey:string,retry:number){
 const [response,setResponse]=useState(initial),[loading,setLoading]=useState(false),[loadingMore,setLoadingMore]=useState(false);
 const [searchError,setSearchError]=useState(''),[moreError,setMoreError]=useState(''),[reopenSearch,setReopenSearch]=useState(false),[refreshRequired,setRefreshRequired]=useState(false);
 const params=hotelQueryParams(filters);params.set('sort',sort);params.set('saved',savedOnly?'1':'0');params.set('stable','1');
 const cacheKey=params.toString()+(savedOnly?'&favoriteIds='+encodeURIComponent(favoriteKey):'');
 const key=cacheKey+'&retry='+retry;
 const cachedResults=useRef(new Map<string,{expires:number;data:SearchResponse}>()),lastRetry=useRef(retry);
 const remember=(id:string,data:SearchResponse)=>{
  cachedResults.current.set(id,{expires:Date.now()+30000,data});
  while(cachedResults.current.size>16)cachedResults.current.delete(cachedResults.current.keys().next().value!);
 };
 const first=useRef(true),generation=useRef(0),controller=useRef<AbortController|null>(null),moreController=useRef<AbortController|null>(null),moreLock=useRef(false),resetting=useRef(false);
 const current=useRef({response,loading,key});current.current={response,loading,key};
 const requestParams=useRef(params);requestParams.current=params;
 useEffect(()=>{
  if(first.current){first.current=false;remember(cacheKey,initial);return}
  const epoch=++generation.current;
  resetting.current=true;
  controller.current?.abort();moreController.current?.abort();moreLock.current=false;
  const request=new AbortController();controller.current=request;
  const cached=cachedResults.current.get(cacheKey),forceRefresh=lastRetry.current!==retry;lastRetry.current=retry;
  if(!forceRefresh&&cached&&cached.expires>Date.now()){
   setResponse(cached.data);setLoading(false);setLoadingMore(false);setSearchError('');setMoreError('');setReopenSearch(false);setRefreshRequired(false);resetting.current=false;
   return()=>request.abort();
  }
  setLoading(true);setLoadingMore(false);setSearchError('');setMoreError('');setReopenSearch(false);setRefreshRequired(false);
  setResponse(old=>({...old,hotels:[],total:0,unknownExcluded:0,page:1,alternatives:[],similarHotelIds:[],similarCount:0,snapshot:undefined}));
  const p=new URLSearchParams(requestParams.current);p.set('page','1');if(forceRefresh)p.set('fresh','1');
  apiJson<SearchResponse>('/api/hotels?'+p,{signal:request.signal}).then(data=>{if(!request.signal.aborted&&generation.current===epoch){remember(cacheKey,data);setResponse(data)}}).catch(e=>{if(!request.signal.aborted&&generation.current===epoch){setSearchError(e instanceof Error?e.message:'숙소 검색에 실패했습니다.');setReopenSearch(e instanceof ApiError&&e.reopen)}}).finally(()=>{if(!request.signal.aborted&&generation.current===epoch){resetting.current=false;setLoading(false)}});
  return()=>{request.abort();moreController.current?.abort()};
 },[key]);
 const loadMore=useCallback(()=>{
  const state=current.current;
  if(moreLock.current||resetting.current||state.loading||state.key!==key||state.response.page*state.response.pageSize>=state.response.total)return;
  moreLock.current=true;setLoadingMore(true);setMoreError('');
  const epoch=generation.current,nextPage=state.response.page+1,request=new AbortController();moreController.current=request;
  const p=new URLSearchParams(requestParams.current);p.set('page',String(nextPage));if(state.response.snapshot)p.set('snapshot',state.response.snapshot.token);
  apiJson<SearchResponse>('/api/hotels?'+p,{signal:request.signal}).then(data=>{
   if(request.signal.aborted||generation.current!==epoch||current.current.key!==key)return;
   if(data.page!==nextPage||!data.hotels.length){setResponse(old=>({...old,total:old.hotels.length}));return}
   setResponse(old=>appendHotelPage(old,data));
  }).catch(e=>{if(!request.signal.aborted&&generation.current===epoch){setMoreError(e instanceof Error?e.message:'추가 숙소를 불러오지 못했습니다.');setRefreshRequired(e instanceof ApiError&&(e.status===410||e.status===409))}}).finally(()=>{if(!request.signal.aborted&&generation.current===epoch){moreLock.current=false;setLoadingMore(false)}});
 },[key]);
 useEffect(()=>()=>{controller.current?.abort();moreController.current?.abort()},[]);
 return{response,loading,loadingMore,searchError,moreError,reopenSearch,refreshRequired,loadMore,hasMore:response.page*response.pageSize<response.total,key};
}
