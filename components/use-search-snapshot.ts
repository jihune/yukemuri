'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {loadSnapshot,loadSnapshotText,SnapshotError} from '@/lib/snapshot-client';
import type {SearchSnapshot} from '@/lib/static-search';
import type {SnapshotManifest} from '@/lib/search-snapshot';
// The static search snapshot of the page: loaded once, read again on refresh
// (a newer deploy replaces it), its name-search part only once a search,
// a suggestion or an alternative needs it.
export function useSearchSnapshot(known?:SnapshotManifest){
 const [snapshot,setSnapshot]=useState<SearchSnapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<SnapshotError|null>(null);
 const [textWanted,setTextWanted]=useState(false),[textReady,setTextReady]=useState<SearchSnapshot|null>(null),[textError,setTextError]=useState<SnapshotError|null>(null),[revision,setRevision]=useState(0),[textRevision,setTextRevision]=useState(0);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;
  setLoading(true);setError(null);
  // The page's manifest for the first load only; a retry or refresh reads the deployed one.
  loadSnapshot(request.signal,revision===0?known:undefined).then(s=>{if(!request.signal.aborted)setSnapshot(s)}).catch(e=>{if(!request.signal.aborted)setError(e instanceof SnapshotError?e:new SnapshotError('숙소 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'))}).finally(()=>{if(!request.signal.aborted)setLoading(false)});
  return()=>request.abort();
 },[revision]);
 useEffect(()=>{
  if(!snapshot||!textWanted)return;
  if(snapshot.index){setTextReady(snapshot);return}
  let active=true;setTextError(null);
  loadSnapshotText(snapshot).then(s=>{if(active)setTextReady(s)}).catch(e=>{if(active)setTextError(e instanceof SnapshotError?e:new SnapshotError('숙소 이름 검색 정보를 불러오지 못했습니다. 다시 시도해 주세요.'))});
  return()=>{active=false};
 },[snapshot,textWanted,textRevision]);
 const wantText=useCallback(()=>setTextWanted(true),[]);
 // A text file that went missing was replaced by a deploy: read the manifest again.
 const refresh=useCallback(()=>{setRevision(r=>r+1);setTextRevision(r=>r+1)},[]);
 return{snapshot,loading,error,textReady:!!snapshot&&textReady===snapshot,textError,wantText,refresh};
}
export type SnapshotState=ReturnType<typeof useSearchSnapshot>;
