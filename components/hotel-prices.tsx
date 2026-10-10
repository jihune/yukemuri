'use client';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { Hotel } from '@/lib/hotel-types';
import { bookingError, type BookingQuery, nights } from '@/lib/booking-query';
import type { PriceQuote } from '@/lib/jalan-prices';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BookingFields from './booking-fields';
import { apiJson } from '@/lib/api-client';
export type RoomPriceMode='any'|'onsen'|'outdoor'|'both';
const meals:Record<string,string>={'朝・夕':'조식·석식','朝のみ':'조식','夕のみ':'석식','食事なし':'식사 없음'};
export default function HotelPrices({hotel,query,onChange,initialMode}:{hotel:Hotel;query:BookingQuery;onChange:(q:BookingQuery)=>void;initialMode:RoomPriceMode}){
 const [quote,setQuote]=useState<PriceQuote|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState<RoomPriceMode>(initialMode),[meal,setMeal]=useState('all');
 const controller=useRef<AbortController|null>(null);
 const queryKey=JSON.stringify(query);
 useEffect(()=>{controller.current?.abort();setLoading(false);setQuote(null);setError('');return()=>controller.current?.abort()},[hotel.id,queryKey]);
 const available=!!hotel.links.find(l=>l.provider==='jalan'&&l.kind==='property'&&l.url);
 const validation=bookingError(query);
 async function load(){
  if(validation){setError(validation);return}
  controller.current?.abort();const current=new AbortController();controller.current=current;
  setLoading(true);setError('');setQuote(null);
  try{
   const params=new URLSearchParams({hotelId:hotel.id,checkIn:query.checkIn,checkOut:query.checkOut,adults:String(query.adults)});
   const data=await apiJson<PriceQuote>('/api/prices?'+params,{signal:current.signal});
   if(!current.signal.aborted)setQuote(data);
  }catch(e){if(!current.signal.aborted)setError(e instanceof Error?e.message:'요금을 조회하지 못했습니다.')}
  finally{if(!current.signal.aborted)setLoading(false)}
 }
 const plans=quote?.plans.filter(p=>(mode==='any'||mode==='onsen'&&p.roomOnsen||mode==='outdoor'&&p.roomOutdoor||mode==='both'&&p.roomOnsen&&p.roomOutdoor)&&(meal==='all'||p.meal===meal))??[];
 return <div className="price-panel">
  <BookingFields query={query} onChange={onChange} prefix={'detail-'+hotel.id}/>
  <p className="booking-help">성인 1~6명 · 객실 1개 · 1~7박. 어린이 포함 일정은 예약 사이트에서 조회하세요.</p>
  {available?<div className="price-action"><button className="price-load" disabled={loading} onClick={load}><RefreshCw size={16} className={loading?'price-spinning':''}/>{loading?'자란 요금 확인 중…':'자란 요금 조회'}</button><span>동일한 조회는 15분간 보관합니다.</span></div>:<p className="booking-help">자란 숙소 연결이 확인되면 요금 조회가 제공됩니다.</p>}
  {error&&<p className="price-error" role="alert">{error}</p>}
  {quote&&<>
   <div className="price-summary"><b>{query.checkIn} ~ {query.checkOut} · {nights(query)}박 · 성인 {query.adults}명</b><span>JPY · 조회 {new Date(quote.retrievedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}{quote.cached?' · 저장된 조회':''}</span></div>
   <div className="price-filters"><label>객실 표기<Select value={mode} onValueChange={v=>setMode(v as RoomPriceMode)}><SelectTrigger aria-label="요금 객실 조건"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="any">전체 객실</SelectItem><SelectItem value="onsen">객실 온천 표기</SelectItem><SelectItem value="outdoor">객실 노천탕 표기</SelectItem><SelectItem value="both">객실 온천 + 노천탕 표기</SelectItem></SelectContent></Select></label><label>식사<Select value={meal} onValueChange={setMeal}><SelectTrigger aria-label="요금 식사 조건"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">전체 식사 조건</SelectItem>{[...new Set(quote.plans.map(p=>p.meal))].map(m=><SelectItem key={m} value={m}>{meals[m]??m}</SelectItem>)}</SelectContent></Select></label></div>
   <p className="booking-help">숙소 시설 필터와 별도로 객실명·객실 표기를 확인합니다. 객실 온천이 명시되지 않은 플랜은 해당 조건에 포함하지 않습니다.</p>
   {plans.length>0?<div className="price-plans">{plans.slice(0,8).map(p=><a key={p.id} className="price-plan" href={p.url} target="_blank" rel="noopener noreferrer"><div><b lang="ja">{p.room}</b><small lang="ja">{p.plan}</small><span>{meals[p.meal]??p.meal}{p.roomOutdoor?' · 객실 노천탕 표기':''}{p.roomOnsen?' · 객실 온천 표기':''}</span></div><div className="price-amount"><b>¥{p.total.toLocaleString()}</b><span>{nights(query)}박 · 전체 인원 총액</span><ExternalLink size={15}/></div></a>)}</div>:<p className="price-empty">조회된 플랜에서 이 객실·식사 조건을 확인하지 못했습니다. 조건을 바꾸거나 예약 페이지의 객실 안내를 확인하세요.</p>}
   <p className="booking-help">조회 페이지의 {quote.observedPlans}개 플랜 중 조건에 맞는 {plans.length}개 · 낮은 금액순 최대 8개 표시. 표시 총액은 세금 포함이며 입탕세·현지 추가 요금, 취소 조건과 최종 결제 금액은 플랜에서 확인하세요.</p>
  </>}
 </div>
}
