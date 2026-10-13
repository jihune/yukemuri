// The address dictionary's required credit (D06): its README asks for this
// wording where users can see it, for as long as the site uses its points.
// Shown in the page footer (components/hotel-explorer.tsx); checked verbatim
// by scripts/check-snapshot-geo.mjs against the built page.
export const GEO_ATTRIBUTION='「位置参照情報（大字町丁目・街区レベル）令和5年」（国土交通省）、「Geolonia 住所データ」（株式会社Geolonia）、「アドレス・ベース・レジストリ」（デジタル庁）をもとに、株式会社情報試作室が加工した jageocoder 用住所データベース（街区レベル）を利用';
export const GEO_NOTE='지도 위치 중 일부는 주소·우편번호·지명으로 찾은 대략 위치이며 실제 숙소 위치와 다를 수 있습니다. 정확한 위치는 숙소 상세의 예약 사이트에서 확인하세요.';
export const GEO_LINKS=[{label:'Geolonia 住所データ',url:'https://geolonia.github.io/japanese-addresses/'},{label:'アドレス・ベース・レジストリ 利用規約',url:'https://www.digital.go.jp/policies/base_registry_address_tos/'}] as const;
