'use client';
import { Hotel, FEATURE_LABELS, FeatureKey } from '@/lib/hotel-types';
import type {HotelSummary} from '@/lib/search-snapshot';
import {useId,useRef,useEffect,useState,type ReactNode} from 'react';
import type {GooglePlaceData} from '@/lib/google-places';
import HotelPhoto from './hotel-photo';
import GooglePlaceRating from './google-place-rating';
import BathCells from './bath-cells';
import RetryImage from './retry-image';
import {hotelFeature} from '@/lib/hotel-bath-facts';
import {hotelFacilityUrl} from '@/lib/hotel-facility-link';
import { primaryRating,orderedRatings } from '@/lib/hotel-ratings';
import { hasCoordinates } from '@/lib/hotel-location';
import { Heart, ExternalLink, Check, Minus, CircleHelp, Waves, Info, X, ArrowLeftRight, CalendarDays, ChevronDown, RotateCw } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import StayMap from './stay-map';
import HotelLifecycleNote from './hotel-lifecycle-note';
import HotelDescription from './hotel-description';
import BookingFields from './booking-fields';
import { datedLink, bookingError, type BookingQuery } from '@/lib/booking-query';
import {roomKindsText} from '@/lib/room-kinds';
import {displayNames,nameLang} from '@/lib/hotel-names';
import CopyName from './copy-name';
import {JTA_LABEL,JTA_MEANING,JTA_NOTE,JTA_ATTRIBUTION,JTA_LINKS,jtaKind} from '@/lib/jta-attribution';
import {OITA_LABEL,OITA_LIMIT,OITA_NOTE,OITA_ATTRIBUTION,OITA_LINKS} from '@/lib/oita-attribution';
const providers={trip:'Trip.com',jalan:'Jalan',official:'공식 홈페이지',maps:'Google Maps'};
const ratingProviders={trip:'Trip.com',google:'Google Maps',jalan:'Jalan',rakuten:'Rakuten Travel'};
const KIND={ryokan:'료칸',hotel:'호텔',unknown:'숙소'};
// 탕 상세 (U05 B): the three bath groups, with 전망 욕탕 (viewBath, D05) among the shared baths.
// Every bath key of FEATURE_LABELS appears once; facts not yet confirmed fold away under one
// ‘확인 전 N개 보기’. Jalan's grade is not a bath fact: the summary shows it, as the card does.
const DETAIL_GROUPS:{label:string;keys:readonly FeatureKey[]}[]=[
 {label:'온천수와 사용 방식',keys:['natural','nigori','freeFlow']},
 {label:'공용·전세 목욕 시설',keys:['largeBath','outdoor','communalOutdoor','viewBath','privateBath','privateOutdoor']},
 {label:'객실 목욕 시설',keys:['roomOnsen','roomIndoorOnsen','roomOutdoor','roomOutdoorOnsen']},
];
const BATH_KEYS=DETAIL_GROUPS.flatMap(group=>group.keys);
// Room types and unnamed room photos shown per source before the rest fold away.
const ROOM_TYPES=3,ROOM_PHOTOS=6;
// A value's source is named the way the representative photo's credit is: by the source it
// came from (trip-… Trip.com, jalan-… Jalan), linked to that source's page.
function origin(hotel:Hotel,sourceId:string){
 const source=hotel.sources.find(s=>s.sourceId===sourceId);
 return{label:sourceId.startsWith('trip-')?'Trip.com':sourceId.startsWith('jalan-')?'Jalan':source?.label??'출처',url:source?.url??null};
}
function Origin({hotel,sourceId,verifiedAt}:{hotel:Hotel;sourceId:string;verifiedAt:string}){
 const o=origin(hotel,sourceId);
 return <small className="fact-origin">{o.url?<a href={o.url} target="_blank" rel="noopener noreferrer">{o.label} ↗</a>:o.label} · <span>확인 {verifiedAt}</span></small>;
}
function Fact({hotel,k}:{hotel:Hotel;k:FeatureKey}){
 const fact=hotelFeature(hotel,k),facilityUrl=hotelFacilityUrl(hotel,fact.sourceId);
 return <div className={`feature-fact ${fact.value===true?'available':''}`}><span>{FEATURE_LABELS[k]}</span><b>{fact.value===true?<><Check size={16} aria-hidden="true"/>{fact.scope==='someRooms'?'일부 객실':fact.scope==='allRooms'?'전 객실':'있음'}</>:fact.value===false?<><Minus size={16} aria-hidden="true"/>없음</>:<><CircleHelp size={16} aria-hidden="true"/>확인 필요</>}</b>{fact.note&&<small>{fact.note}</small>}{facilityUrl&&<a className="fact-source" href={facilityUrl} target="_blank" rel="noopener noreferrer">시설 안내 ↗</a>}</div>;
}
// The facility page to send a reader to when nothing is confirmed: Jalan's first.
function facilityPage(hotel:Hotel){
 for(const source of [...hotel.sources].sort((a,b)=>Number(!a.sourceId.startsWith('jalan-'))-Number(!b.sourceId.startsWith('jalan-')))){
  const url=hotelFacilityUrl(hotel,source.sourceId);
  if(url)return{url,label:origin(hotel,source.sourceId).label+' 시설 안내'};
 }
 return null;
}
function BathDetail({hotel}:{hotel:Hotel}){
 const known=(k:FeatureKey)=>hotelFeature(hotel,k).value!==null,anyKnown=BATH_KEYS.some(known);
 const unknown=DETAIL_GROUPS.map(group=>({...group,keys:group.keys.filter(k=>!known(k))})).filter(group=>group.keys.length);
 const count=unknown.reduce((n,group)=>n+group.keys.length,0),facility=facilityPage(hotel);
 const groups=DETAIL_GROUPS.map(group=>({...group,keys:group.keys.filter(known)})).filter(group=>group.keys.length);
 const facts=(list:typeof groups)=>list.map(group=><div className="bath-detail-group" key={group.label}><h3>{group.label}</h3><div className="feature-grid">{group.keys.map(k=><Fact key={k} hotel={hotel} k={k}/>)}</div></div>);
 // Nothing confirmed: one sentence and the facility page, not a page of ‘확인 필요’.
 return <section className="detail-section" aria-labelledby="detail-bath-title"><h2 id="detail-bath-title">탕 상세</h2>
  {anyKnown?<p className="bath-guide">Jalan 시설 정보를 먼저 봅니다. 객실탕은 표시된 객실 타입에만 해당합니다.</p>:<p className="bath-unknown">이 숙소의 탕 정보는 아직 확인하지 못했습니다.{facility&&<> <a href={facility.url} target="_blank" rel="noopener noreferrer">{facility.label} ↗</a></>}</p>}
  {facts(groups)}
  {anyKnown&&count>0&&<details className="unknown-facts"><summary>확인 전 {count}개 보기<ChevronDown size={18} aria-hidden="true"/></summary>{facts(unknown)}</details>}
  {anyKnown&&<div className="spring-note"><strong>온천 종류와 사용 방식</strong><p>{hotel.spring.types.join(' · ')||'세부 온천 종류는 공식 안내를 확인하세요.'}</p><p>{hotel.spring.waterNotes}</p></div>}
  {anyKnown&&<div className="notice"><Info size={17} aria-hidden="true"/><p>{hotel.spring.useNotes}</p></div>}
 </section>;
}
// D05 room count, room types and photos; D04 opening and renovation years. A missing value is
// ‘확인 필요’, never guessed (a hotel without years is not an old one).
function RoomsAndYears({hotel}:{hotel:Hotel}){
 const rooms=hotel.rooms,years=hotel.facilityYears;
 const byType=rooms?roomKindsText(rooms):'';
 const row=(label:string,value:string,source:{sourceId:string;verifiedAt:string},note?:string)=><div className="feature-fact available" key={label}><span>{label}</span><b><Check size={16} aria-hidden="true"/>{value}</b>{note&&<small>{note}</small>}<Origin hotel={hotel} sourceId={source.sourceId} verifiedAt={source.verifiedAt}/></div>;
 const facts=[rooms&&row('객실 수',rooms.total.toLocaleString()+'실',rooms,byType),years?.opened&&row('설립 연도',years.opened+'년',years),years?.renovated&&row('리모델링 연도',years.renovated+'년',years)].filter(Boolean);
 const missing=[!rooms&&'객실 수',!years?.opened&&'설립 연도',!years?.renovated&&'리모델링 연도'].filter((label):label is string=>!!label);
 const sets=[...(hotel.roomTypes??[])].sort((a,b)=>Number(!a.sourceId.startsWith('trip-'))-Number(!b.sourceId.startsWith('trip-')));
 return <section className="detail-section" aria-labelledby="detail-rooms-title"><h2 id="detail-rooms-title">객실과 시설</h2>
  {facts.length>0&&<div className="feature-grid">{facts}</div>}
  {missing.length>0&&<p className="facts-unknown"><CircleHelp size={16} aria-hidden="true"/>{missing.join(' · ')}: 확인 필요</p>}
  {sets.map(set=>{
   const o=origin(hotel,set.sourceId),ja=set.sourceId.startsWith('jalan-')?'ja':undefined;
   const photo=(item:{name:string|null},p:{url:string;caption:string},j:number)=><figure key={p.url+j}><RetryImage src={p.url} alt={p.caption||(item.name??'객실')+' 사진 '+(j+1)} loading="lazy"/><span className="photo-source-credit">{o.label}</span>{p.caption&&<figcaption lang={ja}>{p.caption}</figcaption>}</figure>;
   // Named types (Trip.com) list each type with its photos; a gallery without names (Jalan)
   // is one grid of photos.
   const named=set.items.filter(item=>item.name),photos=set.items.filter(item=>!item.name).flatMap(item=>item.photos.map(p=>({item,p})));
   const types=(part:typeof named)=><ul className="room-list">{part.map((item,i)=><li key={i}><b>{item.name}</b>{item.photos.length>0&&<div className="room-photos">{item.photos.map((p,j)=>photo(item,p,j))}</div>}</li>)}</ul>;
   const grid=(part:typeof photos,from:number)=><div className="room-photos">{part.map(({item,p},j)=>photo(item,p,from+j))}</div>;
   const more=(label:string,body:ReactNode)=><details className="room-more"><summary>{label}<ChevronDown size={18} aria-hidden="true"/></summary>{body}</details>;
   return <div className="room-set" key={set.sourceId}><h3>{o.label} {named.length?'객실 타입':'객실 사진'}</h3><Origin hotel={hotel} sourceId={set.sourceId} verifiedAt={set.verifiedAt}/>
    {named.length>0&&types(named.slice(0,ROOM_TYPES))}{named.length>ROOM_TYPES&&more('객실 타입 '+(named.length-ROOM_TYPES)+'개 더 보기',types(named.slice(ROOM_TYPES)))}
    {photos.length>0&&grid(photos.slice(0,ROOM_PHOTOS),0)}{photos.length>ROOM_PHOTOS&&more('사진 '+(photos.length-ROOM_PHOTOS)+'장 더 보기',grid(photos.slice(ROOM_PHOTOS),ROOM_PHOTOS))}
   </div>;
  })}
 </section>;
}
const shortDate=(day:string)=>{const [,m,d]=day.split('-');return Number(m)+'.'+Number(d)};
export default function HotelDetail({hotel,fallback,jta,oita,loading,onRetry,onClose,onRestoreFocus,favorite,onFavorite,pending,canSave,compared,onCompare,booking,onBooking}:{hotel:Hotel|null;fallback:HotelSummary|null;jta?:string;oita?:HotelSummary['oita'];loading:boolean;onRetry:()=>void;onClose:()=>void;onRestoreFocus:()=>void;favorite:boolean;onFavorite:()=>void;pending:boolean;canSave:boolean;compared:boolean;onCompare:()=>void;booking:BookingQuery;onBooking:(q:BookingQuery)=>void}){
 const closeButton=useRef<HTMLButtonElement>(null),scroll=useRef<HTMLDivElement>(null),title=useRef<HTMLHeadingElement>(null),retried=useRef(false);
 const nameId=useId(),enRef=useRef<HTMLParagraphElement>(null),jaRef=useRef<HTMLParagraphElement>(null);
 const [googleResult,setGoogleResult]=useState<{hotelId:string;data:GooglePlaceData}|null>(null),[bookingOpen,setBookingOpen]=useState(false);
 const google=googleResult?.hotelId===hotel?.id?googleResult?.data??null:null;
 const card:(HotelSummary&{sources?:Hotel['sources']})|null=hotel??fallback;
 useEffect(()=>{
  if(!hotel?.googlePlaceId)return;
  const controller=new AbortController(),hotelId=hotel.id;
  fetch('/api/hotels/'+encodeURIComponent(hotelId)+'/google?photo=1',{cache:'no-store',signal:controller.signal}).then(async r=>r.ok?await r.json() as {status:string;data?:GooglePlaceData}:null).then(result=>{if(result?.status==='ok'&&result.data&&!controller.signal.aborted)setGoogleResult({hotelId,data:result.data})}).catch(()=>{});
  return()=>controller.abort();
 },[hotel?.id,hotel?.googlePlaceId]);
 useEffect(()=>{if(scroll.current)scroll.current.scrollTop=0},[card?.id]);
 // A retry that brings the full detail removes the button that had focus: move it to the name.
 useEffect(()=>{if(hotel&&retried.current){retried.current=false;title.current?.focus({preventScroll:true})}},[hotel]);
 const r=hotel?primaryRating(hotel):undefined;
 const bookingProblem=bookingError(booking),dated=!bookingProblem&&!!hotel?.links.some(link=>link.url&&datedLink(link,booking)!==link.url);
 const actionLinks=hotel?(['jalan','trip'] as const).flatMap(provider=>hotel.links.filter(link=>link.provider===provider&&link.url).slice(0,1)):[];
 const chosen=booking.checkIn&&booking.checkOut&&!bookingProblem?shortDate(booking.checkIn)+'–'+shortDate(booking.checkOut)+' · 성인 '+booking.adults+'명':booking.checkIn||booking.checkOut?'날짜 확인 필요':'고르지 않음';
 const renderRating=(rating:Hotel['ratings'][number])=>{const source=hotel?.sources.find(s=>s.sourceId===rating.sourceId);return <div className="detail-rating" key={rating.sourceId}><span className="score">{rating.score.toFixed(1)}</span><b>{rating.provider?ratingProviders[rating.provider]:source?.label}</b><span>/{rating.scale} · 리뷰 {rating.reviewCount.toLocaleString()}개</span><small>확인 {rating.verifiedAt??'미확인'}{source?.url&&<> · <a href={source.url} target="_blank" rel="noopener noreferrer">출처 ↗</a></>}</small></div>};
 // U07: Korean, else English, else the original name, then the English and original names that
 // differ, each English or original one with a copy button. Other names: the rest, once.
 const n=card?displayNames(card.names):null,shown=n?[n.title,n.en,n.ja]:[];
 const otherNames=hotel?[...new Set([hotel.names.en,...(hotel.aliases??[])])].filter(name=>name&&!shown.includes(name)&&name!==hotel.names.ko&&name!==hotel.names.ja):[];
 return <Sheet open={!!card} onOpenChange={open=>{if(!open)onClose()}}><SheetContent showCloseButton={false} onOpenAutoFocus={e=>{e.preventDefault();closeButton.current?.focus({preventScroll:true})}} onCloseAutoFocus={e=>{e.preventDefault();onRestoreFocus()}} className="hotel-detail !w-full sm:!max-w-[720px] !gap-0">
  {card&&<>
   <div className="detail-top"><span><Waves size={18} aria-hidden="true"/> 숙소 살펴보기</span><SheetClose asChild><button ref={closeButton} className="icon-button" aria-label="숙소 상세 닫기"><X size={22}/></button></SheetClose></div>
   <div className="detail-scroll" ref={scroll}>
    <div className="detail-lead">
     <div className="detail-image"><HotelPhoto key={card.id} hotel={card} google={google} credit={hotel?true:'label'} carousel/></div>
     <div className="detail-summary">
      {!hotel&&<div className="detail-unavailable"><p role="status">{loading?'자세한 정보를 다시 불러오는 중입니다…':'자세한 정보를 지금 불러올 수 없습니다. 목록에 있는 정보만 보여 줍니다.'}</p><button type="button" className="detail-retry" onClick={()=>{retried.current=true;onRetry()}} disabled={loading}><RotateCw size={17} aria-hidden="true"/>다시 시도</button></div>}
      <SheetDescription className="detail-eyebrow">{KIND[card.kind]} · {card.location.label}{hotelFeature(card,'jalanHighClass').value===true&&<span className="highclass-tag">자란 하이클래스</span>}{jta&&<span className="jta-tag">{JTA_LABEL[jtaKind(jta)]}</span>}</SheetDescription>
      {n&&<div className="detail-name"><div className="name-row"><SheetTitle ref={title} tabIndex={-1} lang={nameLang(n.title)}>{n.title}</SheetTitle>{n.titleLang!=='ko'&&<CopyName name={n.title} label={n.titleLang==='en'?'영어 이름':'원어 이름'} target={title}/>}</div>{n.en&&<div className="name-row"><p className="name-en" id={nameId+'e'} ref={enRef} lang={nameLang(n.en)}>{n.en}</p><CopyName name={n.en} label="영어 이름" target={enRef} id={nameId+'e'}/></div>}{n.ja&&<div className="name-row"><p id={nameId+'j'} ref={jaRef} lang={nameLang(n.ja)}>{n.ja}</p><CopyName name={n.ja} label="원어 이름" target={jaRef} id={nameId+'j'}/></div>}</div>}
      {hotel?<HotelLifecycleNote hotel={hotel}/>:<HotelLifecycleNote hotel={card} compact/>}
      {hotel?<div className="provider-ratings" aria-label="출처별 평점">{orderedRatings(hotel).filter(r=>r.provider==='trip').map(renderRating)}<GooglePlaceRating hotel={hotel} data={google}/>{orderedRatings(hotel).filter(r=>r.provider!=='trip'&&r.provider!=='google').map(renderRating)}{hotel.ratings.length===0&&<p className="secondary">확인된 평점이 없습니다.</p>}</div>
      :<div className="provider-ratings" aria-label="출처별 평점">{card.ratings.filter(r=>r.provider==='trip'||r.provider==='jalan').map(r=><div className="detail-rating" key={r.provider}><span className="score">{r.score.toFixed(1)}</span><b>{ratingProviders[r.provider!]}</b><span>/{r.scale} · 리뷰 {r.reviewCount.toLocaleString()}개</span></div>)}{card.ratings.length===0&&<p className="secondary">확인된 평점이 없습니다.</p>}</div>}
      <BathCells hotel={card} className="detail-cells"/>
     </div>
    </div>
    {hotel&&<div className="detail-body">
     <BathDetail hotel={hotel}/>
     <RoomsAndYears hotel={hotel}/>
     <section className="detail-section"><h2>숙소 소개</h2>{otherNames.length>0&&<p className="other-names">다른 이름: {otherNames.join(' · ')}</p>}<HotelDescription key={hotel.id} hotel={hotel}/></section>
     {r&&(r.summary||r.highlights.length>0)&&<section className="detail-section"><h2>후기 키워드 <span>Trip.com</span></h2><p>{r.summary}</p><div className="review-tags">{r.highlights.map(t=><span key={t}>{t}</span>)}</div><p className="secondary">숙소 페이지에 표시된 키워드 기준 · 확인 {r.verifiedAt}</p></section>}
     <section className="detail-section"><h2>위치</h2><p className="secondary">{hotel.location.address||'주소 확인 필요'}</p>{hasCoordinates(hotel)?<><StayMap hotels={[hotel]} activeId={hotel.id} onSelect={()=>{}} compact/><p className="secondary coordinates">{hotel.location.latitude.toFixed(4)}, {hotel.location.longitude.toFixed(4)} · 예약 사이트 숙소 지도 좌표</p></>:<p className="secondary">지도 좌표는 아직 확인하지 못했습니다. 아래 Google Maps에서 숙소 주소를 확인하세요.</p>}</section>
     {jta&&<section className="detail-section" aria-labelledby="detail-jta-title"><h2 id="detail-jta-title">{JTA_LABEL[jtaKind(jta)]}</h2><p>{JTA_MEANING}</p><p className="secondary jta-credit">등록번호 {jta} · {JTA_NOTE} <span lang="ja">{JTA_ATTRIBUTION}</span> {JTA_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===JTA_LINKS.length-1?')':''}</span>)}</p></section>}
     <section className="detail-section"><h2>공식 안내와 예약 사이트</h2><p className="secondary">최신 운영 안내와 요금·예약 가능 여부는 연결된 사이트에서 확인하세요.</p><div className="external-links">{hotel.links.map(link=>{const href=datedLink(link,booking);return href?<a key={link.provider} href={href} target="_blank" rel="noopener noreferrer"><div><b>{providers[link.provider]}</b><small>{href!==link.url?'고른 날짜·인원으로 열기':link.label}</small></div><ExternalLink size={17} aria-hidden="true"/></a>:<div key={link.provider} className="link-unavailable"><div><b>{providers[link.provider]}</b><small>연결된 페이지 없음</small></div><span>미연결</span></div>})}</div></section>
     <section className="provenance"><h2>정보 출처</h2>{hotel.sources.map(s=><div key={s.sourceId}><b>{s.url?<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a>:s.label}</b><p>수집 {s.retrievedAt.slice(0,10)} · 확인 {s.verifiedAt??'미확인'}{s.nameLocaleUrl&&<> · <a href={s.nameLocaleUrl} target="_blank" rel="noopener noreferrer">한국어 숙소명 출처</a></>}</p></div>)}{oita&&<div data-oita-permit><b>{OITA_LABEL}</b><p><span lang="ja">{oita.kind}</span> 영업{oita.permitted&&' · 허가 '+oita.permitted}({oita.asOf} 목록 기준). {OITA_LIMIT} {OITA_NOTE} <span lang="ja">{OITA_ATTRIBUTION}</span> {OITA_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===OITA_LINKS.length-1?')':''}</span>)}</p></div>}<p>평점과 시설은 확인일 기준입니다. Trip.com과 Jalan의 원래 평점 척도를 유지합니다. 사진 저작권은 원출처에 있습니다. <a href="/api/photo-credits" target="_blank" rel="noopener noreferrer">사진 출처</a></p></section>
    </div>}
   </div>
   <div className="detail-actions">
    {hotel&&actionLinks.length>0&&<><button type="button" className="booking-toggle" aria-expanded={bookingOpen} aria-controls={'detail-booking-'+hotel.id} onClick={()=>setBookingOpen(open=>!open)}><CalendarDays size={18} aria-hidden="true"/><b>날짜·인원</b><span>{chosen}</span><ChevronDown size={18} aria-hidden="true"/></button>
     <div className="booking-link-fields" id={'detail-booking-'+hotel.id} hidden={!bookingOpen}><BookingFields query={booking} onChange={onBooking} prefix={'detail-'+hotel.id}/><p className="booking-help" aria-live="polite">{booking.checkIn||booking.checkOut?bookingProblem?bookingProblem+' 지금은 날짜 없이 열립니다.':dated?'아래 예약 사이트 링크에 고른 날짜와 인원이 들어갑니다(‘고른 날짜·인원으로 열기’).':'이 숙소의 연결된 예약 사이트는 날짜를 넣어 열 수 없습니다.':'날짜를 고르면 Jalan·Trip.com 링크에 날짜와 성인 인원(객실 1개)이 들어갑니다. 요금 조회는 하지 않습니다.'}</p></div></>}
    <div className="detail-action-row">
     {actionLinks.map(link=>{const href=datedLink(link,booking)??link.url!;return <a key={link.provider} className="detail-action-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={providers[link.provider]+' 열기'+(href!==link.url?', 고른 날짜·인원 포함':'')}>{providers[link.provider]} 열기<ExternalLink size={16} aria-hidden="true"/></a>})}
     <button type="button" className={`icon-button detail-heart ${favorite?'saved':''}`} onClick={onFavorite} disabled={pending||!canSave} aria-pressed={favorite} aria-label={favorite?'즐겨찾기 해제':'즐겨찾기 저장'}><Heart fill={favorite?'currentColor':'none'} aria-hidden="true"/></button>
     <button type="button" className="icon-button detail-compare" onClick={onCompare} aria-pressed={compared} aria-label={compared?'비교에서 빼기':'비교 담기'}><ArrowLeftRight size={20} aria-hidden="true"/></button>
    </div>
   </div>
  </>}
 </SheetContent></Sheet>
}
