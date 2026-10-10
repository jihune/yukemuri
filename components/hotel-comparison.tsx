'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeftRight,RotateCcw,X} from 'lucide-react';
import {FEATURE_LABELS,FEATURE_GROUPS,type FeatureKey,type Hotel} from '@/lib/hotel-types';
import {comparisonFeatureLabel,type HotelComparisonResult} from '@/lib/hotel-comparison';
import {hotelFeature} from '@/lib/hotel-bath-facts';
import {hotelFacilityUrl} from '@/lib/hotel-facility-link';
import {providerRating,meetsVerifiedCriteria} from '@/lib/hotel-ratings';
import {formatCollectionTime} from '@/lib/collection-status';
import {apiJson} from '@/lib/api-client';
import {Sheet,SheetContent,SheetTitle,SheetDescription,SheetClose} from '@/components/ui/sheet';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import HotelPhoto from './hotel-photo';
import HotelLifecycleNote from './hotel-lifecycle-note';
import GooglePlaceRating from './google-place-rating';
import TableScrollRegion from './table-scroll-region';

function Rating({hotel,provider}:{hotel:Hotel;provider:'trip'|'jalan'}){
 const rating=providerRating(hotel,provider),source=rating&&hotel.sources.find(item=>item.sourceId===rating.sourceId);
 return rating?<><b>{rating.score.toFixed(1)} / {rating.scale}</b><span>리뷰 {rating.reviewCount.toLocaleString()}개</span><small>확인 {rating.verifiedAt??'확인일 미기록'}</small>{source?.url&&<a href={source.url} target="_blank" rel="noopener noreferrer">평점 출처</a>}</>:<span className="comparison-unknown">확인 필요</span>;
}
function Feature({hotel,feature}:{hotel:Hotel;feature:FeatureKey}){
 const fact=hotelFeature(hotel,feature),url=hotelFacilityUrl(hotel,fact.sourceId);
 return <div className={`comparison-fact ${fact.value===true?'confirmed':''}`}><b>{comparisonFeatureLabel(feature,fact)}</b>{fact.value!==null&&<small>확인 {fact.verifiedAt??'확인일 미기록'}</small>}{url&&<a href={url} target="_blank" rel="noopener noreferrer">시설 출처</a>}{fact.note&&<details><summary>근거 보기</summary><p>{fact.note}</p></details>}</div>;
}
export default function HotelComparison({open,ids,onClose,onRemove,onClear,onDetail,onRestoreFocus}:{open:boolean;ids:string[];onClose:()=>void;onRemove:(id:string)=>void;onClear:()=>void;onDetail:(id:string)=>void;onRestoreFocus:()=>void}){
 const key=ids.join(','),closeButton=useRef<HTMLButtonElement>(null);
 const removeButtons=useRef(new Map<string,HTMLButtonElement>()),focusAfterRemoval=useRef<string|null>(null);
 const [revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [result,setResult]=useState<{key:string;data:HotelComparisonResult}|null>(null);
 // Removing columns keeps the remaining evidence and controls while refreshing.
 // Newly added IDs still wait for their own response.
 const data=result&&ids.every(id=>result.key.split(',').includes(id))?result.data:null;
 useLayoutEffect(()=>{
  if(focusAfterRemoval.current===null)return;
  const target=removeButtons.current.get(focusAfterRemoval.current)??closeButton.current;
  focusAfterRemoval.current=null;target?.focus({preventScroll:true});
 },[key]);
 useEffect(()=>{
  if(!open||!key)return;
  const controller=new AbortController();setLoading(true);setError('');
  apiJson<HotelComparisonResult>('/api/hotel-comparison?'+new URLSearchParams({ids:key}),{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setResult({key,data:value})}).catch(()=>{if(!controller.signal.aborted)setError('비교 정보를 불러오지 못했습니다. 다시 시도해 주세요.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[open,key,revision]);
 const byId=new Map(data?.hotels.map(hotel=>[hotel.id,hotel])??[]);
 const cells=(render:(hotel:Hotel)=>ReactNode)=>ids.map(id=><TableCell key={id}>{byId.has(id)?render(byId.get(id)!):<span className="comparison-unknown">기록 없음</span>}</TableCell>);
 function remove(id:string){const index=ids.indexOf(id);focusAfterRemoval.current=ids[index+1]??ids[index-1]??'';onRemove(id)}
 function clear(){closeButton.current?.focus({preventScroll:true});onClear()}
 return <Sheet open={open} onOpenChange={value=>{if(!value)onClose()}}><SheetContent showCloseButton={false} onOpenAutoFocus={event=>{event.preventDefault();closeButton.current?.focus({preventScroll:true})}} onCloseAutoFocus={event=>{event.preventDefault();onRestoreFocus()}} className="hotel-comparison !w-full sm:!max-w-[min(96vw,1200px)] !gap-0">
  <div className="comparison-header"><div><SheetTitle><ArrowLeftRight size={22}/>숙소 비교 <span>{ids.length}/4</span></SheetTitle><SheetDescription>평점은 출처별 원래 척도이며, 객실탕은 해당 객실 타입에만 적용됩니다.</SheetDescription></div><SheetClose asChild><button ref={closeButton} className="icon-button" aria-label="숙소 비교 닫기"><X size={22}/></button></SheetClose></div>
  <div className="comparison-scroll">
   {!ids.length?<div className="comparison-empty"><p>숙소 목록에서 ‘비교 담기’를 눌러 2~4곳을 선택하세요.</p><button onClick={onClose}>숙소 목록으로</button></div>:<>
    <div className="comparison-toolbar"><span aria-live="polite">{loading?'저장된 비교 정보 확인 중…':data?`자료 조회 ${formatCollectionTime(data.measuredAt)} · 한국시간`:'선택한 숙소의 저장 정보'}</span><button onClick={()=>{if(!loading)setRevision(value=>value+1)}} aria-disabled={loading}><RotateCcw size={16}/>다시 확인</button><button onClick={clear}>모두 비우기</button></div>
    {error&&<p className="collection-error" role="alert">{error}{data&&' 아래는 마지막 조회 결과입니다.'}</p>}
    {loading&&!data&&<p role="status">숙소 정보를 불러오는 중…</p>}
    {data&&<>
     {data.missingIds.some(id=>ids.includes(id))&&<p role="status">일부 기록을 찾을 수 없습니다. 해당 후보를 지우고 목록에서 다시 선택하세요.</p>}
     <p className="table-scroll-hint">표는 좌우로 이동할 수 있습니다. 키보드는 표에 포커스를 두고 좌우 방향키를 누르세요.</p>
     <TableScrollRegion className="comparison-table-region" label="숙소별 평점과 온천 비교표. 좌우 방향키로 이동">
      <Table className="comparison-table"><caption className="sr-only">선택한 숙소의 원래 평점 척도, 리뷰 수, 온천·객실 시설과 확인 근거</caption><TableHeader><TableRow><TableHead scope="col">비교 항목</TableHead>{ids.map(id=>{const hotel=byId.get(id);return <TableHead key={id} scope="col"><button ref={element=>{if(element)removeButtons.current.set(id,element);else removeButtons.current.delete(id)}} className="comparison-remove" onClick={()=>remove(id)} aria-label={(hotel?.names.ko??id)+' 비교에서 빼기'}><X size={18}/></button>{hotel?<><div className="comparison-image"><HotelPhoto hotel={hotel} loading="lazy"/></div><button className="comparison-hotel-name" onClick={()=>onDetail(id)}>{hotel.names.ko}</button>{hotel.names.ja!==hotel.names.ko&&<span lang="ja">{hotel.names.ja}</span>}<small>{hotel.location.label}</small><HotelLifecycleNote hotel={hotel} compact/></>:<><b>{id}</b><span>기록을 찾을 수 없습니다.</span></>}</TableHead>})}</TableRow></TableHeader><TableBody>
       <TableRow><TableHead scope="row">Trip.com · 10점</TableHead>{cells(hotel=><Rating hotel={hotel} provider="trip"/>)}</TableRow>
       <TableRow><TableHead scope="row">Google Maps · 5점</TableHead>{cells(hotel=>hotel.links.some(link=>link.provider==='maps'&&link.url)?<GooglePlaceRating hotel={hotel} data={null}/>:<span className="comparison-unknown">지도 연결 확인 필요</span>)}</TableRow>
       <TableRow><TableHead scope="row">자란넷 · 5점</TableHead>{cells(hotel=><Rating hotel={hotel} provider="jalan"/>)}</TableRow>
       <TableRow><TableHead scope="row">내 검증 기준<small>Trip.com 9.0+ · 리뷰 50개+</small></TableHead>{cells(hotel=><span>{providerRating(hotel,'trip')?meetsVerifiedCriteria(hotel)?'충족':'미충족':'Trip.com 평점 확인 필요'}</span>)}</TableRow>
       {FEATURE_GROUPS.flatMap(group=>group.keys.map(feature=><TableRow key={feature}><TableHead scope="row">{FEATURE_LABELS[feature]}</TableHead>{cells(hotel=><Feature hotel={hotel} feature={feature}/>)}</TableRow>))}
       <TableRow><TableHead scope="row">자란 하이클래스</TableHead>{cells(hotel=><Feature hotel={hotel} feature="jalanHighClass"/>)}</TableRow>
       <TableRow><TableHead scope="row">주소</TableHead>{cells(hotel=><span>{hotel.location.address||'확인 필요'}</span>)}</TableRow>
       <TableRow><TableHead scope="row">온천수 안내</TableHead>{cells(hotel=><span>{hotel.spring.waterNotes||'세부 안내 확인 필요'}</span>)}</TableRow>
      </TableBody></Table>
     </TableScrollRegion>
     <p className="comparison-note">같은 숙소가 출처별 기록으로 남아 있을 수 있습니다. ‘확인 필요’는 ‘없음’과 다릅니다. Google 평점과 사진은 연결된 지도에서 확인하세요. 객실탕은 예약할 객실 타입의 안내를 다시 확인하세요.</p>
    </>}
   </>}
  </div>
 </SheetContent></Sheet>;
}
