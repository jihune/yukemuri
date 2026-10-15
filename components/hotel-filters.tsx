'use client';
import {useId,useState,type ReactNode} from 'react';
import {ShieldCheck} from 'lucide-react';
import {DEFAULT_FILTERS,FEATURE_LABELS,FEATURE_GROUPS,isVerifiedCriteria,type FeatureKey,type HotelFilters} from '@/lib/hotel-types';
import type {SearchResponse} from '@/lib/static-search';
import Picker from './picker';

// U05 filter (PR 4): the same conditions in the desktop panel and the phone's bottom sheet.
// Every condition is one row that is itself the switch (44px and up), its count beside it;
// the conditions sit in groups, and each group's explanation is behind its ‘?’.
function Toggle({label,detail,count,on,onChange,icon}:{label:string;detail?:string;count?:number;on:boolean;onChange:(on:boolean)=>void;icon?:ReactNode}){
 return <button type="button" role="switch" aria-checked={on} className={'filter-toggle'+(on?' is-on':'')} onClick={()=>onChange(!on)}>{icon}<span className="filter-toggle-label">{label}{detail&&<small>{detail}</small>}</span>{count!==undefined&&<small>{count.toLocaleString()}</small>}<span className="filter-switch" aria-hidden="true"/></button>;
}
function Group({title,help,children}:{title:string;help?:string;children:ReactNode}){
 const [open,setOpen]=useState(false),id=useId();
 return <section className="filter-group" aria-labelledby={id+'t'}>
  <div className="filter-group-head"><h3 id={id+'t'}>{title}</h3>{help&&<button type="button" className="filter-help" aria-expanded={open} aria-controls={id+'h'} aria-label={title+' 설명'} onClick={()=>setOpen(o=>!o)}>?</button>}</div>
  {help&&<p id={id+'h'} className="filter-hint" hidden={!open}>{help}</p>}
  <div className="filter-group-items">{children}</div>
 </section>;
}
const GROUP_HELP:Record<string,string>={
 '온천수와 사용 방식':'확인된 조건을 모두 갖춘 숙소만 표시합니다. 대욕탕만 확인된 숙소는 천연온천 조건에 포함하지 않습니다. 카케나가시는 원천을 흘려보내는 방식이고, 가수·가온 없음과는 별개입니다.',
 '공용·전세 목욕 시설':'확인된 시설만 포함합니다. 확인 전인 시설은 있음으로 치지 않습니다.',
 '객실 목욕 시설':'객실탕은 해당 객실 타입을 예약해야 이용할 수 있습니다. 확인된 시설만 포함합니다.',
};
export default function HotelFilters({filters,setFilters,counts,ryokanCount,title=true}:{filters:HotelFilters;setFilters:(f:HotelFilters)=>void;counts:SearchResponse['featureCounts'];ryokanCount:number;title?:boolean}){
 const verified=isVerifiedCriteria(filters);
 const ratingOptions=filters.ratingProvider==='trip'?[8,8.5,9,9.5]:[4,4.2,4.5,4.8];
 const feature=(key:FeatureKey,on:boolean)=>setFilters({...filters,features:on?[...new Set([...filters.features,key])]:filters.features.filter(k=>k!==key)});
 return <div className="filter-content">
  {title&&<div className="filter-title"><h2>숙소 필터</h2><button onClick={()=>setFilters({...DEFAULT_FILTERS,region:filters.region,query:filters.query})}>초기화</button></div>}
  <Toggle icon={<ShieldCheck size={18} aria-hidden="true"/>} label="내 검증 기준" detail="Trip.com 9.0+ · 리뷰 50+" on={verified} onChange={on=>setFilters({...filters,ratingProvider:'trip',minRating:on?9:0,minReviews:on?50:0})}/>
  {FEATURE_GROUPS.map(group=><Group key={group.label} title={group.label} help={GROUP_HELP[group.label]}>{group.keys.map(key=><Toggle key={key} label={FEATURE_LABELS[key]} count={counts[key]??0} on={filters.features.includes(key)} onChange={on=>feature(key,on)}/>)}</Group>)}
  <Group title="숙소 유형·등급" help="자란 하이클래스는 자란 숙소 페이지에서 하이클래스 표시를 확인한 경우만 포함합니다.">
   <Toggle label="자란 하이클래스" count={counts.jalanHighClass??0} on={filters.features.includes('jalanHighClass')} onChange={on=>feature('jalanHighClass',on)}/>
   <Toggle label="료칸만 보기" count={ryokanCount} on={filters.ryokanOnly} onChange={on=>setFilters({...filters,ryokanOnly:on})}/>
  </Group>
  <Group title="평점과 리뷰" help="선택한 예약 사이트의 원래 평점(Trip.com 10점, Jalan 5점)으로 거릅니다.">
   <label className="filter-select">평점 출처<Picker label="평점 출처" value={filters.ratingProvider} onChange={v=>setFilters({...filters,ratingProvider:v as HotelFilters['ratingProvider'],minRating:0,minReviews:0})} options={[{value:'trip',label:'Trip.com · 10점 만점'},{value:'jalan',label:'Jalan · 5점 만점'}]}/></label>
   <label className="filter-select">최소 평점<Picker label="최소 평점" value={String(filters.minRating)} onChange={v=>setFilters({...filters,minRating:Number(v)})} options={[{value:'0',label:'제한 없음'},...ratingOptions.map(v=>({value:String(v),label:v.toFixed(1)+' 이상'}))]}/></label>
   <label className="filter-select">최소 리뷰 수<Picker label="최소 리뷰 수" value={String(filters.minReviews)} onChange={v=>setFilters({...filters,minReviews:Number(v)})} options={[{value:'0',label:'제한 없음'},{value:'50',label:'50개 이상'},{value:'100',label:'100개 이상'},{value:'300',label:'300개 이상'},{value:'500',label:'500개 이상'}]}/></label>
  </Group>
 </div>;
}
