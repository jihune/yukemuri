# 호스팅 이전 검토(2026-10-11)

기록: 2026-10-11T06:20Z / 2026-10-11 15:20 KST. 읽기 전용 조사다. 사용자 요청(2026-10-11 06시대 UTC): Sites가 느리고 소스 유지보수가 어려우면 에이전트가 호스팅과 DB를 운영할 수 있는 무료 호스팅으로 옮기는 것을 검토한다. 결정은 사용자에게 있다(`roadmap.md`의 ‘사용자 결정 대기’).
레포 수정·커밋·push, 운영 Sites·운영 D1 접속, Secret 값 열람은 하지 않았다.
앱 레포 기준: `jihune/yukemuri` main `87dfbb7`(PR #25 병합). 조사 끝 무렵 작업 폴더가 `063f63c`(앱 CI 실행 횟수 조정)로 바뀌었다. 이 변경은 아래 결론에 영향이 없다. 실행기 레포 기준: `jihune/yukemuri-script-runner` `868229c`.

## 0. 결론 요약

- 추천: **Cloudflare Workers Free + D1 Free + `workers.dev` 주소**. 사이트는 public으로 둔다. 배포는 GitHub Actions의 `cloudflare/wrangler-action@v4`로 main 병합 때 실행한다.
- 이유: 지금 앱은 이미 Cloudflare Worker + D1용으로 빌드된다. Sites도 내부적으로 Cloudflare Worker와 D1을 쓴다. 런타임·DB API·SQL을 바꾸지 않아도 된다. 바꿀 것은 배포 설정, 접근 경로, 실행기의 주소·헤더다.
- 조건: 무료 한도 세 가지를 실제로 넘지 않는지 병행 운영에서 확인해야 한다. 요청당 CPU 10ms, D1 읽기 하루 500만 행, D1 쓰기 하루 10만 행이다. 지금 Sites에서는 이 한도가 드러나지 않았다. 코드로 추정하면 수집기만으로 하루 약 380만 행을 읽는다(아래 1.9).
- 대안(조사 당시): 한도를 넘으면 같은 구성에서 Workers Paid(월 5달러)로 바꾸는 것이 가장 작은 변경이었다. 사용자가 무료로만 쓰기로 해서 이 대안은 쓰지 않는다(결정 반영). Vercel Hobby + Turso는 DB 한도가 더 넉넉하다. 대신 빌드 방식·DB 접근 코드·로그인 기능을 새로 만들어야 한다. 차선으로 둔다.
- 느린 접속이 개선된다는 보장은 없다. 한국 통신사에서 Cloudflare 무료 플랜 트래픽이 LAX·싱가포르로 간다는 커뮤니티 보고가 있다(미확인). 병행 운영 중 실제 지연을 재고 결정한다.

## 결정 반영

기록: 2026-10-11T08:25Z / 17:25 KST. 이 절이 아래 계획보다 우선한다.

- 사용자는 이전 여부를 에이전트 판단에 맡겼다(2026-10-11T08:25Z). 에이전트는 Cloudflare 무료 플랜으로 옮기기로 판단했다. 이유는 세 가지다. Sites 게시는 ChatGPT 안의 도구로만 할 수 있어 병합한 변경이 운영에 쌓인다. 사용자 계정이면 main 병합 때 자동으로 배포할 수 있다. 앱이 이미 Worker와 D1용으로 빌드된다.
- 무료로만 쓴다. Workers Paid와 유료 도메인은 쓰지 않는다. 계정은 사용자가 무료로 만든다(사용자 결정, 2026-10-11T08:25Z).
- 사이트는 public으로 둔다. 이용자는 지금 사용자뿐이다. 그래서 Cloudflare Access(Zero Trust)는 쓰지 않는다(사용자 결정, 2026-10-11T08:25Z).
- DDoS와 악성 봇은 막는다(사용자 결정, 2026-10-11T08:25Z). 방법은 3.2절 2단계의 ‘공개 사이트 보호’다.
- 전환 때 기존 Sites에 쓰기 차단 기능을 게시하지 않는다. 사용자는 최종 체크포인트부터 전환이 끝날 때까지 기존 Sites에서 즐겨찾기를 바꾸지 않는다. 다른 방문자·오래된 탭의 쓰기가 유실될 수 있다는 위험을 사용자가 받아들였다(사용자 결정, 2026-10-11T08:25Z).

- 실행기 레포 수정이 허락됐다(사용자 결정, 2026-10-11T09:31Z, 영구). 4단계 적재와 6단계 전환의 실행기 PR은 이 허락으로 진행한다. 6단계에서 수집 예약은 public 앱 레포로 옮긴다. 수집기 코드가 이미 앱 레포에 있고 public 레포의 Actions 사용 시간은 한도가 없기 때문이다. DB 백업과 복원 검사는 개인 즐겨찾기가 들어 있어 private 실행기 레포에 남긴다(에이전트 권장, 2026-10-11T09:31Z). 수집 주기·상한은 바꾸지 않는다.

## 1. 현재 구조

### 1.1 런타임과 빌드

| 항목 | 내용 | 근거 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router 코드를 vinext `1.0.0-beta.5`(Cloudflare의 Vite 기반 Next.js 재구현)로 빌드 | `package.json`(`vinext`, `next 16.3.4`, `@cloudflare/vite-plugin 1.37.1`, `wrangler 4.92.0`) |
| 실행 환경 | Cloudflare Worker(`nodejs_compat`, compatibility_date `2026-05-15`) + Workers Static Assets | `vite.config.ts`, `dist/server/wrangler.json` |
| 진입점 | `build/sites-worker.ts`가 `vinext/server/fetch-handler`를 호출. Sites 커넥터 바인딩(`ctx.props.CONNECTORS`)을 감싸지만 앱 코드에서 커넥터를 쓰지 않음 | `build/sites-worker.ts`, `lib/connectors.ts`(호출처 없음) |
| 빌드 명령 | `node scripts/run-framework.mjs build`. portable 모드에서는 `vinext build`. 매 빌드마다 수집기 배포 자료(`data/collector-release.generated.json`)를 다시 만듦 | `scripts/run-framework.mjs` |
| 빌드 결과 | `dist/server`(Worker 모듈 76개, 6.3MB, gzip 약 0.93MB. 가장 큰 청크 4.77MB는 체크인된 숙소 seed `lib/hotels.crawled.json`) + `dist/client`(정적 파일 36개, 2.7MB). 생성된 `dist/server/wrangler.json`의 D1 `database_id`는 자리표시자 `00000000-…` | 2026-10-10 11:45 빌드 산출물 측정(최신 main과 차이 가능) |
| 예약 작업 | Worker에는 cron이 없다(`triggers: {}`, `scheduled` 처리기 없음). 모든 예약은 실행기 레포의 GitHub Actions | `dist/server/wrangler.json`, `build/sites-worker.ts` |
| Sites 런타임 | 내보내기 메타데이터: `cloudflare_worker` 게시, D1 1개, R2 0개, 소스 저장소 `cloudflare_artifact`. 버전 49 = 커밋 `608a380…`. 게시 49건 모두 succeeded(이전 주소 `yukemuri-hokkaido…` 27건, 현재 주소 22건) | 내보내기 `project-0001/cloudflare/worker/worker-0001.json`, `deployments/`, `versions/` |

### 1.2 DB(D1)

- 바인딩 이름 `DB` 하나. 코드는 D1 API를 직접 쓴다(`prepare().bind().first/all/run()`, `batch()`, `meta.changes`). Drizzle은 스키마·마이그레이션 생성에만 쓴다. 근거: `lib/favorites-db.ts`, `db/index.ts`, `.openai/hosting.json`(`"d1": "DB"`, `"r2": null`).
- 마이그레이션: `drizzle/0000_…sql`–`0012_…sql` 13개(합계 5,144바이트). Sites는 적용 이력을 `__appgarden_migrations` 테이블에 둔다(내보낸 SQL의 2번째 줄). wrangler 기본 이력 테이블은 `d1_migrations`다.
- 테이블 15개: `hotels`, `hotel_names`, `crawl_jobs`, `catalog_meta`, `favorites`, `visitor_favorites`, `price_quotes`, `hotel_name_localizations`, `hotel_description_translations`, `hotel_description_requests`, `hotel_result_sessions`, `hotel_lifecycle`, `hotel_lifecycle_events`, `hotel_source_groups`, `hotel_source_observations`. 명시 인덱스 16개(`hotels` 4, `crawl_jobs` 3 등).
- 크기: 계정 내보내기(2026-10-09, 파일 시각 2026-10-08 18:31)의 D1 SQL이 48,233,620바이트다. 행 수(INSERT 문 수): `crawl_jobs` 15,417, `hotel_names` 13,849, `hotels` 12,271, `hotel_lifecycle` 1,621, `hotel_description_translations` 562, `hotel_name_localizations` 149, 나머지 100행 미만. `visitor_favorites` 0행, `favorites` 2행. 지금 값은 이보다 크다.
- 앱은 첫 요청 때 `catalog_meta`의 표시값으로 seed 적재 여부를 판단한다(`lib/hotel-repository.ts`의 `importSnapshot`·`reindexNames`). 새 DB에 `catalog_meta`가 없으면 첫 요청이 수천 행 일괄 적재를 시도한다. 데이터를 옮길 때 `catalog_meta`를 반드시 함께 옮겨야 한다. 현재 seed 버전(`data/coverage.json`의 `updatedAt`)은 저장소 도입 뒤 바뀌지 않았다.

### 1.3 Secret과 환경 변수(이름만)

| 위치 | 이름 | 비고 |
|---|---|---|
| Sites 환경(내보내기 메타데이터) | secret 1개: `CRAWL_ACCESS_KEY`. 일반 변수 0개 | `env/env-set-0001.json`의 이름 목록만 확인. 값은 열지 않음 |
| 앱 코드가 읽는 이름 | `DB`(D1), `BUCKET`(R2, 미사용), `CRAWL_ACCESS_KEY`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_ENABLED`, `GOOGLE_PLACES_DAILY_REQUEST_LIMIT` | `cloudflare-env.d.ts`, `.env.example`. Google 변수는 운영에 없으므로 Google 연결은 꺼진 상태 |
| 실행기 레포 Actions | secret `YUKEMURI_ACCESS_JSON`(`{"url","token"}` 형식), 변수 `YUKEMURI_ENABLED`, `YUKEMURI_MODE` | `.github/workflows/yukemuri-catalog.yml`, `yukemuri-backup.yml`, `scripts/runner/bootstrap.py` |
| 앱 레포 Actions | 없음(CI는 Secret 없이 검사만) | `.github/workflows/web-checks.yml` |

### 1.4 접근 제어

- Sites 접근 정책: 내보내기의 `access-policy-0001.json`은 `access_mode: public`, 허용 계정 1명, revision 2다. `START_HERE.md`도 “현재 Site 공유 범위는 public”이라고 쓴다. 이번 요청의 “소유자만 접근”과 다르다. 내보내기 뒤에 바꿨는지는 확인하지 못했다.
- 앱 수준:
  - 숙소 조회 API·화면은 인증이 없다.
  - 유지보수 API는 `X-Yukemuri-Crawl-Key` 헤더를 `CRAWL_ACCESS_KEY`와 상수 시간 비교한다(`lib/crawl-access.ts`). 대상: `/api/crawl`, `/api/crawl-prepare`, `/api/crawl-seeds`, `/api/collector-release`, `/api/catalog-export`, 숙소명·설명·수명·출처 묶음 PUT.
  - 즐겨찾기는 브라우저 localStorage의 무작위 토큰(`yukemuri-visitor-v1`)을 `X-Yukemuri-Visitor`로 보내고 서버가 SHA-256으로 구분한다(`lib/api-client.ts`, `lib/visitor-favorites.ts`). 비교 목록도 localStorage에 있다.
  - `app/chatgpt-auth.ts`(Sites의 `oai-authenticated-user-*` 헤더 읽기)는 어디서도 호출하지 않는다.
- 실행기는 같은 토큰을 `OAI-Sites-Authorization: Bearer …`(Sites 접근 게이트용)와 `X-Yukemuri-Crawl-Key`(앱용) 두 헤더로 보낸다(`scripts/runner/bootstrap.py` 99–103행, 앱 레포 `scripts/crawler/update-site.py` 61–62행).

### 1.5 수집 흐름

1. 실행기 `yukemuri-catalog.yml`: cron `53 */3 * * *`(3시간마다, KST 00:53·03:53…), `vars.YUKEMURI_ENABLED == 'true'`일 때만. 작업 상한 6분, 수집 240초, gentle 16페이지, 호스트별 8초 + 0~4초 간격.
2. `scripts/run-updates.py`가 `YUKEMURI_ACCESS_JSON`을 읽고 환경에서 지운다. 호스트는 `yukemuri.jihun7891.chatgpt.site`·`yukemuri-hokkaido…`만 허용한다.
3. `scripts/runner/bootstrap.py`가 고정 주소 `https://yukemuri.jihun7891.chatgpt.site/api/collector-release`에서 수집기 파일 5개를 받는다. 배포 자료의 `siteOrigin`이 같은 주소인지, 해시·상한이 맞는지 검사한다.
4. 받은 `update-site.py`가 `/api/crawl-prepare`(POST) → 페이지마다 `/api/crawl` POST(작업 선점) → 원출처 요청 → `/api/crawl` PUT(관측 저장, 응답에 집계 포함) → 끝에 GET으로 집계를 읽는다. `update-site.py`는 호스트가 `.chatgpt.site`로 끝나야 실행한다(51행).
5. 그래서 앱 레포의 수집기 변경은 Sites에 게시돼야 예약 실행에 반영된다. D01 Trip 주소 수정도 아직 반영되지 않았다(`docs/deployments.md`).

### 1.6 백업 흐름

- 실행기 `yukemuri-backup.yml`: 매일 19:23 UTC(04:23 KST). main·private일 때만 인증 백업을 실행한다.
- `maintenance/catalog-backup/scripts/run-backup.py`가 `YUKEMURI_ACCESS_JSON`으로 `/api/catalog-export`를 테이블별 페이지로 읽는다. 허용 호스트는 `yukemuri.jihun7891.chatgpt.site` 하나다. 영속 테이블 13개를 받아 임시 SQLite에 복원하고 무결성·행 수·스키마(`0012`)를 검사한다.
- 결과(`checkpoint.jsonl.gz`, SQL, 해시, 보고서)는 private Actions artifact로 둔다. 일일 14일, 월요일분 90일 보관. 개인 즐겨찾기가 들어 있어 Git에 넣지 않는다(`docs/db-backups.md`).

### 1.7 Sites 전용이라 옮기면 깨지거나 바꿔야 하는 것

| Sites 전용 요소 | 위치 | 이전 시 처리 |
|---|---|---|
| 게시 도구(ChatGPT 안의 Sites 도구만 가능) | `docs/sites-handoff.md` | GitHub Actions + wrangler 배포로 대체 |
| 빌드 중 `.openai/hosting.json`·`drizzle/`을 `dist/.openai`로 복사하고 Sites가 게시 때 마이그레이션 적용 | `build/sites-vite-plugin.ts` `closeBundle` | `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json` 단계를 배포 workflow에 둠. 복사 동작은 무해 |
| D1 `database_id` 자리표시자를 Sites가 실제 값으로 바꿈 | `vite.config.ts` `SITE_CREATOR_PLACEHOLDER_DATABASE_ID` | 실제 ID(비밀 아님)를 설정에 넣음. Worker 이름도 `site-creator-vinext-starter` 대신 명시 |
| 마이그레이션 이력 테이블 `__appgarden_migrations` | 내보낸 D1 SQL | 새 D1은 wrangler 기본 `d1_migrations`로 스키마를 만들고 데이터만 옮김 |
| Sites 접근 게이트와 `OAI-Sites-Authorization` 헤더 | 실행기 `bootstrap.py`, 앱 `scripts/crawler/*.py`, `scripts/catalog-checkpoint.py`, 실행기 `catalog-checkpoint.py` | 새 주소는 public이라 Sites 접근 게이트 헤더가 필요 없다. 앱용 크롤 키 헤더만 보낸다(결정 반영) |
| 고정 주소 `*.chatgpt.site` 검사 | 실행기 `bootstrap.py` 19행, `run-updates.py` 30행, `run-backup.py` 10행, `catalog-checkpoint.py` 29행. 앱 `scripts/build-collector-release.mjs` 10행(`siteOrigin`), `scripts/crawler/update-site.py` 51행, `update-names.py`·`update-descriptions.py`·`update-lifecycle.py`·`update-source-groups.py`, `source_safety.py` 7행(User-Agent의 주소) | 새 주소로 바꾸거나 허용 목록에 추가. 배포 자료의 `siteOrigin`과 실행기의 고정 주소를 같이 바꿔야 함 |
| Sites가 관리하는 Secret `CRAWL_ACCESS_KEY` | Sites 환경 | Worker secret으로 새로 설정. 값은 에이전트가 볼 수 없으므로 사용자가 GitHub Secret에 넣음 |
| 로그인 만료 감지(`/signin-with-chatgpt` 리다이렉트) | `lib/api-client.ts` 22행 | 새 주소에는 로그인이 없다. 이 안내는 쓰이지 않는다(결정 반영) |
| 주소(origin) | 브라우저 localStorage | 주소가 바뀌면 방문자 토큰이 새로 생긴다. DB의 즐겨찾기 행을 옮겨도 새 주소에서는 보이지 않는다. 토큰 값을 수동으로 옮기거나 기능을 추가해야 함 |

`chatgpt-auth.ts`, 커넥터 바인딩, 로컬 모의 로그인은 운영 동작에 쓰이지 않으므로 깨지지 않는다.

### 1.8 지금 Sites에서 보이지 않던 무료 한도 노출

Sites는 OpenAI 쪽 Cloudflare 계정에서 돈다. 그래서 사용자 무료 계정 한도가 지금 코드에 걸린 적이 없다. 무료 계정으로 옮기면 처음으로 다음 한도가 생긴다.

### 1.9 코드로 추정한 D1 사용량(측정 아님)

- 스키마만 적용한 임시 SQLite에서 실행 계획을 확인했다(운영 데이터 미사용).
  - 수집 PUT과 마지막 GET이 매번 부르는 `queryCoverage()`(`lib/hotel-repository.ts` 91–98행)는 `hotels` 전체(커버링 인덱스 스캔)와 `crawl_jobs` 전체를 훑는다.
  - 2026-10-08 행 수 기준 한 번에 약 2.8만 행을 읽는다.
  - 쓰기 때마다 `invalidateSearch()`가 집계 캐시를 비우므로 캐시가 효과가 없다.
- gentle 1회 = PUT 16번 + GET 1번 ≈ 47만 행. 하루 8회 ≈ **약 380만 행**. 무료 한도 500만 행의 약 75%다. 여기에 작업 선점, 준비 단계, 일일 백업(약 9만 행), 화면 이용이 더해진다.
  - 화면 이용: 목록 집계와 이름 부분검색은 `hotels`를 전체 스캔한다. 요청당 약 1.2만~4만 행이다.
- D1 무료 한도를 넘으면 그날 00:00 UTC(09:00 KST)까지 모든 D1 쿼리가 실패한다. 사이트 전체가 멈춘다.
- 초기 적재 쓰기: 인덱스마다 쓰기 1행이 추가로 계산된다(D1 가격 문서). 2026-10-08 행 수로 보면 인덱스를 포함해 약 20만 행이다. 인덱스를 세지 않으면 약 4.4만 행이다. 하루 무료 쓰기 10만 행을 넘을 수 있어 2–3일에 나눠 적재해야 할 수 있다.
- 수집기의 일상 쓰기량은 추정하지 못했다(목록 페이지당 링크 수에 따라 다름). 병행 운영과 전환 직후에 측정해야 한다.
- 요청당 D1 쿼리 50개 한도(무료). 일반 요청은 10–20개로 보인다. 하지만 `catalog_meta`가 비었을 때의 seed 일괄 적재(약 45개 이상)와 `reindexNames`(1만 2천 행을 100행씩)는 넘는다.

## 2. 후보 비교

확인 방법:
- Cloudflare 문서: 공식 문서 원본 저장소 `github.com/cloudflare/cloudflare-docs`를 2026-10-11에 내려받아 해당 페이지 원문을 직접 읽었다(커밋 `0d35c2c`, 2026-10-10 23:55 UTC). 이 환경에서 `developers.cloudflare.com` 직접 접속은 프록시 403·DNS 실패였다.
- 그 밖의 서비스: 2026-10-11에 웹 검색 요약으로만 확인했다. 원문을 열지 못했다(DNS 실패). 표에 “검색 요약”으로 표시한다.

### 2.1 비교표

| 후보 | 관련 무료 한도 | 출처·확인일 | 한국·일본 지연 | 소유자 전용 접근 | 필요한 코드 변경 | 사용자 수동 작업 | 적합도 |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers Free + D1 Free + Access Free** | 요청 10만/일(정적 파일 요청은 무료·무제한), CPU 10ms/요청(가끔 넘는 것은 허용, 계속 넘으면 1102 오류), 메모리 128MB, Worker 크기 64MiB(압축 한도 없음), 시작 1초, 하위 요청 50/호출, cron 5개/계정. D1: DB 최대 500MB, 계정 5GB, 읽기 500만 행/일, 쓰기 10만 행/일(인덱스 쓰기 포함), 호출당 쿼리 50, Time Travel 7일, 파일 가져오기 5GB, 한도 00:00 UTC 초기화. Access: Zero Trust Free 50명 | Cloudflare 문서 원본(위 커밋), 2026-10-11. Zero Trust 50명은 검색 요약 | Worker는 요청을 받은 엣지에서 실행. D1 주 인스턴스는 `--location apac` 힌트로 아시아·태평양에 둘 수 있으나 도시는 보장 안 됨. `placement`(smart 또는 region 힌트)로 Worker를 DB 가까이 둘 수 있음(모든 플랜). 한국 통신사별로 무료 트래픽이 LAX·SIN으로 간다는 커뮤니티 보고 있음(미확인) | Access로 workers.dev 운영·미리보기 URL 보호(대시보드 클릭). 이메일 일회용 코드 로그인. 실행기는 서비스 토큰 + Service Auth 정책 | 거의 없음: 배포 설정(D1 ID·Worker 이름·마이그레이션 경로), 실행기·수집기의 주소·헤더, D1 한도 대응(집계 쿼리 축소) | 계정 가입, Zero Trust 활성화(결제수단 입력 요구 가능, 무과금, 검색 요약), API 토큰, GitHub Secret, Access 정책·서비스 토큰 | **높음(조건부)** |
| (참고) Cloudflare Workers Paid | 월 5달러. 요청 1천만/월, CPU 3천만 ms/월, 요청당 기본 30초. D1 읽기 250억/월, 쓰기 5천만/월, Time Travel 30일, 호출당 쿼리 1,000 | Cloudflare 문서 원본, 2026-10-11 | 무료와 같음 | 무료와 같음 | 없음(플랜만 변경) | 결제 | 무료가 아님. 한도 초과 시 대안 |
| Vercel Hobby + Turso Free | Vercel: 함수 호출 100만/월, Active CPU 4시간/월, 메모리 2GB 고정, 최대 300초, 비상업 개인용, 초과 시 30일 사용 중지, cron 하루 1회. Turso: DB 100개, 저장 5GB, 읽기 5억 행/월, 쓰기 1천만 행/월, 시점 복구 1일 | 검색 요약(vercel.com/docs/plans/hobby 미러, turso.tech/pricing), 2026-10-11 | 함수 기본 지역 `iad1`(미국). 지역 변경 가능하나 Hobby에서 `icn1`·`hnd1` 사용 가능 여부 미확인. Turso Tokyo(`aws-ap-northeast-1`) 코드가 API 문서 예시에 있음 | Hobby는 운영 도메인 보호 불가(미리보기만). 앱에 로그인 기능을 새로 만들어야 함 | 큼: vinext를 Nitro로 Vercel에 올리거나 `next build`로 전환. `cloudflare:workers` import 5곳 교체. D1 API를 libSQL로 감싸는 계층. Miniflare 기반 Worker 검사 재작성. 앱 로그인 추가 | Vercel·Turso 가입, GitHub 앱 연결, 토큰 | 중간(차선) |
| Netlify Free | 크레딧 300/월, 넘으면 사이트 중지(배포 15, 대역폭 20/GB, 연산 10/GB-시간, 요청 2/1만) | 제3자 요약(검색), 2026-10-11 | 미확인 | 미확인 | Vercel과 비슷하게 큼 + DB 교체 | 가입 | 낮음 |
| Render Free | 15분 무요청 시 정지(재시작 약 1분), 750시간/월, 무료 Postgres 30일 뒤 만료 | render.com/docs/free(검색 요약), 2026-10-11 | 미확인 | 미확인 | 큼(Node 서버 + DB 교체) | 가입 | 부적합 |
| Supabase Free | Postgres 500MB, 1주 무활동 시 일시정지, 무료 프로젝트 2개, PITR 없음 | 제3자 요약(검색), 2026-10-11 | 미확인 | 미확인 | 매우 큼: SQLite SQL(`json_extract`·`json_each`·`julianday`·`GLOB`)을 Postgres로 재작성 | 가입 | 부적합 |
| Deno Deploy Free | 출처마다 다름(요청 100만/월, CPU 10–15시간/월 등) | 제3자 요약(검색), 2026-10-11 | 미확인 | 미확인 | 큼(Nitro 경유 + DB 교체) | 가입 | 낮음 |

### 2.2 Cloudflare 세부 확인 사항(문서 원본)

- Worker 크기: 현재 문서는 “압축 한도 없음, 비압축 64MiB”다. 2026-08-31 주 변경으로 보인다. 예전 3MB(무료) 한도는 사라졌다. 이 앱 번들은 약 6.3MB다.
- CPU: DB 대기 시간은 CPU에 넣지 않는다. 한도를 넘으면 Error 1102다. Workers Logs의 호출 로그에 CPU 시간이 나온다.
- 정적 파일 요청은 Worker 요청 수에 넣지 않는다. 단 `run_worker_first` 경로는 Worker 요청이다.
- `workers.dev`, 버전 URL, 미리보기 URL은 기본 공개다. Access로 Worker 하나의 운영·미리보기를 함께 보호할 수 있다(대상 유형 `worker`). 대시보드에서만 끄고 wrangler 설정에 `workers_dev`를 적지 않으면 다음 배포 때 다시 켜진다.
- 서비스 토큰: Access 정책 동작을 Service Auth로 둬야 한다. 헤더 `CF-Access-Client-Id`, `CF-Access-Client-Secret`. 한 헤더(`Authorization`)로 받는 설정도 있다.
- 마이그레이션: `migrations_dir`·`migrations_table`을 D1 바인딩에 지정할 수 있다. `wrangler d1 migrations apply <DB> --remote`.
- 가져오기·내보내기: `wrangler d1 execute <DB> --remote --file`(5GB까지), `wrangler d1 export <DB> --remote --output <파일>`. 내보내는 동안 다른 요청이 막힌다. 문장 하나는 100KB 이하, 바인딩 인자 100개 이하.
- R2 무료: 10GB-월, Class A 100만/월, Class B 1천만/월. 처음 쓸 때 결제수단을 요구한다는 제3자 보고가 있다(미확인). 이번 계획은 R2가 필요 없다.
- API 토큰: GitHub Actions 문서는 `Edit Cloudflare Workers` 템플릿과 Secret `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`를 안내한다. D1 권한은 따로 `D1 Edit`를 추가한다(권한 목록 문서).
- `cloudflare/wrangler-action`은 v4(4.1.3, 2026-09-24)다. 입력은 `apiToken`, `accountId`, `command`, `wranglerVersion`, `secrets`, `preCommands`, `packageManager` 등이다(저장소 원본 확인).

## 3. 추천안과 이전 계획

### 3.1 추천안

Cloudflare Workers Free + D1 Free, 주소는 `https://<Worker 이름>.<계정 서브도메인>.workers.dev`로 한다. 사이트는 public이다(결정 반영).

- 코드 변경이 가장 작다. 빌드 산출물이 이미 Worker 형식이다. D1 바인딩·SQL·Miniflare 검사·백업 형식을 그대로 쓴다.
- 에이전트가 GitHub만으로 운영할 수 있다. 병합 → Actions가 빌드·마이그레이션·배포·점검을 한다. 롤백은 `wrangler rollback`과 D1 Time Travel(7일)로 한다.
- DDoS 방어가 모든 플랜에 무료로 들어 있다. 무료 플랜은 한도를 넘으면 요청을 거절할 뿐 요금이 나오지 않는다.
- 사용자 도메인 비용이 없다. 커스텀 도메인은 도메인을 이미 가진 경우에만 나중에 붙인다.
- 백업은 지금 방식(Actions artifact)을 유지하고 D1 Time Travel 7일이 더해진다.

다음 경우에는 전환을 멈추고 다시 판단한다.
- 병행 운영에서 1102(CPU) 오류가 반복되거나, D1 읽기·쓰기가 하루 한도의 70%를 넘는다. 이때 선택지는 ① 코드 최적화 뒤 재측정, ② Sites 유지다. Workers Paid는 쓰지 않는다(결정 반영, Codex 검토 2026-10-11).
- 한국에서 잰 지연이 Sites보다 나쁘다.

### 3.2 단계별 계획

이 계획은 사용자 결정을 돕는 초안이다. 각 단계의 실제 명령·workflow는 그 단계의 PR에서 확정하고 검토받는다. `wrangler d1` 명령은 데이터베이스 이름(`yukemuri`)을 첫 인자로 받는다. 앱 레포에서는 `--config dist/server/wrangler.json`을 함께 준다.

각 단계는 별도 PR·별도 세션으로 진행한다. 검토 규칙은 `AGENTS.md`를 따른다. 지금 `AGENTS.md`·`docs/cloud-development.md`는 호스팅 이전과 Secret 회전을 위임 범위 밖으로 둔다. 사용자가 이 계획을 승인한다는 결정을 먼저 기록해야 한다.

**0단계. 결정 기록(에이전트, 문서 PR)**
- 승인 범위를 인수인계와 로드맵에 기록한다. 이전 작업 ID(예: H01), 공유 범위(public 유지), 새 Secret 이름, 전환·롤백 조건이다.

**1단계. 계정 준비(사용자, 3.3절)**
- Cloudflare 가입, API 토큰, GitHub Secret을 만든다. Zero Trust는 필요 없다(결정 반영).

**2단계. 배포 설정과 한도 대응(에이전트, 앱 레포 PR)**
- `vite.config.ts`:
  - Worker 이름 `yukemuri`를 명시한다.
  - 실제 D1 ID는 환경 변수가 없으면 지금 자리표시자를 쓴다. 이렇게 해서 CI 검사와 로컬 개발을 그대로 둔다.
  - `migrations_dir: "drizzle"`, `workers_dev: true`, 미리보기 URL 끔, `placement`, `observability`를 둔다.
- 새 workflow `deploy.yml`:
  - 자동 배포는 4단계 적재(`catalog_meta` 포함)가 끝난 뒤에 켠다. 그 전 main 병합에서는 workflow가 Time Travel 조회·마이그레이션·배포·점검을 모두 건너뛴다. 실제 `database_id`가 없거나 설정의 자동 배포 표시가 꺼져 있으면 건너뛴다. 첫 배포는 적재 완료를 기록하는 PR이 이 표시를 켜면서 일어난다(Codex 검토, 2026-10-11).
  - main push 때 checks와 같은 설치·빌드를 한다.
  - `wrangler d1 time-travel info yukemuri --config dist/server/wrangler.json`으로 복구 지점(bookmark)을 기록한다. 데이터베이스 이름은 필수 인자다(Codex 검토, 2026-10-11).
  - `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json`(새 마이그레이션이 있을 때만) → `wrangler deploy --config dist/server/wrangler.json` 순서다.
  - 비밀 `CRAWL_ACCESS_KEY`는 wrangler-action `secrets` 입력으로 올린다.
  - 공개 `/api/hotels`와 크롤 키를 쓰는 `/api/crawl?report=1`을 점검한다. 이 점검은 적재가 끝난 뒤에만 실행된다. `/api/hotels`는 `hotelRepository.ready()`를 거쳐 빈 DB에 `importSnapshot()`·`reindexNames()`로 쓰기 때문이다. 적재 전 상태 확인은 DB를 바꾸지 않는 `wrangler d1 execute ... --command "SELECT COUNT(*) ..."`로만 한다(Codex 검토, 2026-10-11).
  - 배포 버전 ID를 요약에 남긴다. 권한은 `contents: read`로 둔다.
- 수집기·배포 자료:
  - `build-collector-release.mjs`의 `siteOrigin`을 빌드 변수로 정한다.
  - `scripts/crawler/*.py`의 `.chatgpt.site` 검사를 허용 목록 방식으로 바꾼다.
  - 새 주소에는 Sites 전용 `OAI-Sites-Authorization` 헤더를 보내지 않는다. 앱용 `X-Yukemuri-Crawl-Key`만 보낸다. 키는 지금처럼 표준입력으로만 받는다.
- D1 무료 한도 대응:
  - 수집 PUT·GET의 `coverage`를 가볍게 하거나 요청할 때만 계산한다(`update-site.py` 182·189행이 쓰는 값만).
  - 로컬 Miniflare에서 대표 요청의 `meta.rows_read`·`rows_written`을 재는 검사를 추가한다. Miniflare가 이 값을 운영과 같게 세는지는 미확인이다.
- 공개 사이트 보호(결정 반영):
  - Cloudflare는 L3·L4·L7 DDoS 방어를 모든 플랜에 자동으로, 사용량 제한 없이 적용한다(DDoS 문서).
  - Worker의 Rate Limiting 바인딩으로 `/api/*` 요청을 접속 IP별로 제한한다. 크롤 키가 맞는 유지보수 요청(수집기·백업)은 이 제한에서 뺀다. GitHub Actions 실행기 IP가 일반 방문자처럼 제한되지 않게 하기 위해서다. 제한은 Cloudflare 위치마다 따로 세고 근사값이다. 넘으면 429와 화면 안내를 보인다. 무료 플랜에서 쓸 수 있는지는 이 PR에서 실제 배포로 확인한다.
  - 익명 일반 검색 응답만 짧게 캐시해 D1 읽기를 줄인다. 즐겨찾기 결과(`saved=1`)처럼 `X-Yukemuri-Visitor`에 따라 달라지는 응답은 공용 캐시에 넣지 않는다. 지금처럼 `no-store`로 둔다(`catalog-operations.md`의 공유 캐시 규칙, Codex 검토 2026-10-11).
  - `robots.txt`로 `/api/`와 알려진 AI 수집 봇을 막는다. 규칙을 지키는 봇에만 효과가 있다.
  - Bot Fight Mode·WAF 사용자 규칙·속도 제한 규칙은 도메인(zone) 단위 기능이다. `workers.dev`에는 쓸 수 없다. 도메인은 유료라서 쓰지 않는다.
  - 무료 플랜은 하루 요청 10만 건을 넘으면 1027 오류로 거절한다. 공격을 받으면 09:00 KST까지 사이트가 멈출 수 있다. 요금은 나오지 않는다.
- 문서: `sites-handoff.md`를 새 배포 절차 문서로 바꾸고 `deployments.md` 형식을 고친다. “GitHub merge ≠ 게시”를 “main 병합 = 자동 배포, 배포 결과는 Actions 기록으로 확인”으로 바꾼다.

**3단계. D1 생성과 스키마(에이전트, 수동 실행 workflow)**
- `wrangler d1 create yukemuri --location apac`를 실행한다. 출력된 `database_id`(비밀 아님)를 PR로 커밋한다.
- `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json`으로 0000–0012를 적용한다(Codex 검토, 2026-10-11). 이 단계는 수동 실행 workflow로 하고 Worker는 배포하지 않는다. 자동 배포는 아직 꺼져 있다.
- 운영 DB를 개발 환경에 연결하지 않는다. 개발·CI는 계속 임시 Miniflare DB를 쓴다.

**4단계. 백업에서 새 DB로 적재(에이전트, 실행기 레포의 수동 실행 workflow)**
- 실행기 레포 Actions 안에서만 처리한다. 백업 artifact가 그 레포에 있고 개인 자료가 들어 있기 때문이다.
  1. 최신 성공 일일 백업 artifact를 내려받는다(`actions: read`). `sha256sum -c`로 확인한다.
  2. 기존 `catalog-checkpoint.py restore`로 임시 SQLite를 만든다.
  3. 테이블별로 데이터만 담은 INSERT SQL을 문장당 100KB 이하로 만든다. 이력 테이블과 제외 테이블(`price_quotes`, `hotel_result_sessions`)은 넣지 않는다.
  4. `wrangler d1 execute yukemuri --remote --file <SQL> --config <D1 바인딩 설정>`으로 적재한다. 실행기 레포에는 앱의 wrangler 설정이 없다. 그래서 3단계에서 커밋한 `database_id`로 D1 바인딩만 담은 임시 설정 파일을 만들어 준다. 하루 쓰기 한도를 넘지 않게 테이블 순서·날짜를 나눈다. 예: 1일차 `hotels`, 2일차 `crawl_jobs`, 3일차 나머지와 `catalog_meta`. `catalog_meta`는 첫 공개 접속 전에 꼭 넣는다.
  5. 백업 manifest의 행 수와 새 D1의 `COUNT(*)`를 비교한다. 로그에는 개수만 남긴다.
- SQL·SQLite는 runner 임시 폴더에서 지운다. artifact로 올리지 않는다.
- 계정 내보내기의 `d1-database-0001.sql`(2026-10-08)은 오래됐다. 백업을 쓸 수 없을 때의 마지막 수단으로만 둔다. Git에 넣지 않는다.

**5단계. 병행 운영과 검증(에이전트 + 사용자 확인, 최소 3–7일)**
- 수집기는 계속 Sites를 대상으로 둔다. 새 주소는 조회 검증 전용이다. 새 DB의 자료는 그동안 오래된 상태로 남는다.
- 통과 조건:
  - `cloud-check.py --full` 통과, 브라우저 검사(U01·U02·U03) 통과.
  - 새 주소에서 미게시 병합분(U01·U02·D01·U03 등)이 동작한다.
  - Workers Logs에서 `exceededCpu`가 없고 CPU 시간이 기록된다.
  - D1 일일 읽기·쓰기가 한도의 70% 미만이다.
  - 사용자가 집·휴대폰 통신사에서 `/cdn-cgi/trace`의 `colo` 값과 체감 속도를 Sites와 비교한다.
  - 속도 제한(429) 응답과 화면 안내를 확인한다.
- 수집 부하는 이 단계에서 나오지 않는다. 그래서 2단계의 로컬 측정과 7단계의 첫 24–48시간 관찰로 확인한다.

**6단계. 전환(에이전트 PR + 사용자 확인)**
1. 실행기 예약을 잠시 멈춘다. 예약을 끄는 PR을 병합하거나, 사용자가 `YUKEMURI_ENABLED`를 `false`로 바꾼다. 실행 중인 작업이 끝났는지 본다.
2. 기존 Sites에는 쓰기 차단 기능을 게시하지 않는다(결정 반영). 사용자는 3번부터 7번까지 기존 Sites에서 즐겨찾기를 바꾸지 않는다. 다른 방문자·오래된 탭의 쓰기 유실 위험은 사용자가 받아들였다. 5번 재백업 대조로 확인한다.
3. 실행기 수동 백업을 한 번 실행해 최종 체크포인트를 만든다.
4. 4단계 적재본과 최종 체크포인트를 테이블별 키로 비교한다. 바뀌거나 새로 생긴 행은 새 D1에 upsert한다(키 + 행 해시 비교). 최종 체크포인트에 없는 키의 행은 새 D1에서 지운다. 즐겨찾기 해제·출처 묶음 삭제가 여기에 해당한다. 키가 불분명하거나 차이가 큰 테이블은 그 테이블을 비우고 최종 체크포인트로 다시 적재한다. 행 수와 키 집합을 대조한다(Codex 검토, 2026-10-11).
5. 실행기 PR(6) 직전에 기존 Sites를 한 번 더 백업한다. 6에서 백업 대상이 새 주소로 바뀌기 때문이다. 즐겨찾기 테이블(`favorites`, `visitor_favorites`)이 최종 체크포인트와 같은지 확인한다. 다르면 4와 같은 방법으로 차이(삭제 포함)를 새 D1에 반영하고 원인을 기록한다.
6. 실행기 PR:
   - 수집 workflow를 새 Secret `YUKEMURI_CLOUDFLARE_JSON`과 새 주소로 바꾼다.
   - `bootstrap.py`의 `SITE_ORIGIN`, `run-updates.py` 허용 호스트, `run-backup.py` 허용 호스트, `catalog-checkpoint.py` 검사와 헤더를 바꾼다.
   - 백업 workflow도 새 주소로 바꾼다.
   - 수동 `check-access` → `gentle` 1회를 실행하고 저장 후 조회를 확인한다.
7. 예약을 다시 켠다. Sites는 그대로 두되 수집기 대상에서 뺀다. 사용자는 이후 새 주소만 쓴다. 기존 Sites에서 바꾼 즐겨찾기는 새 DB로 옮기지 않는다.

**7단계. 관찰(에이전트, 첫 1주)**
- 실제 cron 실행의 `collectorRelease`, 저장 수, 1102 오류, D1 일일 사용량을 매일 기록한다.
- 일일 백업이 새 주소에서 성공하는지 확인한다.

**8단계. Sites 정리(사용자 결정)**
- 2주 이상 안정되면 Sites를 유지할지 삭제할지 사용자가 정한다. 삭제는 ChatGPT의 Sites에서만 할 수 있다.
- `YUKEMURI_ACCESS_JSON`을 지우면 Sites용 수집·백업이 영구 중단된다.

**롤백**

| 시점 | 방법 | 손실 |
|---|---|---|
| 6단계 전 | 아무것도 하지 않음. Sites·수집·백업 무변경 | 없음 |
| 전환 직후 앱 결함 | `wrangler rollback`(이전 Worker 버전) 또는 이전 커밋 재배포 | 없음 |
| DB 손상 | `wrangler d1 time-travel restore yukemuri --bookmark <배포 때 기록한 값>`(7일 이내, 덮어쓰기) 또는 최신 백업 재적재 | 복구 지점 이후 기록 |
| 새 호스팅 포기 | 실행기 PR을 되돌려 Sites Secret·주소로 복귀 | 전환 뒤 새 DB에만 쌓인 수집 관측(재수집 가능)과 새 주소에서 만든 즐겨찾기. Sites DB에 되돌려 넣을 도구가 없음 |

### 3.3 사용자만 할 수 있는 일

Secret 값은 채팅·PR·로그에 붙여 넣지 않는다. GitHub 화면의 Secret 입력란에만 넣는다.

1. **Cloudflare 가입**: https://dash.cloudflare.com/sign-up 에서 본인 이메일로 가입하고 이메일을 인증한다. Workers & Pages에 처음 들어갈 때 `workers.dev` 계정 서브도메인을 정한다.
2. **Zero Trust**: 필요 없다. 사이트를 public으로 두기로 했다(결정 반영).
3. **API 토큰 생성**: 대시보드 → Account API tokens → Create Token → 템플릿 “Edit Cloudflare Workers”로 시작한다.
   - 권한을 추가·확인한다: Account `Workers Scripts: Edit`, Account `D1: Edit`, Account `Account Settings: Read`. 선택: Account `Account Analytics: Read`(에이전트가 CPU·D1 사용량을 읽을 때).
   - Account Resources는 본인 계정 하나만 고른다. Zone Resources는 커스텀 도메인을 쓰지 않으면 비운다.
   - 만료일을 정하고 Account ID를 함께 메모한다.
4. **GitHub Secret 등록**(Settings → Secrets and variables → Actions → New repository secret). 이름은 제안이며 2단계 PR에서 확정한다.
   - `jihune/yukemuri`:
     - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
     - `YUKEMURI_CRAWL_ACCESS_KEY`: 비밀번호 관리자 등에서 만든 새 임의값, 예: 64자리 16진수. 기존 Sites 키와 다른 값을 권장한다.
   - `jihune/yukemuri-script-runner`:
     - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`: 4·6단계 적재용. 끝나면 지워도 된다.
     - `YUKEMURI_CLOUDFLARE_JSON`: 새 주소와 크롤 키를 담은 JSON. 기존 `YUKEMURI_ACCESS_JSON`과 같은 `{"url","token"}` 형식이다. 6단계 PR에서 확정한다.
   - 기존 `YUKEMURI_ACCESS_JSON`은 Sites 정리 전까지 지우지 않는다.
5. **Access 설정**: 필요 없다(결정 반영).
6. **확인**:
   - 새 주소에 로그인 없이 접속해 화면을 확인한다. 사이트는 public이다(결정 반영, Codex 검토 2026-10-11).
   - 집·휴대폰에서 `https://<새 주소>/cdn-cgi/trace`의 `colo`를 알려준다. 같은 방법으로 Sites 주소도 확인하면 비교할 수 있다.
7. **전환 전 Sites 게시**: 하지 않는다(결정 반영). 전환하는 동안 기존 Sites에서 즐겨찾기를 바꾸지 않는다.
8. **선택**:
   - 즐겨찾기·비교 목록을 이어 쓰려면 기존 주소의 localStorage `yukemuri-visitor-v1` 값을 새 주소에 옮긴다. 개발자 도구에서 하며, 에이전트가 안내문을 준비한다.
   - Sites 삭제 여부와 시점을 정한다. 무료 한도를 넘으면 코드 최적화나 Sites 유지 중에서 고른다. Workers Paid는 쓰지 않는다(결정 반영).

### 3.4 에이전트가 자동으로 할 일

- 2단계 앱 레포 PR(배포 설정, 배포 workflow, 수집기 주소·헤더, D1 한도 대응, 측정 검사, 문서)과 검토·병합.
- D1 생성·마이그레이션·적재·차이 반영 workflow 작성과 수동 실행. 행 수 대조 기록.
- 실행기 레포 PR: 주소·허용 호스트·헤더·Secret 이름 변경, 예약 일시 정지·재개, 백업 대상 변경.
- 배포 뒤 점검: Actions 요약, Workers Logs·D1 사용량(Analytics 권한이 있을 때), 브라우저 검사.
- 롤백 실행(`wrangler rollback`, Time Travel 복구 workflow, 실행기 되돌리기 PR)과 기록.
- `deployments.md`·인수인계·로드맵에 커밋·Worker 버전 ID·시각(UTC/KST)·검사·미확인 사항 기록.

### 3.5 위험과 미확인 사항

1. **CPU 10ms**:
   - 첫 요청의 검색 색인 생성(1만 2천 행 JSON 해석 + 색인 준비, `catalogueSearchIndex`), React 서버 렌더링, 4.77MB seed 모듈 평가가 한도를 넘을 수 있다.
   - 로컬 Miniflare 측정은 SQLite 포함 벽시계 시간 31–152ms 중앙값이었다(`docs/U02-20261010.md` 173–183행). CPU만 따로 잰 값은 없다.
   - 문서는 “가끔 넘는 것은 허용, 계속 넘으면 종료”라고만 한다. 허용 폭은 공개되지 않았다.
2. **D1 읽기 500만 행/일**: 수집기만으로 약 380만 행/일이 추정된다(1.9). 넘으면 09:00 KST까지 사이트가 멈춘다. 2단계 코드 변경 없이 무료로 운영하기는 어렵다고 본다.
3. **D1 쓰기 10만 행/일**: 초기 적재 약 20만 행(추정)이라 여러 날로 나눠야 한다. 일상 수집 쓰기량은 미측정이다.
4. **요청당 D1 쿼리 50개**: seed 버전(`data/coverage.json`)을 바꾸는 미래 PR은 첫 요청에서 일괄 적재를 시도해 한도를 넘을 수 있다. 그런 변경은 배포 workflow의 별도 준비 단계로 나눠야 한다. Workers 한도 문서에는 “내부 서비스 하위 요청 1,000(무료)”이라는 다른 수치도 있다. 보수적으로 50을 기준으로 둔다.
5. **한국 지연**: 무료 플랜의 한국 경로가 ICN이 아닐 수 있다(커뮤니티 보고, 미확인). Worker와 D1이 멀면 순차 쿼리마다 왕복이 늘어난다. `placement`와 `--location apac`로 줄일 수 있으나 측정이 필요하다. 지금 Sites가 느린 원인(로그인 게이트, 경로, DB 위치, 첫 요청 색인 생성)도 확인하지 못했다.
6. **접근 정책**: 사이트는 public으로 둔다(결정 반영). 내보내기와 `START_HERE.md`도 Sites를 public으로 기록한다.
7. **악성 봇·과도한 요청**: `workers.dev`에서는 Bot Fight Mode와 WAF 규칙을 쓸 수 없다. Worker 안의 속도 제한과 캐시로 줄인다. 무료 한도를 넘기면 그날 09:00 KST까지 1027 오류가 나지만 요금은 없다. Rate Limiting 바인딩의 무료 플랜 사용 가능 여부는 2단계에서 확인한다.
8. **즐겨찾기 토큰**: 주소가 바뀌면 localStorage가 비어 보인다. DB의 행은 남는다.
9. **비원자적 백업**: 최종 체크포인트도 단일 시점 스냅샷이 아니다. 전환 중 예약을 멈추는 이유다.
10. **GitHub Actions 사용량**: 사용자 GitHub 플랜은 미확인이다. Free 개인 계정이면 private 레포 합계 2,000분/월, artifact 500MB다(검색 요약). 지금 수집(하루 8회 × 약 3분), 백업, PR 검사에 배포가 더해진다. 백업 artifact 크기도 미확인이다.
11. **Zero Trust 결제수단**: Access를 쓰지 않으므로 해당 없다(결정 반영).
12. **vinext 베타**: `1.0.0-beta.5`다. Cloudflare 경로는 Sites에서 이미 운영 중이라 위험이 낮다. 다른 플랫폼(Nitro 경유)은 검증되지 않았다.
13. **Secret 정책**: 새 크롤 키 생성은 사실상 Secret 회전이다. `AGENTS.md`상 사용자 승인이 필요하다.

## 4. 확인하지 못한 것

- 운영 Sites의 현재 공유 범위, 현재 D1 실제 크기·행 수, 최근 실행기·백업 실행 결과. 운영에 접속하지 않았다.
- Sites가 느린 실제 원인과 Sites의 D1 위치.
- 이 앱의 Workers CPU 시간, D1 행 읽기·쓰기 실측값. 위 수치는 코드·실행 계획·2026-10-08 행 수로 낸 추정이다.
- D1 가져오기(`execute --file`)가 쓰기 한도에 어떻게 계산되는지. 인덱스 자동 생성분(`sqlite_autoindex`)을 쓰기로 세는지도 확인하지 못했다.
- 한국 통신사별 Cloudflare 무료 플랜 경로(ICN·NRT·LAX·SIN).
- Zero Trust Free와 R2의 결제수단 요구. 검색 요약만 확인했다.
- Vercel Hobby의 함수 지역 제한(`icn1`·`hnd1`), 운영 도메인 보호 범위. Turso 무료 플랜의 Tokyo 지역. Netlify·Deno Deploy·Supabase 한도. 모두 검색 요약이나 제3자 자료뿐이다.
- 사용자 GitHub 플랜과 Actions 사용량, 백업 artifact 크기.
- 최신 main으로 다시 빌드한 번들 크기와 `wrangler deploy --dry-run` 결과. 2026-10-10 빌드 산출물로만 쟀다.
- Miniflare의 `meta.rows_read`가 운영 D1과 같게 세는지.

## 5. 출처

공식 문서 원본(2026-10-11 확인, `github.com/cloudflare/cloudflare-docs` 커밋 `0d35c2c`, 2026-10-10 23:55 UTC):
- https://developers.cloudflare.com/ddos-protection/about/ (2026-10-11T08:2xZ 원본 확인: 모든 플랜에 L3·L4·L7 DDoS 방어를 사용량 제한 없이 제공)
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ (같은 시각 원본 확인: 위치별·근사 카운터)
- https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ (같은 시각 원본 확인: 도메인 단위 설정)
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://developers.cloudflare.com/d1/configuration/data-location/
- https://developers.cloudflare.com/d1/best-practices/read-replication/
- https://developers.cloudflare.com/workers/configuration/placement/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- https://developers.cloudflare.com/r2/pricing/

저장소 원본(2026-10-11 확인):
- https://github.com/cloudflare/wrangler-action (v4.1.3, 마지막 커밋 2026-09-24)
- https://github.com/cloudflare/vinext README(마지막 커밋 2026-10-10)

검색 요약만 확인(2026-10-11, 원문 미열람):
- Zero Trust 온보딩·결제수단: https://developers.cloudflare.com/cloudflare-one/setup/
- Zero Trust Free 50명: https://blog.cloudflare.com/teams-plans
- workers.dev 원클릭 Access: https://developers.cloudflare.com/changelog/2025-10-03-one-click-access-for-workers
- Vercel: https://vercel.com/docs/plans/hobby (미러 https://examples.vercel.com/docs/plans/hobby), https://vercel.com/docs/deployment-protection, https://vercel.com/docs/functions/limitations, https://vercel.com/docs/functions/configuring-functions/region, https://vercel.com/docs/cron-jobs/usage-and-pricing
- Turso: https://turso.tech/pricing, https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan, https://docs.turso.tech/api-reference/locations/list
- Render: https://render.com/docs/free
- Netlify(제3자): https://flaviocopes.com/hosting-free-tiers/, https://agentdeals.dev/netlify-vs-render
- Supabase(제3자): https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
- Deno Deploy: https://docs.deno.com/deploy/usage/ (제3자 https://costbench.com/software/cdn-edge/deno-deploy/free-plan/)
- GitHub Actions 사용량: https://docs.github.com/billing/managing-billing-for-your-products/managing-billing-for-github-actions
- R2 결제수단(제3자): https://tech-insider.org/au/how-to-set-up-cloudflare-r2-2026/
- 한국 경로(커뮤니티): https://damoang.net/development/2488, https://lowendtalk.com/discussion/comment/2962988/, https://station.railway.com/questions/routing-issues-across-railway-from-korea-ab0144d2

레포 근거 파일(앱 `jihune/yukemuri`): `package.json`, `vite.config.ts`, `build/sites-worker.ts`, `build/sites-vite-plugin.ts`, `scripts/run-framework.mjs`, `scripts/cloud-setup.sh`, `.openai/hosting.json`, `cloudflare-env.d.ts`, `db/schema.ts`, `drizzle/`, `lib/crawl-access.ts`, `lib/favorites-db.ts`, `lib/hotel-repository.ts`, `lib/catalog-export.ts`, `lib/api-client.ts`, `app/api/*/route.ts`, `scripts/build-collector-release.mjs`, `scripts/crawler/update-site.py`, `.github/workflows/web-checks.yml`, `docs/*.md`.
실행기 `jihune/yukemuri-script-runner`: `.github/workflows/yukemuri-catalog.yml`, `yukemuri-backup.yml`, `scripts/runner/bootstrap.py`, `scripts/run-updates.py`, `maintenance/catalog-backup/scripts/run-backup.py`, `catalog-checkpoint.py`.
Sites 내보내기: `…/sites/projects/project-0001/` 의 `project.json`, `access_policies/`, `deployments/`, `versions/`, `cloudflare/worker/`, `cloudflare/d1/`(크기·테이블 이름·행 수만), `env/`(이름만).
