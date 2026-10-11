# Cloudflare 배포 절차(H01)

기록: 2026-10-11T10:08Z / 2026-10-11 19:08 KST(첫 커밋 `e426686`). H01 2단계 PR에서 만들었다. 갱신: 2026-10-11T10:21Z(커밋 `e60627c`, 상위 세션 전달에 맞춰 사용자 작업과 서브도메인 등록 반영).
대상: Cloudflare Workers Free + D1 Free, 주소 `https://yukemuri.<계정 서브도메인>.workers.dev`. 사이트는 public이다. 유료 플랜·유료 도메인·Cloudflare Access는 쓰지 않는다(사용자 결정, 2026-10-11T08:25Z).
전체 계획과 근거는 `hosting-review-20261011.md`의 ‘결정 반영’ 절과 3.2절이다. 전환(6단계)이 끝날 때까지 운영은 기존 Sites다(`sites-handoff.md`).

## 파일

| 파일 | 역할 |
|---|---|
| `cloudflare-deploy.json` | 비밀이 아닌 배포 값. `workerName`·`databaseName`(둘 다 `yukemuri`), `databaseId`(D1 UUID 또는 `null`), `publicOrigin`(workers.dev 주소 또는 `null`), `autoDeploy`(true/false) |
| `vite.config.ts` | 위 값으로 `dist/server/wrangler.json`을 만든다. `databaseId`가 `null`이면 지금까지 쓰던 자리표시자 `00000000-0000-4000-8000-000000000000`을 쓴다. 그래서 CI·로컬 개발·빌드는 계정 없이 동작한다 |
| `.github/workflows/deploy.yml` | main push·수동 실행. 아래 ‘자동 배포’ |
| `.github/workflows/d1-setup.yml` | 수동 실행 전용. 아래 ‘3단계: D1 만들기’ |
| `scripts/cloudflare-deploy-gate.mjs` | 배포 여부 판정 |
| `scripts/cloudflare-d1-setup.mjs` | D1 찾기·만들기 |
| `scripts/cloudflare-workers-subdomain.mjs` | `workers.dev` 서브도메인 읽기, 없을 때만 등록 |
| `scripts/cloudflare-smoke.mjs` | 배포 뒤 점검 |
| `lib/edge-guard.ts` | 공개 사이트 보호(IP별 속도 제한) |
| `public/robots.txt` | `/api/`와 알려진 AI 수집 봇 차단 요청 |

생성된 `dist/server/wrangler.json`의 설정: Worker 이름 `yukemuri`, `workers_dev: true`, `preview_urls: false`, `observability.enabled: true`, `placement.mode: smart`, D1 바인딩 `DB`(`database_name: yukemuri`, `migrations_dir: ../../drizzle`), Rate Limiting 바인딩 `API_RATE_LIMITER`(namespace `1001`, 60초에 120회). `migrations_dir`는 생성된 설정 파일 위치(`dist/server/`)에서 계산하므로 `../../drizzle`이 레포의 `drizzle/`을 가리킨다.

모든 `wrangler d1` 명령은 데이터베이스 이름과 설정 경로를 준다. 예: `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json`.

## 사용자가 한 일

사용자가 아래를 등록했다(2026-10-11T09:5xZ 사용자 보고, 상위 세션 전달). 값은 확인하지 않았다. Secret 값은 채팅·PR·로그에 붙여 넣지 않고 GitHub Secret 입력란에만 넣는다.

1. API 토큰: 프로필의 API Tokens(사용자 토큰)에서 템플릿 ‘Edit Cloudflare Workers’에 Account `D1: Edit`를 더했다. Account Resources는 본인 계정, Zone Resources는 All zones, 만료 없음, IP 제한 없음이다. 템플릿의 다른 권한(KV·R2·Pages·Tail·Workers Routes 등)도 들어 있다. `Account Analytics: Read`는 없다. CPU·D1 사용량을 API로 읽어야 할 때 사용자에게 권한 추가를 요청한다.
2. GitHub Secret:
   - 앱 레포 `jihune/yukemuri`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `YUKEMURI_CRAWL_ACCESS_KEY`(새 Worker의 `CRAWL_ACCESS_KEY`로 올라간다).
   - 실행기 레포 `jihune/yukemuri-script-runner`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`(4단계 적재용, `hosting-review-20261011.md` 3.3절). `YUKEMURI_CLOUDFLARE_JSON`은 6단계에서 정한다. 기존 `YUKEMURI_ACCESS_JSON`은 Sites 정리 전까지 지우지 않는다.
3. `workers.dev` 서브도메인: 사용자는 정하지 않았다. 3단계 workflow가 `jihune`으로 등록했다(아래 ‘3단계 결과’).

## 3단계: D1 만들기(수동 실행, Worker 배포 없음)

Secret 세 개가 생기고 상위 세션이 맡기면 실행한다.

1. Actions → ‘Cloudflare D1 setup’ → Run workflow(main). 계정에 `workers.dev` 서브도메인이 없을 때만 쓸 값을 `workers_subdomain`에 넣는다(소문자·숫자·하이픈, 1–63자, 앞뒤 하이픈 금지). 비워도 된다.
2. `scripts/cloudflare-workers-subdomain.mjs`가 Cloudflare API `GET /accounts/{account_id}/workers/subdomain`으로 현재 서브도메인을 읽는다.
   - 있으면 입력을 무시하고 바꾸지 않는다(덮어쓰지 않음).
   - 없고 입력이 있으면 같은 경로에 `PUT {"subdomain":"<입력>"}`으로 등록한다.
   - 없고 입력도 없으면 경고만 남기고 D1 작업을 이어 간다.
   - 요약에 서브도메인과 `publicOrigin`(`https://yukemuri.<서브도메인>.workers.dev`)을 쓴다. 이 형식은 `cloudflare-deploy-gate.mjs`·`build-collector-release.mjs`·`source_safety.py`의 허용 형식과 같다. 토큰은 환경 변수로만 넘기고, 출력은 서브도메인·주소·등록 여부뿐이다. 서브도메인 등록에 필요한 토큰 권한은 템플릿의 Workers 권한으로 충분하다고 보지만 실제 실행 전까지 미확인이다.
3. workflow가 빌드한 뒤 `wrangler d1 list --json`으로 `yukemuri`를 찾는다. 없으면 `wrangler d1 create yukemuri --location apac --config dist/server/wrangler.json`으로 만든다. 같은 이름이 둘 이상이면 실패한다.
4. 실행 요약에 `database_id`와 이번 실행에서 만들었는지가 나온다. 레포의 `databaseId`가 이미 다른 값이면 마이그레이션 전에 실패한다.
5. 찾은 ID를 실행기 안의 `cloudflare-deploy.json`에만 넣고 다시 빌드한 뒤 `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json`으로 0000–0012를 적용한다. 적용 목록을 요약에 남긴다. 이력 테이블은 wrangler 기본 `d1_migrations`다.
6. 에이전트가 요약의 ID를 `cloudflare-deploy.json`의 `databaseId`에 넣는 PR을 만든다. 이 PR은 `autoDeploy`를 켜지 않는다. 그래서 병합해도 배포는 계속 건너뛴다.

다시 실행해도 안전하다. 이미 있는 서브도메인·D1은 바꾸거나 만들지 않고, 적용된 마이그레이션은 다시 적용하지 않는다.

## 3단계 결과(2026-10-11)

- run 38138420167(main `da47a7a`, 12:13:00Z–12:17:14Z, 성공, 상위 세션 실행). 값은 상위 세션이 로그에서 확인해 전달했다.
- 서브도메인 `jihune`을 이번 실행에서 등록했다. 공개 주소는 `https://yukemuri.jihune.workers.dev`다. 이 주소는 배포 판정·수집기 release·`site_api()`의 허용 형식에 맞는다(로컬 확인).
- D1 `yukemuri`를 이번 실행에서 만들었다. `database_id`는 `128a3c5b-8e5f-470a-a901-d899d396cae1`이고 `cloudflare-deploy.json`에 기록했다. 마이그레이션 0000–0012 13개를 적용했다.
- 사용자 토큰으로 서브도메인 등록·D1 생성·마이그레이션이 됐다.
- D1의 실제 위치(`--location apac` 힌트 반영 여부)는 미확인이다. 4단계 또는 첫 배포에서 `wrangler d1 info yukemuri --config dist/server/wrangler.json`으로 확인한다.
- `publicOrigin`과 `autoDeploy`는 아직 켜지 않았다. 아래 ‘4단계 뒤’의 PR에서 켠다.

## 4단계 뒤: 자동 배포 켜기

4단계 적재(`catalog_meta` 포함)가 끝났다는 기록 PR이 `publicOrigin`을 채우고 `autoDeploy`를 `true`로 바꾼다. 적재 전 `/api/hotels` 호출은 빈 DB에 seed를 쓰기 때문에 이 순서를 지킨다. 적재 전 상태 확인은 `wrangler d1 execute yukemuri --remote --config dist/server/wrangler.json --command "SELECT COUNT(*) FROM hotels"`처럼 DB를 바꾸지 않는 조회로만 한다.

## 자동 배포(deploy.yml)

- 시작: main push와 수동 실행. `pull_request`·`pull_request_target`에서는 실행하지 않는다. 레포가 public이므로 Secret은 이 두 이벤트에서만 쓴다. 토큰 권한은 `contents: read`다. D1 setup과 같은 동시 실행 그룹(`cloudflare-account`)이라 둘이 겹치지 않는다. 6단계에 들어올 앱 레포 수집 workflow는 별도 그룹(`yukemuri-catalog-updates`)을 쓰므로 배포와 서로 막지 않는다.
- 판정: `databaseId`가 `null`이거나 `autoDeploy`가 `false`면 checkout과 판정 뒤 모든 단계를 건너뛰고 이유를 요약에 쓴다. Cloudflare에 접속하지 않는다. `autoDeploy`가 `true`인데 `publicOrigin`이 없으면 실패한다.
- 켜졌을 때 순서:
  1. `bash scripts/cloud-setup.sh` 뒤 `python3 scripts/cloud-check.py --full`. 이 커밋을 CI와 같은 검사로 다시 확인하고 그 빌드를 배포한다. `YUKEMURI_SITE_ORIGIN=publicOrigin`이라 수집기 release의 `siteOrigin`이 새 주소가 된다.
  2. `d1 time-travel info yukemuri --json`으로 복구 지점(bookmark)을 요약에 남긴다. JSON의 `bookmark` 필드는 wrangler 4.92.0 소스에서 확인했다. 값이 없으면 배포 전에 멈춘다.
  3. `d1 migrations apply yukemuri --remote`. 새 마이그레이션이 없으면 아무것도 하지 않는다.
  4. `deploy --config dist/server/wrangler.json`. 크롤 키는 `cloudflare/wrangler-action`의 `secrets` 입력으로 `CRAWL_ACCESS_KEY`에 올린다. 배포 버전 ID를 요약에 남긴다.
  5. `scripts/cloudflare-smoke.mjs`: 공개 `/api/hotels`가 200이고 숙소가 있는지, 키 없는 `/api/crawl?report=1`이 403인지, 키를 쓴 같은 요청이 200인지, `robots.txt`가 `/api/`를 막는지 본다. 로그에는 상태와 개수만 남긴다.
- `cloudflare/wrangler-action`은 v4.1.3 커밋 `953926a2e2182532811c01a25e53647d93bf07c0`로 고정했다(2026-10-11 `git ls-remote` 확인). `wranglerVersion`은 잠금 파일과 같은 4.92.0이다.

## 공개 사이트 보호

- DDoS: Cloudflare가 L3·L4·L7 방어를 모든 플랜에 자동 적용한다(`hosting-review-20261011.md` 5절 출처).
- 속도 제한(`lib/edge-guard.ts`, `build/sites-worker.ts`에서 앱 앞에 둔다):
  - Worker에 닿는 모든 요청(페이지·RSC·`/api/*`)을 `CF-Connecting-IP`별로 센다. 정적 파일(`dist/client`)은 Worker 앞에서 바로 나가므로 세지 않는다. 첫 화면(`app/page.tsx`)도 요청마다 D1 검색을 하므로 `/?q=<매번 다른 값>`으로 제한을 피할 수 없게 했다(Codex 검토 P1, 2026-10-11).
  - 60초에 120회를 넘으면 429, `Retry-After: 60`, `Cache-Control: no-store`를 돌려준다. `/api/*`에는 JSON `{"error":"요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요."}`를 보낸다. 화면은 기존 오류 표시 경로(`lib/api-client.ts`)로 이 문구를 보여 주고 자동 재시도하지 않는다. 페이지에는 같은 문구의 작은 HTML 화면을 보낸다.
  - 크롤 키가 맞는 요청(수집기·백업)은 세지 않는다. 틀린 키는 일반 요청처럼 센다.
  - Cloudflare 문서상 카운터는 위치(데이터센터)마다 따로이고 근사값이다.
  - 바인딩이 없거나 `limit()`가 실패하면 제한 없이 통과시킨다. 로컬 검사·개발에서 앱이 그대로 동작한다.
  - 무료 플랜에서 Rate Limiting 바인딩을 쓸 수 있는지는 미확인이다. 문서(`workers/runtime-apis/bindings/rate-limit`, 2026-10-11 원본 `0d35c2c`)에 플랜 제한 문구는 없다. 첫 실제 배포에서 확인한다. 배포가 바인딩 때문에 거절되면 `vite.config.ts`의 `ratelimits`를 빼는 PR로 되돌린다. 코드는 바인딩 없이도 동작한다.
- 검색 캐시:
  - 익명 일반 검색의 짧은 캐시는 기존 isolate 안 30초 결과 캐시(`hotelRepository.search`)다. 키에 즐겨찾기 ID와 방문자 범위가 들어가고 `fresh`·`snapshot` 요청은 건너뛴다(`catalog-operations.md`). 브라우저에는 지금처럼 `Cache-Control: no-store`를 보낸다.
  - Cloudflare 위치 사이에서 공유하는 캐시는 `workers.dev`에서 쓰지 않는다. Cache API(`caches.default`)는 `*.workers.dev` 배포에서 효과가 없다(문서 `r2/examples/cache-api`, 원본 `0d35c2c`: “any `*.workers.dev` deployments will have no impact”). 처음에는 Cache API를 넣었다가 Codex 검토 P2(2026-10-11)로 뺐다.
  - Workers Caching(`cache.enabled`)도 쓰지 않는다. 켜면 정적 파일 요청도 Worker 요청 수(하루 10만)에 들어가고, `Cache-Control`이 없는 응답도 기본 TTL로 저장된다. 진입점별 설정은 wrangler 4.107.0 이상이 필요한데 잠금 파일은 4.92.0이다(문서 `workers/cache/`).
  - 그래서 공개 검색의 D1 읽기는 속도 제한과 isolate 캐시로만 줄인다. 더 줄이려면 P01의 색인·쿼리 개선이 필요하다.
- 남은 위험(공유 캐시 없음, 상위 세션 요청으로 기록):
  - P01 측정(`P01-20261011.md`, 운영 규모 복사본)으로 요청 하나가 D1에서 읽는 행 수는 목록 첫 쪽(`fresh`) 37,723행, 이름 부분검색 26,656행이다. Miniflare의 행 수가 운영과 같은지는 미확인이다.
  - D1 무료 읽기는 하루 500만 행이다. 수집기 약 58만 행(P01 추정)과 백업 약 9만 행을 빼면 약 433만 행이 남는다. 캐시를 타지 않는 목록 첫 쪽 요청으로는 하루 약 115회, 이름 부분검색으로는 약 162회다. 한 사용자의 일반 이용으로도 닿을 수 있다. isolate 30초 캐시는 같은 isolate에서 같은 조건을 다시 부를 때만 도움이 된다.
  - 속도 제한 60초 120회는 IP 하나가 1분에 목록 첫 쪽 기준 약 453만 행(120 × 37,723)을 읽게 허용한다. IP 한 곳이 1분 안팎에 그날 남은 읽기를 다 쓸 수 있다. 다 쓰면 09:00 KST까지 모든 D1 쿼리가 실패해 사이트가 멈춘다. 요금은 나오지 않는다.
  - 한도 값은 120으로 둔다. 30으로 낮춰도 IP 하나가 1분에 약 113만 행을 읽어 4분쯤이면 같은 결과가 되고, 사람의 지도 이동·검색에 먼저 걸린다. 속도 제한으로는 일일 읽기 한도를 지킬 수 없다.
  - 대응은 새 작업 P02(목록·검색 요청당 D1 읽기를 색인 등으로 크게 줄임)다. P02 완료 전에는 6단계 전환을 하지 않는다. 5단계 병행 운영에서 실제 일일 읽기량을 확인한다.
- `robots.txt`: 모든 봇에 `/api/`를, 알려진 AI 수집 봇(GPTBot, ClaudeBot, CCBot, Google-Extended, Bytespider, PerplexityBot 등)에 사이트 전체를 막아 달라고 요청한다. 규칙을 지키는 봇에만 효과가 있다.
- Bot Fight Mode·WAF 규칙은 도메인 단위라 `workers.dev`에 쓸 수 없다. 하루 요청 10만 건을 넘으면 09:00 KST까지 1027 오류가 나지만 요금은 없다.

## 수집기와 배포 자료

- `scripts/build-collector-release.mjs`의 `siteOrigin`은 빌드 변수 `YUKEMURI_SITE_ORIGIN`으로 정한다. 기본값은 Sites 주소 `https://yukemuri.jihun7891.chatgpt.site`다. Sites 두 주소와 `https://yukemuri.<서브도메인>.workers.dev`만 받는다.
- `scripts/crawler/source_safety.py`의 `site_api()`가 수집기 스크립트 다섯 개(`update-site.py`, `update-names.py`, `update-descriptions.py`, `update-lifecycle.py`, `update-source-groups.py`)의 주소 허용 목록이다. Sites 두 주소에는 지금처럼 `OAI-Sites-Authorization`과 `X-Yukemuri-Crawl-Key`를 보낸다. workers.dev 주소에는 `X-Yukemuri-Crawl-Key`만 보낸다.
- 실행기의 `bootstrap.py`는 Sites 주소만 받는다. 6단계에서 수집 예약은 앱 레포 workflow로 옮기고 크롤 키는 앱 레포 Secret `YUKEMURI_CRAWL_ACCESS_KEY`를 쓴다(`hosting-review-20261011.md` 3.2절 6단계, PR #32). 그때 수집기는 위 허용 목록의 workers.dev 주소로 바로 실행한다. 백업만 실행기 레포에 남는다.

## 롤백

| 상황 | 방법 |
|---|---|
| 배포한 코드 결함 | `wrangler rollback`(이전 Worker 버전) 또는 이전 커밋을 main에 되돌려 재배포 |
| DB 손상 | `wrangler d1 time-travel restore yukemuri --bookmark <요약의 값> --config dist/server/wrangler.json`(7일 이내, 덮어쓰기) 또는 최신 백업 재적재 |
| 자동 배포 중지 | `cloudflare-deploy.json`의 `autoDeploy`를 `false`로 바꾸는 PR |

## 미확인

- 무료 플랜의 Rate Limiting 바인딩 사용 가능 여부.
- `wrangler-action`이 pnpm으로 설치된 wrangler 4.92.0을 그대로 쓰는지. 실제 Secret으로 실행한 적이 없다.
- 사용자 토큰(템플릿 + D1 Edit)으로 Rate Limiting 바인딩이 있는 Worker를 올릴 수 있는지. 서브도메인 등록과 D1 생성·마이그레이션은 3단계에서 됐다.
- D1의 실제 위치(`--location apac`).
