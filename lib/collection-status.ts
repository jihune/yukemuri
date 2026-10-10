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
};
export const COLLECTION_PROVIDER_LABELS={jalan:'자란넷',trip:'Trip.com'};
export const COLLECTION_ISSUE_LABELS:Record<CollectionIssue,string>={
 missing_page:'페이지 없음',access_limited:'접근 제한·요청 대기',connection:'연결 오류',source_format:'자료 형식 확인 필요',source_review:'이동 주소·수집 규칙 확인 필요',other:'기타 요청 오류',
};
export function formatCollectionTime(value:string|null){
 if(!value||!Number.isFinite(Date.parse(value)))return '확인 기록 없음';
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
export function collectionState(provider:ProviderCollectionStatus,measuredAt:string){
 if(provider.waitingUntil&&Date.parse(provider.waitingUntil)>Date.parse(measuredAt))return '출처 요청 대기';
 if(provider.activePages>0)return '확인 중';
 if(provider.pendingPages>0||provider.retryPages>0||provider.failedPages>0)return '다음 수집 대기';
 return provider.lastSuccessAt?'대기 중':'확인 기록 없음';
}
