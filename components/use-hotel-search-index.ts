'use client';
import {startTransition,useEffect,useMemo,useState} from 'react';
import {apiJson} from '@/lib/api-client';
import {prepareSearchIndex,type SearchIndexHotel} from '@/lib/hotel-search-index';

// Keep the full catalogue out of the HTML/RSC stream. Initial cards provide
// useful suggestions while the independent index loads after the first paint.
export function useHotelSearchIndex(initial:SearchIndexHotel[]){
 const [hotels,setHotels]=useState(initial),[ready,setReady]=useState(false),[failed,setFailed]=useState(false);
 const prepared=useMemo(()=>prepareSearchIndex(hotels),[hotels]);
 useEffect(()=>{
  let controller:AbortController|null=null,active=true,busy=false;
  const refresh=()=>{
   if(document.hidden||busy)return;
   busy=true;controller=new AbortController();const request=controller;
   apiJson<{hotels:SearchIndexHotel[]}>('/api/hotels/search-index',{signal:request.signal,cache:'default'}).then(data=>{
    if(active&&!request.signal.aborted)startTransition(()=>{setHotels(data.hotels);setReady(true);setFailed(false)});
   }).catch(()=>{if(active&&!request.signal.aborted)setFailed(true)}).finally(()=>{busy=false});
  };
  const frame=requestAnimationFrame(refresh),timer=setInterval(refresh,300000);
  const resume=()=>{if(!document.hidden)refresh()};document.addEventListener('visibilitychange',resume);
  return()=>{active=false;cancelAnimationFrame(frame);clearInterval(timer);document.removeEventListener('visibilitychange',resume);controller?.abort()};
 },[]);
 return{prepared,ready,failed};
}
