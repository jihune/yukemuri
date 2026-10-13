'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {HotelFilters} from '@/lib/hotel-types';
import {mapArea,needsText,type MapAreaResponse,type MapBounds,type GeoColumns} from '@/lib/static-search';
import {loadSnapshotText} from '@/lib/snapshot-client';
import {mapSearchBounds} from '@/lib/map-bounds';
import type {SnapshotState} from './use-search-snapshot';

// One computation per press of the area-search button, over the snapshot in
// the browser. A name search waits for the snapshot's name-search part.
// geo: the D06 approximate points once the map has loaded them (U05), read when the button is pressed.
export function useMapArea(snap:SnapshotState,filters:HotelFilters,savedOnly:boolean,favorites:string[],geo?:{current:GeoColumns|null}){
 const [area,setArea]=useState<{bounds:MapBounds;bbox:string;data:MapAreaResponse}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const s=snap.snapshot,scope=JSON.stringify([filters,savedOnly,savedOnly?[...favorites].sort():[],s?.manifest.id]);
 const last=useRef<MapBounds|null>(null),request=useRef(0);
 // New conditions or a new snapshot make the old area result wrong; drop it.
 useEffect(()=>{request.current++;setArea(null);setBusy(false);setError('')},[scope]);
 const search=useCallback((raw:MapBounds)=>{
  const bounds=mapSearchBounds(raw),id=++request.current;last.current=bounds;
  if(!s){setError('지도 범위의 숙소를 불러오지 못했습니다. 다시 시도해 주세요.');return}
  setError('');
  // The bounds as the former request sent them (five decimals).
  const [west,south,east,north]=[bounds.west,bounds.south,bounds.east,bounds.north].map(v=>Number(v.toFixed(5)));
  if(!(south<north&&west<east)){setArea(null);setError('지도 범위를 확인하세요.');return}
  const run=()=>{if(id===request.current){setArea({bounds,bbox:[west,south,east,north].join(','),data:mapArea(s,filters,{west,south,east,north},savedOnly,favorites,geo?.current??null)});setBusy(false)}};
  if(!needsText(filters)||s.index){run();return}
  setBusy(true);
  loadSnapshotText(s).then(run).catch(e=>{if(id===request.current){setBusy(false);setError(e instanceof Error?e.message:'지도 범위의 숙소를 불러오지 못했습니다. 다시 시도해 주세요.')}});
  // filters, savedOnly and favorites are in scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,s]);
 const retry=useCallback(()=>{if(last.current)search(last.current)},[search]);
 const clear=useCallback(()=>{request.current++;setArea(null);setBusy(false);setError('')},[]);
 return{area,busy,error,search,retry,clear};
}
