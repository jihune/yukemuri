import type {Hotel} from '@/lib/hotel-types';
export default function HotelLifecycleNote({hotel,compact=false}:{hotel:Hotel;compact?:boolean}){
 const life=hotel.lifecycle;if(!life)return null;
 const proof=life.evidence;
 const label=life.state==='closed'?'폐업 확인':life.state==='temporarily_closed'?'휴관 중':life.reviewNeeded?'영업 상태 재확인 중':proof?.openedAt?'개업일 확인':null;
 if(!label)return null;
 if(compact)return <span className={`lifecycle-badge state-${life.state}`}>{label}{proof?.openedAt?' · '+proof.openedAt:''}</span>;
 return <section className={`lifecycle-note state-${life.state}`} aria-label="숙소 운영 상태"><b>{label}</b>{proof?<><p>{proof.evidence}</p><p>{proof.closedUntil?'휴관 안내 '+proof.effectiveDate+' ~ '+proof.closedUntil+' · 실제 재개장 여부는 다시 확인합니다.':proof.expectedReopenAt?'재개장 예정 '+proof.expectedReopenAt+' · 실제 재개장 여부는 다시 확인합니다.':proof.openedAt?'개업 '+proof.openedAt:''}</p><small><a href={proof.sourceUrl} target="_blank" rel="noopener noreferrer">{proof.sourceLabel} ↗</a> · 확인 {proof.checkedAt.slice(0,10)}</small></>:<p>원출처 페이지를 다시 확인하고 있습니다. 페이지가 사라진 것만으로 폐업을 확정하지 않습니다.</p>}</section>;
}
