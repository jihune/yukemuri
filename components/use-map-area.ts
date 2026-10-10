'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {HotelFilters} from '@/lib/hotel-types';
import type {MapAreaResponse,MapBounds} from '@/lib/hotel-repository';
import {hotelQueryParams} from '@/lib/hotel-query';
import {apiJson} from '@/lib/api-client';

// One request per press of the area-search button. A newer press cancels the
// pending one; an identical query within 30 seconds is answered from memory.
export function useMapArea(filters:HotelFilters,savedOnly:boolean,favoriteKey:string){
 const [area,setArea]=useState<{bounds:MapBounds;data:MapAreaResponse}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const params=hotelQueryParams(filters,filters.query,savedOnly).toString();
 const scope=params+(savedOnly?'&favoriteIds='+encodeURIComponent(favoriteKey):'');
 const cache=useRef(new Map<string,{expires:number;data:MapAreaResponse}>()),controller=useRef<AbortController|null>(null),last=useRef<MapBounds|null>(null);
 // New conditions make the old area result wrong; drop it.
 useEffect(()=>{controller.current?.abort();setArea(null);setBusy(false);setError('')},[scope]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const search=useCallback((raw:MapBounds)=>{
  const bounds={west:Math.max(-180,raw.west),south:Math.max(-90,raw.south),east:Math.min(180,raw.east),north:Math.min(90,raw.north)};
  last.current=bounds;
  const bbox=[bounds.west,bounds.south,bounds.east,bounds.north].map(v=>v.toFixed(5)).join(',');
  const key=scope+'&bbox='+bbox;
  controller.current?.abort();
  const hit=cache.current.get(key);
  if(hit&&hit.expires>Date.now()){setArea({bounds,data:hit.data});setBusy(false);setError('');return}
  const request=new AbortController();controller.current=request;setBusy(true);setError('');
  apiJson<MapAreaResponse>('/api/hotels/map?'+params+'&bbox='+bbox,{signal:request.signal}).then(data=>{
   if(request.signal.aborted)return;
   cache.current.set(key,{expires:Date.now()+30000,data});
   while(cache.current.size>16)cache.current.delete(cache.current.keys().next().value!);
   setArea({bounds,data});
  }).catch(e=>{if(!request.signal.aborted)setError(e instanceof Error?e.message:'지도 범위의 숙소를 불러오지 못했습니다.')}).finally(()=>{if(!request.signal.aborted)setBusy(false)});
 },[scope,params]);
 const retry=useCallback(()=>{if(last.current)search(last.current)},[search]);
 const clear=useCallback(()=>{controller.current?.abort();setArea(null);setBusy(false);setError('')},[]);
 return{area,busy,error,search,retry,clear};
}
