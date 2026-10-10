# 출처별 수집·표시 우선순위

| 정보 | 우선 출처 | 보완 출처와 처리 |
|---|---|---|
| 평점·리뷰 수 | Trip.com, Google Maps | 두 출처를 각각 표시. Trip 10점·Google 5점 유지. 없으면 Jalan·Rakuten의 확인된 점수 표시 |
| 호텔·객실·온천 시설과 설명 | Jalan | 확인한 항목은 Jalan 우선, 미확인 항목만 공식 안내·Trip 자료로 보완 |
| 숙소 대표사진 | Trip.com, Google Maps | Trip → Google → Jalan → 공식 자료 순으로 표시, 실패하면 다음 확인 사진 사용 |

점수를 환산하거나 서로 다른 공급자의 리뷰 수를 더하지 않는다. 일반 목록의 기본 평점 필터는 Trip.com이며 Jalan 필터도 유지한다. Google 평점·사진은 연결된 숙소 상세를 열 때 조회한다. Google 점수로 전국 목록을 일괄 정렬하는 기능은 제공하지 않는다.

## 동일 숙소 연결과 원본 보존

`hotel_source_groups`에는 기준 숙소 ID, 정확한 Trip/Jalan ID, 확인한 Google Place ID와 동일 숙소·동일 판매 범위의 검토 근거만 저장한다. 기존 수동 검증 숙소의 정확한 상세 링크는 최초 1회 가져온다. 다른 후보는 이름 유사도만으로 연결하지 않고 원어명·주소 또는 공식 링크·판매 객실 범위를 대조한다. 별관·별도 객실 재고·리브랜딩 후보는 확인 전 연결하지 않는다.

원출처별 `hotels.payload`, 기존 ID와 즐겨찾기를 유지한다. 읽을 때 연결 자료를 조합하고 검색용 평점·시설 열에 같은 우선순위를 적용한다. 수집으로 연결 자료가 바뀌면 관련 숙소의 검색 열도 갱신한다. 연결을 새로 저장·해제하면 기존 검색 세션을 만료한다. 시설이 `someRooms`면 일부 객실이라는 범위를 유지하며, 외부 온천 이용 안내만으로 숙소 자체 온천을 확정하지 않는다. 더 우선인 확인 자료가 없는 항목은 기존 검증 자료로 보완한다.

보호된 `/api/hotel-source-groups`의 GET은 100개씩 `next` 커서로 조회한다. PUT은 `source-group-contract.ts` 형식의 검토 근거를 요구하며 다른 숙소 연결·오래된 근거·미확인 동일성·평점/사진 본문을 거절한다. DELETE의 `hotelId`는 연결만 해제하고 원래 숙소·즐겨찾기를 지우지 않는다.

```bash
python scripts/crawler/update-source-groups.py
```

Sites에서 확인한 동일 Site의 `{url,token}`을 숨긴 표준입력으로 보내 현재 연결을 읽는다. 저장 시에는 `patches`에 `hotelId, tripHotelId?, jalanHotelId?, googlePlaceId?, matchedName, sourceUrl, sourceLabel, identityEvidence, sameInventory:true, checkedAt`를 전달한다. 스크립트가 연결 근거와 상세 응답을 다시 읽는다. 비밀을 명령 인자·파일·자동 작업 설명·원출처 요청에 넣지 않는다.

## Google Maps 연결 상태

Google Places API (New)의 서버 조회 경로를 준비했다. 기본은 꺼져 있으며 현재 키를 새로 설정하거나 과금 API를 활성화하지 않았다. 환경변수 `GOOGLE_PLACES_API_KEY`와 `GOOGLE_PLACES_ENABLED=true`, 검토한 해당 숙소의 `googlePlaceId`가 모두 필요하다. API 키는 서버 비밀로 관리한다. 연결 전 `/api/hotels/{id}/google`은 `not_connected`, 동일성 연결이 없으면 `not_mapped`를 반환하고 사진·점수를 만들지 않는다.

`GOOGLE_PLACES_DAILY_REQUEST_LIMIT`의 기본값은 하루 100회, 허용 설정 범위는 1~1000회다. 일본 날짜를 기준으로 DB에서 요청 예산을 원자적으로 예약하며 상세와 사진 미디어 요청을 각각 1회로 센다. 이 숫자는 과금액 제한이 아니므로 실제 활성화 시 Google Cloud의 API 제한·예산도 설정해야 한다. UI는 상세를 연 숙소만 조회하며 전국 Google 수집·백그라운드 프리페치는 하지 않는다.

필드 마스크는 `id,rating,userRatingCount,googleMapsUri,photos`이며 응답 ID가 확인한 Place ID와 맞는지 검사한다. 사진은 최신 API 응답의 첫 대표 후보를 사용한다. 미디어 주소만 반환하고 키·사진 리소스명은 브라우저로 보내지 않는다. Google 출처와 사진 저자 표기를 유지한다. 응답은 `no-store`, 평점·사진·리소스명을 D1 원관측/검색/내보내기/애플리케이션 캐시에 영속 저장하지 않는다. Place ID와 독립적으로 조사한 동일성 근거만 저장한다. 기존 OpenStreetMap 지도에 Google API 자료를 붙이지 않는다.

공식 참고: [Places 정책](https://developers.google.com/maps/documentation/places/web-service/policies), [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details), [Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos).

## 자동 수집

기존 120페이지 예산 중 상세는 Jalan 48페이지, Trip 24페이지로 배정하고 목록 24·재확인 24를 유지한다. Jalan은 객실·온천, Trip은 평점·대표사진을 보강한다. 각 권역에서 아직 상세가 없는 확인된 연결 출처를 먼저 처리하고 기존 온천마을/지역 순서와 전국 예약 몫을 유지한다. 막힌 공급자의 예산을 억지로 채우지 않는다. Google Maps는 이 수집기 페이지 예산에 포함하거나 HTML 스크래핑으로 대체하지 않는다.

코드 변경은 게시하고, 이후 데이터 수집·연결 근거 갱신에는 재게시가 필요 없다.
