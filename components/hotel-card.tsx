'use client';
import {Heart,MapPin,ShieldCheck,ArrowLeftRight} from 'lucide-react';
import type {RatingProvider} from '@/lib/hotel-types';
import type {HotelSummary} from '@/lib/search-snapshot';
import {hotelFeature} from '@/lib/hotel-bath-facts';
import {providerRating,displayRating,meetsVerifiedCriteria} from '@/lib/hotel-ratings';
import HotelLifecycleNote from './hotel-lifecycle-note';
import HotelPhoto from './hotel-photo';
import BathCells from './bath-cells';
// U05 B ‘탕 체크리스트’: the six bath columns (BathCells) sit in the same place on every
// card, so cards read down the page column by column.
export default function HotelCard({hotel:h,active,saved,pending,canSave,provider,onActive,onDetail,onFavorite,onMap,similar,unmetConditions,compared,onCompare}:{hotel:HotelSummary;active:boolean;saved:boolean;pending:boolean;canSave:boolean;provider:RatingProvider;onActive:(id:string|null)=>void;onDetail:(id:string)=>void;onFavorite:(id:string)=>void;onMap:(h:HotelSummary)=>void;similar?:boolean;unmetConditions?:string[];compared?:boolean;onCompare?:(id:string)=>void}){
 const r=providerRating(h,provider)??displayRating(h);
 return <article id={'card-'+h.id} className={`hotel-card ${active?'card-active':''} ${unmetConditions?'alternative-card':''}`} onMouseEnter={()=>onActive(h.id)} onMouseLeave={()=>onActive(null)}>
  <button type="button" className="card-image" onClick={()=>onDetail(h.id)} aria-label={h.names.ko+' 상세 보기'}><HotelPhoto hotel={h} loading="lazy"/></button>
  <button type="button" className={`favorite-button ${saved?'saved':''}`} onClick={()=>onFavorite(h.id)} disabled={!canSave||pending} aria-label={h.names.ko+(saved?' 즐겨찾기 해제':' 즐겨찾기 저장')} aria-pressed={saved}><Heart size={19} fill={saved?'currentColor':'none'}/></button>
  <div className="card-head">
   <div className="card-location"><span className="location-label">{h.location.label}</span><span className="card-kind">{h.kind==='ryokan'?'료칸':'숙소'}</span>{hotelFeature(h,'jalanHighClass').value===true&&<span className="highclass-tag">자란 하이클래스</span>}{similar&&<span className="similar-name-tag">유사한 이름</span>}</div>
   <button type="button" className="card-title" onClick={()=>onDetail(h.id)}><h3>{h.names.ko}</h3></button>
   {h.names.ja!==h.names.ko&&<p className="name-ja" lang="ja">{h.names.ja}</p>}
   <HotelLifecycleNote hotel={h} compact/>
   <div className="card-rating">{r?<><span className="score">{r.score.toFixed(1)}</span><b>{r.provider==='jalan'?'/5 Jalan':'/10 Trip.com'}</b><span>리뷰 {r.reviewCount.toLocaleString()}개</span>{meetsVerifiedCriteria(h)&&<span className="verified-badge"><ShieldCheck size={14} aria-hidden="true"/>내 기준</span>}</>:<span>평점 확인 전</span>}</div>
  </div>
  <BathCells hotel={h}/>
  {unmetConditions&&<div className="unmet-conditions"><b>맞지 않거나 확인되지 않은 조건</b>{unmetConditions.map(reason=><span key={reason}>{reason}</span>)}</div>}
  <div className="card-bottom"><button type="button" onClick={()=>onMap(h)}><MapPin size={14}/>{h.location.latitude!==null?'지도에서 보기':'주소 확인'}</button>{onCompare&&<button type="button" className="card-compare" onClick={()=>onCompare(h.id)} aria-pressed={!!compared} aria-label={h.names.ko+(compared?' 비교에서 빼기':' 비교 담기')}><ArrowLeftRight size={14}/>{compared?'비교에서 빼기':'비교 담기'}</button>}<button type="button" onClick={()=>onDetail(h.id)}>숙소 상세</button></div>
 </article>;
}
