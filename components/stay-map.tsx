'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { Hotel } from '@/lib/hotel-types';
import { displayRating } from '@/lib/hotel-ratings';
import { hasCoordinates } from '@/lib/hotel-location';
import { LocateFixed, MapPin, Plus, Minus } from 'lucide-react';
type Props={hotels:Hotel[];activeId:string|null;onSelect:(id:string)=>void;compact?:boolean;focusId?:string|null};
export default function StayMap({hotels,activeId,onSelect,compact=false,focusId=null}:Props){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<Leaflet.Map|null>(null),api=useRef<typeof Leaflet|null>(null),layer=useRef<Leaflet.LayerGroup|null>(null);
 const props=useRef({hotels,activeId,onSelect});props.current={hotels,activeId,onSelect};
 const [ready,setReady]=useState(false),[error,setError]=useState(false),[tileError,setTileError]=useState(false);
 const draw=useRef(()=>{});
 useEffect(()=>{
  let cancelled=false;
  import('leaflet').then(L=>{
   if(cancelled||!container.current)return;
   api.current=L;
   const map=L.map(container.current,{zoomControl:false,scrollWheelZoom:true,attributionControl:true}).setView([36.5,137.5],5);
   mapRef.current=map;layer.current=L.layerGroup().addTo(map);
   const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(map);
   tiles.on('tileerror',()=>setTileError(true));
   draw.current=()=>{
    if(!layer.current)return;
    layer.current.clearLayers();
    const groups:{hotels:Hotel[];point:Leaflet.Point}[]=[];
    for(const h of props.current.hotels.filter(hasCoordinates)){
     const point=map.latLngToLayerPoint([h.location.latitude,h.location.longitude]);
     const near=groups.find(g=>g.point.distanceTo(point)<52);
     if(near&&map.getZoom()<16)near.hotels.push(h);else groups.push({hotels:[h],point});
    }
    for(const group of groups){
     const hs=group.hotels,first=hs[0];
     const located=hs.filter(hasCoordinates);
     const lat=located.reduce((a,h)=>a+h.location.latitude,0)/located.length,lng=located.reduce((a,h)=>a+h.location.longitude,0)/located.length;
     const active=hs.some(h=>h.id===props.current.activeId);
     const marker=L.marker([lat,lng],{icon:L.divIcon({className:'stay-marker-wrap',html:`<span class="stay-marker ${active?'is-active':''} ${hs.length>1?'is-cluster':''}">${hs.length>1?hs.length+'곳':displayRating(first)?.score.toFixed(1)??'숙소'}</span>`,iconSize:[52,36],iconAnchor:[26,18]}),keyboard:true,title:hs.length>1?`${first.location.label} 주변 ${hs.length}개 숙소`:first.names.ko,alt:first.names.ko}).addTo(layer.current);
     marker.on('click',()=>{
      if(hs.length>1){map.fitBounds(L.latLngBounds(located.map(h=>[h.location.latitude,h.location.longitude] as [number,number])),{padding:[50,50],maxZoom:17});}
      else props.current.onSelect(first.id);
     });
    }
   };
   map.on('moveend',()=>draw.current());
   const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(container.current);
   (map as Leaflet.Map & {_stayObserver?:ResizeObserver})._stayObserver=observer;
   setReady(true);
  }).catch(()=>setError(true));
  return()=>{cancelled=true;const map=mapRef.current as (Leaflet.Map&{_stayObserver?:ResizeObserver})|null;map?._stayObserver?.disconnect();map?.remove();mapRef.current=null};
 },[]);
 useEffect(()=>{
  if(!ready||!mapRef.current||!api.current)return;
  const points=hotels.filter(hasCoordinates).map(h=>[h.location.latitude,h.location.longitude] as [number,number]);
  if(points.length)mapRef.current.fitBounds(api.current.latLngBounds(points),{padding:[40,55],maxZoom:hotels.length===1?13:12,animate:false});
  draw.current();
 },[hotels,ready]);
 useEffect(()=>{draw.current()},[activeId]);
 useEffect(()=>{const h=hotels.find(h=>h.id===focusId);if(h&&hasCoordinates(h)&&ready)mapRef.current?.flyTo([h.location.latitude,h.location.longitude],15,{duration:.5})},[focusId,ready,hotels]);
 function reset(){const located=hotels.filter(hasCoordinates);if(mapRef.current&&api.current&&located.length)mapRef.current.fitBounds(api.current.latLngBounds(located.map(h=>[h.location.latitude,h.location.longitude])),{padding:[40,55],maxZoom:12})}
 return <div className={`stay-map ${compact?'compact-map':''}`}>
  <div ref={container} className="map-canvas" aria-label="숙소 위치 지도"/>
  <div className="map-caption"><MapPin size={15}/><span>{compact?'숙소 위치':'불러온 숙소'} <b>{hotels.filter(hasCoordinates).length}곳</b></span></div>
  <div className="map-controls">
   <button aria-label="지도 확대" onClick={()=>mapRef.current?.zoomIn()}><Plus size={19}/></button>
   <button aria-label="지도 축소" onClick={()=>mapRef.current?.zoomOut()}><Minus size={19}/></button>
   <button aria-label="검색 결과 전체 보기" onClick={reset}><LocateFixed size={19}/></button>
  </div>
  {!ready&&!error&&<div className="map-loading">지도를 불러오는 중…</div>}
  {(error||tileError)&&<div className="map-error">배경 지도를 불러오지 못했습니다. 숙소 상세의 Google Maps에서 위치를 확인해 주세요.</div>}
  <div className="map-note">예약 사이트의 확인된 위치 · 상세에서 출처 확인</div>
 </div>
}
