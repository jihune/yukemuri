'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { Hotel } from '@/lib/hotel-types';
import { displayRating } from '@/lib/hotel-ratings';
import { hasCoordinates } from '@/lib/hotel-location';
import { LocateFixed, MapPin, Plus, Minus, Search } from 'lucide-react';
import type { MapBounds, MapCell, MapPoint } from '@/lib/hotel-repository';
type Props={hotels:Hotel[];activeId:string|null;onSelect:(id:string)=>void;compact?:boolean;focusId?:string|null;
 // Map-bounds search: when points or cells are given they replace the loaded hotels on the map.
 points?:MapPoint[]|null;cells?:MapCell[];onSearchArea?:(bounds:MapBounds)=>void;areaBusy?:boolean;areaFailed?:boolean};
type Spot={id:string;lat:number;lng:number;label:string;title:string;place:string};
// One empty array for every render: a new [] each time would re-run the fitting effect
// and throw away the view the user chose.
const NO_CELLS:MapCell[]=[];
export default function StayMap({hotels,activeId,onSelect,compact=false,focusId=null,points=null,cells=NO_CELLS,onSearchArea,areaBusy=false,areaFailed=false}:Props){
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<Leaflet.Map|null>(null),api=useRef<typeof Leaflet|null>(null),layer=useRef<Leaflet.LayerGroup|null>(null);
 const spots:Spot[]=points?points.map(p=>({id:p.id,lat:p.lat,lng:p.lng,label:p.score===null?'숙소':p.score.toFixed(1),title:p.name,place:p.name})):hotels.filter(hasCoordinates).map(h=>({id:h.id,lat:h.location.latitude,lng:h.location.longitude,label:displayRating(h)?.score.toFixed(1)??'숙소',title:h.names.ko,place:h.location.label}));
 const props=useRef({spots,cells,activeId,onSelect});props.current={spots,cells,activeId,onSelect};
 const area=points!==null||cells.length>0;
 // Moves made by the code (fitting results, focusing a card) do not offer an area search.
 const [moved,setMoved]=useState(false),programmatic=useRef(false);
 const quietly=(move:()=>void,ms=0)=>{programmatic.current=true;move();setTimeout(()=>{programmatic.current=false},ms)};
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
    const groups:{spots:Spot[];point:Leaflet.Point}[]=[];
    for(const h of props.current.spots){
     const point=map.latLngToLayerPoint([h.lat,h.lng]);
     const near=groups.find(g=>g.point.distanceTo(point)<52);
     if(near&&map.getZoom()<16)near.spots.push(h);else groups.push({spots:[h],point});
    }
    for(const group of groups){
     const hs=group.spots,first=hs[0];
     const lat=hs.reduce((a,h)=>a+h.lat,0)/hs.length,lng=hs.reduce((a,h)=>a+h.lng,0)/hs.length;
     const active=hs.some(h=>h.id===props.current.activeId);
     const marker=L.marker([lat,lng],{icon:L.divIcon({className:'stay-marker-wrap',html:`<span class="stay-marker ${active?'is-active':''} ${hs.length>1?'is-cluster':''}">${hs.length>1?hs.length+'곳':first.label}</span>`,iconSize:[52,36],iconAnchor:[26,18]}),keyboard:true,title:hs.length>1?`${first.place} 주변 ${hs.length}개 숙소`:first.title,alt:first.title}).addTo(layer.current);
     marker.on('click',()=>{
      if(hs.length>1){map.fitBounds(L.latLngBounds(hs.map(h=>[h.lat,h.lng] as [number,number])),{padding:[50,50],maxZoom:17});}
      else props.current.onSelect(first.id);
     });
    }
    // Grid counts from a map-bounds search with more points than one response holds.
    for(const cell of props.current.cells){
     const marker=L.marker([cell.lat,cell.lng],{icon:L.divIcon({className:'stay-marker-wrap',html:`<span class="stay-marker is-cluster">${cell.count}곳</span>`,iconSize:[52,36],iconAnchor:[26,18]}),keyboard:true,title:`이 구역 ${cell.count}개 숙소, 눌러서 확대`,alt:`이 구역 ${cell.count}개 숙소`}).addTo(layer.current);
     marker.on('click',()=>map.fitBounds(L.latLngBounds([[cell.south,cell.west],[cell.north,cell.east]])));
    }
   };
   map.on('moveend',()=>{draw.current();if(!programmatic.current)setMoved(true)});
   const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(container.current);
   (map as Leaflet.Map & {_stayObserver?:ResizeObserver})._stayObserver=observer;
   setReady(true);
  }).catch(()=>setError(true));
  return()=>{cancelled=true;const map=mapRef.current as (Leaflet.Map&{_stayObserver?:ResizeObserver})|null;map?._stayObserver?.disconnect();map?.remove();mapRef.current=null};
 },[]);
 useEffect(()=>{
  if(!ready||!mapRef.current||!api.current)return;
  // An area result belongs to the view the user chose; keep that view.
  const located=hotels.filter(hasCoordinates).map(h=>[h.location.latitude,h.location.longitude] as [number,number]);
  if(!area&&located.length){const map=mapRef.current,L=api.current;quietly(()=>map.fitBounds(L.latLngBounds(located),{padding:[40,55],maxZoom:hotels.length===1?13:12,animate:false}))}
  draw.current();
 },[hotels,ready,area,points,cells]);
 useEffect(()=>{draw.current()},[activeId]);
 useEffect(()=>{const h=hotels.find(h=>h.id===focusId);if(h&&hasCoordinates(h)&&ready)quietly(()=>mapRef.current?.flyTo([h.location.latitude,h.location.longitude],15,{duration:.5}),800)},[focusId,ready,hotels]);
 function reset(){const located=hotels.filter(hasCoordinates);if(mapRef.current&&api.current&&located.length)mapRef.current.fitBounds(api.current.latLngBounds(located.map(h=>[h.location.latitude,h.location.longitude])),{padding:[40,55],maxZoom:12})}
 function searchArea(){
  const b=mapRef.current?.getBounds();if(!b||!onSearchArea||areaBusy)return;
  setMoved(false);onSearchArea({west:b.getWest(),south:b.getSouth(),east:b.getEast(),north:b.getNorth()});
 }
 return <div className={`stay-map ${compact?'compact-map':''}`}>
  <div ref={container} className="map-canvas" aria-label="숙소 위치 지도"/>
  <div className="map-caption"><MapPin size={15}/><span>{compact?'숙소 위치':area?'이 지역':'지도 표시'} <b>{spots.length+cells.reduce((sum,c)=>sum+c.count,0)}곳</b></span></div>
  {onSearchArea&&ready&&(moved||areaBusy||area||areaFailed)&&<button className="map-area-search" aria-disabled={areaBusy||undefined} onClick={searchArea}><Search size={15}/>{areaBusy?'이 지역 숙소를 찾는 중…':area?'이 지역에서 다시 검색':'이 지역에서 검색'}</button>}
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
