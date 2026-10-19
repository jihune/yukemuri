// The address dictionary's required credit (D06): its README asks for this
// wording where users can see it, for as long as the site uses its points.
// Shown in the page footer (components/hotel-explorer.tsx); checked verbatim
// by scripts/check-snapshot-geo.mjs against the built page.
export const GEO_ATTRIBUTION='「位置参照情報（大字町丁目・街区レベル）令和5年」（国土交通省）、「Geolonia 住所データ」（株式会社Geolonia）、「アドレス・ベース・レジストリ」（デジタル庁）をもとに、株式会社情報試作室が加工した jageocoder 用住所データベース（街区レベル）を利用';
export const GEO_NOTE='지도 위치 중 일부는 주소·우편번호·지명으로 찾은 대략 위치이며 실제 숙소 위치와 다를 수 있습니다. 정확한 위치는 숙소 상세의 예약 사이트에서 확인하세요.';
export const GEO_LINKS=[{label:'Geolonia 住所データ',url:'https://geolonia.github.io/japanese-addresses/'},{label:'アドレス・ベース・レジストリ 利用規約',url:'https://www.digital.go.jp/policies/base_registry_address_tos/'}] as const;
// Overture Maps Places (D08): approximate points moved to a matched place
// (data/overture-geo.json). The wording is docs.overturemaps.org/attribution's
// (read 2026-10-19) for each first source in the extract. CDLA Permissive 2.0 asks
// for its text beside the shared data, Apache 2.0 for its text and Foursquare's
// NOTICE.txt; all three are served from public/licenses/.
// Shown in the footer, the data status screen and the map's attribution.
export const OVERTURE_SOURCES={meta:'Data from Meta. Available under CDLA Permissive 2.0.',Microsoft:'Data from Microsoft. Available under CDLA Permissive 2.0.',Foursquare:'Data from Foursquare. Copyright 2024 Foursquare Labs, Inc. All rights reserved. Available under Apache 2.0. Foursquare data was transformed to the Overture schema. Changed: 2026-03-18. NOTICE.txt.'} as const;
export const OVERTURE_ATTRIBUTION='Overture Maps Foundation, overturemaps.org. '+Object.values(OVERTURE_SOURCES).join(' ');
export const OVERTURE_NOTE='대략 위치 중 일부는 숙소 이름·주소가 맞는 Overture Maps 장소의 위치로 고쳤습니다.';
export const OVERTURE_LINKS=[{label:'Overture Maps',url:'https://overturemaps.org/'},{label:'CDLA Permissive 2.0 전문',url:'/licenses/CDLA-Permissive-2.0.txt'},{label:'Apache 2.0 전문',url:'/licenses/Apache-2.0.txt'},{label:'Foursquare NOTICE.txt',url:'/licenses/Foursquare-NOTICE.txt'}] as const;
export const OVERTURE_MAP_CREDIT='<a href="https://overturemaps.org/" target="_blank" rel="noopener noreferrer">Overture Maps</a>';
