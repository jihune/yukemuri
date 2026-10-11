'use client';
import {useEffect,useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {apiJson} from '@/lib/api-client';
import {COLLECTION_PROVIDER_LABELS,COLLECTION_ISSUE_LABELS,collectionState,formatCollectionTime,type CollectionStatus} from '@/lib/collection-status';
import type {SnapshotCoverage} from '@/lib/search-snapshot';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import TableScrollRegion from './table-scroll-region';

export default function CollectionStatusPanel({coverage}:{coverage:SnapshotCoverage}){
 const [open,setOpen]=useState(false),[revision,setRevision]=useState(0),[data,setData]=useState<CollectionStatus|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!open)return;
  const request=new AbortController();setLoading(true);setError('');
  apiJson<CollectionStatus>('/api/collection-status',{signal:request.signal}).then(value=>{if(!request.signal.aborted)setData(value)}).catch(()=>{if(!request.signal.aborted)setError('수집 현황을 불러오지 못했습니다. 다시 확인해 주세요.')}).finally(()=>{if(!request.signal.aborted)setLoading(false)});
  return()=>request.abort();
 },[open,revision]);
 return <details className="coverage-panel" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>전국 수집 현황</summary>
  <div className="collection-overview">
   <div className="collection-toolbar"><span aria-live="polite">{loading?'수집 현황 확인 중…':data?`현황 조회 ${formatCollectionTime(data.measuredAt)} · 한국시간`:'출처별 최근 확인과 대기 상태'}</span><button onClick={()=>{if(!loading)setRevision(value=>value+1)}} aria-disabled={loading} aria-label="출처별 수집 현황 새로고침"><RotateCcw size={14}/>현황 새로고침</button></div>
   {error&&<p className="collection-error" role="alert">{error}{data&&' 아래는 마지막 조회 결과입니다.'}</p>}
   {loading&&!data&&<p role="status">저장된 수집 기록을 확인하고 있습니다.</p>}
   {data&&<>
    {data.quality?.records===0&&<p role="status">아직 저장된 수집 기록이 없습니다. 수집 후 현황을 다시 확인해 주세요.</p>}
    {data.quality&&<><dl className="collection-quality" aria-label="저장된 온천 정보 확인량">{[
     ['상세 정보 저장',data.quality.detailRecords],['온천·욕탕 조건 확인',data.quality.bathKnownRecords],
     ['천연온천수 사용 확인',data.quality.naturalOnsenRecords],['객실 온천 확인',data.quality.roomOnsenRecords],
    ].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{Number(count).toLocaleString()}<small>개 기록</small></dd></div>)}</dl>
    <p className="collection-note">총 {data.quality.records.toLocaleString()}개 출처별 숙소 기록 기준입니다. 조건 확인에는 ‘없음’도 포함하며, 하이클래스 등급만 확인된 기록은 제외합니다. 객실 온천은 안내된 객실 타입에만 적용됩니다.</p></>}
    <p className="table-scroll-hint">표는 좌우로 이동할 수 있습니다. 키보드는 표에 포커스를 두고 좌우 방향키를 누르세요.</p>
    <TableScrollRegion className="collection-table-region" label="출처별 수집 상태. 좌우 방향키로 이동"><Table className="collection-table" aria-label="출처별 수집 상태"><TableHeader><TableRow><TableHead scope="col">출처</TableHead><TableHead scope="col">최근 페이지 확인</TableHead><TableHead scope="col">상세 확인</TableHead><TableHead scope="col">재시도·실패</TableHead><TableHead scope="col">상태</TableHead></TableRow></TableHeader><TableBody>{data.providers.map(provider=><TableRow key={provider.provider}><TableHead scope="row">{COLLECTION_PROVIDER_LABELS[provider.provider]}</TableHead><TableCell><time dateTime={provider.lastSuccessAt??undefined}>{formatCollectionTime(provider.lastSuccessAt)}</time></TableCell><TableCell>{provider.completedDetailPages.toLocaleString()}페이지</TableCell><TableCell>재시도 {provider.retryPages.toLocaleString()} · 실패 {provider.failedPages.toLocaleString()}</TableCell><TableCell>{collectionState(provider,data.measuredAt)}{provider.waitingUntil&&<small>{formatCollectionTime(provider.waitingUntil)} 이후 재개 가능</small>}</TableCell></TableRow>)}</TableBody></Table></TableScrollRegion>
    {data.providers.some(provider=>provider.issues.length>0)&&<ul className="collection-issues">{data.providers.filter(provider=>provider.issues.length>0).map(provider=><li key={provider.provider}><b>{COLLECTION_PROVIDER_LABELS[provider.provider]}</b> · {provider.issues.map(issue=>`${COLLECTION_ISSUE_LABELS[issue.reason]} ${issue.count.toLocaleString()}건`).join(' · ')}</li>)}</ul>}
    <p className="collection-google"><b>Google Maps</b> · {data.google.connected?'조회 설정됨 · 숙소 상세에서 요청할 때 평점·사진 확인':'미연결 · Google 평점·사진의 새 조회는 아직 시작하지 않았습니다.'}</p>
    <p className="collection-note">시각은 한국시간이며, 최근 페이지 확인은 해당 출처의 마지막 성공 기록입니다. 모든 숙소의 확인일이 같다는 뜻은 아닙니다. 예약 실행은 지연될 수 있고, 오류가 발생한 출처는 정해진 대기 후 이어갑니다. 이 화면은 저장된 기록만 조회합니다.</p>
   </>}
  </div>
  <p>현재 {coverage.prefectures} / 47개 도도부현에 숙소 항목이 있습니다. 출처별 숙소 링크 {coverage.discoveredDetailUrls.toLocaleString()}개를 발견했고, 상세 페이지 {coverage.completedDetailPages.toLocaleString()}개를 자동 확인했습니다. 같은 숙소가 여러 예약 사이트에 있으면 별도 항목으로 집계합니다. 미처리·재시도 {coverage.pending.toLocaleString()}건, 실패 {coverage.failed.toLocaleString()}건입니다. 하코네·유후인과 전통 온천마을을 먼저 보강하고, 규슈·홋카이도·오키나와 권역, 오사카·고베, 도쿄 인근 순으로 수집합니다. 신규 발견과 개업일은 구분하며, 공식 확인된 폐업·장기 휴관 숙소는 일반 탐색에서 제외하고 즐겨찾기에는 상태를 남깁니다. 전국 모든 숙소의 최신 상태를 아직 확보한 것은 아닙니다.</p>
 </details>;
}
