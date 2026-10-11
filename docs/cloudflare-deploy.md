# Cloudflare 배포 절차(H01)

기록: 2026-10-11T10:30Z / 2026-10-11 19:30 KST. H01 2단계 PR에서 만들었다.
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
| `scripts/cloudflare-smoke.mjs` | 배포 뒤 점검 |
| `lib/edge-guard.ts` | 공개 사이트 보호(속도 제한·검색 캐시) |
| `public/robots.txt` | `/api/`와 알려진 AI 수집 봇 차단 요청 |

생성된 `dist/server/wrangler.json`의 설정: Worker 이름 `yukemuri`, `workers_dev: true`, `preview_urls: false`, `observability.enabled: true`, `placement.mode: smart`, D1 바인딩 `DB`(`database_name: yukemuri`, `migrations_dir: ../../drizzle`), Rate Limiting 바인딩 `API_RATE_LIMITER`(namespace `1001`, 60초에 120회). `migrations_dir`는 생성된 설정 파일 위치(`dist/server/`)에서 계산하므로 `../../drizzle`이 레포의 `drizzle/`을 가리킨다.

모든 `wrangler d1` 명령은 데이터베이스 이름과 설정 경로를 준다. 예: `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json`.

## 사용자가 할 일

`hosting-review-20261011.md` 3.3절과 같다. Secret 값은 채팅·PR·로그에 붙여 넣지 않고 GitHub Secret 입력란에만 넣는다.

상태(상위 세션 전달, 2026-10-11T09:55Z): 사용자가 앱 레포에 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`·`YUKEMURI_CRAWL_ACCESS_KEY`를, 실행기 레포에 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`를 등록했다. 값은 확인하지 않았다. 토큰은 ‘Edit Cloudflare Workers’ 템플릿에 Account `D1: Edit`를 더한 것이다. `workers.dev` 서브도메인은 아직 없을 수 있다. 없으면 3단계에서 상위 세션이 등록한다.

1. Cloudflare 가입과 Workers & Pages 첫 화면에서 `workers.dev` 계정 서브도메인을 정한다. 서브도메인을 에이전트에게 알려 준다. 비밀이 아니다. `publicOrigin`에 들어간다.
2. API 토큰: 대시보드 → Account API tokens → Create Token → 템플릿 ‘Edit Cloudflare Workers’. 권한은 Account `Workers Scripts: Edit`, Account `D1: Edit`, Account `Account Settings: Read`다. 선택 권한은 Account `Account Analytics: Read`(CPU·D1 사용량 조회)다. Account Resources는 본인 계정 하나, Zone Resources는 비운다. 만료일을 정한다.
3. `jihune/yukemuri`의 Settings → Secrets and variables → Actions → New repository secret:
   - `CLOUDFLARE_API_TOKEN`: 2번의 토큰.
   - `CLOUDFLARE_ACCOUNT_ID`: 대시보드의 Account ID.
   - `YUKEMURI_CRAWL_ACCESS_KEY`: 새 임의값(예: 64자리 16진수). 기존 Sites 키와 다른 값을 권장한다. 새 Worker의 `CRAWL_ACCESS_KEY`로 올라간다.
4. 실행기 레포 Secret(`YUKEMURI_CLOUDFLARE_JSON` 등)은 4·6단계 PR에서 정한다. 기존 `YUKEMURI_ACCESS_JSON`은 Sites 정리 전까지 지우지 않는다.

## 3단계: D1 만들기(수동 실행, Worker 배포 없음)

Secret 세 개가 생기고 상위 세션이 맡기면 실행한다.

1. Actions → ‘Cloudflare D1 setup’ → Run workflow(main).
2. workflow가 빌드한 뒤 `wrangler d1 list --json`으로 `yukemuri`를 찾는다. 없으면 `wrangler d1 create yukemuri --location apac --config dist/server/wrangler.json`으로 만든다. 같은 이름이 둘 이상이면 실패한다.
3. 실행 요약에 `database_id`와 이번 실행에서 만들었는지가 나온다. 레포의 `databaseId`가 이미 다른 값이면 마이그레이션 전에 실패한다.
4. 찾은 ID를 실행기 안의 `cloudflare-deploy.json`에만 넣고 다시 빌드한 뒤 `wrangler d1 migrations apply yukemuri --remote --config dist/server/wrangler.json`으로 0000–0012를 적용한다. 적용 목록을 요약에 남긴다. 이력 테이블은 wrangler 기본 `d1_migrations`다.
5. 에이전트가 요약의 ID를 `cloudflare-deploy.json`의 `databaseId`에 넣는 PR을 만든다. 이 PR은 `autoDeploy`를 켜지 않는다. 그래서 병합해도 배포는 계속 건너뛴다.

다시 실행해도 안전하다. 이미 있는 D1은 만들지 않고, 적용된 마이그레이션은 다시 적용하지 않는다.

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
  - `/api/*` 요청을 `CF-Connecting-IP`별로 센다. 60초에 120회를 넘으면 429, `Retry-After: 60`, `Cache-Control: no-store`, JSON `{"error":"요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요."}`를 돌려준다. 화면은 기존 오류 표시 경로(`lib/api-client.ts`)로 이 문구를 보여 주고 자동 재시도하지 않는다.
  - 크롤 키가 맞는 요청(수집기·백업)은 세지 않는다. 틀린 키는 일반 요청처럼 센다.
  - Cloudflare 문서상 카운터는 위치(데이터센터)마다 따로이고 근사값이다. 페이지·정적 파일은 제한하지 않는다.
  - 바인딩이 없거나 `limit()`가 실패하면 제한 없이 통과시킨다. 로컬 검사·개발에서 앱이 그대로 동작한다.
  - 무료 플랜에서 Rate Limiting 바인딩을 쓸 수 있는지는 미확인이다. 문서(`workers/runtime-apis/bindings/rate-limit`, 2026-10-11 원본 `0d35c2c`)에 플랜 제한 문구는 없다. 첫 실제 배포에서 확인한다. 배포가 바인딩 때문에 거절되면 `vite.config.ts`의 `ratelimits`를 빼는 PR로 되돌린다. 코드는 바인딩 없이도 동작한다.
- 검색 캐시:
  - `GET /api/hotels` 가운데 `saved=1`·`fresh`·`snapshot`이 없는 요청만 Cache API(`caches.default`)에 30초 저장한다. 키는 URL뿐이다. 요청 헤더로 항목을 고르거나 오염시킬 수 없다. 200 응답만 저장한다.
  - 브라우저에는 지금처럼 `Cache-Control: no-store`를 보낸다. 응답의 `X-Yukemuri-Cache`가 `HIT`/`MISS`를 알려 준다.
  - `X-Yukemuri-Visitor`에 따라 달라지는 응답(`saved=1`)과 `fresh=1` 새로고침, 목록 이어 읽기(`snapshot`)는 저장하지 않는다(`catalog-operations.md`의 공유 캐시 규칙).
  - Cloudflare 문서는 Cache API가 커스텀 도메인에서 동작한다고만 쓴다. `workers.dev`에서 실제로 저장되는지는 미확인이다. 저장되지 않으면 기존 isolate 안 30초 결과 캐시만 남고 동작은 같다. 5단계에서 `X-Yukemuri-Cache: HIT`로 확인한다.
  - Workers Caching(`cache.enabled`)은 쓰지 않는다. 켜면 정적 파일 요청도 Worker 요청 수(하루 10만)에 들어가고, `Cache-Control`이 없는 응답도 기본 TTL로 저장된다(문서 `workers/cache/`).
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
- `workers.dev`에서 Cache API 저장 여부.
- `wrangler-action`이 pnpm으로 설치된 wrangler 4.92.0을 그대로 쓰는지. 실제 Secret으로 실행한 적이 없다.
- 토큰 권한 세 개로 Rate Limiting 바인딩이 있는 Worker를 올릴 수 있는지.
