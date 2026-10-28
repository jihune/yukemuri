export type CollectionProvider='jalan'|'trip';
export type CollectionIssue='missing_page'|'access_limited'|'connection'|'source_format'|'source_review'|'other';
export type ProviderCollectionStatus={
 provider:CollectionProvider;
 lastSuccessAt:string|null;
 completedDetailPages:number;
 pendingPages:number;
 retryPages:number;
 failedPages:number;
 activePages:number;
 waitingUntil:string|null;
 issues:{reason:CollectionIssue;count:number}[];
};
export type CollectionStatus={
 measuredAt:string;
 quality:{records:number;detailRecords:number;bathKnownRecords:number;naturalOnsenRecords:number;roomOnsenRecords:number};
 providers:ProviderCollectionStatus[];
 google:{connected:boolean;mode:'on_demand'};
 // U06: only in the snapshot's status.json (lib/search-snapshot-build.ts collectionFill), never
 // in /api/collection-status; absent from snapshots built before it.
 fill?:CollectionFill;
};
// U06 (docs/U06-20261015.md 4절). Places: one list entry, a provider's hotel record (the
// snapshot's hotels). Pages: crawl_jobs rows, detail and list apart. Every row splits its
// places three ways that add up to the scope's records: filled, absent at the source (the
// source was read and has no such value), and not yet filled (not read, not readable, not
// translated). Unknown is never counted as absent.
export type FillRowKey='detail'|'bath'|'rooms'|'years'|'rating'|'photo'|'nameKo'|'descKo';
export type FillCounts={filled:number;none:number;empty:number};
export type FillScopeKey='all'|'jalan'|'trip';
// geo: places per map precision grade, index = GEO_GRADE (lib/search-snapshot.ts).
// staleTranslations: places whose only translation is of an earlier source text (in descKo empty).
export type FillScope={records:number;rows:Record<FillRowKey,FillCounts>;geo:number[];staleTranslations:number};
export type PageCounts={done:number;pending:number;retry:number;failed:number};
// trend: the last 30 UTC days' rows that each collection's count keeps, one a day
// (DAILY_PROGRESS_KEY; the snapshot deploy after a run stores it since C07 plan 2, the
// collector's end-of-run read before): places and detail pages done and found per provider,
// as at the day's last run. usage: the whole account's Cloudflare usage today (the free limits are per account),
// read once when the snapshot is built; account is null when it could not be read. Both are
// absent from snapshots built before them.
export type TrendDay={date:string;records:number;pages:Record<CollectionProvider,{done:number;total:number}>};
export type UsageCounts={rowsRead:number|null;rowsWritten:number|null;requests:number|null};
export type UsageToday={measuredAt:string;date:string;limits:{rowsRead:number;rowsWritten:number;requests:number};account:UsageCounts|null};
export type CollectionFill={scopes:Record<FillScopeKey,FillScope>;pages:Record<CollectionProvider,{detail:PageCounts;list:PageCounts;detailChecked24h:number}>;trend?:TrendDay[];usage?:UsageToday};
export const DAILY_PROGRESS_KEY='daily-progress:';
export const FILL_ROWS:{key:FillRowKey;group:string;label:string;states:[string,string,string];note:string}[]=[
 {key:'detail',group:'시설 정보',label:'상세 정보',states:['출처 상세 페이지를 받음','해당 없음','목록 정보만 있음'],note:'탕·객실·연도는 상세 페이지에서만 나옵니다.'},
 {key:'bath',group:'시설 정보',label:'탕 조건',states:['13개 탕 항목 중 하나 이상 확인(없음 포함)','지금 규칙으로 읽은 자란넷 상세에 탕 표기가 없음','확인 전'],note:'탕 조건은 자란넷 상세에서만 읽습니다. Trip.com 곳은 비어 있습니다.'},
 {key:'rooms',group:'시설 정보',label:'객실 정보',states:['객실 수나 객실 타입·사진 있음','지금 규칙으로 읽은 자란넷 상세에 객실 정보가 없음','확인 전'],note:'Trip.com은 읽은 규칙을 나타내는 표시가 없어 없음과 확인 전을 나누지 않습니다.'},
 {key:'years',group:'시설 정보',label:'설립·리모델링 연도',states:['연도 있음','자란넷 페이지에는 연도 칸이 없음','Trip.com 상세 전이거나 표기 없음'],note:'설립·리모델링 연도는 Trip.com에만 있습니다.'},
 {key:'rating',group:'시설 정보',label:'평점',states:['Trip.com이나 자란넷 평점 있음','받은 페이지에 평점이 없음','해당 없음'],note:'원래 척도(Trip.com 10점, 자란넷 5점) 그대로 보입니다.'},
 {key:'photo',group:'시설 정보',label:'대표 사진',states:['사진 있음','받은 페이지에 사진이 없음','해당 없음'],note:'사진 저작권은 원출처에 있습니다.'},
 {key:'nameKo',group:'한국어',label:'한국어 이름',states:['한국어 이름 있음','찾아봤지만 확인된 한국어 이름이 없음','아직 찾아보지 않음'],note:'Trip.com 한국어 페이지나 확인한 출처의 이름입니다.'},
 {key:'descKo',group:'한국어',label:'한국어 설명',states:['한국어 원문이거나 지금 원문의 번역이 있음','출처 설명이 없음','번역 전(원문이 바뀐 옛 번역 포함)'],note:'설명 번역은 지금 정기적으로 추가하지 않습니다.'},
];
export const GEO_GROUPS=[
 {label:'건물 위치',grades:[1,6,7],desc:'출처 좌표, Wikidata, Overture'},
 {label:'번지 블록',grades:[2],desc:'주소의 번지 묶음'},
 {label:'동네',grades:[3],desc:'주소의 오아자 중심'},
 {label:'넓은 범위',grades:[4,5],desc:'시정촌·도도부현 중심'},
];
export const COLLECTION_PROVIDER_LABELS={jalan:'자란넷',trip:'Trip.com'};
export const COLLECTION_ISSUE_LABELS:Record<CollectionIssue,string>={
 missing_page:'페이지 없음',access_limited:'접근 제한·요청 대기',connection:'연결 오류',source_format:'자료 형식 확인 필요',source_review:'이동 주소·수집 규칙 확인 필요',other:'기타 요청 오류',
};
export function formatCollectionTime(value:string|null){
 if(!value||!Number.isFinite(Date.parse(value)))return '확인 기록 없음';
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
