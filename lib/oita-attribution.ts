// D08 PR 3: what the detail sheet says about an Oita Prefecture lodging business permit
// (lib/oita-permits.ts links it when the search snapshot is built; a card carries it as `oita`).
// Apart from the list, so the page never loads it; scripts/check-oita-permits.mjs keeps the
// addresses equal to data/oita-ryokan-permits.json's.
export const OITA_LABEL='오이타현 여관업 허가 목록에 있음';
export const OITA_LIMIT='목록에 없다고 무허가나 폐업이라는 뜻은 아닙니다. 오이타시 숙소는 시가 따로 관리해서 이 목록에 없고, 목록 시점 뒤에 받은 허가는 빠져 있습니다.';
// The month the list is as of (2026-03), as the catalog gives it: 2026년 3월 시점 목록.
export const oitaAsOf=(month:string)=>`${month.slice(0,4)}년 ${Number(month.slice(5,7))}월 시점 목록`;
// CC BY 4.0: the source, the license, and that the list was processed.
export const OITA_NOTE='‘오이타현 여관업 허가’ 표시는 오이타현 목록을 유케무리가 숙소 이름과 주소로 이어 붙여 만들었습니다.';
export const OITA_ATTRIBUTION='「旅館業営業許可施設一覧」（大分県）を加工して作成';
export const OITA_LINKS=[{label:'大分県 旅館業営業許可施設一覧',url:'https://data.bodik.jp/dataset/440001_ryokan_business'},{label:'CC BY 4.0',url:'https://creativecommons.org/licenses/by/4.0/deed.ja'}] as const;
