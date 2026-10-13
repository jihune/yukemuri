'use client';
import {useState} from 'react';
import type {HotelSummary} from '@/lib/search-snapshot';
import type {RatingProvider} from '@/lib/hotel-types';
import {providerRating,displayRating} from '@/lib/hotel-ratings';

// The stays beside the map (U05 map mode): the stays in view, the members of a
// group, or the stays without a point. The heading count is the whole set;
// rows render a page at a time so all of Japan stays light on a phone.
const PAGE=50;
export function scoreLabel(h:HotelSummary,provider:RatingProvider){
 const r=providerRating(h,provider)??displayRating(h);
 if(!r)return null;
 return r.provider==='jalan'?`${r.score.toFixed(1)}/5`:r.score.toFixed(1);
}
// On a phone in map mode the list is a sheet over the bottom of the map: a peek of its
// heading, half the screen, or most of it, cycled by its handle (U05 map mode).
const SHEET=['peek','half','full'] as const,SHEET_LABEL={peek:'목록 반쯤 펼치기',half:'목록 크게 펼치기',full:'목록 접기'};
export default function MapStayList({title,stays,provider,activeId,onSelect,onBack,empty,sheet=false}:{title:string;stays:HotelSummary[];provider:RatingProvider;activeId:string|null;onSelect:(id:string)=>void;onBack?:()=>void;empty:string;sheet?:boolean}){
 const [height,setHeight]=useState<typeof SHEET[number]>('peek');
 const [shown,setShown]=useState(PAGE),key=stays.length+':'+(stays[0]?.id??'');
 const [forKey,setForKey]=useState(key);
 if(forKey!==key){setForKey(key);setShown(PAGE)}
 return <section className={`map-stay-list ${sheet?'is-sheet sheet-'+height:''}`} aria-label={title}>
  {sheet&&<button type="button" className="map-sheet-handle" aria-label={SHEET_LABEL[height]} aria-expanded={height!=='peek'} onClick={()=>setHeight(SHEET[(SHEET.indexOf(height)+1)%SHEET.length])}><span/></button>}
  <div className="map-stay-list-head">
   {onBack&&<button type="button" className="map-stay-list-back" onClick={onBack}>← 이 화면 목록</button>}
   <h3>{title} <b>{stays.length.toLocaleString()}곳</b></h3>
  </div>
  {stays.length===0?<p className="map-stay-list-empty">{empty}</p>:<ul>
   {stays.slice(0,shown).map(h=>{const score=scoreLabel(h,provider),r=providerRating(h,provider)??displayRating(h);return <li key={h.id}>
    <button type="button" className={h.id===activeId?'is-active':''} onClick={()=>onSelect(h.id)}>
     <span className="map-stay-name">{h.names.ko}</span>
     <span className="map-stay-meta">{h.location.label}{score&&<> · <b>{score}</b> {r?.provider==='jalan'?'Jalan':'Trip.com'}</>}</span>
    </button>
   </li>})}
  </ul>}
  {shown<stays.length&&<button type="button" className="map-stay-list-more" onClick={()=>setShown(n=>n+PAGE)}>{Math.min(PAGE,stays.length-shown)}곳 더 보기 ({shown.toLocaleString()} / {stays.length.toLocaleString()})</button>}
 </section>
}
