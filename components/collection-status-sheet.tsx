'use client';
import {useEffect,useRef,useState,type KeyboardEvent,type RefObject} from 'react';
import {RotateCcw,X} from 'lucide-react';
import {Sheet,SheetContent,SheetTitle,SheetDescription,SheetClose} from '@/components/ui/sheet';
import {GEO_ATTRIBUTION,GEO_NOTE,GEO_LINKS,OVERTURE_ATTRIBUTION,OVERTURE_NOTE,OVERTURE_LINKS} from '@/lib/geo-attribution';
import {JTA_ATTRIBUTION,JTA_NOTE,JTA_LINKS} from '@/lib/jta-attribution';
import {OITA_ATTRIBUTION,OITA_NOTE,OITA_LINKS} from '@/lib/oita-attribution';
import {COLLECTION_PROVIDER_LABELS,COLLECTION_ISSUE_LABELS,FILL_ROWS,GEO_GROUPS,formatCollectionTime,type CollectionStatus,type FillScopeKey,type TrendDay} from '@/lib/collection-status';

// U06: the data status screen. Every value comes from the snapshot's status.json, computed
// once when the snapshot is built (lib/search-snapshot-build.ts collectionFill); opening it
// reaches neither the Worker nor D1. Two units stay apart: pages (what the collector fetches)
// and places (one list entry, a provider's hotel record). docs/U06-20261015.md.
const SCOPES:{key:FillScopeKey;label:string}[]=[{key:'all',label:'전체'},{key:'jalan',label:'자란넷'},{key:'trip',label:'Trip.com'}];
const n=(value:number)=>value.toLocaleString('ko-KR');
function share(part:number,whole:number){
 if(!whole)return '0%';
 const p=part/whole*100;
 return p>0&&p<0.1?'0.1% 미만':p.toFixed(1)+'%';
}
// One stacked bar: the parts sized by count, 2px gaps, nothing drawn for an empty part.
function Bar({parts,thick}:{parts:[number,string][];thick?:boolean}){
 return <span className={'u06-bar'+(thick?' u06-bar-thick':'')} aria-hidden="true">{parts.filter(([count])=>count>0).map(([count,cls],i)=><i key={i} className={cls} style={{flexGrow:count}}/>)}</span>;
}
const DAY=86400000,dayOf=(date:string)=>Date.parse(date+'T00:00:00Z'),dateLabel=(date:string)=>`${Number(date.slice(5,7))}월 ${Number(date.slice(8,10))}일`;
// Series colours: categorical slots 1 and 2 of the dataviz reference palette, checked with its
// validator on the white surface (all checks pass; the site has no dark theme).
const SERIES=[{key:'jalan',label:'자란넷',color:'var(--u06-jalan)'},{key:'trip',label:'Trip.com',color:'var(--u06-trip)'}] as const;
// Gridlines at 1, 2 or 5 times a power of ten, at most five, the top one at or above the largest value.
function gridlines(max:number){
 const raw=Math.max(max,1)/4,unit=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].map(m=>m*unit).find(v=>v>=raw)!;
 return Array.from({length:Math.ceil(Math.max(max,1)/step)+1},(_,i)=>i*step);
}
// Detail pages done per provider, one point a UTC day with a collection run. The lines are SVG
// stretched to the plot (strokes keep 2px); dots, labels and the tooltip are HTML on top.
function TrendChart({days}:{days:TrendDay[]}){
 const [at,setAt]=useState<number|null>(null);
 const first=dayOf(days[0].date),span=Math.max(dayOf(days[days.length-1].date)-first,DAY),last=days.length-1;
 const x=(d:TrendDay)=>(dayOf(d.date)-first)/span*100;
 const lines=gridlines(Math.max(...days.flatMap(d=>SERIES.map(s=>d.pages[s.key].done)))),top=lines[lines.length-1],y=(v:number)=>100-v/top*100;
 function pick(clientX:number,box:DOMRect){const p=(clientX-box.left)/box.width*100;let best=0;days.forEach((d,i)=>{if(Math.abs(x(d)-p)<Math.abs(x(days[best])-p))best=i});setAt(best)}
 function key(e:KeyboardEvent){
  const next=e.key==='ArrowLeft'?Math.max(0,(at??last)-1):e.key==='ArrowRight'?Math.min(last,(at??last)+1):e.key==='Home'?0:e.key==='End'?last:null;
  if(next!==null){e.preventDefault();setAt(next)}
 }
 const shown=at===null?null:days[at],point=shown??days[last];
 return <div className="u06-chart">
  <ul className="u06-chart-legend">{SERIES.map(s=><li key={s.key}><i style={{background:s.color}}/>{s.label} 상세 완료 <b>{n(days[last].pages[s.key].done)}쪽</b></li>)}</ul>
  <div className="u06-plot-wrap"><div className="u06-plot" tabIndex={0} role="group" aria-label="날짜별 상세 페이지 완료 꺾은선. 화살표 키로 날짜를 고릅니다. 같은 값은 아래 표로 보기에 있습니다." onPointerDown={e=>pick(e.clientX,e.currentTarget.getBoundingClientRect())} onPointerMove={e=>pick(e.clientX,e.currentTarget.getBoundingClientRect())} onPointerLeave={e=>{if(e.pointerType==='mouse')setAt(null)}} onBlur={()=>setAt(null)} onKeyDown={key}>
   {lines.map(v=><i key={v} className="u06-gridline" style={{top:y(v)+'%'}}><span>{n(v)}</span></i>)}
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{SERIES.map(s=><polyline key={s.key} points={days.map(d=>`${x(d)},${y(d.pages[s.key].done)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}</svg>
   {shown&&<i className="u06-cross" style={{left:x(shown)+'%'}}/>}
   {SERIES.map(s=><i key={s.key} className="u06-dot" data-series={s.key} style={{left:x(point)+'%',top:y(point.pages[s.key].done)+'%',background:s.color}}/>)}
   <span className="u06-xlabel" style={{left:0}}>{dateLabel(days[0].date)}</span><span className="u06-xlabel u06-xlabel-end">{dateLabel(days[last].date)}</span>
   {shown&&<div className="u06-chart-tip" aria-hidden="true" style={x(shown)>55?{right:100-x(shown)+'%'}:{left:x(shown)+'%'}}><b>{dateLabel(shown.date)}(UTC)</b>{SERIES.map(s=>{const before=at?days[at-1].pages[s.key].done:null,done=shown.pages[s.key].done;return <span key={s.key}><i style={{background:s.color}}/>{s.label}<strong>{n(done)}쪽{before!==null?` (+${n(done-before)})`:''}</strong></span>})}<span>곳<strong>{n(shown.records)}곳</strong></span></div>}
  </div></div>
 </div>;
}
// The average a day between the first and the last row shown.
function rateText(days:TrendDay[]){
 const a=days[0],b=days[days.length-1],span=Math.max(1,Math.round((dayOf(b.date)-dayOf(a.date))/DAY));
 return `${dateLabel(a.date)}부터 ${dateLabel(b.date)}까지 ${span}일 동안 상세 페이지를 하루 평균 `+SERIES.map(s=>`${s.label} ${n(Math.round((b.pages[s.key].done-a.pages[s.key].done)/span))}쪽`).join(', ')+' 받았습니다.';
}
const signed=(v:number)=>(v>=0?'+':'')+n(v);
const USAGE=[{key:'rowsRead',label:'D1 읽기',unit:'행'},{key:'rowsWritten',label:'D1 쓰기',unit:'행'},{key:'requests',label:'Worker 요청',unit:'건'}] as const;
// Mounted while open (hotel-explorer.tsx), so each opening reads status.json afresh.
export default function CollectionStatusSheet({onClose,load,opener}:{onClose:()=>void;load:(signal:AbortSignal)=>Promise<CollectionStatus>;opener:RefObject<HTMLElement|null>}){
 const [data,setData]=useState<CollectionStatus|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [scope,setScope]=useState<FillScopeKey>('all'),[table,setTable]=useState(false),[trendTable,setTrendTable]=useState(false),[loadedAt,setLoadedAt]=useState(0);
 const closeButton=useRef<HTMLButtonElement>(null),firstHeading=useRef<HTMLHeadingElement>(null),refocus=useRef(false);
 useEffect(()=>{
  const request=new AbortController();
  load(request.signal).then(value=>{if(!request.signal.aborted){setData(value);setLoadedAt(Date.now());setError('')}}).catch(()=>{if(!request.signal.aborted)setError('자료 현황을 불러오지 못했습니다. 다시 시도해 주세요.')}).finally(()=>{if(!request.signal.aborted)setLoading(false)});
  return()=>request.abort();
 },[attempt,load]);
 function retry(){if(loading)return;refocus.current=true;setLoading(true);setAttempt(a=>a+1)}
 // After a successful retry the ‘다시 시도’ button is gone; the first heading takes focus.
 useEffect(()=>{if(refocus.current&&data&&!error&&firstHeading.current){refocus.current=false;firstHeading.current.focus({preventScroll:true})}},[data,error]);
 const fill=data?.fill,s=fill?.scopes[scope];
 const detail=s?.rows.detail;
 return <Sheet open onOpenChange={value=>{if(!value)onClose()}}><SheetContent showCloseButton={false} onOpenAutoFocus={e=>{e.preventDefault();closeButton.current?.focus({preventScroll:true})}} onCloseAutoFocus={e=>{if(!opener.current?.isConnected)return;e.preventDefault();opener.current.focus({preventScroll:true})}} className="u06-sheet !w-full sm:!max-w-[960px] !gap-0">
  <div className="u06-top"><div><SheetTitle>자료 현황</SheetTitle><SheetDescription>{data?`${formatCollectionTime(data.measuredAt)} 기준 · 검색 자료를 만들 때 계산`:'출처별 수집 진행과 숙소 정보 채움'}</SheetDescription></div><SheetClose asChild><button ref={closeButton} className="icon-button u06-close" aria-label="자료 현황 닫기"><X size={22}/></button></SheetClose></div>
  <div className="u06-body">
   {error&&<div className="u06-error" role="alert"><p>{error}{data&&' 아래는 마지막으로 불러온 결과입니다.'}</p><button type="button" onClick={retry} aria-disabled={loading}><RotateCcw size={15}/>{loading?'다시 불러오는 중…':'다시 시도'}</button></div>}
   {loading&&!data&&<p className="u06-wait" role="status">자료 현황을 불러오는 중…</p>}
   {data&&!fill&&<p className="u06-wait" role="status">이 검색 자료에는 채움 현황이 없습니다. 페이지를 다시 열어 주세요.</p>}
   {fill&&s&&detail&&<>
    <div className="u06-scope" role="group" aria-label="곳 단위 줄의 출처">{SCOPES.map(item=><button key={item.key} type="button" aria-pressed={scope===item.key} onClick={()=>setScope(item.key)}><b>{item.label}</b><small>{n(fill.scopes[item.key].records)}곳</small></button>)}</div>
    <div className="u06-grid">
     <section className="u06-o1" aria-labelledby="u06-detail">
      <h2 id="u06-detail" ref={firstHeading} tabIndex={-1}>상세까지 모은 곳</h2>
      {s.records===0&&<p className="u06-lead" role="status">아직 저장된 수집 기록이 없습니다. 수집 뒤 검색 자료를 다시 만들면 채워집니다.</p>}
      <p className="u06-hero"><b>{share(detail.filled,s.records)}</b><span>{n(detail.filled)} / {n(s.records)}곳</span></p>
      <p className="u06-lead">목록의 {n(s.records)}곳 중 {n(detail.filled)}곳은 출처의 상세 페이지까지 받았습니다. 나머지 {n(s.records-detail.filled)}곳은 목록에 나온 이름·주소·평점·사진만 있습니다.</p>
      <Bar thick parts={[[detail.filled,'u06-filled'],[s.records-detail.filled,'u06-empty']]}/>
     </section>
     <section className="u06-o2" aria-labelledby="u06-pages">
      <h2 id="u06-pages">출처별 페이지 수집 <small>페이지 기준</small></h2>
      {(['jalan','trip'] as const).map(provider=>{const p=fill.pages[provider],d=p.detail,total=d.done+d.pending+d.retry+d.failed,info=data.providers.find(x=>x.provider===provider);return <div key={provider} className="u06-meter" data-provider={provider}>
       <p className="u06-head"><b>{COLLECTION_PROVIDER_LABELS[provider]} 상세 페이지</b><span><strong>{share(d.done,total)}</strong> · {n(d.done)} / {n(total)}쪽</span></p>
       <Bar parts={[[d.done,'u06-filled'],[d.retry+d.failed,'u06-none'],[d.pending,'u06-empty']]}/>
       <p className="u06-sub">대기 {n(d.pending)}쪽 · 재시도 {n(d.retry)}쪽 · 실패 {n(d.failed)}쪽 · 지난 24시간 확인 {n(p.detailChecked24h)}쪽(다시 확인 포함) · 마지막 수집 {formatCollectionTime(info?.lastSuccessAt??null)}</p>
       <p className="u06-sub">목록 페이지 {n(p.list.done)}쪽 완료 · 대기 {n(p.list.pending+p.list.retry)}쪽{p.list.failed?<> · <span className="u06-issue">실패 {n(p.list.failed)}쪽</span></>:null}</p>
       {info?.waitingUntil&&<p className="u06-sub u06-issue">출처 요청 대기 · {formatCollectionTime(info.waitingUntil)} 이후 다시 수집</p>}
       {info&&info.issues.length>0&&<p className="u06-sub u06-issue">{info.issues.map(issue=>`${COLLECTION_ISSUE_LABELS[issue.reason]} ${n(issue.count)}쪽`).join(' · ')}</p>}
      </div>})}
     </section>
     {fill.trend&&<section className="u06-o7" aria-labelledby="u06-trend">
      <h2 id="u06-trend">날짜별 수집 추이 <small>상세 페이지 완료 · 최근 30일</small></h2>
      {fill.trend.length<2?<p className="u06-lead">{fill.trend.length?`${dateLabel(fill.trend[0].date)}(UTC) 기록 하나만 있습니다. `:'아직 기록이 없습니다. '}수집이 끝날 때마다 그날 값을 한 줄 남깁니다. 이틀 치가 쌓이면 꺾은선이 보입니다.</p>:<>
       <p className="u06-lead">{rateText(fill.trend)}</p>
       <TrendChart days={fill.trend}/>
       <button type="button" className="u06-table-toggle" aria-expanded={trendTable} onClick={()=>setTrendTable(v=>!v)}>{trendTable?'표 닫기':'표로 보기'}</button>
       {trendTable&&<div className="u06-table-region" tabIndex={0} role="region" aria-label="날짜별 수집 추이 표"><table className="u06-table"><caption className="sr-only">날짜별(UTC) 상세 페이지 완료와 곳 수, 괄호는 앞 기록과의 차이</caption><thead><tr><th scope="col">날짜(UTC)</th>{SERIES.map(s=><th key={s.key} scope="col">{s.label} 상세</th>)}<th scope="col">곳</th></tr></thead><tbody>{fill.trend.map((d,i,all)=><tr key={d.date}><th scope="row">{dateLabel(d.date)}</th>{SERIES.map(s=><td key={s.key}>{n(d.pages[s.key].done)}{i?` (${signed(d.pages[s.key].done-all[i-1].pages[s.key].done)})`:''}</td>)}<td>{n(d.records)}</td></tr>)}</tbody></table></div>}
      </>}
     </section>}
     <section className="u06-o3" aria-labelledby="u06-fill">
      <h2 id="u06-fill">무엇이 찼고 무엇이 비었나 <small>목록의 {n(s.records)}곳 기준</small></h2>
      <p className="u06-legend"><span><i className="u06-filled"/>채움</span><span><i className="u06-none"/>출처에 없음</span><span><i className="u06-empty"/>아직 비어 있음</span></p>
      {FILL_ROWS.map((row,i)=>{const c=s.rows[row.key];return <div key={row.key}>
       {(i===0||FILL_ROWS[i-1].group!==row.group)&&<h3 className="u06-group">{row.group}</h3>}
       <div className="u06-row" data-row={row.key} tabIndex={0} aria-label={`${row.label}: 채움 ${n(c.filled)}곳, 출처에 없음 ${n(c.none)}곳, 아직 비어 있음 ${n(c.empty)}곳`}>
        <p className="u06-head"><b>{row.label}</b><span><strong>{share(c.filled,s.records)}</strong> · {n(c.filled)}곳</span></p>
        <Bar parts={[[c.filled,'u06-filled'],[c.none,'u06-none'],[c.empty,'u06-empty']]}/>
        <div className="u06-tip" aria-hidden="true"><p>{row.note}</p>{([['u06-filled',row.states[0],c.filled],['u06-none',row.states[1],c.none],['u06-empty',row.states[2],c.empty]] as const).map(([cls,label,count])=><span key={cls}><i className={cls}/>{label}<strong>{n(count)}곳 · {share(count,s.records)}</strong></span>)}</div>
       </div>
      </div>})}
      <button type="button" className="u06-table-toggle" aria-expanded={table} onClick={()=>setTable(v=>!v)}>{table?'표 닫기':'표로 보기'}</button>
      {table&&<div className="u06-table-region" tabIndex={0} role="region" aria-label="채움 상태 표"><table className="u06-table"><caption className="sr-only">목록의 {n(s.records)}곳 기준 채움 상태</caption><thead><tr><th scope="col">줄</th><th scope="col">채움</th><th scope="col">출처에 없음</th><th scope="col">아직 비어 있음</th></tr></thead><tbody>{FILL_ROWS.map(row=>{const c=s.rows[row.key];return <tr key={row.key}><th scope="row">{row.label}</th><td>{n(c.filled)}</td><td>{n(c.none)}</td><td>{n(c.empty)}</td></tr>})}</tbody></table>
       {s.staleTranslations>0&&<p className="u06-sub">한국어 설명의 ‘아직 비어 있음’ 중 {n(s.staleTranslations)}곳은 원문이 바뀌어 다시 번역해야 합니다.</p>}</div>}
     </section>
     <section className="u06-o4" aria-labelledby="u06-geo">
      <h2 id="u06-geo">지도 위치의 정확도</h2>
      {(()=>{const counts=GEO_GROUPS.map(g=>g.grades.reduce((sum,grade)=>sum+(s.geo[grade]??0),0)),located=counts.reduce((a,b)=>a+b,0),missing=s.records-located;return <>
       <p className="u06-lead">목록의 {n(s.records)}곳 중 {n(located)}곳은 지도에 점이 있습니다{missing>0?`(위치 없음 ${n(missing)}곳)`:''}. 그중 건물 위치는 {share(counts[0],located)}입니다.{counts[0]<located?' 나머지는 주소로 찾은 대략 위치입니다.':''}</p>
       <Bar thick parts={counts.map((count,i)=>[count,'u06-geo-'+(i+1)] as [number,string])}/>
       <ul className="u06-geo-legend">{GEO_GROUPS.map((g,i)=><li key={g.label} data-geo={i+1}><i className={'u06-geo-'+(i+1)}/><span><b>{g.label} {share(counts[i],located)}</b>{n(counts[i])}곳 · {g.desc}</span></li>)}</ul>
      </>})()}
     </section>
     {fill.usage&&(()=>{const u=fill.usage,account=u.account,hours=Math.max(0,Math.round((loadedAt-Date.parse(u.measuredAt))/3600000)),reset=new Date(loadedAt).toISOString().slice(0,10)!==u.date;return <section className="u06-o8" aria-labelledby="u06-usage">
      <h2 id="u06-usage">Cloudflare 무료 사용량 <small>{dateLabel(u.date)}(UTC) · 계정 전체</small></h2>
      {account?<>
       <p className="u06-lead">{formatCollectionTime(u.measuredAt)} 측정, {hours<1?'1시간 이내':`약 ${hours}시간 전`} 기준입니다. {reset?'그 뒤 09:00(KST)에 한도가 초기화되어 지금 쓴 양은 이와 다릅니다.':'한도는 매일 09:00(KST)에 초기화됩니다.'}</p>
       {/* null: the analytics had no row for it yet (a new UTC day, a late aggregate), never shown as 0. */}
       {USAGE.map(item=>{const used=account[item.key],limit=u.limits[item.key];return <div key={item.key} className="u06-meter" data-usage={item.key}>
        <p className="u06-head"><b>{item.label}</b><span>{used===null?<>기록 없음 · 한도 {n(limit)}{item.unit}</>:<><strong>{share(used,limit)}</strong> · {n(used)} / {n(limit)}{item.unit}</>}</span></p>
        <Bar parts={used===null?[[limit,'u06-empty']]:[[Math.min(used,limit),'u06-filled'],[Math.max(limit-used,0),'u06-empty']]}/>
        {used===null?<p className="u06-sub">측정 때 분석 자료에 오늘 기록이 아직 없었습니다. 날짜가 막 바뀌었거나 집계가 늦으면 생깁니다.</p>:used>=0.7*limit&&<p className="u06-sub u06-issue">무료 한도의 70%를 넘었습니다.</p>}
       </div>})}
      </>:<p className="u06-lead" role="status">사용량을 읽지 못함 · {formatCollectionTime(u.measuredAt)}에 검색 자료를 만들면서 Cloudflare 사용량을 조회하지 못했습니다. 한도는 매일 09:00(KST)에 초기화됩니다.</p>}
      <p className="u06-sub">무료 한도는 계정의 모든 Worker·D1을 합쳐 하루 D1 읽기 {n(u.limits.rowsRead)}행, 쓰기 {n(u.limits.rowsWritten)}행, Worker 요청 {n(u.limits.requests)}건입니다. 측정 뒤에 쓴 양은 다음 검색 자료를 만들 때 반영됩니다.</p>
     </section>})()}
     <section className="u06-o5">
      <details className="u06-defs"><summary>세는 기준</summary><dl>
       <div><dt>곳(숙소 기록)</dt><dd>목록에서 1곳으로 세는 단위이고, 출처별 숙소 기록 하나입니다. 같은 숙소가 자란넷과 Trip.com에 함께 있으면 2곳으로 셉니다. 직접 연결한 20곳만 하나로 합칩니다. 그래서 같은 출처라도 상세 페이지 비율과 상세까지 모은 곳 비율이 다를 수 있습니다.</dd></div>
       <div><dt>페이지</dt><dd>수집기가 받는 출처 페이지입니다. 상세 페이지와 목록 페이지를 따로 셉니다. 대기는 아직 받지 않은 페이지, 재시도는 오류 뒤 다시 받을 페이지, 실패는 다시 받지 않는 페이지입니다.</dd></div>
       <div><dt>채움·출처에 없음·아직 비어 있음</dt><dd>채움은 값이 있는 것, 출처에 없음은 출처를 확인했지만 그 정보가 없는 것, 아직 비어 있음은 아직 확인하지 않았거나 읽지 않았거나 번역하지 않은 것입니다.</dd></div>
       {FILL_ROWS.map(row=><div key={row.key}><dt>{row.label}</dt><dd>채움: {row.states[0]}. 출처에 없음: {row.states[1]}. 아직 비어 있음: {row.states[2]}. {row.note}</dd></div>)}
       <div><dt>수집 순서</dt><dd>하코네·유후인과 전통 온천마을을 먼저 보강하고, 규슈·홋카이도·오키나와 권역, 오사카·고베, 도쿄 인근 순으로 수집합니다. 공식 확인된 폐업·장기 휴관 숙소는 일반 탐색에서 제외하고 즐겨찾기에는 상태를 남깁니다. 전국 모든 숙소의 최신 상태를 아직 확보한 것은 아닙니다.</dd></div>
       <div><dt>날짜별 수집 추이</dt><dd>수집 실행이 끝날 때 그날(UTC) 값을 한 줄 남기고 최근 30일을 보입니다. 같은 날 여러 번 실행하면 마지막 값이 남고, 실행이 없던 날은 점이 없습니다. 상세 페이지 완료는 위 출처별 페이지 수집의 완료와 같은 기준입니다.</dd></div>
       <div><dt>Cloudflare 무료 사용량</dt><dd>검색 자료를 만들 때 Cloudflare 분석 API에서 그날(UTC) 계정 전체 사용량을 한 번 읽습니다. 화면을 열 때 다시 묻지 않습니다. 읽지 못하면 ‘사용량을 읽지 못함’으로 보입니다.</dd></div>
       <div><dt>계산 시각</dt><dd>배포와 수집 실행이 끝날 때 검색 자료를 만들면서 한 번 계산합니다. 화면을 열 때 서버에서 다시 세지 않습니다.</dd></div>
       <div><dt>Google Maps</dt><dd>{data.google.connected?'조회 설정됨 · 숙소 상세에서 요청할 때 평점·사진을 확인합니다.':'미연결 · Google 평점·사진의 새 조회는 아직 시작하지 않았습니다.'}</dd></div>
      </dl></details>
     </section>
     {/* The footer's credits, here too: the footer is hard to reach while the list keeps loading. */}
     <section className="u06-o6 u06-credits" aria-labelledby="u06-credits">
      <h2 id="u06-credits">출처 표기</h2>
      <p>사진 저작권은 원출처에 있습니다. <a href="/api/photo-credits" target="_blank" rel="noopener noreferrer">사진 출처</a></p>
      <p>{GEO_NOTE} <span lang="ja">{GEO_ATTRIBUTION}</span> {GEO_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===GEO_LINKS.length-1?')':''}</span>)}</p>
      <p>{OVERTURE_NOTE} <span lang="en">{OVERTURE_ATTRIBUTION}</span> {OVERTURE_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===OVERTURE_LINKS.length-1?')':''}</span>)}</p>
      <p>{JTA_NOTE} <span lang="ja">{JTA_ATTRIBUTION}</span> {JTA_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===JTA_LINKS.length-1?')':''}</span>)}</p>
      <p>{OITA_NOTE} <span lang="ja">{OITA_ATTRIBUTION}</span> {OITA_LINKS.map((link,i)=><span key={link.url}>{i?' · ':'('}<a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>{i===OITA_LINKS.length-1?')':''}</span>)}</p>
     </section>
    </div>
   </>}
  </div>
 </SheetContent></Sheet>;
}
