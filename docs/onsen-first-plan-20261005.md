# 유케무리의 온천 탐색·숙소 변화 추적 계획

2026-10-05 사용자 결정: 일본 온천 탐색을 제품의 중심에 둔다. 요금·공실은 연결된 예약 사이트에서 확인한다. 즐겨찾기는 로그인과 계정 동기화 없이 브라우저별로 유지한다. 유케무리 이름에 특정 지역을 붙이지 않는다.

## 수집 순서와 완료 기준

| 순서 | 범위 | 이 단계에서 먼저 확인할 내용 |
| --- | --- | --- |
| 최우선 | 하코네·유후인, 전통 온천마을 | 실제 숙소 목록, 운영 상태, 온천수·전세탕·객실탕의 출처와 적용 범위 |
| 1차 | 규슈 7현, 홋카이도, 오키나와 본섬·미야코지마·이시가키 | 목록 신규 발견, 상세·시설 보강, 공식 개업·휴관·폐업 안내 |
| 2차 | 오사카·고베 | 전통 온천마을 아리마·기노사키는 앞 단계에 승격, 도시 숙소는 그다음 |
| 3차 | 도쿄와 인근 가나가와·지바·사이타마·야마나시·시즈오카 | 하코네는 최우선으로 분리, 나머지는 후속 확장 |
| 병행 | 나머지 일본 | 새 목록과 오래된 상세의 확인이 멈추지 않도록 페이지 예산 일부 배정 |

`data/collection-priorities.json`이 순서와 주기를 관리한다. 현재 명시한 대표 전통 온천마을 20곳은 첫 단계로 승격한다. 등록되지 않은 전통 온천마을은 차후 검증해 이 파일에 추가한다. 우선권은 원어/한국어/영어 숙소명·원래 위치·주소와 검증된 지역 목록 URL에서 계산한다. 도도부현에 붙인 검색용 관광 별칭으로 마을 소속을 추측하지 않는다. 도시·마을 검색에서도 도도부현 전체에 관광마을 이름을 붙이지 않는다.

기존 큐에 우선순위를 중단 후 재개 가능한 방식으로 보강한다. 새 URL도 같은 규칙을 사용한다. 수집기가 처리하는 매 5번째 페이지는 전국 순서로 할당한다. 이는 회당 20%를 목표로 한 예산 분배이며, 차단·대기나 예산 미달 때 정확한 20%를 보장하는 집계는 아니다. 유지보수 API는 실행기 요청의 lane을 받으므로 일반 브라우저 사용자는 수집 순서를 바꿀 수 없다.

확인 완료된 목록과 상세도 다시 방문한다. 전통 온천마을은 7일, 1차 권역은 14일, 2차는 21일, 3차는 30일, 그 외는 45일이 지나면 재확인 대상이 된다. 이 숫자는 **다시 확인할 수 있는 시점**이며 갱신 완료 보장이나 서비스 수준 약속이 아니다. 차단·대기·페이지 예산과 작업량에 따라 실제 갱신이 늦어질 수 있다. 과거 실패는 재검토하고 404/410도 최소 7일 뒤 다시 확인한다. 해외 도시로 명시적으로 제외한 작업은 다시 살리지 않는다.

## 신규·폐업·휴관·재개장

- 첫 발견일(first_seen_at), 마지막 출처 확인일(last_seen_at), 마지막 상세 확인일(last_detail_at)을 영업 상태와 별도로 기록한다. 새로 발견했다는 이유로 신규 개업이라 표시하지 않는다.
- 출처 404/410은 확인 필요 신호다. 호텔·원래 ID·평점·시설·즐겨찾기를 삭제하거나 폐업으로 자동 바꾸지 않는다. 한 선점의 재전송은 이 신호를 중복 누적하지 않는다.
- 영업·휴관·폐업 확정에는 숙소 공식 홈페이지 또는 공식 관광기관의 안내, 출처 URL, 확인일, 효력일, 원어명·주소/ID 대조 근거가 필요하다. 미래 개업/휴관 예정 정보를 현재 상태로 적용하지 않는다.
- 공식 휴관·폐업 상태는 일반 탐색과 자동완성에서 제외한다. 직접 상세와 즐겨찾기에서는 상태와 출처를 계속 보여준다. 최신 공지로 영업 재개를 확인하면 다시 탐색에 포함한다.
- 예약 사이트 목록이 다시 나타났다는 이유나 예정일이 지났다는 이유만으로 재개장 처리하지 않는다. 안내된 휴관 기간/예상 재개장 날짜가 지나면 검토 후보로 반환한다. 예정일이 없더라도 휴관 확인이 7일 이상 오래되면 재검토한다.
- 새 호텔·증축 객실·브랜드 교체·공급자별 별도 판매 객실을 구분한다. 같은 주소의 리브랜딩이나 이름 변경만으로 서로 다른 OTA 항목을 합치지 않는다. 기존 하코네 nol/Harvest 검토 기록도 유지한다.
- `hotel_lifecycle_events`에 공식 상태 변경과 원출처 누락 신호를 남긴다. 관리 체크포인트에도 상태와 이력을 포함한다. 공식 증거 갱신은 기존 연속 목록을 만료시켜 다시 검색하게 한다.

## 정기 작업 실행

현재의 6시간 주기를 유지한다. 한 실행의 수집기 페이지 예산 120을 상세 Jalan 48·Trip 24, 목록 발견 24, 기존 목록/상세 재확인 24로 배정한다. 객실·호텔·온천은 Jalan, 평점·대표사진은 Trip.com·Google Maps를 우선한다. Google Maps는 기본 비활성인 별도 상세 API 경로이며 일괄 HTML 수집에 포함하지 않는다. [출처 우선순위](source-priorities-20261005.md)를 함께 따른다. 막힌 단계를 다른 공급자에 대한 과도한 요청으로 채우지 않는다. 기존 상세 비율이 낮아도 신규 발견과 갱신 몫을 0으로 줄이지 않는다.

```bash
python scripts/crawler/update-site.py --health-only
python scripts/crawler/update-site.py --kind detail --provider jalan --max-pages 48
python scripts/crawler/update-site.py --kind detail --provider trip --max-pages 24
python scripts/crawler/update-site.py --kind list --max-pages 24
python scripts/crawler/update-site.py --refresh-only --max-pages 24
python scripts/crawler/update-lifecycle.py
```

모두 동일 Site의 `{url,token}`을 숨긴 표준입력으로 전달한다. 접근 정보는 매번 같은 project_id의 get_site에서 얻으며 원출처에 보내지 않는다. 기존 names/descriptions 스크립트도 새 주소와 과거 주소를 지원한다.

공식 개업·휴관·폐업을 연구할 때는 다음 지역 관광기관을 기본 대조 대상으로 삼고, 숙소 운영사 홈페이지를 우선한다. 이들은 자동수집 API가 아니라 수동 조사/정기 작업의 공식 확인 출처다. 협회 회원 목록 역시 지역 전체 숙소를 보장하지 않는다.

- 하코네 관광협회: https://www.hakone.or.jp/
- 유후시 관광협회: https://yufuin.gr.jp/spot/?sort=update
- 구로카와 온천 관광여관협동조합: https://www.kurokawaonsen.or.jp/
- 규슈 관광기구: https://www.visit-kyushu.com/
- 홋카이도 관광기구: https://www.visit-hokkaido.jp/
- 오키나와 관광컨벤션뷰로: https://www.okinawastory.jp/
- 미야코지마 관광협회: https://miyako-guide.net/
- 이시가키시 관광교류협회: https://www.yaeyama.or.jp/

공식 조사에서 발견한 OTA 숙소 페이지는 `update-lifecycle.py`의 `seeds:[{url,prefecture}]`로 중복 없이 큐에 추가하고, `update-site.py --url URL --kind detail --max-pages 1`로 아직 처리하지 않은 상세를 확인할 수 있다. 기존 완료 페이지는 만료 시 `--refresh-only --url URL --max-pages 1`로 재확인한다. 이 도구는 영업/시설을 추측해서 생성하는 기능이 아니다.

공식 상태를 검증했으면 `patches` 배열에 `id,state,sourceUrl,sourceKind,sourceLabel,evidence,identityEvidence,checkedAt,effectiveDate`를 넣는다. state는 operating/temporarily_closed/closed, sourceKind는 official_property/official_tourism이다. 영업 상태에는 검증한 openedAt을, 휴관에는 안내된 closedUntil(휴관 마지막 날)이나 expectedReopenAt(공식 재개장 예정일)을 선택적으로 넣을 수 있다. 마지막 휴관일을 재개장일로 저장하지 않는다. 날짜는 YYYY-MM-DD, checkedAt은 UTC ISO 날짜/시간이다. 스크립트가 저장 뒤 상세를 다시 읽어 상태와 근거를 검증한다. 오래된 확인일의 덮어쓰기는 409로 거절한다.

정기 조사 검색어는 한국어·일본어·영어를 섞어 사용한다: `地域 旅館 新規開業`, `地域 ホテル 閉館 営業終了`, `旅館 休館 リニューアル 再開`, `地域 onsen hotel opening closure`, `温泉街 旅館一覧`. 실제 확인한 개업/휴관만 저장하고 검색 스니펫만으로 확정하지 않는다.

## 이번 조사에서 확인한 사례

- 하코네 유모토 호텔: 2026-03-01~2027-06-30 전관 리뉴얼 휴관. Jalan 348699와 공식 안내 주소 `箱根町湯本茶屋97`를 대조했다. 예약 사이트의 숙소 페이지가 남아 있으므로 출처 존재와 영업 상태를 분리해야 한다.
  https://www.hakone-yumotohotel.com/news/リニューアル工事に伴う休館のご案内.html
- 레지나 리조트 유후인 구누기노모리: 공식 개업일 2025-11-16. Jalan 389144 주소 `湯布院町川上460-6`와 공식 안내를 대조했다. 같은 리조트의 Kakoi 구역은 별도 주소 447-1에 2026-07-03 개업했으므로 본관 개업일을 이 날짜로 덮어쓰지 않는다.
  https://www.regina-resorts.com/yufuin/main/news/2580
  https://www.regina-resorts.com/yufuin/kakoi/news/detail.php?id=2826

## 넓은 비교 조사에서 가져온 설계

Booking.com의 공식 변경 추적 문서는 개업/일시 휴업/영구 폐업을 구분하고 바뀐 숙소의 상세를 다시 가져오는 방식을 설명한다. 여기서는 계정/API를 연결하지 않고 상태 분리와 변경 대상 재확인 방식만 참고했다.
https://developers.booking.com/demand/docs/accommodations/look-accommodation-changes

Reddit r/dataengineering/r/webscraping, Hacker News, Stack Overflow, Software Engineering Stack Exchange에서 추출 실패·원출처 삭제·증분 수집·데이터 품질/스키마 변경을 여러 검색어로 비교했다. 커뮤니티 사례는 설계 아이디어와 실패 사례로만 사용했다. 빈 결과/삭제된 목록을 실제 숙소 폐업으로 간주하는 구현은 채택하지 않았다.
https://www.reddit.com/r/dataengineering/comments/1seu8mg/how_do_you_catch_bad_data_from_scrapers_before_it/
https://stackoverflow.com/questions/37718176/web-scraping-how-to-identify-records-in-the-database-but-removed-on-the-web
https://news.ycombinator.com/item?id=40176738
https://softwareengineering.stackexchange.com/questions/141367/how-to-build-a-web-service-to-detect-content-changes-at-an-external-website

## 앞으로의 단계

1. 하코네·유후인·구로카와 대표 목록을 공식 협회/숙소 홈페이지와 대조해 누락과 장기 휴관을 줄인다. 마을별 상세/온천수/객실탕 확인 비율, 오래된 항목, 출처 없는 영업 상태를 함께 점검한다.
2. 규슈·홋카이도·오키나와/미야코지마/이시가키에서 같은 대조를 확장한다. 섬의 일반 스파·대욕탕·리조트 외부 온천 입장권을 숙소 자체의 천연온천으로 오인하지 않는다.
3. 오사카·고베, 도쿄 인근으로 확장하며 공식 신규/폐업 안내 감시 대상을 계속 보강한다. 숙소 매핑은 이름·주소·좌표와 판매 범위를 검토한 뒤 결정한다.

현재 방향에서 추가 사용자 결정은 필요 없다. 전국 모든 신규·폐업 숙소를 빠짐없이 즉시 반영하려면 완전한 공식 목록이나 공급자 변경 피드가 필요하다. 현재는 공개 페이지와 공식 공지 조사에 근거해 지속적으로 보강하는 단계다. 유료/제휴 API 도입은 향후 실제 완전성 또는 지연 문제가 확인될 때 별도로 선택한다.

운영 데이터에서 최초 검색 색인 정비가 화면 요청을 지연시키는 사례를 확인해, 지역 검색 및 수집 우선순위 정비를 보호된 유지보수 단계로 분리했다. 각 500건 단위로 저장·재개하고 원본 수집 자료는 보존한다. 정기 수집이 정비 완료를 먼저 확인한다.

미야코지마 실제 검토에서 Jalan 385325의 온천 항목은 호텔 자체 욕탕이 아니라 리조트 공용 ‘시기라 황금온천’ 및 별도 입장료 안내였다. 수집 단계와 과거 자료 해석 단계 모두 이 명시적 안내를 식별해 숙소 내 천연온천·노천탕·전세탕 확인으로 사용하지 않는다. 원래 온천 안내와 입장료 조건은 보존하고 상세에 외부/리조트 공용 시설 안내를 표시한다. 별도로 확인된 객실탕 정보와 공식 출처의 숙소 내 시설 정보는 유지한다. 과거 저장된 시설 검색용 열도 유지보수에서 100개씩 수정하며 원본 payload는 바꾸지 않는다.
공식 일일 온천 시설 확인: https://act.shigira.com/top/hotspring?lng=ja-JP
