# 유케무리 사이트·데이터 수집 구조 검토

검토일: 2026-10-05. 기존 사이트의 실제 코드, 자동 작업 지침, 외부 운영 사례를 대조했다. 숙소 수를 늘리는 작업과 구조 개선을 구분하고, 이번에는 안정성과 데이터 품질을 먼저 개선했다.

## 판단

현재 규모에는 Python 수집기와 D1을 유지하는 편이 적절하다. 바로 Kafka·Redis·Elasticsearch를 추가하기보다, 기존 DB에서 작업 선점·오류 분류·저장 검증·품질 진단을 갖추는 것이 우선이다. 이는 이 사이트의 개인 사용 목적과 현재 코드에 근거한 판단이며, 대규모 운영에서의 일반적인 성능 보장은 아니다.

중장기적으로 중요한 목표는 ‘항목 몇 개 추가’에서 ‘사용자가 찾는 숙소의 상세·온천 근거·한국어 정보가 얼마나 확인됐는가’로 바꿔야 한다. 출처별 항목 수는 고유 숙소 수가 아니며, 47개 도도부현에 데이터가 있다고 전체 수집이 끝난 것도 아니다.

## 실제로 발견하고 고친 문제

| 문제 | 영향 | 이번 변경 |
|---|---|---|
| 대기 목록 GET은 선점하지 않음 | 수동 실행·자동 실행이 겹치면 같은 URL을 요청 | UUID를 사용하는 POST 선점, 단일 SQL UPDATE/RETURNING, 공급자별 한 작업 |
| 중단된 실행의 소유권 구분 없음 | 늦은 저장이나 재실행 결과가 새 작업에 섞일 수 있음 | 180초 임대, 만료 후 재선점, 다른 token의 저장 409 거절 |
| 완료 응답을 잃은 재전송 | 같은 관측값·시도 횟수를 다시 적용할 수 있음 | 마지막 완료 token으로 중복 저장 생략 |
| 대기가 실행기 내부에만 존재 | 새 실행기가 공급자 대기를 잊음 | DB에 공급자별 다음 요청 시각을 저장하고 모든 단계에 적용 |
| Retry-After 미반영, 오류 유형을 잃음 | 긴 서버 대기 안내를 무시하거나 원인을 구분하기 어려움 | 초·HTTP 날짜 해석, HTTP 코드 보존, 상한 있는 지수 대기와 무작위 분산 |
| 오래된 자료의 호텔 저장은 거절돼도 이름 색인은 갱신 | 잘못된 검색 별칭이 남을 수 있음 | 실제 UPSERT가 반환한 호텔만 이름 색인 갱신 |
| 수집 시각을 문자열로 비교 | 시간대가 다른 과거 자료를 최신으로 판단 가능 | SQLite julianday로 시각 비교 |
| 상세 관측값의 공급자는 검사하지만 요청 숙소 ID와 대조 부족 | 추천 카드 등 다른 숙소 자료가 섞일 위험 | 상세 URL의 ID와 관측 ID를 서버에서 직접 대조 |
| 상세 보강 조회에서 JSON URL 비교를 위해 호텔을 반복 탐색 | 큐와 호텔이 커질 때 조회 비용 증가 | URL의 공급자 ID로 호텔 PK 조회, 공급자·단계·상태 인덱스 |
| 제출한 관측 수를 저장 수로 반환 | 실제 거절된 자료도 저장된 것처럼 집계 | 실제 UPSERT 수와 제출 관측 수를 나누어 반환 |
| 현황이 수량과 일부 큐 집계 위주 | 시설·번역·명칭 품질 변화 파악이 어려움 | 인증된 집계 진단 API와 실행기 health-only 모드 |

기존 완료된 상세를 다시 보강하다 실패하면 완료 상태는 보존하고, 실패 제한에 도달한 보강은 7일 보류한다. 공급자에 403/429가 오면 최소 한 시간 쉬고 그 실행에서는 해당 공급자를 더 요청하지 않는다. 지원되는 Retry-After의 최대 범위는 7일이다. 구형 GET/PUT 실행기는 호환을 위해 남아 있으므로, 새 자동 작업은 반드시 최신 POST 선점 스크립트를 사용해야 한다.

## 조사 범위와 자료의 해석

영어·일본어·한국어 검색을 사용했다. 아래 커뮤니티 자료는 작성자의 경험과 문제 제기를 파악하는 자료다. 구현의 정확성은 SQLite·Cloudflare·Scrapy·AWS 등 공식 문서와 실제 Worker/D1 검사로 확인했다. 일부 검색 결과는 본문 접근이 실패했고, 그런 경우 검색 요약만으로 구현 근거를 확정하지 않았다.

| 범위 | 검색한 주제·키워드 | 읽고 검토한 사례 |
|---|---|---|
| Reddit r/webscraping, r/dataengineering, r/sqlite | scraper reliability, silent bad data, idempotent pipeline, incremental crawling, multilingual FTS5 | [수집기가 오류 없이 잘못된 데이터를 반환하는 문제](https://www.reddit.com/r/webscraping/comments/1ser5eo/how_do_you_monitor_your_scrapers/) |
| Hacker News | crawler architecture, HTTP vs headless browser, hotel mapping | [대규모 수집과 브라우저 비용에 대한 토론](https://news.ycombinator.com/item?id=36337473) |
| Stack Overflow·DBA Stack Exchange | OFFSET duplicates, non-unique ordering, keyset pagination | [무한 스크롤에서 OFFSET과 keyset 비교](https://dba.stackexchange.com/questions/237861/does-keyset-cursor-pagination-scale-query-performance-better-than-offset-paginat) |
| DEV Community | retry storms, distributed scraping, queue recovery | [실행 간 재시도 누적으로 생기는 문제](https://dev.to/doru_gradinaru_889c1b8687/how-i-stopped-retry-storms-from-destroying-my-scraping-budget-5b7e), [Redis 큐 예제](https://dev.to/agenthustler/web-scraping-at-scale-distributed-architecture-with-redis-queues-3hb5) |
| Zenn·Qiita | スクレイピング, リトライ, 差分, 文字コード | [장기 운영 수집기 설계](https://zenn.dev/autodataworks/articles/ab789c9f46660f), [오류별 재시도와 Retry-After](https://qiita.com/ai_engineering_note/items/7c6bde71894749ac4297) |
| Python.org·teratail | empty extraction, dynamic websites, previous/current diff | [0개 수집 진단 사례](https://discuss.python.org/t/web-scraping-crawled-0-pages-at-0-pages-min-scraped-0-items-at-0-items-min-in-python/49083), [행 단위 차이 비교 사례](https://teratail.com/questions/172659) |
| Velog·검색 결과 확장 | 크롤링, 중복 데이터, 재시도, 동시 요청 | 적합성이 낮은 결과는 설계 근거로 채택하지 않음 |
| 숙박 데이터 공급자·공식 API | hotel mapping, canonical hotel identifier, Rakuten Travel, accommodation content | GIATA, Rakuten, Booking.com, Google Places 공식 문서 |

채택한 생각은 ‘작은 지속성 큐’, ‘재실행해도 결과가 중복되지 않는 저장’, ‘실행 간 대기 유지’, ‘원문과 관측값을 검증한 후 반영’, ‘수량과 품질을 따로 측정’이다. 외부 글의 코드를 복사하거나 실행하지 않았다.

모든 페이지를 브라우저로 수집하라는 제안은 채택하지 않았다. 현재 JSON-LD와 시설표를 일반 HTTP로 읽을 수 있으므로 필요한 경우에만 별도로 검토한다. 특정 DEV 예제의 pop 다음 processing 기록은 두 단계 사이 중단을 해결하지 못하므로 그대로 사용하지 않았다. 광고성 글이나 우회 중심 조언도 현재 구조의 필요성과 분리해서 검토했다.

## 다음 개선 순서

| 우선순위 | 개선 | 설계와 완료 기준 |
|---|---|---|
| 1 | 공급자 간 같은 숙소 연결 | 공통 내부 property ID와 provider ID 매핑. 이름만으로 자동 병합하지 않고 주소·좌표·공식 링크를 대조. 높은 확신 후보부터 검토하고 즐겨찾기 ID를 보존 |
| 1 | 품질 기반 수집 우선순위 | 상세 방문·즐겨찾기·온천 필터와 관련된 항목을 먼저. 목록·상세·시설·이름·번역 예산을 분리하고, 지역별 미확인 비율로 편중을 줄임 |
| 1 | 갱신·백업·복구 | 지금 done 큐는 주로 최초 발견/보강용이며 모든 항목을 정기 재검증하는 구조는 아님. 필드별 갱신 주기와 정규화 관측 이력, 현재 DB의 제한된 내보내기·복구 절차 필요 |
| 2 | 스크롤 중 일관된 목록 | 현재 OFFSET은 추가/평점 갱신 중 순서가 움직일 수 있음. 단순 keyset도 평점·이름 변경까지 고정하지 않으므로 결과 ID 스냅샷과 만료 정책을 함께 검토 |
| 2 | 검색 확대 | 현재 오타·한국어 별칭 검색을 보존한 채 SQL 부분검색과 전체 색인의 병목 측정. FTS5 trigram은 3글자 미만 제약 때문에 ‘아소’ 같은 두 글자 지역명에 별도 경로 필요 |
| 2 | 변경·품질 이상 감지 | 추출 0건, 평점 척도 이상, 좌표 누락 급증, 시설 근거 소실을 최근 기준과 비교. 실패를 자동으로 초기화하지 않고 출처별로 보류·진단 |
| 2 | 공식 한국어 이름의 우선순위 | 공식 숙소·체인, 관광기관, 예약 사이트를 구조화한 출처 등급. 공식 이름 확인 전에는 예약 표기를 공식 이름으로 승격하지 않음 |
| 3 | 날짜 요금 비교의 품질 | 같은 숙소뿐 아니라 동일 객실·식사·취소·세금·인원을 맞춘 quote 단위 비교. 지금 Trip.com 가격은 링크 조회 중심이며 전체 실시간 객실 비교가 아님 |
| 3 | 검색 조건 공유·비교 화면 | 실제 사용 흐름을 바탕으로 URL 조건 복원과 몇 개 숙소 비교를 검토. 현재 브랜드와 온천 중심 검색 흐름은 유지 |

상용 숙박 매핑에는 공급자 코드를 공통 숙소 ID로 연결하는 [GIATA MultiCodes](https://info.giata.com/en/knowledge/what-is-multicodes-mc) 같은 제품이 있다. 이는 데이터 모델의 참고 사례이며 유료 서비스 도입을 결정한 것은 아니다.

공식 데이터 경로도 다시 확인했다. [Rakuten 시설 검색 API의 현행 문서](https://webservice.rakuten.co.jp/documentation/simple-hotel-search)는 2026-07-31 버전과 applicationId·access key를 안내한다. [Booking.com Demand API](https://developers.booking.com/demand/docs/getting-started/try-out-the-api)는 Managed Affiliate Partner 등록을 요구한다. 현재 계정 자격·키·비용을 확보하지 않았으므로 두 서비스를 연결하지 않았다. 기존 무료 수집 경로를 유지하면서 공식 API를 추가할 수 있는지는 별도 접근 가능성 확인이 필요하다.

한국어 이름 확보에서 Google 지도는 참고 출처 중 하나지만, [Places API 공식 정책](https://developers.google.com/maps/documentation/places/web-service/policies)의 저장 제한과 place ID 예외를 고려해야 한다. 공식 호텔·관광기관의 공개 한국어 페이지에서 직접 확인한 표기를 우선하는 현재 방식을 유지한다.

## 공식 구현 근거

- [SQLite RETURNING](https://sqlite.org/lang_returning.html): 실제 갱신된 행만 반환받아 선점·색인 갱신에 사용.
- [Cloudflare D1 인덱스](https://developers.cloudflare.com/d1/best-practices/use-indexes/): 조회 계획과 읽은 행 수를 확인하고 필요한 복합 인덱스만 추가.
- [Scrapy 작업 중단·재개](https://docs.scrapy.org/en/latest/topics/jobs.html): 큐와 중복 상태가 실행 사이에 유지되어야 함.
- [Scrapy AutoThrottle](https://docs.scrapy.org/en/latest/topics/autothrottle.html): 오류가 빨리 돌아온다는 이유로 요청을 가속하지 않음. 향후 지연 기반 속도 조절의 참고.
- [AWS 지수 백오프와 jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/): 동시 재시도 집중을 완화하는 방식.
- [SQLite row values](https://sqlite.org/rowvalue.html): 다음 스크롤 개선에서 정렬 키 기반 조회 검토.
- [SQLite FTS5](https://sqlite.org/fts5.html): trigram의 짧은 문자열 제약과 색인 저장 비용 확인.

## 검증과 한계

외부 원출처에 부하를 주는 대량 수집을 실행하지 않고, 분리된 Worker/D1에서 동시 선점·임대 만료·재전송·요청 숙소 ID·시간대·거절된 별칭·공급자 대기·상세 보강·집계 인증을 검증한다. Python 파서의 기존 목록·상세 fixtures와 재시도 정책도 검증한다. 기존 공개 검색, 160개 연속 목록, 번역 원문 보존, 브라우저별 즐겨찾기 격리 검사를 함께 실행한다.

이 변경은 이미 잘못 저장된 별칭을 일괄 삭제하거나 공급자 중복을 자동 병합하지 않는다. 기존 검증된 정보와 즐겨찾기 손실을 피하려면 별도 후보 검토가 필요하다. 호텔 저장·후속 URL 등록·완료 처리는 전체가 한 거대한 트랜잭션인 구조가 아니라, 임대와 반복 가능한 단계로 복구한다. 새 임대 방식에 참여하지 않는 구형 실행기의 동시 원출처 요청까지 완전히 막지는 못한다.

검색과 자동완성 캐시는 짧은 TTL로 유지되며 여러 서버 실행 환경에 걸친 즉시 무효화는 아직 보장하지 않는다. 브라우저 화면의 수동 조작 검사는 이번 구조 검증에 포함하지 않았다.
