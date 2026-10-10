'use client';
import { Hotel, FEATURE_LABELS, FEATURE_GROUPS, FeatureKey } from '@/lib/hotel-types';
import {useRef,useEffect,useState} from 'react';
import type {GooglePlaceData} from '@/lib/google-places';
import HotelPhoto from './hotel-photo';
import GooglePlaceRating from './google-place-rating';
import {hotelFeature} from '@/lib/hotel-bath-facts';
import {hotelFacilityUrl} from '@/lib/hotel-facility-link';
import { primaryRating,orderedRatings } from '@/lib/hotel-ratings';
import { hasCoordinates } from '@/lib/hotel-location';
import { Heart, MapPin, ExternalLink, Check, Minus, CircleHelp, Waves, Info, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import StayMap from './stay-map';
import HotelLifecycleNote from './hotel-lifecycle-note';
import HotelDescription from './hotel-description';
const providers={trip:'Trip.com',jalan:'Jalan',official:'공식 홈페이지',maps:'Google Maps'};
const ratingProviders={trip:'Trip.com',google:'Google Maps',jalan:'Jalan',rakuten:'Rakuten Travel'};
export default function HotelDetail({hotel,onClose,onRestoreFocus,favorite,onFavorite,pending,canSave}:{hotel:Hotel|null;onClose:()=>void;onRestoreFocus:()=>void;favorite:boolean;onFavorite:()=>void;pending:boolean;canSave:boolean}){
 const closeButton=useRef<HTMLButtonElement>(null),scroll=useRef<HTMLDivElement>(null);
 const [googleResult,setGoogleResult]=useState<{hotelId:string;data:GooglePlaceData}|null>(null);
 const google=googleResult?.hotelId===hotel?.id?googleResult?.data??null:null;
 useEffect(()=>{
  if(!hotel?.googlePlaceId)return;
  const controller=new AbortController(),hotelId=hotel.id;
  fetch('/api/hotels/'+encodeURIComponent(hotelId)+'/google?photo=1',{cache:'no-store',signal:controller.signal}).then(async r=>r.ok?await r.json() as {status:string;data?:GooglePlaceData}:null).then(result=>{if(result?.status==='ok'&&result.data&&!controller.signal.aborted)setGoogleResult({hotelId,data:result.data})}).catch(()=>{});
  return()=>controller.abort();
 },[hotel?.id,hotel?.googlePlaceId]);
 useEffect(()=>{if(scroll.current)scroll.current.scrollTop=0},[hotel?.id]);
 const r=hotel?primaryRating(hotel):undefined;
 const renderRating=(rating:Hotel['ratings'][number])=>{const source=hotel?.sources.find(s=>s.sourceId===rating.sourceId);return <div className="detail-rating" key={rating.sourceId}><span className="score">{rating.score.toFixed(1)}</span><b>{rating.provider?ratingProviders[rating.provider]:source?.label}</b><span>{rating.scale}점 만점 · 리뷰 {rating.reviewCount.toLocaleString()}개</span><small>{source?.url&&<a href={source.url} target="_blank" rel="noopener noreferrer">출처 ↗</a>} · 확인 {rating.verifiedAt}</small></div>};
 return <Sheet open={!!hotel} onOpenChange={open=>{if(!open)onClose()}}><SheetContent showCloseButton={false} onOpenAutoFocus={e=>{e.preventDefault();closeButton.current?.focus({preventScroll:true})}} onCloseAutoFocus={e=>{e.preventDefault();onRestoreFocus()}} className="hotel-detail !w-full sm:!max-w-[780px] !gap-0">
  {hotel&&<>
   <div className="detail-top"><span><Waves size={18}/> 숙소 살펴보기</span><SheetClose asChild><button ref={closeButton} className="icon-button" aria-label="숙소 상세 닫기"><X size={22}/></button></SheetClose></div>
   <div className="detail-scroll" ref={scroll}>
    <div className="detail-image"><HotelPhoto key={hotel.id} hotel={hotel} google={google} credit/></div>
    <div className="detail-body">
     <div className="detail-name"><div><div className="eyebrow">{hotel.kind==='ryokan'?'료칸':hotel.kind==='hotel'?'호텔':'숙소'} · {hotel.location.label}</div><SheetTitle className="!text-[26px] !leading-[1.4]">{hotel.names.ko}</SheetTitle>{hotel.names.ja!==hotel.names.ko&&<p lang="ja">{hotel.names.ja}</p>}{hotel.names.en!==hotel.names.ko&&hotel.names.en!==hotel.names.ja&&<p lang="en">{hotel.names.en}</p>}</div><button className={`icon-button detail-heart ${favorite?'saved':''}`} onClick={onFavorite} disabled={pending||!canSave} aria-pressed={favorite} aria-label={favorite?'즐겨찾기 해제':'즐겨찾기 저장'}><Heart fill={favorite?'currentColor':'none'}/></button></div>
     {hotel.aliases&&hotel.aliases.some(name=>!Object.values(hotel.names).includes(name))&&<p className="secondary">다른 이름: {hotel.aliases.filter(name=>!Object.values(hotel.names).includes(name)).join(' · ')}</p>}
     <SheetDescription className="!text-[15px] location-line"><MapPin size={16}/>{hotel.location.label}</SheetDescription>
     <HotelLifecycleNote hotel={hotel}/>
     <div className="provider-ratings" aria-label="출처별 평점">{orderedRatings(hotel).filter(r=>r.provider==='trip').map(renderRating)}<GooglePlaceRating hotel={hotel} data={google}/>{orderedRatings(hotel).filter(r=>r.provider!=='trip'&&r.provider!=='google').map(renderRating)}{hotel.ratings.length===0&&<p className="secondary">확인된 평점이 없습니다.</p>}</div>
     <HotelDescription key={hotel.id} hotel={hotel}/>
     <section className="detail-section"><h2><Waves size={21}/> 온천과 목욕 시설</h2><p className="bath-guide">자란넷의 객실·시설 정보를 우선 확인합니다. 대욕탕·노천탕 유무와 천연온천수 사용 여부는 구분하며, 객실탕은 표시된 객실 타입에만 적용됩니다.</p>{[...FEATURE_GROUPS,{label:'자란 숙소 등급',keys:['jalanHighClass'] as const}].map(group=><div className="bath-detail-group" key={group.label}><h3>{group.label}</h3><div className="feature-grid">
      {group.keys.map(key=>{
       const label=FEATURE_LABELS[key],fact=hotelFeature(hotel,key),facilityUrl=hotelFacilityUrl(hotel,fact.sourceId);
       return <div key={key} className={`feature-fact ${fact.value===true?'available':''}`}><span>{label}</span><b>{fact.value===true?<><Check size={16}/>{fact.scope==='someRooms'?'일부 객실':fact.scope==='allRooms'?'전 객실':'있음'}</>:fact.value===false?<><Minus size={16}/>없음</>:<><CircleHelp size={16}/>확인 필요</>}</b>{fact.note&&<small>{fact.note}</small>}{facilityUrl&&<a className="fact-source" href={facilityUrl} target="_blank" rel="noopener noreferrer">시설 안내 ↗</a>}</div>
      })}
     </div></div>)}<div className="spring-note"><strong>온천 종류와 사용 방식</strong><p>{hotel.spring.types.join(' · ')||'세부 온천 종류는 공식 안내를 확인하세요.'}</p><p>{hotel.spring.waterNotes}</p></div><div className="notice"><Info size={17}/><p>{hotel.spring.useNotes}</p></div></section>
     {r&&(r.summary||r.highlights.length>0)&&<section className="detail-section"><h2>후기 키워드 <span>Trip.com</span></h2><p>{r.summary}</p><div className="review-tags">{r.highlights.map(t=><span key={t}>{t}</span>)}</div><p className="secondary">숙소 페이지에 표시된 키워드 기준 · 확인 {r.verifiedAt}</p></section>}
     <section className="detail-section"><h2>위치</h2><p className="secondary">{hotel.location.address||'주소 확인 필요'}</p>{hasCoordinates(hotel)?<><StayMap hotels={[hotel]} activeId={hotel.id} onSelect={()=>{}} compact/><p className="secondary coordinates">{hotel.location.latitude.toFixed(4)}, {hotel.location.longitude.toFixed(4)} · 예약 사이트 숙소 지도 좌표</p></>:<p className="secondary">지도 좌표는 아직 확인하지 못했습니다. 아래 Google Maps에서 숙소 주소를 확인하세요.</p>}</section>
     <section className="detail-section"><h2>공식 안내와 예약 사이트</h2><p className="secondary">숙소의 최신 운영 안내와 요금·예약 가능 여부는 연결된 사이트에서 확인하세요.</p><div className="external-links">{hotel.links.map(link=>link.url?<a key={link.provider} href={link.url} target="_blank" rel="noopener noreferrer"><div><b>{providers[link.provider]}</b><small>{link.label}</small></div><ExternalLink size={17}/></a>:<div key={link.provider} className="link-unavailable"><div><b>{providers[link.provider]}</b><small>연결된 페이지 없음</small></div><span>미연결</span></div>)}</div></section>
     <section className="provenance"><h2>정보 출처</h2>{hotel.sources.map(s=><div key={s.sourceId}><b>{s.url?<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a>:s.label}</b><p>수집 {s.retrievedAt.slice(0,10)} · 확인 {s.verifiedAt??'미확인'}{s.nameLocaleUrl&&<> · <a href={s.nameLocaleUrl} target="_blank" rel="noopener noreferrer">한국어 숙소명 출처</a></>}</p></div>)}<p>평점과 시설은 확인일 기준입니다. Trip.com과 Jalan의 원래 평점 척도를 유지합니다. 사진 저작권은 원출처에 있습니다. <a href="/api/photo-credits" target="_blank" rel="noopener noreferrer">사진 출처</a></p></section>
    </div>
   </div>
  </>}
 </SheetContent></Sheet>
}
