# 과거 요구사항 대조(2026-10-11)

기록: 2026-10-11 (UTC) / 2026-10-11 (KST).
대조 기준: main `87dfbb7`(PR #25 병합)의 문서와 코드.
이 문서는 기록 시점의 체크포인트다. 대조는 상위 세션이 맡긴 하위 에이전트가 레포를 읽기만 하고 했다.
입력은 사용자가 2026-10-11에 올린 ChatGPT 계정 내보내기와 Work 이관 보관본이다. 대화 원문은 레포 밖 비공개 자료로만 읽었다. 이 문서에는 요구를 확인하는 데 필요한 짧은 인용만 둔다(`AGENTS.md`의 ‘운영·배포·비밀’).
이 문서 뒤의 반영: PR #26(`4a83269`)으로 앱 CI 중복 실행을 줄였다(R94). 로드맵 반영은 `roadmap.md`의 ‘사용자 결정 대기’와 우선 작업 표에 있다.

## (a) 읽은 범위

### 과거 대화 (사용자 메시지)

| 자료 | 읽은 범위 |
|---|---|
| 유케무리 대화 7개의 사용자 메시지 추출본 | 7개 파일 전체를 끝까지 읽었다. 본 줄기 사용자 메시지 97개다. A 1개, B 4개, C 77개, D 9개, E 2개, F 1개, G 3개. |
| 보관본의 원본 대화 JSON 6개 | 본 줄기 밖의 분기 메시지만 따로 추출해 모두 읽었다. C의 분기 23개와 D의 분기 2개다. 모두 "작업 계속해", "ok continue", 같은 이관 요청의 재전송이다. 새 요구는 없었다. C의 "100개"는 본 줄기 77개와 분기 23개를 합친 수다. |
| 같은 대화의 사용자·assistant 추출본 | 사용자 메시지가 가리키는 맥락만 부분적으로 읽었다. D 앞부분(12:21Z~14:27Z, 아이디어 목록 포함), C의 10-05T03:43Z·10-06T08:05Z~09:12Z, G의 마지막 답변. 나머지 assistant 발언은 읽지 않았다. |
| `post-export-worklog.md` | 전체. |
| `supplied-documents` | 고유 문서 5개 전체. 두 폴더의 01~04는 바이트가 같다(`cmp` 확인). 웹 에이전트 정리 문서 1개도 읽었다. |
| 아카이브 README 2개 | 전체(`YUKEMURI_PRIVATE_PROJECT_ARCHIVE_20261010/README.md`, `YUKEMURI_WEB_MIGRATION_20261009/README_HANDOFF.md`). |

`sites/projects/project-0001/env/*`, DB SQL, 첨부 `.dat`, Sites 내보내기 파일은 열지 않았다.
B 10-02T10:29Z 메시지는 사용자가 "참고만 해"라며 붙인 Claude 답변이다. 사용자 본인의 요구로 세지 않았다. 사용자가 이후 자기 말로 다시 말한 부분만 요구로 셌다.
A(10-01)는 한국 온천 호텔 추천 질문이다. 앱 요구가 아니지만 사용자의 온천 기준이 드러나 기준만 추출했다.

대화 약칭: A 온천 호텔 추천(10-01), B 개인용 OTA 설계 검토(10-02), C 홋카이도 숙소 검색 구현(10-02~10-08), D 작업 내용과 아이디어 정리(10-08), E C01 진단 수정 완료(10-08), F U01 수정 및 검사(10-08), G 프로젝트 이어가기 방법(10-09), W post-export-worklog(10-09~10), S supplied-documents.

### 현재 계획·구현

- 전체 읽음: `AGENTS.md`, `START_HERE.md`, `CLAUDE.md`, `docs/README.md`, `docs/roadmap.md`, `docs/work-handoff-latest.md`, `docs/conversation-handoff.md`, `docs/legacy-history.md`, `docs/onsen-first-plan-20261005.md`, `docs/source-priorities-20261005.md`, `docs/architecture-review-20261005.md`, `docs/catalog-operations.md`, `docs/checkpoint-20261007.md`, `docs/checkpoint-20261008.md`, `docs/writing-guide.md`, `docs/db-backups.md`, `docs/deployments.md`, `docs/sites-handoff.md`, `docs/collection-status-20261007.md`, `docs/collector-runner-migration.md`, `docs/cloud-development.md`, `docs/migration-20261009.md`, `docs/operations-checkpoint-20261008.md`, `docs/U03-20261011.md`, `docs/history/README-before-checkpoint-20261007.md`.
- 일부만 읽음(필요한 절·grep): `docs/D01-20261010.md`, `docs/D01-20261011.md`, `docs/U02-20261010.md`, `docs/ui-u01-*.md`, `docs/history/work-handoff-*.md`.
- 코드 확인: `lib/hotel-types.ts`, `components/hotel-explorer.tsx`, `hotel-card.tsx`, `hotel-detail.tsx`, `hotel-description.tsx`, `stay-map.tsx`, `retry-image.tsx`, `booking-fields.tsx`, `lib/hotel-name-match.ts`, `lib/booking-query.ts`, `lib/japan-place-labels.ts`, `db/schema.ts`, `data/collection-priorities.json`, `scripts/crawler/collect.py`, `scripts/crawler/update-descriptions.py`, `.github/workflows/web-checks.yml`, `git log --oneline`(108커밋).
- GitHub 읽기 전용 조회 2건: `gh api`로 `jihune/yukemuri`와 `jihune/yukemuri-script-runner`의 Actions 실행 목록만 읽었다. 아무것도 바꾸지 않았다.

## 분류 기준

- DONE: 코드나 문서에 구체적 근거가 있다. 대화 속 assistant의 약속은 근거로 쓰지 않았다.
- PLANNED: 로드맵·인수인계·계획 문서에 앞으로 할 일로 있다.
- MISSING: 사용자가 말했지만 계획에도 구현에도 없다.
- DROPPED/SUPERSEDED: 사용자가 나중에 바꿨거나 레포 문서의 결정이 명시적으로 대체했다.
- UNCLEAR: 판단할 수 없거나 사용자 결정이 남아 있다.

## 집계

| 분류 | 개수 |
|---|---:|
| DONE | 65 |
| PLANNED | 10 |
| MISSING | 5 |
| DROPPED/SUPERSEDED | 6 |
| UNCLEAR | 7 |
| 합계 | 93 |

DONE 중 화면·수집기 변경 다수는 GitHub main에만 있고 Sites에는 아직 게시되지 않았다(`docs/deployments.md:34-40`). 운영 사이트 반영은 별도 문제로 R72에 묶었다.

## (b) 요구사항 표

### 1. 제품 범위와 온천 기준

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R01 | 개인용 일본 호텔·료칸·온천 숙소 검색 사이트. Trip.com의 검색 사용성과 Jalan의 온천 상세를 합친다 | B 10-02T10:19Z, C 10-02T11:27Z | DONE | `AGENTS.md:24`, `app/layout.tsx:3`, `components/hotel-explorer.tsx` |
| R02 | 예약·결제는 하지 않는다. 검색·비교 뒤 Trip.com·Jalan·공식 홈페이지로 넘어간다 | C 10-02T11:27Z | DONE | `components/hotel-detail.tsx:51`('공식 안내와 예약 사이트') |
| R03 | 일반 목욕탕이 아닌 실제 온천수와 일본식 노천탕. 수영장·바데풀형은 온천으로 치지 않는다 | A 10-01T10:36Z | DONE | 천연온천·노천탕 필터 `lib/hotel-types.ts:3-15`. 天然温泉/人工温泉含まず 근거만 인정 `scripts/crawler/collect.py:281-289`. 리조트 공용·외부 온천 제외 `docs/catalog-operations.md:77` |
| R04 | 미끌미끌한 수질(천질·pH)로 고르기 | A 10-01T10:36Z, D 10-08T12:39Z(아이디어 4 승인) | PLANNED | `docs/roadmap.md:64`(이후 아이디어 6 '온천 성분·분위기 탐색'). 참고: 수집기는 천질 목록을 비워 둔다(`collect.py:360` `types=[]`) |
| R05 | 시설이 낡지 않은 곳(리뉴얼 연도·시설 연식) | A 10-01T10:36Z, D 10-08T12:39Z(아이디어 4 승인) | MISSING | `Hotel` 타입에 연식·리뉴얼 필드 없음(`lib/hotel-types.ts:36-46`). 로드맵 이후 아이디어 6은 수질만 다룬다 |
| R06 | v0.1은 홋카이도 한정·mock 20개 | C 10-02T11:27Z | SUPERSEDED | C 10-03T12:53Z 전국 확대 요청, 10-05T05:48Z 지역 순서 지시. 전국 실제 자료 `docs/checkpoint-20261007.md:37` |
| R07 | Trip.com·Jalan에 등록된 전체 숙소로 범위 확대 | C 10-03T12:53Z | PLANNED | `docs/roadmap.md:26`(D02 '전국 순환'), 정기 수집 `docs/collector-runner-migration.md:16`. 속도 문제는 R95 |
| R08 | 날짜별 실시간 요금 수집·비교 | C 10-03T15:07Z → 10-05T05:48Z "무조건 온천 탐색 중심으로 간다" | DROPPED | `AGENTS.md:24`, `docs/history/README-before-checkpoint-20261007.md:66`(`/api/prices` 410) |
| R09 | 한국 온천 호텔 (Trip.com '한국' 광역 검색 예시) | A 10-01T10:36Z, B 10-02T10:19Z | SUPERSEDED | C 10-02T11:27Z에서 범위를 '일본 숙소'로 정의. 비일본 숙소 제외 `docs/collection-status-20261007.md:7` |

### 2. 검색·필터·화면

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R10 | 광역 지역 검색('일본', 홋카이도·삿포로·노보리베츠·도야호·하코다테 등) | B 10-02T10:19Z, C 10-02T11:27Z | DONE | `lib/hotel-types.ts:19-30`(일본 전국·47개 도도부현·홋카이도 세부), `hotel-explorer.tsx:164` |
| R11 | 목록과 지도 함께 보기, 모바일 반응형, 데스크톱·모바일 확인 | C 10-02T11:27Z | DONE | `hotel-explorer.tsx:186`(목록 + 지도 탭), `docs/ui-u01-20261010.md`(360/390px 64개), `docs/U03-20261011.md:39`(1024~1440px) |
| R12 | 필터: 천연온천·대욕장·노천탕·전세탕/가족탕·객실 온천·객실 노천탕·료칸·평점·리뷰 수 | C 10-02T11:27Z | DONE | `lib/hotel-types.ts:3-15,48`, `hotel-explorer.tsx:39` |
| R13 | '내 검증 기준' 빠른 필터: 평점 9.0+ · 리뷰 50개+ | B 10-02T10:19Z, C 10-02T11:27Z | DONE | `hotel-explorer.tsx:37,172`, `lib/hotel-types.ts:50` |
| R14 | 카드: 한·일·영 이름, 위치, 평점, 리뷰 수, 온천 특징, 대표 이미지, 즐겨찾기 | C 10-02T11:27Z | DONE | `components/hotel-card.tsx:13-21` |
| R15 | 상세: 기본정보, 온천 특징, 지도 위치, 리뷰 요약, 외부 링크 영역 | C 10-02T11:27Z | DONE | `hotel-detail.tsx:37-51`. 리뷰 요약은 Trip.com '후기 키워드'(`:49`) |
| R16 | 외부 링크: Trip.com·Jalan·공식 홈페이지·Google Maps | C 10-02T11:27Z | DONE | `hotel-detail.tsx:16,51` |
| R17 | 즐겨찾기. 브라우저별로 간단히 저장 | C 10-02T11:27Z, 10-05T05:48Z | DONE | `docs/onsen-first-plan-20261005.md:3`, `lib/visitor-favorites.ts` |
| R18 | 지도에서 마우스 휠로 확대·축소 | C 10-02T15:22Z | DONE | `components/stay-map.tsx:31`(`scrollWheelZoom:true`) |
| R19 | 이미지 실패 시 자동 재로딩, 깨진 이미지 수정 | C 10-02T15:22Z, 10-04T01:14Z·01:15Z | DONE | `components/retry-image.tsx:23-52`, `components/hotel-photo.tsx:8`(대체 사진 순서) |
| R20 | 필터에 체크박스 | C 10-03T09:21Z | DONE | `hotel-explorer.tsx:37-39` |
| R21 | 영어·일본어·한국어·Jalan 명칭 등 여러 이름으로 검색 | C 10-04T01:17Z | DONE | `docs/history/README-before-checkpoint-20261007.md:96-99`, `lib/hotel-search-index.ts` |
| R22 | 오타·유사 이름 결과, 입력 중 자동완성(예상 숙소) | C 10-04T03:35Z | DONE | `lib/hotel-name-match.ts:11-31`(한글 자모 단위 편집 거리), `components/hotel-autocomplete.tsx`, `hotel-card.tsx:15`('유사한 이름') |
| R23 | 예상 숙소 표시와 검색 속도 개선 | C 10-04T04:07Z, 10-04T07:03Z | DONE | `README-before-checkpoint-20261007.md:127,139`(결과 캐시, 전국 색인 분리 로딩) |
| R24 | 정확히 같지 않아도 관련성 높은 순으로 표시 | C 10-04T04:07Z | DONE | `lib/hotel-relevance.ts` |
| R25 | 위치를 한국어로 통일. 온천 지역은 'OO 온천', 큰 지역도 함께('나하 - 오키나와') | C 10-04T04:07Z | DONE | `lib/japan-place-labels.ts:98`(`formatHotelLocation`), 온천 지역명 오류 수정 `docs/roadmap.md:100` |
| R26 | 상세를 열 때 스크롤이 맨 위로 튀지 않게 | C 10-04T05:21Z | DONE | `hotel-explorer.tsx:112`(목록 위치 저장) |
| R27 | 다음/이전 버튼 대신 맨 아래에서 자동 추가 로딩 | C 10-04T05:21Z | DONE | `hotel-explorer.tsx:95-96,181-182` |
| R28 | 조건에 맞는 결과가 없으면 칸을 나눠 관련 후보 표시 | C 10-04T05:21Z | DONE | `hotel-explorer.tsx:183`, `lib/hotel-alternatives.ts:11` |
| R29 | 대욕탕만 있는 호텔과 천연온천 구분 | C 10-04T05:21Z | DONE | `hotel-card.tsx:21`('대욕탕 · 천연온천 미확인'), `collect.py:281-289` |
| R30 | 세부 필터: 객실 노천탕, 객실 욕조 온천, 니고리유, 카케나가시 | C 10-04T05:21Z | DONE | `lib/hotel-types.ts:6-13` |
| R31 | 자란 하이클래스 여부 표시 | B 10-02T10:19Z, C 10-04T05:21Z | DONE | `hotel-explorer.tsx:39`, `hotel-card.tsx:18`, `lib/hotel-bath-facts.ts:20-23` |
| R32 | 노천탕이 대욕장·가족탕·객실 중 어디 있는지 구분 | C 10-04T05:21Z | DONE | `lib/hotel-types.ts:6`(communalOutdoor·privateOutdoor·roomOutdoorOnsen) |
| R33 | Jalan의 객실 수와 전망 온천 여부 | B 10-02T10:19Z | MISSING | 시설 항목에 없음(`lib/hotel-types.ts:3-9`). 로드맵에 없음 |
| R34 | 객실 사진 | B 10-02T10:19Z, D 10-08T12:39Z(아이디어 4 승인) | MISSING | 대표 사진과 대체 사진만 다룬다(`hotel-photo.tsx:8`). 로드맵에 없음 |
| R35 | 사이트 이름에서 '홋카이도' 제거 | C 10-05T05:48Z | DONE | `app/layout.tsx:3`('유케무리 · 일본 온천 탐색'), `docs/onsen-first-plan-20261005.md:3` |
| R36 | 한국어 화면 (자란의 일본어·번역기 불편 해소) | B 10-02T10:19Z | DONE | 화면 문구 전체 한국어(`components/*`) |
| R37 | 날짜를 이 사이트에서 입력하고 예약 사이트로 넘기기 (자란 달력이 번역기에서 깨짐) | B 10-02T10:19Z | UNCLEAR | 날짜·인원 입력과 날짜 포함 링크 코드는 있다(`components/booking-fields.tsx`, `lib/booking-query.ts:15-27`). 이를 쓰는 `components/hotel-prices.tsx`를 어떤 화면도 불러오지 않는다. 요금 화면 제거 때 함께 빠진 것으로 보인다. 로드맵에 없음 |
| R38 | 공개 가능한 수준의 깔끔한 UI. Trip.com 복제 금지. 온천 특징이 한눈에 | C 10-02T11:27Z | DONE | 카드 온천 태그 `hotel-card.tsx:21`, U01·U03 화면 검사 |
| R39 | 검색·비교·선별 (숙소 비교) | C 10-02T11:27Z | DONE | `components/hotel-comparison.tsx`(최대 4곳), `docs/checkpoint-20261008.md:9` |
| R40 | 360~390px 모바일·키보드로 비교·현황 검사, 확인·미확인 범위 구분 | F 10-08T16:56Z | DONE | `docs/ui-u01-20261010.md`, `docs/roadmap.md:24`. 실제 기기·스크린리더는 미확인 |
| R41 | 시설안내 버튼이 도시 목록이 아닌 해당 숙소 페이지로 (Tokyo Disneyland Hotel 사례) | C 10-04T14:32Z | DONE | `lib/hotel-facility-link.ts`, `README-before-checkpoint-20261007.md:137` |

### 3. 승인한 아이디어 (D 10-08T12:39Z "너가 추천한 아이디어랑 작업 순서대로 ... 진행하자")

assistant가 10-08T12:35Z에 제안한 6개 아이디어와 우선순위를 사용자가 승인했다. 아이디어 4(시설 상태와 온천수 보강)는 R04·R05·R34로 나눴다. 우선순위 목록의 '공식 개업·리뉴얼·휴관 조사'는 R52에 넣었다.

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R42 | 자주 쓰는 온천 조건 저장 | D 10-08T12:39Z | PLANNED | `docs/roadmap.md:59` |
| R43 | 비교표에서 차이만 보기 | D 10-08T12:39Z | PLANNED(진행 중) | `docs/roadmap.md:29`(U03 PR B, PR #24 검토 대기) |
| R44 | 객실 예약 확인표(일부 객실의 객실 타입명, 전세탕 조건) | D 10-08T12:39Z | PLANNED | `docs/roadmap.md:61`(객실탕 체크리스트) |
| R45 | 여행별 후보 묶음과 메모 | D 10-08T12:39Z | PLANNED | `docs/roadmap.md:62` |
| R46 | 지도 영역에서 다시 검색 | D 10-08T12:39Z | DONE | `docs/roadmap.md:129`(PR #16 `30a73bf`). Sites 미게시 |

### 4. 숙소 정보와 출처

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R49 | UI와 특정 출처를 강하게 묶지 않는다. Rakuten·자체 DB·다른 OTA를 붙일 수 있게 데이터 계층 분리 | C 10-02T11:27Z | DONE | `lib/hotel-types.ts:32-46`(공급자 필드·Provenance), `lib/source-policy.ts:5`, `lib/hotel-repository.ts` |
| R50 | 데이터의 출처와 확인 시점 저장 | C 10-02T11:27Z | DONE | `lib/hotel-types.ts:32-33`, `hotel-detail.tsx:52` |
| R51 | 출처 우선순위: 평점은 Trip.com·Google Maps, 객실·온천은 Jalan, 사진은 Trip.com·Google Maps | C 10-05T15:21Z | DONE(Trip·Jalan 부분) | `AGENTS.md:25`, `docs/source-priorities-20261005.md:3-9`, `lib/source-policy.ts:5`. Google 부분은 R96 |
| R52 | 일본 전체의 신규·폐업 숙소를 잘 반영 | C 10-05T05:48Z, D 우선순위 3번 | PLANNED(로드맵 표 밖) | 구조: `db/schema.ts:51-55`, `scripts/crawler/update-lifecycle.py`. 계획: `docs/onsen-first-plan-20261005.md:82-88`. 현재 `docs/roadmap.md` 우선 작업 표에는 없다. 예약 수집은 폐업 판단을 하지 않는다(`roadmap.md:67`) |
| R53 | 수집 순서: 하코네·유후인 등 전통 온천마을 최우선 → 규슈·홋카이도·오키나와/미야코지마/이시가키 → 오사카·고베 → 도쿄 인근 | C 10-05T05:48Z | DONE | `data/collection-priorities.json`, `docs/onsen-first-plan-20261005.md:7-15` |
| R54 | 한국어 이름 보강. 공식 한국어 이름 우선. 구글 지도 등에서도 수집 | C 10-04T07:03Z, 10-04T13:45Z | PLANNED | `docs/roadmap.md:26`(D02 '이름 보강'). 정기 예약에는 이름 조사가 없다(`docs/checkpoint-20261007.md:12`) |
| R55 | 숙소 설명을 원문 언어와 관계없이 한국어로 자동 번역 | C 10-04T08:59Z, 10-04T13:45Z | MISSING | 저장 구조와 기존 번역 526개는 있다(`docs/roadmap.md:48`). 정기 예약은 번역을 하지 않는다(`checkpoint-20261007.md:12`, `roadmap.md:67`). 후속 계획이 없다. 화면은 "한국어 번역은 자동으로 순차 반영됩니다"라고 안내한다(`components/hotel-description.tsx:11`) |
| R56 | 소잔쿄(sozankyo.com)를 정확히 찾기 | C 10-03T16:44Z, 10-04T01:15Z | DONE | `lib/hotels.verified.json`, `README-before-checkpoint-20261007.md:99`, `scripts/crawler/fixtures/jalan-sozankyo-baths.html` |
| R57 | Trip.com 평점과 Jalan 온천 정보를 같은 숙소로 연결 (두 장점 결합의 전제) | C 10-02T11:27Z, D 10-08T12:39Z | PLANNED | `docs/roadmap.md:25`(D01 2차), `docs/work-handoff-latest.md:65` |
| R58 | Rakuten API 등 공식 API 연결 | C 10-02T11:27Z("나중에") | UNCLEAR | 데이터 계층은 준비됨(R49). 계정·키가 없어 연결하지 않았다(`docs/architecture-review-20261005.md:64`). 로드맵에 없음 |

### 5. 수집과 갱신

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R59 | API가 막혔으니 일정 간격을 두고 크롤링 | C 10-03T13:14Z | DONE | `docs/collector-runner-migration.md:26`(호스트별 8초 + 0~4초) |
| R60 | AI 봇인 것이 안 걸리게 수집 | C 10-03T13:14Z | SUPERSEDED | 사용자 후속 지시 E 10-08T16:04Z "기존 요청 간격·robots·대기·임대를 지켜". `AGENTS.md:46` |
| R61 | 갱신은 에이전트가 아닌 스크립트로(토큰 비용). 24시간 무료 서버에서 | C 10-05T16:18Z | DONE | `AGENTS.md:51`, `docs/collector-runner-migration.md`(GitHub Actions Python) |
| R62 | 6시간 간격은 별로. 하루 한 번보다 자주. 봇 차단을 피함 | C 10-05T16:18Z, 10-05T16:31Z | DONE | cron `53 */3 * * *`(`collector-runner-migration.md:16`). 관측: 10-09~10-11 실제 예약 실행은 하루 약 3회, 모두 성공(아래 메모 2) |
| R63 | 봇 차단이 아니면 긴 대기를 걸지 않는다 | C 10-08T05:18Z, 10-08T09:00Z | DONE | `AGENTS.md:47`, `docs/operations-checkpoint-20261008.md:59-72` |
| R64 | 받은 실패 메일의 이상 여부 확인 | C 10-08T09:00Z | DONE | `docs/operations-checkpoint-20261008.md:65` |
| R65 | 요청 간격·robots·대기·임대 준수. 빈 자료를 성공 처리하지 않음. 대기·시도 횟수 임의 초기화 금지 | E 10-08T16:04Z | DONE | `AGENTS.md:35,46-47`, `docs/jalan-c01-20261008.md` |

### 6. 호스팅·비용·백업

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R67 | 무료 호스팅. 유료 서버 결제 없음. 기존 구독 안에서 | B 10-02T10:19Z | DONE | Sites와 GitHub 무료 사용. `AGENTS.md:28,51`, `docs/db-backups.md:7`(추가 요금 한도 미변경). 한도 감시는 R94 |
| R68 | 개발·배포·호스팅을 한 곳에서 | B 10-02T10:19Z | SUPERSEDED | G 10-09T03:20Z "지금처럼 gpt sites로 계속 해도 된다". `START_HERE.md:13-24` |
| R69 | 호스팅 변경은 미래 과제로 보류 | W | PLANNED(보류) | `docs/sites-handoff.md:3`, `docs/migration-20261009.md:64` |
| R70 | DB 관리·백업. zip 파일 수동 관리를 계속하지 않음 | G 10-09T03:20Z, W | DONE | `docs/db-backups.md:5-9`, `docs/evidence/automatic-backup-20261009.json`. 로드맵 O01 상태 문구는 오래됨(메모 1) |
| R71 | 사이트 정보를 계속 갱신 | G 10-09T03:20Z | DONE | R61·R62의 정기 수집 |
| R72 | GPT Sites 스킬을 Claude·Codex 웹에서 쓸 수 있게 | G 10-09T03:20Z | UNCLEAR | 스킬과 전달 절차는 있다(`docs/cloud-development.md:71-80`, `docs/sites-handoff.md`). Claude 웹에는 Sites 도구가 없다(`docs/work-handoff-latest.md:58`). Codex 웹의 게시 가능 여부는 확인 기록이 없다. v49 이후 병합분 7건이 미게시다(`docs/deployments.md:34-40`) |
| R73 | 이메일로 받은 ChatGPT 데이터 내보내기 처리 | W | DONE | `docs/conversation-handoff.md`, `scripts/import-chat-export.py` |
| R74 | 모든 대화·Work 기록·실행기·문서·지침·소스를 GitHub로 | C 10-07T08:17Z, G 10-09T02:54Z | DONE | `jihune/yukemuri`, `docs/legacy-history.md`(원래 Git 이력 bundle). 대화 원본은 비공개 보존이며 Git에 넣지 않는다(`AGENTS.md:49`) |
| R94 | 정기 수집·백업이 무료 한도 안에서 멈추지 않고 돈다 (R61·R67에서 나온 조건) | B 10-02T10:19Z, C 10-05T16:18Z | UNCLEAR | Actions 사용 분 감시 기록이 없다. 앱 레포 CI가 push와 pull_request 양쪽에서 돈다(`.github/workflows/web-checks.yml:2-5`). 실측은 메모 3 |
| R95 | 전체 숙소 범위를 현실적인 기간 안에 채우기 (R07과 R62의 결합) | C 10-03T12:53Z, 10-05T16:31Z | UNCLEAR | 실행당 16페이지(`collector-runner-migration.md:25`)와 실측 하루 약 3회 기준 계산은 메모 4. 주기·상한 변경은 사용자 결정 대상(`AGENTS.md:12`) |
| R96 | Google Maps 평점·대표사진 실제 사용 (R51의 Google 부분, R54의 구글 이름 수집 포함) | C 10-04T07:03Z, 10-05T15:21Z | UNCLEAR | 코드 경로는 있고 기본 꺼짐(`docs/source-priorities-20261005.md` 'Google Maps 연결 상태'). 이전 체크포인트의 '연결 여부 결정' 항목(`checkpoint-20261007.md` 남은 작업 6)이 현재 로드맵에는 없다. `roadmap.md:67`은 허가 조건만 적는다 |

### 7. 개인정보와 공유

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R75 | 혼자 쓰므로 로그인 기능 불필요 | C 10-04T06:41Z | DONE | `README-before-checkpoint-20261007.md:115-117`(로그인 UI 없음, public) |
| R76 | 나만 사용하는 사이트 | G 10-09T03:20Z | UNCLEAR | `START_HERE.md:23`(public 유지, "개인 용도라는 설명만으로 바꾸지 않았다"), `AGENTS.md:12` |
| R77 | 비밀·운영 DB·개인 즐겨찾기를 Git·문서에 넣지 않음 | S 01 가이드 | DONE | `AGENTS.md:48-49` |

### 8. 작업 방식과 문서

| ID | 요구 요약 | 출처 | 분류 | 근거 |
|---|---|---|---|---|
| R78 | Claude와 GPT 교차 검토 | B 10-02T10:19Z, W | DONE | `AGENTS.md:13`, `docs/cloud-development.md:27-28` |
| R79 | 중요한 구조 결정은 이유와 함께 설명 | C 10-02T11:27Z | DONE | `docs/work-handoff-latest.md:39-45`('이번 세션의 결정') |
| R80 | 알아서 장기간 자율 진행. 사용자가 할 절차만 안내 | C 10-03T09:55Z, 10-06T07:58Z, 10-06T14:56Z, 10-07T15:11Z, W | DONE | `AGENTS.md:11,18` |
| R81 | 사용자 결정이 필요한 사항을 추려서 보여주기 | C 10-05T02:44Z | MISSING | 레포 문서에 결정 대기 목록이 없다(`docs/`·`AGENTS.md`·`START_HERE.md` grep 결과 없음) |
| R82 | 유사 사례를 넓게 조사(레딧·개발자 커뮤니티) | C 10-03T13:14Z, 10-05T01:27Z | DONE | `docs/architecture-review-20261005.md:29-46`, `README-before-checkpoint-20261007.md:68-75` |
| R83 | 아이디어·구현·작업·남은 일을 레포에 두고 빠진 것 검사 | C 10-07T08:17Z | DONE | `docs/roadmap.md`, `docs/history/`, `docs/legacy-history.md` |
| R84 | 문서는 기록 일시가 있는 체크포인트 | C 10-07T08:17Z | DONE | `AGENTS.md:53-57`, `docs/writing-guide.md:42-44` |
| R85 | AI 슬롭 방지. 한국어로 쉽고 간결하게 | C 10-07T08:17Z | DONE | `docs/writing-guide.md:13-22` |
| R86 | ASD-STE100 조사·반영 | C 10-07T08:17Z | DONE | `docs/writing-guide.md:5-11` |
| R87 | 작업마다 새 세션. 맥락은 프로젝트 자료에 저장 | C 10-08T11:17Z~11:20Z | DONE | `AGENTS.md:13`, `START_HERE.md` |
| R88 | 클라우드 브라우저로 GitHub를 조작하지 않음 | E 10-08T16:31Z, F 10-08T16:56Z | DONE | `AGENTS.md:20` |
| R89 | GitHub 접근은 필요할 때 허가 요청. 새 세션은 GitHub 연결 없이 시작 | D 10-08T12:39Z, E 10-08T16:04Z | SUPERSEDED | G 10-09T02:54Z GitHub 기반 웹 이관 결정, W "깃허브 연결 허용할 테니까 남은 작업도 다 너가 알아서". `AGENTS.md:9-11` |
| R90 | 종료 전 변경·검사·반영·남은 문제·다음 작업을 UTC·KST로 기록 | E 10-08T16:04Z, F 10-08T16:56Z | DONE | `AGENTS.md:14` |
| R91 | 이전 수치를 현재값으로 가정하지 않음. 확인·미확인 범위 구분 | F 10-08T16:56Z | DONE | `AGENTS.md:36,56,70` |
| R92 | 로컬로 옮기지 않고 Codex 웹·Claude Code 웹에서 이어감 | G 10-09T02:54Z | DONE | `START_HERE.md:3`, `docs/conversation-handoff.md:10` |
| R93 | 구독이 매월 바뀌므로 양쪽 서비스에서 코딩·유지보수·검토 가능 | W | DONE | `AGENTS.md:3,13`, `docs/cloud-development.md:3` |

ID R47·R48·R66은 정리 중 다른 항목에 합쳐 비웠다.

## (c) MISSING·UNCLEAR 상세와 제안

제한 표기: [운영 자료] 운영 D1 읽기·쓰기 필요, [유료] 유료 서비스, [새 계정] 새 외부 계정, [사용자 결정] 사용자 판단 필요.

### 우선순위 높음

**R72 Sites 게시 경로 (UNCLEAR, 높음)**
- 사용자 원문: "gpt sites 스킬을 claude나 codex 웹에서 쓸수 있게 해야할듯?" (G 10-09T03:20Z)
- 현재: 2026-10-10 이후 병합한 U01·D01 2건·U02 4건·U03 A가 모두 미게시다. Trip 주소 수집기 수정도 게시 전에는 예약 실행에 반영되지 않는다(`AGENTS.md:45`).
- 이유: 사용자가 쓰는 운영 사이트에는 v49 이후 개선이 하나도 없다.
- 제안 로드맵 항목 (S01 Sites 게시와 게시 경로 확정):
  - ChatGPT Work 세션에서 main의 검사한 커밋을 기존 Sites에 게시한다.
  - 게시 전에 `docs/sites-handoff.md` 절차로 운영 소스와 기준 커밋을 대조한다.
  - Codex 웹에 Sites 도구가 있는지 한 번 확인하고 결과를 `docs/cloud-development.md`에 기록한다.
  - 게시 뒤 Trip 상세 재수집으로 주소 중복이 사라졌는지 확인한다.
  - 구독이 바뀐 달에도 Sites 호스팅과 게시가 유지되는지 확인 항목으로 둔다.
- 제한: [사용자 결정] Work 세션을 사용자가 연다. 운영 게시이므로 [운영 자료] 영향이 있다. 새 유료 서비스는 필요 없다(ChatGPT 구독 유지 전제).

**R94 무료 Actions 한도 (UNCLEAR, 높음)**
- 사용자 원문: "내가 호스팅할 서버나 그런거는 유료결제 해서 쓰는게 없고" (B 10-02T10:19Z)
- 현재: 실행기 레포와 앱 레포는 같은 개인 계정의 private 레포다. 앱 레포 CI는 push와 pull_request에서 모두 돈다. 실측은 메모 3이다. 10-06 대화의 assistant 보고에 따르면 계정은 무료 플랜이고 Actions 초과 예산은 0달러다. 이 보고는 직접 확인하지 않았다.
- 이유: 무료 분이 바닥나면 3시간 수집과 일일 백업이 그달 남은 기간 동안 멈출 수 있다.
- 제안 로드맵 항목 (O02 Actions 사용량 관리):
  - 사용자가 GitHub 결제 화면에서 이번 달 Actions 사용 분과 한도를 확인한다.
  - 앱 레포 CI를 PR과 main push에서만 실행하도록 바꾼다.
  - 같은 브랜치의 이전 CI 실행은 새 push 때 취소한다.
  - 수집·백업 예약은 바꾸지 않는다.
  - 매주 사용 분을 인수인계에 기록한다.
- 제한: [사용자 결정] 결제 화면 확인은 사용자만 할 수 있다. CI 변경은 코드 검토 대상이다. 유료 서비스는 필요 없다.

### 우선순위 중간

**R55 숙소 설명 한국어 번역의 지속 (MISSING, 중간)**
- 사용자 원문: "영어라고 언급했는데, 일본어가 원문일수도 있고 언어 상관없이 한국어로 번역될 수 있도록 하라." (C 10-04T13:45Z)
- 현재: 번역 저장 API와 번역 526개가 있다. LLM 예약을 끈 뒤 새 번역 수단이 없다. 화면 문구와 `scripts/crawler/update-descriptions.py:3` 주석은 아직 자동 번역을 말한다.
- 제안 로드맵 항목 (D03 설명 번역 보강):
  - 화면 문구를 "번역 준비 중"처럼 사실에 맞게 고친다.
  - 번역 방식을 사용자가 고른다. 선택지는 수동 에이전트 세션 묶음 번역과 번역 중단이다.
  - 정기 LLM 예약은 만들지 않는다(`AGENTS.md:51`).
  - 원문과 번역의 대응 검사는 기존 API 규칙을 따른다.
- 제한: 문구 수정은 코드만 필요하다. 번역 보강은 [운영 자료]와 [사용자 결정]이 필요하다.

**R05 시설 연식·리뉴얼 정보 (MISSING, 중간)**
- 사용자 원문: "온천수 쓰고 미끌미끌한 느낌이 나는 온천이면서 시설 낡지 않은 곳 알려줘." (A 10-01T10:36Z)
- 이유: 사용자의 첫 온천 기준이다. 승인한 아이디어 4에도 리뉴얼 연도가 있다.
- 제안 로드맵 항목 (D04 시설 연식 표시):
  - Jalan 상세와 공식 안내에 개업·리뉴얼 연도가 있는지 먼저 표본으로 확인한다.
  - 확인한 연도만 출처·확인일과 함께 저장한다.
  - 연도를 추정하지 않는다.
  - 상세와 비교에 표시한다. 필터는 확인량이 충분해진 뒤 검토한다.
- 제한: [운영 자료] 재수집 또는 기존 관측 재해석이 필요하다. 수집기 변경은 Sites 게시가 필요하다.

**R95 전체 숙소 범위 확보 속도 (UNCLEAR, 중간)**
- 사용자 원문: "하루한번보다는 자주하면좋겠고 봇차단안당하게" (C 10-05T16:31Z)
- 현재: 하루 실행 횟수 요구는 충족한다. 상세 대기량 대비 처리 속도는 메모 4와 같다.
- 제안 로드맵 항목 (C03 수집량 점검):
  - 운영 건강 보고로 현재 상세 대기 수와 하루 처리 페이지를 측정한다.
  - 현재 속도로 걸리는 기간을 기록한다.
  - 주기·상한을 바꿀지 사용자에게 선택지를 보인다.
  - 요청 간격·robots·403/429 규칙은 바꾸지 않는다.
- 제한: [운영 자료] 건강 보고 조회. [사용자 결정] 주기·상한 변경(`AGENTS.md:12`). Actions 분 사용도 늘어나므로 R94와 함께 본다.

**R81 사용자 결정 대기 목록 (MISSING, 중간)**
- 사용자 원문: "사용자 결정 필요한 사항이나 앞으로 어떻게 했으면 좋겠는지도 추려서 보여주면 좋다." (C 10-05T02:44Z)
- 이유: 이 보고서의 UNCLEAR 7개 중 6개가 사용자 결정을 기다린다. 지금은 각 문서에 흩어져 있다.
- 제안 로드맵 항목:
  - `docs/roadmap.md`에 '사용자 결정 대기' 절을 만든다.
  - 항목마다 질문 하나, 권장 기본값, 결정 전 영향을 한 줄씩 쓴다.
  - 결정이 나면 날짜와 함께 해당 문서로 옮긴다.
- 제한: 없음. 문서만 바꾼다.

### 우선순위 낮음

**R33 객실 수와 전망 온천 (MISSING, 낮음)**
- 사용자 원문: "jalan 에서는 일본사이트 답게 객실 수부터 온천의 타입이나 노천탕 여부, 대욕탕 여부, 방 안에 온천이 있는지 여부, 전망 온천 여부, 하이클래스 선정 여부 등이 세세하게 있기 때문이다." (B 10-02T10:19Z)
- 제안 로드맵 항목 (D05 Jalan 시설 항목 추가):
  - Jalan 상세 fixture에서 객실 수와 전망탕 표기가 있는지 확인한다.
  - 있으면 수집기에 두 항목을 추가하고 미확인은 '확인 필요'로 둔다.
  - 전망 온천은 시설 필터에, 객실 수는 상세·비교에 표시한다.
- 제한: 수집기 변경, Sites 게시, [운영 자료] 재수집.

**R34 객실 사진 (MISSING, 낮음)**
- 사용자 원문: "호텔 순서나 위치 보는 거, 그리고 객실 사진 등도 트립닷컴에 비해 부실한 경우가 많다." (B 10-02T10:19Z)
- 제안 로드맵 항목:
  - 현재 수집하는 Trip.com·Jalan 상세에 객실 사진 주소와 객실 타입명이 있는지 확인한다.
  - 사진 출처 표기를 유지한다.
  - 객실탕 체크리스트(R44)와 함께 설계한다.
- 제한: [운영 자료] 재수집. 사진 요청이 늘면 원출처 부하도 늘어난다.

**R37 날짜를 넣어 예약 사이트로 넘기기 (UNCLEAR, 낮음)**
- 현재: 날짜 입력과 날짜 포함 링크 코드가 남아 있지만 화면에서 쓰지 않는다. 사용자가 끈 것은 실시간 요금이다. 날짜 전달까지 끈다고 말한 기록은 없다.
- 제안 로드맵 항목:
  - 상세의 예약 사이트 링크에 체크인·체크아웃·인원을 넣을지 사용자에게 묻는다.
  - 넣기로 하면 기존 `booking-fields.tsx`와 `booking-query.ts`를 요금 조회 없이 다시 연결한다.
  - 쓰지 않기로 하면 남은 요금 코드를 정리한다.
- 제한: [사용자 결정]. 그 밖에는 코드만 필요하다.

**R96 Google Maps 평점·사진 연결 (UNCLEAR, 낮음)**
- 사용자 원문: "사이트에 정보 수집할 때 평점 부분은 트립닷컴거랑 구글맵 리뷰 평점 최우선으로" (C 10-05T15:21Z)
- 제안 로드맵 항목 (G01 Google 연결 결정):
  - Places API 키 발급과 일일 상한을 쓸지 사용자가 정한다.
  - 쓰지 않으면 문서의 출처 우선순위에 'Google 미사용'을 명시한다.
  - 쓰면 기존 경로(`/api/hotels/{id}/google`)를 켜고 하루 상한을 유지한다.
- 제한: [유료] [새 계정] [사용자 결정].

**R76 사이트 접근 범위 (UNCLEAR, 낮음)**
- 사용자 원문: "나는 개인적으로 나만 사용할거거든." (G 10-09T03:20Z)
- 현재: Sites 공유 범위는 public이다. 사용자는 10-04에 로그인이 필요 없다고 했다.
- 제안 로드맵 항목:
  - 'URL을 아는 사람 누구나 읽을 수 있음'을 유지할지 사용자에게 묻는다.
  - 제한하기로 하면 로그인 필요 여부와 수집기 인증을 먼저 검사한다.
- 제한: [사용자 결정]. 공유 범위 변경은 현재 작업 범위 밖이다(`AGENTS.md:12`).

**R58 Rakuten 등 공식 API (UNCLEAR, 낮음)**
- 사용자 원문: "나중에 Rakuten API, 자체 DB 또는 다른 OTA API를 붙일 수 있도록 데이터 계층을 분리할 것." (C 10-02T11:27Z)
- 제안 로드맵 항목: '이후 아이디어'에 공식 API 연결 후보로 적는다. 계정을 만들기 전에는 진행하지 않는다.
- 제한: [새 계정] [사용자 결정].

### 표 밖에 있는 PLANNED 항목

**R52 신규·폐업·휴관 반영 (PLANNED, 낮음~중간)**
- 사용자 원문: "대신에 모든 일본 신규 숙소 폐업 숙소 반영이 잘 되면 좋겠다." (C 10-05T05:48Z)
- 계획은 `docs/onsen-first-plan-20261005.md:82-88`에만 있다. 사용자가 승인한 우선순위 3번 '공식 개업·리뉴얼·휴관 조사'도 현재 로드맵 표에 없다.
- 제안: 로드맵 우선 작업 표에 L01 행을 추가한다. 하코네·유후인·구로카와부터 공식 안내와 대조한다. [운영 자료]가 필요하다.

## 계획 문서 정합성 메모

1. `docs/roadmap.md:28` O01 상태는 '절차 존재·실행 미확인'이다. 그러나 일일 백업과 복원 검사가 실행 중이다(`docs/db-backups.md:5-6`, `docs/evidence/automatic-backup-20261009.json`). Actions 목록에서도 예약 백업 10-09T23:18Z·10-10T22:37Z 성공을 읽었다.
2. `docs/roadmap.md:23` C02는 '실제 cron 관찰은 남음'이다. Actions 목록에서 전환 커밋 `b2bcbba` 이후 예약 실행 10-08T19:02Z·10-09T01:30Z와 `868229c` 이후 7회가 모두 성공했다. 실제 간격은 약 4.4~9.4시간이었다. cron은 하루 8회지만 실행은 하루 약 3회였다.
3. 앱 레포 CI 실측(메모 3): 10-10~10-11 실행 77회(pull_request 37, push 40)다. 실행별 시간을 분 단위로 올려 더하면 날짜별 약 136분이다. 실행기 레포는 10-06~10-11에 약 136분이다. GitHub 무료 플랜의 private 레포 한도(월 2,000분)를 이 속도로 쓰면 약 2주 안에 소진된다. 시작·갱신 시각 차이로 계산한 근사치다. 실제 과금 분과 결제 주기는 확인하지 않았다.
4. 수집 속도 계산(R95): 10-07 기준 상세 대기는 Jalan 10,744·Trip 1,629페이지였다(`docs/checkpoint-20261007.md:38`). 실행당 16페이지, 하루 약 3회면 하루 약 48페이지다. 재확인 몫을 빼지 않아도 상세 대기 처리에 약 250일이 걸린다. 현재 대기 수는 다시 조회해야 한다.
5. `docs/roadmap.md:65` 이후 아이디어 7 '지도 범위 검색'은 U02 2차로 main에 병합됐다(`roadmap.md:129`). 이후 아이디어 표에서 옮겨야 한다.
6. `docs/roadmap.md:3`의 '갱신' 시각은 2026-10-08이다. 표 행은 2026-10-11까지 갱신됐다.
7. C01 뒤에 남은 Jalan 연결 오류 1건과 Trip 목록 404 1건은 `roadmap.md:50` 문장에만 있다. 작업 행이 없다.
