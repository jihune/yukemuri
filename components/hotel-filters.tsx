'use client';
import {useId,useState,type ReactNode} from 'react';
import {ChevronRight,ShieldCheck} from 'lucide-react';
import {DEFAULT_FILTERS,FEATURE_LABELS,isVerifiedCriteria,type FeatureKey,type HotelFilters} from '@/lib/hotel-types';
import type {SearchResponse} from '@/lib/static-search';
import Picker from './picker';

// U05 filter (PR 4, two-step panel after the user's choice C on 2026-10-15): the same panel on a
// wide screen and in the phone's bottom sheet. First ‘내 기준’ and the six bath conditions as a
// 2-column grid of pressed buttons, in the cards' order; then the remaining conditions in groups
// that start closed. Every row and button is 44px and up, its count beside it; a group's
// explanation is behind its ‘?’.
function Toggle({label,detail,count,on,onChange}:{label:string;detail?:string;count?:number;on:boolean;onChange:(on:boolean)=>void}){
 return <button type="button" role="switch" aria-checked={on} className={'filter-toggle'+(on?' is-on':'')} onClick={()=>onChange(!on)}><span className="filter-toggle-label">{label}{detail&&<small>{detail}</small>}</span>{count!==undefined&&<small>{count.toLocaleString()}</small>}<span className="filter-switch" aria-hidden="true"/></button>;
}
function Group({title,help,active,children}:{title:string;help?:string;active:number;children:ReactNode}){
 const [open,setOpen]=useState(false),[shown,setShown]=useState(false),id=useId();
 return <section className="filter-group" aria-labelledby={id+'t'}>
  <div className="filter-group-head"><h3 id={id+'t'}><button type="button" className="filter-group-toggle" aria-expanded={shown} aria-controls={id+'i'} onClick={()=>setShown(o=>!o)}><ChevronRight size={16} aria-hidden="true"/>{title}{active>0&&<span className="filter-group-count">{active}개 켜짐</span>}</button></h3>{help&&<button type="button" className="filter-help" aria-expanded={open} aria-controls={id+'h'} aria-label={title+' 설명'} onClick={()=>setOpen(o=>!o)}>?</button>}</div>
  {help&&<p id={id+'h'} className="filter-hint" hidden={!open}>{help}</p>}
  <div className="filter-group-items" id={id+'i'} hidden={!shown}>{children}</div>
 </section>;
}
// The six bath conditions of the cards (lib/bath-columns.ts) as filter keys, in the cards' order.
// The room one filters ‘객실 온천’ (roomOnsen): the card's 객실탕 column also counts an open-air
// room bath that is not onsen water, which no single filter key says.
const CORE:{key:FeatureKey;label:string}[]=[{key:'natural',label:'천연온천'},{key:'outdoor',label:'노천탕'},{key:'privateBath',label:'전세탕'},{key:'roomOnsen',label:'객실 온천'},{key:'freeFlow',label:'카케나가시'},{key:'nigori',label:'니고리유'}];
// The rest, folded by group: the sub-conditions of the shared, private and room baths.
const MORE:{label:string;help:string;keys:FeatureKey[]}[]=[
 {label:'공용·전세 목욕 시설 세부',help:'확인된 시설만 포함합니다. 확인 전인 시설은 있음으로 치지 않습니다.',keys:['largeBath','communalOutdoor','privateOutdoor']},
 {label:'객실 목욕 시설 세부',help:'객실탕은 해당 객실 타입을 예약해야 이용할 수 있습니다. 확인된 시설만 포함합니다.',keys:['roomIndoorOnsen','roomOutdoor','roomOutdoorOnsen']},
];
export default function HotelFilters({filters,setFilters,counts,ryokanCount,title=true}:{filters:HotelFilters;setFilters:(f:HotelFilters)=>void;counts:SearchResponse['featureCounts'];ryokanCount:number;title?:boolean}){
 const verified=isVerifiedCriteria(filters),[helpOpen,setHelpOpen]=useState(false),helpId=useId();
 const helpButton=<button type="button" className="filter-help" aria-expanded={helpOpen} aria-controls={helpId} aria-label="탕 조건 설명" onClick={()=>setHelpOpen(o=>!o)}>?</button>;
 const ratingOptions=filters.ratingProvider==='trip'?[8,8.5,9,9.5]:[4,4.2,4.5,4.8];
 const feature=(key:FeatureKey,on:boolean)=>setFilters({...filters,features:on?[...new Set([...filters.features,key])]:filters.features.filter(k=>k!==key)});
 return <div className="filter-content">
  {/* The bath conditions' explanation sits behind a ‘?’ in the title row (the phone's sheet has no title row). */}
  {title?<div className="filter-title"><h2>숙소 필터</h2>{helpButton}<button onClick={()=>setFilters({...DEFAULT_FILTERS,region:filters.region,query:filters.query})}>초기화</button></div>:<div className="filter-group-head filter-quick-head"><h3>탕 조건</h3>{helpButton}</div>}
  <p id={helpId} className="filter-hint" hidden={!helpOpen}>확인된 조건을 모두 갖춘 숙소만 표시합니다. 천연온천은 대욕탕만 확인된 숙소를 포함하지 않습니다. 카케나가시는 원천을 흘려보내는 방식이고, 가수·가온 없음과는 별개입니다. 내 기준은 Trip.com 9.0점 이상·리뷰 50개 이상입니다.</p>
  <div className="filter-quick" role="group" aria-label="탕 조건">
   <button type="button" className="filter-chip is-verified" aria-pressed={verified} onClick={()=>setFilters({...filters,ratingProvider:'trip',minRating:verified?0:9,minReviews:verified?0:50})}><ShieldCheck size={16} aria-hidden="true"/><span>내 기준</span><small>9.0+ · 리뷰 50+</small></button>
   {CORE.map(({key,label})=>{const on=filters.features.includes(key);return <button key={key} type="button" className="filter-chip" aria-pressed={on} onClick={()=>feature(key,!on)}><span>{label}</span><small>{(counts[key]??0).toLocaleString()}</small></button>})}
  </div>
  {MORE.map(group=><Group key={group.label} title={group.label} help={group.help} active={group.keys.filter(key=>filters.features.includes(key)).length}>{group.keys.map(key=><Toggle key={key} label={FEATURE_LABELS[key]} count={counts[key]??0} on={filters.features.includes(key)} onChange={on=>feature(key,on)}/>)}</Group>)}
  <Group title="숙소 유형·등급" help="자란 하이클래스는 자란 숙소 페이지에서 하이클래스 표시를 확인한 경우만 포함합니다." active={Number(filters.features.includes('jalanHighClass'))+Number(filters.ryokanOnly)}>
   <Toggle label="자란 하이클래스" count={counts.jalanHighClass??0} on={filters.features.includes('jalanHighClass')} onChange={on=>feature('jalanHighClass',on)}/>
   <Toggle label="료칸만 보기" count={ryokanCount} on={filters.ryokanOnly} onChange={on=>setFilters({...filters,ryokanOnly:on})}/>
  </Group>
  <Group title="평점과 리뷰" help="선택한 예약 사이트의 원래 평점(Trip.com 10점, Jalan 5점)으로 거릅니다." active={Number(filters.minRating>0)+Number(filters.minReviews>0)}>
   <label className="filter-select">평점 출처<Picker label="평점 출처" value={filters.ratingProvider} onChange={v=>setFilters({...filters,ratingProvider:v as HotelFilters['ratingProvider'],minRating:0,minReviews:0})} options={[{value:'trip',label:'Trip.com · 10점 만점'},{value:'jalan',label:'Jalan · 5점 만점'}]}/></label>
   <label className="filter-select">최소 평점<Picker label="최소 평점" value={String(filters.minRating)} onChange={v=>setFilters({...filters,minRating:Number(v)})} options={[{value:'0',label:'제한 없음'},...ratingOptions.map(v=>({value:String(v),label:v.toFixed(1)+' 이상'}))]}/></label>
   <label className="filter-select">최소 리뷰 수<Picker label="최소 리뷰 수" value={String(filters.minReviews)} onChange={v=>setFilters({...filters,minReviews:Number(v)})} options={[{value:'0',label:'제한 없음'},{value:'50',label:'50개 이상'},{value:'100',label:'100개 이상'},{value:'300',label:'300개 이상'},{value:'500',label:'500개 이상'}]}/></label>
  </Group>
 </div>;
}
