'use client';
import {Heart,MapPin,ShieldCheck,Waves,ArrowLeftRight} from 'lucide-react';
import {FEATURE_LABELS,type Hotel,type FeatureKey,type RatingProvider} from '@/lib/hotel-types';
import {hotelFeature} from '@/lib/hotel-bath-facts';
import {providerRating,displayRating,meetsVerifiedCriteria} from '@/lib/hotel-ratings';
import HotelLifecycleNote from './hotel-lifecycle-note';
import HotelPhoto from './hotel-photo';
export default function HotelCard({hotel:h,active,saved,pending,canSave,provider,onActive,onDetail,onFavorite,onMap,similar,unmetConditions,compared,onCompare}:{hotel:Hotel;active:boolean;saved:boolean;pending:boolean;canSave:boolean;provider:RatingProvider;onActive:(id:string|null)=>void;onDetail:(id:string)=>void;onFavorite:(id:string)=>void;onMap:(h:Hotel)=>void;similar?:boolean;unmetConditions?:string[];compared?:boolean;onCompare?:(id:string)=>void}){
 const r=providerRating(h,provider)??displayRating(h),natural=hotelFeature(h,'natural');
 const available=(key:FeatureKey)=>hotelFeature(h,key).value===true;
 const tags=(Object.keys(FEATURE_LABELS) as FeatureKey[]).filter(key=>key!=='jalanHighClass'&&available(key)&&!(key==='outdoor'&&(available('communalOutdoor')||available('privateOutdoor')))&&!(key==='privateBath'&&available('privateOutdoor'))&&!(key==='roomOutdoor'&&available('roomOutdoorOnsen'))&&!(key==='roomOnsen'&&(available('roomIndoorOnsen')||available('roomOutdoorOnsen'))));
 return <article id={'card-'+h.id} className={`hotel-card ${active?'card-active':''} ${unmetConditions?'alternative-card':''}`} onMouseEnter={()=>onActive(h.id)} onMouseLeave={()=>onActive(null)}>
  <button type="button" className="card-image" onClick={()=>onDetail(h.id)} aria-label={h.names.ko+' 상세 보기'}><HotelPhoto hotel={h} loading="lazy"/><span className="type-tag">{h.kind==='ryokan'?'료칸':'숙소'}</span><span className="photo-tag">숙소 사진</span></button>
  <button type="button" className={`favorite-button ${saved?'saved':''}`} onClick={()=>onFavorite(h.id)} disabled={!canSave||pending} aria-label={h.names.ko+(saved?' 즐겨찾기 해제':' 즐겨찾기 저장')} aria-pressed={saved}><Heart size={19} fill={saved?'currentColor':'none'}/></button>
  <div className="card-body"><div className="card-location"><MapPin size={13}/><span className="location-label">{h.location.label}</span>{similar&&<span className="similar-name-tag">유사한 이름</span>}</div>
   <button type="button" className="card-title" onClick={()=>onDetail(h.id)}><h3>{h.names.ko}</h3></button>
   <HotelLifecycleNote hotel={h} compact/>
   {available('jalanHighClass')&&<span className="highclass-tag">자란 하이클래스</span>}
   {h.names.ja!==h.names.ko&&<p className="name-ja" lang="ja">{h.names.ja}</p>}{h.names.en!==h.names.ko&&h.names.en!==h.names.ja&&<p className="name-en" lang="en">{h.names.en}</p>}
   <div className="card-rating">{r?<><span className="score">{r.score.toFixed(1)}</span><b>{r.provider==='jalan'?'Jalan · /5':'Trip.com · /10'}</b><span>리뷰 {r.reviewCount.toLocaleString()}개</span>{meetsVerifiedCriteria(h)&&<ShieldCheck size={15} className="verified-icon" aria-label="내 검증 기준 충족"/>}</>:<span>평점 확인 필요</span>}</div>
   <div className="feature-tags">{tags.map(key=><span className={key==='natural'?'natural':''} key={key}>{key==='natural'&&<Waves size={13}/>} {FEATURE_LABELS[key]}{hotelFeature(h,key).scope==='someRooms'?' · 일부 객실':hotelFeature(h,key).scope==='allRooms'?' · 전 객실':''}</span>)}{natural.value!==true&&<span className="neutral">{natural.value===false?'천연온천 아님':available('largeBath')?'대욕탕 · 천연온천 미확인':'천연온천 확인 필요'}</span>}</div>
   {unmetConditions&&<div className="unmet-conditions"><b>맞지 않거나 확인되지 않은 조건</b>{unmetConditions.map(reason=><span key={reason}>{reason}</span>)}</div>}
   <div className="card-bottom"><button type="button" onClick={()=>onMap(h)}><MapPin size={14}/>{h.location.latitude!==null?'지도에서 보기':'주소 확인'}</button>{onCompare&&<button type="button" className="card-compare" onClick={()=>onCompare(h.id)} aria-pressed={!!compared} aria-label={h.names.ko+(compared?" 비교에서 빼기":" 비교 담기")}><ArrowLeftRight size={14}/>{compared?"비교에서 빼기":"비교 담기"}</button>}<button type="button" onClick={()=>onDetail(h.id)}>숙소 상세</button></div>
  </div>
 </article>;
}
