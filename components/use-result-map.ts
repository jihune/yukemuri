'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {SnapshotGeo} from '@/lib/search-snapshot';
import {loadSnapshotGeo} from '@/lib/snapshot-client';
import {resultPositions,type ResultPositions} from '@/lib/map-groups';
import type {SnapshotState} from './use-search-snapshot';

// The points of the whole search result for the map (U05 map mode). The D06
// approximate points (geo.json) load only once the map is shown; until then, when
// that file is missing (an older snapshot) or when it fails, the map uses the
// sources' own points and counts the other stays as location unknown; a failed load
// can be retried.
export function useResultMap(snap:SnapshotState,order:number[]|null,shown:boolean){
 const s=snap.snapshot,manifest=s?.manifest;
 const [geo,setGeo]=useState<{id:string;data:SnapshotGeo|null;failed:boolean}|null>(null);
 const geoFor=geo&&manifest&&geo.id===manifest.id?geo:null;
 useEffect(()=>{
  if(!shown||!manifest||geoFor)return;
  const controller=new AbortController();
  loadSnapshotGeo(manifest,controller.signal)
   .then(data=>setGeo({id:manifest.id,data,failed:false}))
   .catch(()=>{if(!controller.signal.aborted)setGeo({id:manifest.id,data:null,failed:true})});
  return()=>controller.abort();
 },[shown,manifest,geoFor]);
 // A geo.json that is not row for row the loaded snapshot is not used.
 const geoData=geoFor?.data&&s&&geoFor.data.grade.length===s.core.ids.length?geoFor.data:null;
 const positions=useMemo<ResultPositions|null>(()=>s&&order?resultPositions(order,s.core,geoData):null,[s,order,geoData]);
 // After a failure the stays stay counted with the sources' points; retrying clears it and loads again.
 const retryGeo=useCallback(()=>setGeo(g=>g?.failed?null:g),[]);
 return{positions,geo:geoData,geoLoading:shown&&!!manifest&&!!manifest.files.geo&&!geoFor,geoFailed:!!geoFor?.failed,retryGeo};
}
