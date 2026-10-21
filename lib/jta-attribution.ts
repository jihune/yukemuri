// D08 PR 1: what the card and the detail sheet say about a Japan Tourism Agency registration
// (lib/jta-registration.ts links it when the search snapshot is built; a card carries the
// registration number as `jta`). Apart from the lists, so the page never loads them;
// scripts/check-jta-registration.mjs keeps the addresses equal to data/jta-registered.json's.
export const jtaKind=(number:string)=>number.startsWith('R')?'ryokan':'hotel';
export const JTA_LABEL={hotel:'관광청 등록 호텔',ryokan:'관광청 등록 료칸'} as const;
export const JTA_MEANING='일본 국제관광호텔정비법에 따라, 외국인 여행자가 안심하고 묵을 수 있도록 시설과 접객 기준을 갖춰 일본 관광청에 등록한 숙소입니다. 등록은 숙소가 스스로 신청하는 제도라서 이 표시가 없다고 나쁜 숙소라는 뜻은 아닙니다. 숙소 이름과 주소가 관광청 목록과 맞는 곳에만 표시합니다.';
// PDL1.0 1.1: the source, and that and by whom it was processed.
export const JTA_NOTE='‘관광청 등록 호텔·료칸’ 표시는 관광청 목록을 유케무리가 숙소 이름과 주소로 이어 붙여 만들었습니다.';
export const JTA_ATTRIBUTION='「国際観光ホテル整備法 登録ホテル一覧・登録旅館一覧」（観光庁）を加工して作成';
export const JTA_LINKS=[{label:'観光庁 登録ホテル・旅館',url:'https://www.mlit.go.jp/kankocho/seisaku_seido/kokusaikankohotel/index.html'},{label:'公共データ利用規約（第1.0版）',url:'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0'}] as const;
