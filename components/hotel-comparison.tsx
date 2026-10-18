'use client';
import {Fragment,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeftRight,ChevronDown,Diff,RotateCcw,X} from 'lucide-react';
import {FEATURE_LABELS,FEATURE_GROUPS,type FeatureKey,type Hotel} from '@/lib/hotel-types';
import {comparisonFeatureLabel,type HotelComparisonResult} from '@/lib/hotel-comparison';
import {comparisonRowState,featureComparisonValue,type ComparisonValue} from '@/lib/comparison-differences';
import {hotelFeature} from '@/lib/hotel-bath-facts';
import {hotelFacilityUrl} from '@/lib/hotel-facility-link';
import {providerRating,meetsVerifiedCriteria} from '@/lib/hotel-ratings';
import {formatCollectionTime} from '@/lib/collection-status';
import {apiJson} from '@/lib/api-client';
import {roomKindsText} from '@/lib/room-kinds';
import {displayNames} from '@/lib/hotel-names';
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
// A value a source states once for the stay (D05 room count, D04 years), with its source page.
function Stated({hotel,text,detail,sourceId,verifiedAt}:{hotel:Hotel;text:string;detail?:string;sourceId:string;verifiedAt:string}){
 const url=hotel.sources.find(item=>item.sourceId===sourceId)?.url;
 return <div className="comparison-fact confirmed"><b>{text}</b>{detail&&<span>{detail}</span>}<small>확인 {verifiedAt}</small>{url&&<a href={url} target="_blank" rel="noopener noreferrer">출처</a>}</div>;
}
// U05 B: on a phone each cell is a mark (✓ – ?) or a short value, so 2-4 stays fit side by side
// without moving sideways; a row opens below itself with each stay's full cell (evidence and
// date). A wide screen shows the full cells in the table as before.
type Mark={state:'yes'|'no'|'unknown'|'value'|'ref';text:string;sr:string;scope?:string};
const UNKNOWN:Mark={state:'unknown',text:'?',sr:'확인 필요'},REF:Mark={state:'ref',text:'…',sr:'펼쳐서 보기'};
const scoreMark=(hotel:Hotel,provider:'trip'|'jalan'):Mark=>{const r=providerRating(hotel,provider);return r?{state:'value',text:r.score.toFixed(1),sr:r.score.toFixed(1)+'점'}:UNKNOWN};
export default function HotelComparison({open,ids,onClose,onRemove,onClear,onDetail,onRestoreFocus}:{open:boolean;ids:string[];onClose:()=>void;onRemove:(id:string)=>void;onClear:()=>void;onDetail:(id:string)=>void;onRestoreFocus:()=>void}){
 const key=ids.join(','),closeButton=useRef<HTMLButtonElement>(null);
 const removeButtons=useRef(new Map<string,HTMLButtonElement>()),focusAfterRemoval=useRef<string|null>(null);
 const [revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [result,setResult]=useState<{key:string;data:HotelComparisonResult}|null>(null);
 // The choice outlives closing the sheet; it applies only while two or more candidates are compared.
 const [diffOnlyChosen,setDiffOnlyChosen]=useState(false),[diffAnnounced,setDiffAnnounced]=useState(false),[opened,setOpened]=useState<string[]>([]);
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
 const missing=<span className="comparison-unknown">기록 없음</span>;
 const toggleRow=(key:string)=>setOpened(list=>list.includes(key)?list.filter(item=>item!==key):[...list,key]);
 const cells=(row:Row)=>ids.map(id=>{const hotel=byId.get(id),mark=hotel?row.mark(hotel):UNKNOWN;return <TableCell key={id} onClick={()=>toggleRow(row.key)}><span className={'comparison-mark is-'+mark.state}><span aria-hidden="true">{mark.text}</span>{mark.scope&&<small aria-hidden="true">{mark.scope}</small>}<span className="sr-only">{hotel?mark.sr:'기록 없음'}</span></span><div className="comparison-full">{hotel?row.render(hotel):missing}</div></TableCell>});
 const unknownSpan=<span className="comparison-unknown">확인 필요</span>;
 // Rows in table order. value is the compared value; rows without one are reference rows.
 // The D05 room count and D04 years compare their stated values; a stay without them is
 // unknown, never the same as or different from another (U03).
 type Row={key:string;label:string;head:ReactNode;render:(hotel:Hotel)=>ReactNode;mark:(hotel:Hotel)=>Mark;value?:(hotel:Hotel)=>ComparisonValue};
 const year=(key:'opened'|'renovated',label:string):Row=>({key,label,head:label,render:hotel=>{const y=hotel.facilityYears,v=y?.[key];return y&&v?<Stated hotel={hotel} text={v+'년'} sourceId={y.sourceId} verifiedAt={y.verifiedAt}/>:unknownSpan},mark:hotel=>{const v=hotel.facilityYears?.[key];return v?{state:'value',text:String(v),sr:v+'년'}:UNKNOWN},value:hotel=>{const v=hotel.facilityYears?.[key];return v?[String(v)]:null}});
 const rows:Row[]=[
  {key:'trip',label:'Trip.com · 10점',head:'Trip.com · 10점',render:hotel=><Rating hotel={hotel} provider="trip"/>,mark:hotel=>scoreMark(hotel,'trip'),value:hotel=>{const r=providerRating(hotel,'trip');return r?[r.score.toFixed(1)]:null}},
  {key:'maps',label:'Google Maps · 5점',head:'Google Maps · 5점',render:hotel=>hotel.links.some(link=>link.provider==='maps'&&link.url)?<GooglePlaceRating hotel={hotel} data={null}/>:<span className="comparison-unknown">지도 연결 확인 필요</span>,mark:()=>REF},
  {key:'jalan',label:'자란넷 · 5점',head:'자란넷 · 5점',render:hotel=><Rating hotel={hotel} provider="jalan"/>,mark:hotel=>scoreMark(hotel,'jalan'),value:hotel=>{const r=providerRating(hotel,'jalan');return r?[r.score.toFixed(1)]:null}},
  {key:'criteria',label:'내 검증 기준',head:<>내 검증 기준<small>Trip.com 9.0+ · 리뷰 50개+</small></>,render:hotel=><span>{providerRating(hotel,'trip')?meetsVerifiedCriteria(hotel)?'충족':'미충족':'Trip.com 평점 확인 필요'}</span>,mark:hotel=>providerRating(hotel,'trip')?meetsVerifiedCriteria(hotel)?{state:'yes',text:'✓',sr:'충족'}:{state:'no',text:'–',sr:'미충족'}:UNKNOWN,value:hotel=>providerRating(hotel,'trip')?[meetsVerifiedCriteria(hotel)?'충족':'미충족']:null},
  ...[...FEATURE_GROUPS.flatMap(group=>group.keys),'jalanHighClass' as const].map((feature):Row=>({key:feature,label:FEATURE_LABELS[feature],head:FEATURE_LABELS[feature],render:hotel=><Feature hotel={hotel} feature={feature}/>,mark:hotel=>{const fact=hotelFeature(hotel,feature);return fact.value===null?UNKNOWN:fact.value===false?{state:'no',text:'–',sr:'없음'}:{state:'yes',text:'✓',sr:comparisonFeatureLabel(feature,fact),scope:fact.scope==='someRooms'?'일부':fact.scope==='allRooms'?'전':undefined}},value:hotel=>featureComparisonValue(feature,hotelFeature(hotel,feature))})),
  {key:'rooms',label:'객실 수',head:'객실 수',render:hotel=>hotel.rooms?<Stated hotel={hotel} text={hotel.rooms.total.toLocaleString()+'실'} detail={roomKindsText(hotel.rooms)} sourceId={hotel.rooms.sourceId} verifiedAt={hotel.rooms.verifiedAt}/>:unknownSpan,mark:hotel=>hotel.rooms?{state:'value',text:String(hotel.rooms.total),sr:hotel.rooms.total+'실'}:UNKNOWN,value:hotel=>hotel.rooms?[String(hotel.rooms.total),roomKindsText(hotel.rooms)||null]:null},
  year('opened','설립 연도'),year('renovated','리모델링 연도'),
  {key:'address',label:'주소',head:'주소',render:hotel=><span>{hotel.location.address||'확인 필요'}</span>,mark:()=>REF},
  {key:'water',label:'온천수 안내',head:'온천수 안내',render:hotel=><span>{hotel.spring.waterNotes||'세부 안내 확인 필요'}</span>,mark:()=>REF},
 ];
 // A missing record is an unknown value. Fewer than two candidates leave every row unjudged.
 const states=new Map(rows.flatMap(row=>{const value=row.value;if(!value)return [];const state=comparisonRowState(ids.map(id=>byId.has(id)?value(byId.get(id)!):null));return state?[[row.key,state] as const]:[]}));
 const differing=[...states.values()].filter(state=>state.kind==='differs').length,undecided=[...states.values()].filter(state=>state.kind==='undecided').length;
 const diffOnly=diffOnlyChosen&&states.size>0;
 function toggleDiffOnly(){setDiffOnlyChosen(!diffOnlyChosen);setDiffAnnounced(true)}
 // Said from the current rows, so a changed candidate set never leaves an old count behind.
 const diffAnnouncement=diffAnnounced?diffOnly?`다른 항목 ${differing}개만 표시 중`:'모든 항목 표시 중':'';
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
     {states.size>0&&<div className="comparison-diff-bar"><p>값이 다른 항목 {differing}개 · 미확인으로 판단 보류 {undecided}개</p><button aria-pressed={diffOnly} onClick={toggleDiffOnly}><Diff size={16} aria-hidden="true"/>다른 항목만 보기</button><span className="sr-only" aria-live="polite">{diffAnnouncement}</span></div>}
     <p className="table-scroll-hint">표는 좌우로 이동할 수 있습니다. 키보드는 표에 포커스를 두고 좌우 방향키를 누르세요.</p>
     <TableScrollRegion className="comparison-table-region" label="숙소별 평점과 온천 비교표. 좌우 방향키로 이동">
      <Table className="comparison-table"><caption className="sr-only">선택한 숙소의 원래 평점 척도, 리뷰 수, 온천·객실 시설과 확인 근거</caption><TableHeader><TableRow><TableHead scope="col">비교 항목</TableHead>{ids.map(id=>{const hotel=byId.get(id),n=hotel?displayNames(hotel.names):null;return <TableHead key={id} scope="col"><button ref={element=>{if(element)removeButtons.current.set(id,element);else removeButtons.current.delete(id)}} className="comparison-remove" onClick={()=>remove(id)} aria-label={(n?.title??id)+' 비교에서 빼기'}><X size={18}/></button>{hotel&&n?<><div className="comparison-image"><HotelPhoto hotel={hotel} loading="lazy"/></div><button className="comparison-hotel-name" onClick={()=>onDetail(id)}>{n.title}</button>{n.ja&&<span lang="ja">{n.ja}</span>}<small>{hotel.location.label}</small><HotelLifecycleNote hotel={hotel} compact/></>:<><b>{id}</b><span>기록을 찾을 수 없습니다.</span></>}</TableHead>})}</TableRow></TableHeader><TableBody>
       {rows.filter(row=>!diffOnly||states.get(row.key)?.kind==='differs').map(row=>{const state=states.get(row.key),expanded=opened.includes(row.key);return <Fragment key={row.key}><TableRow className={state?.kind==='differs'?'comparison-row-diff':undefined}><TableHead scope="row">{row.head}{state?.kind==='differs'?<span className="comparison-diff-tag"><Diff size={14} aria-hidden="true"/>다름</span>:state?.kind==='undecided'?<span className="comparison-undecided">판단 보류{state.unknown>0&&` · 미확인 ${state.unknown}곳`}</span>:null}<button type="button" className="comparison-expand" aria-expanded={expanded} aria-controls={'comparison-evidence-'+row.key} onClick={()=>toggleRow(row.key)}><span className="sr-only">{row.label} </span>근거<ChevronDown size={14} aria-hidden="true"/></button></TableHead>{cells(row)}</TableRow>
        {expanded&&<TableRow className="comparison-evidence" id={'comparison-evidence-'+row.key}><TableCell colSpan={ids.length+1}><ul>{ids.map(id=>{const hotel=byId.get(id);return <li key={id}><b>{hotel?displayNames(hotel.names).title:id}</b>{hotel?row.render(hotel):missing}</li>})}</ul></TableCell></TableRow>}</Fragment>})}
       {diffOnly&&!differing&&<TableRow><TableCell colSpan={ids.length+1} className="comparison-diff-none">확인된 값이 다른 항목이 없습니다. 미확인 항목은 같거나 다르다고 판단하지 않았습니다.</TableCell></TableRow>}
      </TableBody></Table>
     </TableScrollRegion>
     {diffOnly&&<p className="comparison-diff-hidden">같거나 판단 보류인 항목 {states.size-differing}개와 참고 항목 {rows.length-states.size}개(Google Maps·주소·온천수 안내)를 숨겼습니다.</p>}
     <p className="comparison-note">같은 숙소가 출처별 기록으로 남아 있을 수 있습니다. ‘확인 필요’는 ‘없음’과 다릅니다. Google 평점과 사진은 연결된 지도에서 확인하세요. 객실탕은 예약할 객실 타입의 안내를 다시 확인하세요.</p>
    </>}
   </>}
  </div>
 </SheetContent></Sheet>;
}
