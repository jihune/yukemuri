# V01 구조·죽은 코드·문서와 코드의 차이: findings

- 검토자: 구조 영역 하위 에이전트. 시작 2026-11-10T01:28Z (`date -u` 출력).
- 원본 `/home/user/yukemuri` (HEAD `d5caa7c`)는 읽기만 했다. 실행은 사본 `/tmp/claude-0/-home-user-yukemuri/11216226-e5e3-5b40-8685-a8e18bce33cd/scratchpad/v01/structure/repo`에서만 했다.
- 지적은 찾은 순서대로 덧붙였다. 표와 원자료는 같은 폴더의 `refs/` 아래에, 센 스크립트는 `tools/` 아래에 있다.
- 이 파일은 Write 도구가 "Subagents should return findings as text, not write report files."라며 거부해서 bash로 덧붙여 썼다. 같은 내용을 마지막 보고에도 담는다.

## 4. 같은 규칙의 두 구현

### F-01 (P2) Worker 주소 규칙이 일곱 곳에 따로 있고 같은 입력에 답이 갈린다

- 파일: `scripts/runner/run-collection.py` `WORKER_ORIGIN`·`target_origin`, `scripts/crawler/source_safety.py` `WORKER_HOST`·`site_api`, `scripts/cloudflare-deploy-gate.mjs` `workersOrigin`, `scripts/build-collector-release.mjs` `siteOrigin` 검사, `scripts/cloudflare-smoke.mjs`·`scripts/cloudflare-prepare.mjs`·`scripts/record-coverage.mjs`의 `assert.match(origin??'',...)`.
- 근거(원문):
  - `run-collection.py`: `# Same rule as scripts/cloudflare-deploy-gate.mjs and source_safety.WORKER_HOST.` 바로 아래 `WORKER_ORIGIN = re.compile(r'https://yukemuri\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev')`
  - `source_safety.py`: `sites=host in SITE_HOSTS` / `if site.scheme!='https' or not(sites or WORKER_HOST.fullmatch(host)) or site.username or site.password:` (호스트 이름만 본다. 포트·경로·질의·대소문자는 보지 않는다)
  - `cloudflare-smoke.mjs`·`cloudflare-prepare.mjs`·`record-coverage.mjs`: `assert.match(origin??'',/^https:\/\/yukemuri\.[a-z0-9-]+\.workers\.dev$/,'Expected the public workers.dev origin');` (레이블 규칙이 느슨하다)
- 재현: `python3 tools/origin_rules.py repo` (사본에서 실행, 출력 전체는 `refs/origin-rules.txt`). 파이썬 규칙은 파일을 import해서, JS 규칙은 파일의 정규식 글자 그대로 돌렸다. 대조: `https://yukemuri.jihune.workers.dev`는 일곱 곳 모두 accept, `http://...`는 모두 reject.

| 입력 | run-collection | deploy-gate | source_safety | smoke·prepare·record-coverage | build-collector-release |
|---|---|---|---|---|---|
| `https://yukemuri.a-.workers.dev` | reject | reject | reject | accept | reject |
| `https://yukemuri.-.workers.dev` | reject | reject | reject | accept | reject |
| `https://yukemuri.` + a 64자 + `.workers.dev` | reject | reject | reject | accept | reject |
| `https://yukemuri.jihune.workers.dev:8443` | reject | reject | accept (키를 `:8443`로 보냄) | reject | reject |
| `https://yukemuri.jihune.workers.dev/x?y=1` | reject | reject | accept | reject | reject |
| `https://YUKEMURI.jihune.workers.dev` | reject | reject | accept | reject | reject |
| `https://yukemuri.jihune.workers.dev\n` | reject | reject | accept | reject | reject |
| `https://yukemuri.jihun7891.chatgpt.site` | reject | reject | accept | reject | accept |

- 영향: 운영 경로(`collect.yml` → `run-collection.py` → `update-site.py`)에서는 가장 엄한 `target_origin`이 먼저 걸러서 지금 틀린 결과는 나가지 않는다. 사람이 `scripts/crawler/update-*.py`나 `cloudflare-smoke.mjs`를 손으로 돌릴 때만 갈린다. 그래서 P2다. `run-collection.py`의 주석 “Same rule as ... source_safety.WORKER_HOST”는 사실과 다르다(포트·경로·대소문자 입력에서 답이 다름).
- 제안: 수집 키를 받는 곳은 한 규칙(레이블 규칙 `[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`, 포트 없음)으로 맞추고, `source_safety.site_api`는 `site.port is None`을 더 본다. 세 `.mjs`의 느슨한 정규식은 `cloudflare-deploy-gate.mjs`의 `workersOrigin`을 export해서 쓴다.

### F-02 (P3) 무료 한도 숫자 100,000이 두 곳에 따로 있다(지금 값은 같음)

- 파일: `scripts/cloudflare-usage.mjs`의 `export const LIMITS={rowsRead:5_000_000,rowsWritten:100_000,requests:100_000};`와 `scripts/preflight-report.mjs`의 `export const D1_DAILY_WRITES=100000;`.
- `scripts/collection-budget.mjs`·`scripts/daily-check.mjs`는 `import {LIMITS,...} from './cloudflare-usage.mjs'`로 한 곳을 쓴다. `preflight-report.mjs`만 따로 적었다. 두 값이 지금 같아서 다른 답을 내는 입력은 없다.
- 재현: `grep -rnE "D1_DAILY_WRITES|LIMITS=" scripts/*.mjs` → 위 두 줄.
- 제안: `preflight-report.mjs`가 `LIMITS.rowsWritten`을 import한다.

### 같은 규칙으로 보았으나 지적하지 않는 것

- 쪽수·시간 상한: `run-collection.py`(`MAX_PAGES = 120`, `DEFAULT_PAGES = 16`, `SECONDS_PER_PAGE = 11`, 120쪽이면 1,380초), `collection-budget.mjs`(`maxPages:120`, `fallbackPages:16`), `collect.yml`(`timeout-minutes: 26`, `"${PAGES:-16}"`), `daily-check.mjs`(`JOB_MINUTES=26`), `collection-chain.mjs`(`minPages:16`). 값이 서로 맞고 검사가 묶는다: `check-collect-workflow.mjs`가 `timeout-minutes: 26`을, `check-daily-check.mjs`가 `JOB_MINUTES`와 `collect.yml`을, `check-collection-chain.mjs`가 `minPages:BUDGET.fallbackPages`를, `check_collection.py`가 `time_limit('gentle', MAX_PAGES) + 120 < 26 * 60`을 본다. `BUDGET.maxPages`와 `run-collection.py`의 `MAX_PAGES`를 한 검사가 같이 보지는 않지만, 예산이 더 큰 쪽수를 내면 `page_count`가 `pages must be 0-120`으로 실행을 멈추므로 조용히 틀리지는 않는다. (`collection-budget*`·`collection-chain*`·`daily-check.mjs`는 열린 PR 또는 곧 고칠 파일.)
- `LIMIT_HOURS`: `scripts/check-collection-freshness.mjs`의 `export const LIMIT_HOURS=12;` 하나뿐이고 `check-collect-workflow.mjs`가 `assert.equal(LIMIT_HOURS,12)`로 본다. `START_HERE.md` 2번의 “12시간을 넘었으면”과 같다.
- 숙소 이름 표시 순서: 화면 쪽은 모두 `lib/hotel-names.ts`의 `displayNames`를 쓴다(`grep -rlE "displayNames\(" app components lib` → `photo-credits/route.ts`, `hotel-explorer`, `hotel-comparison`, `hotel-detail`, `map-stay-list`, `hotel-card`, `stay-map`, `static-search`, `wikidata-names`, `search-snapshot-build`). 따로 구현한 표시 순서는 찾지 못했다. `lib/hotel-repository.ts`가 `hotels.name` 열에 `hotel.names.ko`를 넣는 것은 저장용 열이라 표시 규칙으로 보지 않았다(열린 PR #292 파일).
- 좌표 범위: 아래 F-03.

### F-03 (P3) 일본 좌표 범위가 수집기와 Worker 계약에서 경계값만 다르고, Overture 목록은 범위가 다르다

- 파일: `scripts/crawler/collect.py`(상세 해석 함수 안) `if not (20 < lat < 46.5 and 122 < lng < 154):`, `lib/crawl-contract.ts` `observedHotel`의 `latitude:z.number().min(20).max(46.5).nullable(),longitude:z.number().min(122).max(154).nullable()`, `scripts/snapshot-geo.mjs` `const inJapan=(lat,lng)=>...lat>=20&&lat<=46.5&&lng>=122&&lng<=154;`, `scripts/geo/update-overture.py` `WHERE bbox.xmin BETWEEN 122 AND 154 AND bbox.ymin BETWEEN 24 AND 46`.
- 재현: 사본에서 `node tools/coord-rules.mjs tmp`(계약은 저장소의 `compileLib`로 컴파일, 다른 둘은 원문 줄을 그대로 평가). 출력(`refs/coord-rules.txt`):
  - `lat=35 lng=139  collect.py=kept  crawl-contract.ts=accepted  snapshot-geo.mjs=inJapan` (대조)
  - `lat=20 lng=139  collect.py=dropped  crawl-contract.ts=accepted  snapshot-geo.mjs=inJapan`
  - `lat=46.5 lng=139  collect.py=dropped  crawl-contract.ts=accepted  snapshot-geo.mjs=inJapan`
  - `lat=35 lng=122  collect.py=dropped  ...accepted ...inJapan`, `lat=35 lng=154  collect.py=dropped ...accepted ...inJapan`
  - `lat=19.99 lng=139  collect.py=dropped  crawl-contract.ts=rejected  snapshot-geo.mjs=outside` (대조)
- 영향: 수집기는 경계를 빼고(초과·미만) 계약과 지도 쪽은 넣는다(이상·이하). 정확히 20, 46.5, 122, 154인 좌표에서만 갈리고 그 위도·경도에 숙소가 있을 일은 사실상 없다. Overture 목록(`update-overture.py`)은 위도 24~46만 받아서 위도 20~24와 46~46.5를 다른 세 곳과 다르게 본다(실행은 하지 않고 줄만 읽음: 미확인 아님, 원문 인용). 사소함.
- 제안: 네 곳의 주석에 서로를 가리키는 한 줄을 두거나 수집기의 비교를 `<=`로 맞춘다.

## 5. 문서와 코드

### F-04 (P2) 문서가 시키는 내보내기 명령이 지금 운영 주소에서는 요청 전에 멈춘다

- 파일: `scripts/catalog-checkpoint.py` `export`, 문서 `docs/catalog-operations.md` ‘데이터 내보내기와 복원 연습’.
- 근거(원문): 문서 `python scripts/catalog-checkpoint.py export --out /absolute/private/checkpoint.jsonl.gz` 그리고 “현재 Site 접근 정보 JSON을 표준입력으로 전달한다”. 코드 `if site.scheme!='https' or not site.hostname or not site.hostname.endswith('.chatgpt.site') or site.username or site.password:raise ValueError('Expected this Sites HTTPS URL')`. 지금 운영 주소는 `cloudflare-deploy.json`의 `"publicOrigin": "https://yukemuri.jihune.workers.dev"`다.
- 재현(사본, 요청이 나가기 전에 멈추므로 운영에 닿지 않음): `printf '%s\n' '{"url":"https://yukemuri.jihune.workers.dev","token":"placeholder-not-a-key-000000"}' | python3 scripts/catalog-checkpoint.py export --out <scratch>/tmp/x.jsonl.gz` → `exit=1`, 마지막 줄 `ValueError: Expected this Sites HTTPS URL`, 출력 파일 없음. 대조: 같은 사본에서 `python3 scripts/check-checkpoint.py` → `exit=0` (`Checkpoint checks passed: ...`). 이 검사는 `'source':'test.chatgpt.site'` manifest로 복원 쪽만 보고 주소 검사는 보지 않는다.
- 영향: 날마다 도는 백업은 private 실행기 레포의 사본(`maintenance/catalog-backup/`)이 하므로 이 파일이 멈춰도 백업이 멈추지는 않는다(실행기 레포는 보지 못함: 미확인 1). 앱 레포 문서대로 손으로 내보내려 하면 실패한다. 조용히 틀리지 않고 오류로 멈추므로 P2.
- 덧붙임(읽기만 함): 같은 함수는 `urllib.request.Request(url,headers={'OAI-Sites-Authorization':...,'X-Yukemuri-Crawl-Key':...,'Accept':'application/json'})`로 User-Agent를 정하지 않는다. `scripts/crawler/source_safety.py`의 주석은 “Cloudflare answers the urllib default User-Agent (Python-urllib) with error 1010 before the Worker sees the request”라고 적는다. 주소 검사를 고쳐도 이 요청이 통과하는지는 운영에 요청하지 않아 미확인이다(미확인 2).
- 제안: `site_api`(source_safety)와 같은 주소 규칙·User-Agent를 쓰게 하거나, 이 도구가 옛 Sites 전용임을 문서에 적고 지금 절차(실행기 백업, D1 Time Travel)를 가리킨다.

### F-05 (P2) 지금의 절차 문서 여러 곳이 옛 호스팅을 지금 상태로 말한다

지금 코드: `cloudflare-deploy.json`은 `"publicOrigin": "https://yukemuri.jihune.workers.dev"`, `"autoDeploy": true`. `.github/workflows/deploy.yml`은 `on: push: branches: [main]`이고 사본에서 `node scripts/cloudflare-deploy-gate.mjs` → `mode=deploy`, `reason=enabled`, `public_origin=https://yukemuri.jihune.workers.dev`. 이어서 `d1 migrations apply yukemuri --remote`와 Worker 배포가 돈다. `collect.yml`은 checkout한 저장소의 `scripts/runner/run-collection.py`를 돌린다(`run: python3 scripts/runner/run-collection.py --mode "$MODE" --pages "${PAGES:-16}"`). `docs/roadmap.md` 14번 H01 줄도 “6단계 전환 끝(10-13T05:30Z, 운영 `https://yukemuri.jihune.workers.dev`)”라고 적는다.

아래 문장은 이와 다르다(모두 원문).

| 문서 | 문장 | 지금 코드와 다른 점 |
|---|---|---|
| `START_HERE.md` 표 | `운영 주소 \| https://yukemuri.jihun7891.chatgpt.site`, `운영 DB \| 기존 Sites D1. 개발 클론은 임시 DB를 사용` | 운영 주소·DB는 Cloudflare Worker와 그 D1 |
| `START_HERE.md` | “GitHub 준비가 호스팅·DB·수집 예약을 자동으로 이전하지 않는다.”, “Sites 도구가 없으면 검사한 커밋과 배포 인수인계를 준비해.” | main push가 배포함 |
| `README.md` | “기존 Sites 호스팅·운영 D1·Python 예약은 유지한다.”(같은 파일 첫 줄은 Cloudflare 전환을 적음), “배포 전달은 [Sites 인수인계](docs/sites-handoff.md)”, “정기 수집은 GitHub의 Python 예약이 시작한다. 3시간 간격의 소량 처리”, “Sites의 수집기를 예약 때 받아 실행하는 [전환 방식]...을 준비했다” | `collect.yml` 주석 “hourly since C05, every 3 hours before”, 수집기는 checkout에서 실행 |
| `docs/cloud-development.md` | “호스팅·DB·기존 Python 수집기는 현 위치에 둔다.”, “Sites 배포는 `sites-handoff.md`의 별도 절차다.”, “운영 D1은 기존 Sites에 있다.” | 위와 같음 |
| `docs/sites-handoff.md` | “6단계 전환이 끝날 때까지 운영은 아래 Sites이고”(전환은 10-13에 끝남), ‘자동 갱신’ 절 “기존 GitHub Python 예약은 운영 Site의 인증된 `/api/collector-release`를 받는다. 앱 레포에서 수집기를 수정해도 Sites에 게시되기 전에는 다음 예약에 반영되지 않는다.” | 수집기 수정은 main 병합 뒤 다음 `collect.yml` 실행에 바로 반영됨 |
| `skills/yukemuri-maintenance/SKILL.md` 6번 | “배포가 요청됐으면 `docs/sites-handoff.md`를 읽는다. 실제 Sites 도구가 있을 때 설치된 공식 Sites 절차를 적용한다.” | 배포는 `deploy.yml` |
| `CLAUDE.md` | “GitHub merge와 실제 Sites 게시를 구분한다.” | main 병합이 곧 Cloudflare 배포(문서만 바꾼 push 제외) |
| `AGENTS.md` (열린 PR #291 파일) | “운영은 기존 Sites와 D1이다.”, “실행기는 매번 운영 Sites의 보호된 수집기 자료를 받는다. 수집기 수정은 게시 전까지 예약 실행에 반영되지 않는다.”, “GitHub 병합은 Sites 게시가 아니다” | 위와 같음 |
| `docs/db-backups.md` 첫 줄 | “2026-10-09. 운영 DB는 기존 Sites D1이다.”, “v49/0012 복원 스키마” | 같은 문서 첫 항목은 11-03 갱신으로 “그 읽기가 그날 수집 예산에 먼저 잡힌다”(Cloudflare D1 예산)고 적어 문서 안에서 어긋남. 마이그레이션은 `drizzle/0015_faulty_menace.sql`까지 있음 |
| `docs/collector-runner-migration.md`, `docs/README.md` | ‘실행 방식’ 절이 `scripts/runner/bootstrap.py`가 Sites에서 수집기를 받는 방식을 현재형으로 적음. `docs/README.md` “GitHub 없이 개발을 시작한다.” | 지금 수집은 `collect.yml` + `run-collection.py`. 이 문서에 대체됐다는 표시가 없음 |

- 운영 사고로 이어질 수 있는 지점: “merge는 게시가 아니다”를 믿고 main에 병합하면 그 push가 D1 마이그레이션 적용과 Worker 배포를 실제로 한다. 등급 3(마이그레이션·인증 등)은 병합 전 사용자 확인이 따로 있어 막는 장치가 하나 있다. 그래서 P1이 아니라 P2로 적는다.
- 가리키는 파일의 존재: `python3 -I tools/doc_paths.py /home/user/yukemuri <문서 13개>` → `TOTAL checked=139 missing=23`. 없는 23개는 모두 다른 저장소 경로(`jihune/yukemuri-script-runner`, `scripts/run-updates.py`, `project-files.json`, `site/`, `maintenance/catalog-backup/`), 폴더 없이 쓴 파일 이름(`cloud-check.py`, `audit-catalog.py`, `update-site.py`), Git에 없는 실행 중 폴더(`.wrangler/state`), 쓰지 말라고 든 이름(`STATE.md`, `agents_work/`)이다. 저장소 안에서 끊긴 경로는 없다(`refs/doc-paths.txt`).
- 문서의 명령 가운데 돌려 본 것: `docs/cloud-development.md`의 U01 DOM 검사(`npm install --prefix .sites-runtime/u01-dom --no-save --package-lock=false jsdom@26.1.0` 뒤 `node scripts/check-u01-dom.cjs`)는 사본에서 `install rc=0`, `check-u01-dom rc=0`.
- 제안: 위 문장들을 “운영은 Cloudflare Worker와 D1, 배포는 main push(`deploy.yml`), 수집은 `collect.yml`”로 고치고, `docs/sites-handoff.md`·`docs/collector-runner-migration.md` 머리에 H01 전환으로 대체됐다고 적는다.

### F-06 (P2) `docs/catalog-operations.md`의 ‘검색 조건과 연속 목록’ 절이 없어진 서버 기능을 말한다

- 근거(문서 원문): “첫 화면부터 주소의 검색 조건을 서버가 적용한다.”, “유효 시간 20분, 보관 상한 256개 세션”, “`stable=1`은 새 UI용 API 선택사항이다. 기존 페이지 번호 API는 호환성을 유지한다. `snapshot` 토큰으로 이어 읽을 때는 고정 순서를 사용한다.”
- 코드: 목록 경로가 없다. `git ls-files app/api` 16개 가운데 `app/api/hotels/`에는 `[id]/route.ts`와 `[id]/google/route.ts`뿐이다. `scripts/former-search-api.mjs` 머리 주석: “The list, map, suggestion and name-index endpoints the Worker had until P03 (/api/hotels, /api/hotels/map, /api/hotels/suggestions, /api/hotels/search-index), answered for tests by the browser's code”. `hotel_result_sessions`를 읽고 쓰는 코드는 없다: `grep -rnoE "hotel_result_sessions|hotelResultSessions" app lib components scripts` → `lib/catalog-export.ts`의 `excluded` 목록과 `scripts/check-search-snapshot-worker.mjs` 한 줄, `db/schema.ts`의 표 정의뿐(패턴 대조: 같은 grep이 `lib/catalog-export.ts`에서 걸림).
- 확인한 방법: 위 파일 목록과 grep이다. Worker에 `/api/hotels` 목록 요청을 직접 보내 보지는 않았다. `scripts/check-runtime.py`의 주석도 “The home page is one static shell (P03): filters render, the list comes from the snapshot.”라고 적는다.
- 제안: 그 절을 “P03 뒤 목록·검색은 브라우저가 정적 스냅숏으로 한다”로 바꾸거나 과거 기록이라고 표시한다. 같은 문서 ‘검증’ 절의 “120개 고정 ID, 만료/다른 조건/다른 브라우저/즐겨찾기 변경 거절, 세션 용량”도 같은 기능을 말한다.

### F-07 (P2) 공통 검사 밖에 있는 검사 일곱 개 가운데 세 개가 지금 main에서 실패한다

- 무엇을 셌나: `scripts/` 아래 이름이 `check`로 시작하는 파일 83개(`git ls-files scripts`에서 `check-`, `check_`, `check.py`) 가운데 `scripts/cloud-check.py`에 이름이 있는 것이 47개, workflow만 부르는 것이 1개(`check-collection-freshness.mjs`), 브라우저 검사가 25개다. 나머지 10개에서 다른 검사가 대신 돌리는 2개(`scripts/geo/check_geocode.py`, `check_overture.py`)와 짝 파일을 빼면, 아무 자동 경로도 돌리지 않고 브라우저도 필요 없는 진입점은 일곱 개다.
- 재현(사본, HEAD `d5caa7c`, `dist/`는 받은 그대로, Node v22.23.4):

| 명령 | 결과 |
|---|---|
| `node scripts/check-catalog.mjs` | rc=0 |
| `node scripts/check-lifecycle-worker.mjs` | rc=0 |
| `node scripts/check-public-worker.mjs` | rc=0 (첫 두 번은 다른 작업이 8787 포트를 쓰고 있어 `EADDRINUSE`, 포트가 빈 뒤 통과) |
| `node scripts/check-u01-dom.cjs` | rc=0 (`docs/cloud-development.md`가 안내하는 검사) |
| `node scripts/check-facility-links.cjs` | rc=1: `Error: Cannot find module '.../components/hotel-photo'` (`load()`가 `components/hotel-detail.tsx`를 읽을 때 `./hotel-photo` 대역이 없음) |
| `node scripts/check-source-groups-worker.mjs` | rc=1: 55번째 줄 `const linkedSearch=await api('/api/hotels?q=Source%20QA&features=roomOnsen&rating=9&reviews=50&fresh=1');assert.equal(linkedSearch.total,2);` → `AssertionError ... 1 !== 2` |
| `python3 scripts/run-runtime-check.py` | rc=1: `scripts/check-runtime.py` `status,home=call('GET','/');assert status==200 and '일본 전국' in home and 'v0.5' in home and 'role="checkbox"' in home` → `AssertionError`. 사본의 `dist/client/index.html`에서 `grep -c` 결과는 `일본 전국` 1, `v0.5` 0, `role="checkbox"` 0 |

- 영향: 세 검사는 과거 날짜 문서에서만 불린다(`refs/scripts-refs.tsv`의 `dated-doc-only`). 이름은 시설 링크·출처 묶음·실행 중 Worker를 검사한다고 말하지만 지금은 아무것도 판정하지 못한다. `check-source-groups-worker.mjs`의 `1 !== 2`가 낡은 기대값인지 실제 회귀인지는 가르지 못했다(미확인 3: 묶인 숙소가 스냅숏에서 카드 하나로 합쳐지게 바뀐 뒤의 기대값일 수 있으나 확인하지 않음).
- 제안: 살릴 검사는 고쳐 `cloud-check.py`에 넣고, 버릴 검사는 지운다. 출처 묶음 검사는 원인을 먼저 가른다.

### F-08 (P3) `docs/db-backups.md`의 “전체 영속 테이블 13개”는 지금 스키마와 다르다

- 근거: 문서 “전체 영속 테이블 13개를 내보낸 뒤”, “일시적 `price_quotes`와 `hotel_result_sessions`는 제외한다.” 코드 `lib/catalog-export.ts`의 `EXPORT_TABLES`는 13개이고 manifest는 `excluded:['price_quotes','hotel_result_sessions']`다.
- 재현(사본): 마이그레이션 16개를 메모리 SQLite에 적용해 표를 세고 `EXPORT_TABLES`와 견줌 → `tables after all migrations: 16`, `EXPORT_TABLES: 13`, `in schema, neither exported nor named excluded: ['hotel_locale_names']`.
- `hotel_locale_names`를 빼기로 한 것은 기록된 결정이다(`docs/D07-20261019.md` “5. 백업: `hotel_locale_names`는 ... `EXPORT_TABLES`에 넣지 않았다. 다시 모을 수 있는 자료이고”). 결함은 문서와 manifest의 `excluded` 목록이 그 표를 말하지 않는다는 것뿐이다.
- 제안: 문서를 “13개(다시 모을 수 있는 `hotel_locale_names` 제외)”로, manifest `excluded`에 그 표를 더한다.

## 1. `scripts/` 참조 목록

만든 방법: `python3 -I tools/refs.py repo refs/scripts-refs.tsv`(파일 177개마다, 그 파일 이름을 적은 다른 추적 파일을 종류별로 셈. 단위는 “(대상 파일, 이름을 적은 파일)” 한 쌍이고 주석에 적힌 이름도 센다), `python3 -I tools/reach.py refs/scripts-refs.detail.txt refs/scripts-unreachable.txt`(자동 경로에서 닿는지), `python3 -I tools/table.py ...`(아래 숫자). 전체 표는 `refs/scripts-refs.tsv`, 파일마다 누가 불렀는지는 `refs/scripts-refs.detail.txt`.

패턴 대조(아는 참조가 걸리는지): `scripts/collection-budget.mjs`는 workflow 1(`collect.yml`), `scripts/check-collection-budget.mjs`는 `cloud-check.py` 1, `scripts/sites-env.mjs`는 `package.json` 1, `scripts/crawler/retry_policy.py`는 다른 스크립트 7(`from retry_policy import`), `scripts/execution-profile.mjs`는 `cloud-setup.sh` 1과 `vite.config.ts` 1로 나왔다. `scripts/crawler/check.py`가 `cloud-check.py`와 겹쳐 세이지 않도록 이름 앞 경계를 두었다.

이 방법이 못 잡는 것 하나를 찾았다: `scripts/crawler/fixtures/jalan-locale-en.html`·`jalan-locale-kr.html`은 표에서 ‘과거 문서만’으로 나오지만 `scripts/crawler/check.py`가 `fixtures/('jalan-locale-%s.html'%('kr' if lang=='ko' else 'en'))`로 이름을 만들어 읽는다. 두 파일은 쓰인다.

숫자(`refs/scripts-summary.txt`, `tools/table.py` 출력):

- `scripts/` 아래 추적 파일 177개. `package.json`이 이름을 적은 것 3, workflow 28, `cloud-check.py` 53, `cloud-setup.sh` 3.
- `package.json`·workflow·`cloud-check.py`·`cloud-setup.sh`에서 다른 스크립트를 거쳐 닿는 것 123개, 닿지 않는 것 54개(위 fixture 2개를 빼면 52개).
- 닿지 않는 54개의 내역:
  - 코드에서도 문서에서도 불리지 않음 1개: `scripts/install-ci.mjs`. 이 파일만 부르는 `scripts/install-ci.sh`, 그 둘만 부르는 `scripts/npm-install.mjs`까지 세 파일이 한 사슬이다. `install-ci.mjs`는 `if (!process.env.npm_execpath) throw new Error("Run this installer with npm run install:ci.")`라고 하지만 `package.json`의 `"install:ci": "bash scripts/install-pnpm.sh"`는 다른 파일을 가리키고, `install-ci.sh`가 읽는 `package-lock.json`은 저장소에 없다(`git ls-files | grep -c package-lock.json` → 0, 대조 `pnpm-lock.yaml` → 1).
  - 다른 스크립트나 주석에서만 불림 16개: `check-catalog.mjs`(`lib/catalog-core.ts` 주석), `check-public-worker.mjs`·`check-public-access.py`·`check-runtime.py`·`serve-former-worker.mjs`(서로와 `run-runtime-check.py`), `check-u02-browser.mjs`·`check-u05-map-browser.mjs`·`check-u06-status-browser.mjs`·`site-search-node.mjs`(브라우저 검사끼리), `compare-static-search.mjs`(`lib/static-search.ts` 주석), `measure-search-snapshot.mjs`, `connector-preview/` 3개(서로만), `install-ci.sh`, `npm-install.mjs`.
  - 지금의 절차 문서에서만 불림 3개: `scripts/audit-catalog.py`(`docs/catalog-operations.md`), `scripts/check-u01-browser.mjs`·`scripts/check-u01-dom.cjs`(`docs/cloud-development.md`). `audit-catalog.py`는 마이그레이션만 적용한 빈 SQLite에서 `exit=0`, `check-u01-dom.cjs`는 `rc=0`이었다. `check-u01-browser.mjs`는 브라우저가 필요해 돌리지 않았다.
  - 과거 날짜 문서에서만 불림 34개: 브라우저 검사 20개(`*-browser.mjs`), fixture 2개(위에 적은 대로 실제로는 쓰임), 그 밖 12개 `audit-region-labels.mjs`, `audit-trip-addresses.mjs`, `check-facility-links.cjs`, `check-lifecycle-worker.mjs`, `check-source-groups-worker.mjs`, `compare-snapshot-builds.mjs`, `geo/measure-public.mjs`, `lifecycle-survey.py`, `measure-first-view.mjs`, `measure-route-cpu.mjs`, `measure-snapshot-client.mjs`, `run-runtime-check.py`. 목록 전체는 `refs/scripts-summary.txt`.
- 닿는 123개 가운데 이름과 달리 운영 경로가 아닌 것: `scripts/runner/bootstrap.py`(부르는 곳은 `scripts/runner/check_bootstrap.py` 하나와 문서 둘, workflow 0), `scripts/sites-env.sh`·`scripts/build-verified.sh`·`scripts/install-pnpm.sh`·`scripts/pnpm-install.mjs`(`package.json`의 `install:ci`와 `run-framework.mjs`의 `managedLinux` 갈래에서만). 3절에 적는다.
- `package.json`의 `start`(`node --import ./scripts/sites-env.mjs ... wrangler.js dev --config dist/server/wrangler.json --local`)는 스크립트 20개가 머리 주석에서 요구한다(`grep -rlE 'then pnpm start' scripts | wc -l` → 20)(“Needs the local site (node scripts/prepare-local-site.mjs, then pnpm start)”). `scripts/sites-env.mjs`는 이름과 달리 지금도 쓰인다. `lint`, `db:generate`, `install:ci`를 부르는 workflow·문서·스크립트는 없다(`grep -rnE "install:ci|pnpm lint|db:generate"` → 오류 문구 두 줄뿐).

## 3. 옛 호스팅(Sites)의 흔적: 실행되는 것과 실행되지 않는 것

지금 운영 경로(Cloudflare 배포, 수집, 브라우저)에서 실행되는 것:

| 곳 | 무엇 | 근거 |
|---|---|---|
| `build/sites-worker.ts` | Worker의 진입점. 요청마다 `runWithConnectorBinding(binding, () => guardRequest(...))`를 거친다 | `vite.config.ts` `main: "./build/sites-worker.ts"`. `binding`은 Cloudflare에서 `ctx.props?.CONNECTORS`가 없어 `undefined`. 저장한 값을 읽는 `getConnectorBinding`의 사용처는 `lib/connectors.ts`뿐이고 그 파일을 import하는 곳은 없다(`refs/imports.txt`) |
| `build/sites-vite-plugin.ts` `closeBundle` | 빌드 때마다 `.openai/hosting.json`과 `drizzle/`를 `dist/.openai/`로 복사 | 사본 `ls dist/.openai` → `drizzle`, `hosting.json`. 배포는 `dist/server/wrangler.json`(`assets.directory: ../client`)만 올리므로 이 복사본은 쓰이지 않는다 |
| `.openai/hosting.json` | `vite.config.ts`가 import해 D1 바인딩 이름(`"d1": "DB"`)을 읽음 | 빌드에 필요. `project_id`(Sites 프로젝트 ID)는 읽는 코드가 없다 |
| `scripts/build-collector-release.mjs`, `data/collector-release.generated.json`, `app/api/collector-release/route.ts` | 빌드 때마다 수집기 파일 5개를 JSON으로 묶고 Worker가 유지관리 키로 내준다 | `run-framework.mjs` `if (command === "build") await import("./build-collector-release.mjs")`. 배포 뒤 `cloudflare-smoke.mjs`가 이 경로의 403과 200을 본다. 받아 쓰는 쪽(`bootstrap.py`)은 이 저장소의 어떤 workflow도 부르지 않는다. 묶음 안의 `limits:{maxPages:16,maxSeconds:240,...}`는 지금 상한(120쪽)과 다르지만 읽는 운영 코드가 없다. 기본 주소도 옛 주소다: `const siteOrigin=process.env.YUKEMURI_SITE_ORIGIN||'https://yukemuri.jihun7891.chatgpt.site';`(배포 때는 `deploy.yml`이 `YUKEMURI_SITE_ORIGIN`을 준다) |
| `scripts/crawler/source_safety.py` `site_api` | 수집 때마다 실행. `SITE_HOSTS={'yukemuri.jihun7891.chatgpt.site','yukemuri-hokkaido.jihun7891.chatgpt.site'}` 갈래는 workers.dev 주소에서는 타지 않는다 | F-01 표: `https://yukemuri.jihun7891.chatgpt.site`를 지금도 받아들이고 그때 `OAI-Sites-Authorization` 헤더에 키를 싣는다 |
| `lib/api-client.ts` `readApiJson` | 브라우저의 모든 API 응답에서 `response.status===401||response.redirected&&/\/(?:signin(?:-with-chatgpt)?|login|callback|auth)(?:\/|\?|$)/i.test(response.url)`을 보고 “로그인 상태를 확인해 주세요”를 낸다 | `app/`·`lib/`에 401을 내는 경로는 없다(`grep -rnE "status:\s*401" app lib` → 0건, 대조 `grep -rnE "status:\s*403" app lib`은 걸림) |
| `.sites-runtime/`, `scripts/execution-profile.mjs` | pnpm 저장 폴더(`pnpm-workspace.yaml` `storeDir: ${SITES_PNPM_SHARED_STORE:-.sites-runtime/pnpm-store}`)와 실행 프로필 읽기 | `cloud-setup.sh`가 `readExecutionProfile()!=="portable"`이면 멈춘다. 이름은 Sites지만 모든 환경에서 쓰인다 |

실행되지 않는 것(이 저장소의 workflow·`cloud-check.py`·앱에서 닿지 않음. 검사만 CI에서 도는 것은 그렇게 적음):

| 곳 | 무엇 | 근거 |
|---|---|---|
| `scripts/runner/bootstrap.py` | `SITE_ORIGIN = 'https://yukemuri.jihun7891.chatgpt.site'`에서 수집기를 받아 실행하는 옛 시작기 | `grep -rn "bootstrap" .github/workflows/*.yml` → 0건(대조: `run-collection.py`는 `collect.yml`에서 2건). 그 검사 `scripts/runner/check_bootstrap.py`만 `cloud-check.py`에서 돈다 |
| `app/chatgpt-auth.ts` | `oai-authenticated-user-*` 요청 헤더를 믿고 사용자를 만든다 | import하는 파일 0(`refs/imports.txt`). Cloudflare에는 그 헤더를 붙이는 관문이 없으므로 나중에 이 파일을 쓰면 누구나 헤더를 넣어 사용자를 사칭할 수 있다 |
| `scripts/sites-env.sh`, `build-verified.sh`, `install-pnpm.sh`, `pnpm-install.mjs` | Sites 관리형 환경의 설치·빌드 싸개 | `run-framework.mjs`는 `managedLinux`일 때만 `build-verified.sh`를 부르고 `cloud-setup.sh`는 `portable`만 받는다 |
| `scripts/install-ci.mjs`, `install-ci.sh`, `npm-install.mjs` | npm 시절 설치기 | 1절 |
| `scripts/catalog-checkpoint.py export` | `.chatgpt.site` 주소만 받는다 | F-04 |
| `scripts/connector-preview/` 3개, `build/connector-preview-plugin.mjs`, `build/connector-preview-worker.mjs`, `lib/connector-preview.d.ts` | Sites 미리보기의 연결 앱 다리 | `vite.config.ts`에서 `command === "serve"`(개발 서버)일 때만 보조 Worker로 붙는다. `scripts/connector-preview/`를 부르는 파일은 그 폴더 안뿐 |
| `vite.config.ts`의 `r2_buckets ... "site-creator-r2"`, `SITE_CREATOR_PLACEHOLDER_DATABASE_ID`, `allowedHosts: ["terminal.local"]`, `CODEX_SANDBOX` | Sites 시작 틀의 설정 | `.openai/hosting.json`의 `"r2": null`이라 R2 갈래는 타지 않는다. 자리표시 DB ID는 `databaseId`가 `null`일 때만 쓰이는데 지금은 값이 있다 |

## 6. 배치에서 헷갈릴 만한 곳(사실만, 재편 권고 아님)

숫자는 `git ls-files`에서 센 것이다(명령은 각 줄에).

- `build/`는 빌드 결과가 아니라 소스다. Worker 진입점 `build/sites-worker.ts`, 벤더링한 Vite 플러그인 `build/sites-vite-plugin.ts`(+LICENSE), 개발 서버용 `connector-preview-*.mjs`가 있다. 빌드 결과는 `dist/`다. `eslint.config.mjs`의 `globalIgnores([".next/**","out/**","build/**","next-env.d.ts"])` 때문에 이 폴더는 lint 대상이 아니다(타입 검사는 `tsconfig.json`의 `**/*.ts`에 들어 있음). lint 자체도 CI에 없다(`package.json`의 `lint`를 부르는 곳 0).
- 검사 파일의 자리와 이름이 넷이다(`git ls-files scripts`에서 이름이 `check`로 시작하는 83개): `scripts/check-*.{mjs,cjs,py}` 73개, `scripts/crawler/check.py` 1개와 `scripts/crawler/check_*.py` 4개, `scripts/runner/check_*.py` 3개, `scripts/geo/check_*.py` 2개. 최상위는 `check-`, 하위 폴더는 `check_`다.
- `check-`로 시작하지만 회귀 검사가 아닌 것: `scripts/check-collection-freshness.mjs`는 `collect-watch.yml`이 6시간마다 돌리는 운영 감시이고 `collection-chain.mjs`·`daily-check.mjs`가 여기서 `GENTLE_TITLE`·`WORKFLOW`를 import한다. 반대로 `scripts/daily-check.mjs`는 운영 점검이고 그 회귀 검사는 `scripts/check-daily-check.mjs`다. `scripts/checked-commit.mjs`는 배포 workflow의 도구다.
- `update-*` 스크립트가 세 곳에 있다(`git ls-files scripts | grep "/update-"` → 11개): `scripts/crawler/update-*.py` 5개(Worker에 쓰는 유지보수 도구), `scripts/update-*.{py,mjs}` 4개(`data/`의 공개 목록을 다시 만드는 도구), `scripts/geo/update-*.{py,mjs}` 2개.
- 운영 상태(lifecycle) 관련이 네 곳이다: `scripts/runner/apply-lifecycle.py`(workflow가 부름), `scripts/crawler/update-lifecycle.py`(그것이 부르는 도구), `scripts/lifecycle-push.mjs`(배포 게이트), `scripts/lifecycle-survey.py`(과거 문서에서만 불림).
- `scripts/runner/`에는 지금 쓰는 시작기(`run-collection.py`, `apply-lifecycle.py`)와 쓰지 않는 옛 시작기(`bootstrap.py`)가 같이 있다.
- `scripts/` 최상위에 132개가 섞여 있다(`git ls-files scripts | awk -F/ 'NF==2' | wc -l`): CI 검사, 손으로 돌리는 브라우저 검사 25개(`*-browser.mjs`), 배포 도구(`cloudflare-*`), 측정 도구(`measure-*`, `compare-*`), Sites·npm 시절 설치기, 한 번 쓴 조사 도구(`audit-*`).
- 실행 파일이 `docs/` 아래에도 있다: `git ls-files docs/evidence | grep -cE '\.(mjs|cjs|js|py|sh)$'` → 90. `web-checks.yml`·`deploy.yml`의 `paths-ignore: ['**/*.md', 'docs/**', 'archives/**']` 때문에 이 파일만 바꾼 push는 검사가 돌지 않는다.
- 공개 자료 JSON이 두 곳이다: `data/` 16개, `lib/hotels.real.json`·`lib/hotels.verified.json`(+복원되는 `lib/hotels.crawled.json`). `README.md`가 “`data/`와 일부 `lib/*.json`”이라고 적어 두었다.
- 스키마가 두 곳이다: `db/schema.ts`(drizzle-kit용 표 정의 16개)와 `drizzle/*.sql`(마이그레이션 16개 + `meta/`). 앱 코드는 `db/`를 import하지 않고 `env.DB`에 SQL을 직접 쓴다(`db/index.ts`를 import하는 파일 0, `refs/imports.txt`).
- 스킬 문서가 세 곳이다: 원본 `skills/yukemuri-maintenance/SKILL.md`, 그리로 보내는 `.claude/skills/...`·`.agents/skills/...`(각 325바이트). `docs/cloud-development.md` ‘공통 스킬’ 표가 설명한다.
- 보존 자료가 세 곳이다: `source-assets/`(조각 286개 파일), `archives/git/`(추적 파일은 `manifest.json` 하나, bundle 두 개는 `cloud-setup.sh`가 복원), `docs/evidence/`(410개). `archives/git/manifest.json`을 읽는 코드는 없다(`scripts/materialize-source-assets.py`의 `MANIFEST`는 `source-assets/manifest.json`).
- `.sites-runtime/`은 이름과 달리 모든 환경의 pnpm 저장 폴더이고(`pnpm-workspace.yaml`), 문서가 브라우저 검사 의존성을 두라고 하는 곳이기도 하다(`.sites-runtime/u01-dom`).
- `package.json`의 `"name": "site-creator-vinext-starter"`는 Sites 시작 틀의 이름 그대로다.
- `docs/README.md`(‘문서 목록’)의 표는 12줄이고 md 18개를 가리킨다. `docs/` 최상위 md는 55개다. `cloudflare-deploy.md`와 `deployments.md`는 목록에 없다(`grep -c` → 0).
- `hooks/`에는 `use-mobile.ts` 하나뿐이고 쓰는 곳은 앱이 닿지 않는 `components/ui/sidebar.tsx` 하나다. `vendor/`에는 `app/globals.css`가 import하는 CSS 하나와 그 라이선스가 있다. `examples/d1/`(2개)은 Sites 시작 틀의 예제로 `tsconfig.json`의 `exclude`에 들어 있고 부르는 곳이 없다.

## 2. 죽은 코드와 지워 본 결과

방법: `node tools/imports.mjs repo refs/imports.txt`(TypeScript 파서로 import·`require`·`import()`·`new URL(..., import.meta.url)`를 따라가 앱의 뿌리 `app/**/route|page|layout`, `build/sites-worker.ts`, `vite.config.ts`에서 닿지 않는 모듈을 냄), `node tools/exports.mjs repo refs/exports.tsv lib/ db/ app/ hooks/`(export 419개마다 그 이름을 적은 다른 파일 수). 스크립트가 `lib/*.ts`를 문자열 경로로 컴파일해 쓰는 경우(`compileLib(temp,'lib/jta-registration.ts')`)는 import 그래프에 안 잡히므로 grep으로 따로 확인했다(`lib/search-snapshot-build.ts`, `lib/jta-registration.ts`는 그렇게 쓰인다).

지워 보기: 사본에서 `bash tools/trial.sh repo logs <묶음> <파일...>`. 한 묶음을 지우고 `node node_modules/typescript/bin/tsc --noEmit`과 `python3 scripts/cloud-check.py`(빌드 없는 공통 검사, 38단계)를 돌린 뒤 `git checkout HEAD -- <파일>`로 되돌린다. 판정 줄은 스크립트가 종료 코드로 만든다(`logs/trial-summary.txt`). 대조 두 개: 쓰이는 `lib/hotel-names.ts`를 지우면 `FAIL ... tsc_exit=2 quick_check_exit=1`, 쓰이는 `scripts/collection-budget.mjs`를 지우면 `FAIL ... tsc_exit=0 quick_check_exit=1 ... last_step=[Running: node scripts/check-collection-chain.mjs]`.

### F-09 (P2) 쓰이지 않는 파일 77개와 export 여섯 개(묶음별 결과)

| 묶음 | 파일 | 지금 쓰임 | 묶음만 지우고 tsc + 빠른 공통 검사 |
|---|---|---|---|
| B1 npm 시절 설치기 | `scripts/install-ci.mjs`, `scripts/install-ci.sh`, `scripts/npm-install.mjs` | 없음(1절) | PASS (`files_deleted=3 tsc_exit=0 quick_check_exit=0`) |
| B2 Sites 로그인 도우미 | `app/chatgpt-auth.ts` | import 0 | PASS |
| B3 연결 앱의 안 쓰는 쪽 | `lib/connectors.ts`, `components/connector-error.tsx`, `lib/connector-errors.mts` | `connectors.ts` import 0, `connector-error.tsx` import 0, `connector-errors.mts`는 그 컴포넌트만 import | PASS |
| B4 예시 숙소 | `lib/hotels.seed.ts`, `public/images/credits-sample.json` | `hotels.seed.ts` import 0, JSON은 그 파일만 읽음 | PASS |
| B5 drizzle 접근자와 예제 | `db/index.ts`, `examples/d1/`(2개) | `getDb()` 사용처 0, 예제는 부르는 곳 0 | PASS |
| B6 안 쓰는 UI 부품 | `components/ui/` 61개 가운데 56개, `hooks/use-mobile.ts`, (`components/connector-error.tsx`) | 앱이 닿는 것은 `drawer`, `select`, `sheet`, `table`, `tooltip` 다섯 개뿐(`refs/ui-unreached.txt`) | PASS (`files_deleted=58`) |
| B7 미리보기 다리 스크립트 | `scripts/connector-preview/` 3개 | 폴더 안에서만 서로 부름 | PASS |
| B8 옛 bundle 기록 | `archives/git/manifest.json` | 읽는 코드 0 | PASS |
| B9 Sites 관리형 싸개 | `scripts/sites-env.sh`, `scripts/build-verified.sh`, `scripts/install-pnpm.sh`, `scripts/pnpm-install.mjs` | `package.json` `install:ci`와 `run-framework.mjs`의 `managedLinux` 갈래만 | PASS. 다만 지우면 `package.json`의 `install:ci`와 `run-framework.mjs`의 `./build-verified.sh` 줄이 없는 파일을 가리키게 된다 |
| B10 안 쓰는 export | `lib/hotel-name-match.ts` `matchHotelName`, `lib/hotel-query.ts` `defaultHotelQuery`, `lib/hotel-search-index.ts` `searchIndexHotel`, `lib/hotels.real.ts` `CATALOG_VERIFIED_AT`, `lib/bath-columns.ts` `BathColumnId`, `lib/hotel-suggestions.ts` `SuggestionsResponse` | 선언한 파일 말고는 이름을 적은 파일 0(`grep -rlw`; 대조 `displayNames`는 12개 파일) | `node tools/remove-exports.mjs ...`로 선언을 지운 뒤 `tsc exit=0` |

- 묶음을 모두 한꺼번에 지운 사본(삭제 77, 수정 6)에서 `python3 scripts/cloud-check.py --full`(빌드와 Worker 검사 포함)을 돌린 결과는 이 절 끝의 ‘한꺼번에 지운 결과’에 적는다.
- 심각도: 틀린 결과를 내지는 않는다. 다만 `app/chatgpt-auth.ts`는 3절에 적은 대로 나중에 쓰면 사칭이 가능한 코드라 남겨 둘 이유가 없다. 묶음 전체를 P2 하나로 적는다.
- 제안: B1~B8은 그대로 지우고, B9는 `package.json`의 `install:ci`와 `run-framework.mjs`의 `managedLinux` 갈래를 함께 정리할 때 지운다.

### 쓰임은 있지만 이름이나 자리 때문에 죽은 것처럼 보이는 것

- `app/api/prices/route.ts`: 지금 하는 일은 `GET`에 410과 안내 문구를 돌려주는 것뿐이다(`export async function GET(){return Response.json({error:'요금 조회는 예약 사이트에서 확인해 주세요. ...'},{status:410,headers:{'Cache-Control':'no-store'}})}`). `components/`·`lib/`에서 부르는 곳은 0이다. 검사 두 곳이 410을 기대한다: `scripts/check-public-reads-worker.mjs`의 `['/api/prices',410]`, `scripts/measure-d1-reads.mjs`의 `['prices','요금(폐지)','/api/prices',{},410]`(둘 다 `cloud-check.py --full`). 지우기는 아래 ‘요금 경로를 지운 결과’에 적는다.
- `app/api/hotels/[id]/google/route.ts`: 운영에서는 첫 줄 `if(env.GOOGLE_PLACES_ENABLED!=='true'||!env.GOOGLE_PLACES_API_KEY)return Response.json({status:'not_connected'},{headers});`에서 끝난다. 배포가 주는 값은 `vite.config.ts`의 `vars: { REJECT_AUTOMATED_AGENTS: "1" }`와 `cloudflare-deploy-worker.sh`의 `{CRAWL_ACCESS_KEY:k}`뿐이라 두 변수는 없다. 죽은 경로는 아니다: `components/hotel-detail.tsx`가 `if(!hotel?.googlePlaceId)return;` 뒤에 `fetch('/api/hotels/'+encodeURIComponent(hotelId)+'/google?photo=1',...)`를 부른다. 저장소 자료에는 `googlePlaceId`가 없다(`grep -o '"googlePlaceId"'` → `lib/hotels.real.json` 0, `lib/hotels.verified.json` 0, `lib/hotels.crawled.json` 0, `data/source-groups-reviewed.json` 0; 대조 `"id":`는 20, 1, 1634건). 운영 D1에 그 값을 가진 숙소가 있는지는 보지 않았다(미확인 4). 있다면 상세를 열 때마다 `not_connected`만 받는 요청이 하나씩 더 나가고 상세 한도(분당 30)에 든다.
- `lib/google-places.ts`의 `readGooglePlace`: 위 이유로 운영에서는 실행되지 않고 `scripts/check-source-policy.mjs`(공통 검사)가 가짜 fetch로 돌린다. `components/google-place-rating.tsx`는 상세와 비교 화면이 쓴다.
- `lib/connector-context.ts`, `lib/connector-contract.mts`, `lib/connector-preview.d.ts`, `build/connector-preview-plugin.mjs`, `build/connector-preview-worker.mjs`: `build/sites-worker.ts`와 `vite.config.ts`가 import하므로 지우려면 두 파일을 함께 고쳐야 한다. 쓰임 없음(운영에서 하는 일 없음), 지우기는 미확인.
- `lib/hotels.real.ts`: `realHotels`를 쓰는 곳은 자동 경로 밖의 `scripts/check-catalog.mjs` 하나다(그 검사는 `rc=0`).
- `/api/hotel-descriptions`, `/api/hotel-names`, `/api/hotel-source-groups`, `/api/crawl-seeds`: 부르는 곳은 손으로 돌리는 `scripts/crawler/update-descriptions.py`, `update-names.py`, `update-source-groups.py`, `update-lifecycle.py`뿐이다(예약 수집에는 없음). `/api/catalog-export`는 `scripts/catalog-checkpoint.py`와 실행기 백업이 부른다.
- `data/operational-evidence-reviewed.json`: 코드에서 읽는 곳 0(`grep -rlF` → 0, 대조 `data/lifecycle-official.json`은 9개 파일). 문서에서도 이름이 나오지 않는다. 쓰임 없음, 지우기는 미확인(운영 상태 근거의 원본일 수 있음).
- `package.json`의 의존성 가운데 앱이 닿지 않는 파일만 import하는 것 14개: `@base-ui/react`, `@hookform/resolvers`(import 0), `@shadcn/react`, `class-variance-authority`, `cmdk`, `date-fns`(import 0), `embla-carousel-react`, `input-otp`, `next-themes`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`(대조: `leaflet` 2/2, `zod` 10/9, `vaul` 1/1은 닿음). 쓰임 없음, 지우기는 미확인(잠금 파일이 바뀜).
- `lib/*.ts` export 가운데 다른 파일이 이름을 적지 않지만 같은 파일 안에서 쓰는 것(export만 불필요): `observedHotel`, `LOCALE_REFRESH_DAYS`, `isAutomatedAgent`, `externalBathDescription`, `externalBathNote`, `COMPARISON_LIMIT`, `hotelNamePatch`, `SOURCE_POLICY`, `preferredPhotos`, `MAP_POINT_LIMIT`, `compareText`와 타입 여럿. 전체는 `refs/exports.tsv`의 `other_files=0` 줄(67개, 그중 `db/schema.ts`의 표 13개는 drizzle-kit용).

### F-10 (P3) `lib/edge-guard.ts` 머리 주석이 P03 전의 첫 화면을 말한다

- 근거: `lib/edge-guard.ts` “Static assets are served before the Worker and are not counted. Pages count too: the home page runs a D1 search per request.” 그런데 `scripts/build-static-page.mjs` 머리 주석은 “Cloudflare serves a matching static asset before the Worker ..., so `/` and `/?q=...` never invoke the Worker. The page reads no request data and no database (app/page.tsx)”이고 `app/page.tsx`도 “opening the site never calls the Worker”라고 적는다. 빌드 결과에 `dist/client/index.html`이 있고 `dist/server/wrangler.json`의 `assets`는 `{'directory': '../client'}`다.
- 재현: 사본에서 `python3 -c "import json;print(json.load(open('dist/server/wrangler.json'))['assets'])"` → `{'directory': '../client'}`, `ls dist/client/index.html` → 있음. 실제 Cloudflare에서 `/`가 Worker를 거치지 않는지는 요청해 보지 않았다(주석과 설정만 대조).
- 제안: 그 문장을 지우거나 “첫 화면은 정적 자산이라 세지 않는다”로 고친다. F-06의 문서 문장 “첫 화면부터 주소의 검색 조건을 서버가 적용한다”도 같은 이유로 지금과 다르다.

### 덧붙임: 스키마 파일과 마이그레이션, lint

- `db/schema.ts`와 `drizzle/meta/`는 어긋나지 않았다: 깨끗한 둘째 사본(`repo2`)에서 `node node_modules/drizzle-kit/bin.cjs generate` → `No schema changes, nothing to migrate`, `git status`에 `drizzle/` 변화 없음.
- `build/` 폴더가 lint에서 빠지는 것을 확인했다: `node node_modules/eslint/bin/eslint.js build/sites-worker.ts` → `0:0  warning  File ignored because of a matching ignore pattern.` 대조 `node node_modules/eslint/bin/eslint.js lib/edge-guard.ts` → 경고 없이 `exit=0`.

### 요금 경로를 지운 결과(지워도 됨이 아님)

- 둘째 사본(`repo2`, 원본을 다시 복사)에서: 지우기 전 `node scripts/check-public-reads-worker.mjs` → `exit=0`(대조). `app/api/prices/route.ts`를 지우고 `node scripts/run-framework.mjs build` → `exit=0`. 그 뒤 `node scripts/check-public-reads-worker.mjs` → `exit=1`, `AssertionError [ERR_ASSERTION]: /api/prices` `404 !== 410`. `node scripts/measure-d1-reads.mjs --check` → `exit=1`, `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`(404 화면을 JSON으로 읽으려다 멈춤). 요약은 `logs/prices-summary.txt`.
- 그러므로 `app/api/prices/route.ts`는 화면이 부르지 않지만 `cloud-check.py --full`의 두 검사가 410을 요구한다. 지우려면 그 두 검사의 기대값을 함께 고쳐야 한다. 옛 북마크와 옛 클라이언트에 410을 주려고 둔 경로라는 것은 파일 주석(“Keep the old route explicit for bookmarks and older clients”)이 말한다.

### F-07 보충

- `lib/hotel-facility-link.ts`의 `hotelFacilityUrl`을 보는 검사는 실패하는 `scripts/check-facility-links.cjs` 하나뿐이다(`grep -rl "hotelFacilityUrl\|hotel-facility-link" scripts app components lib` → 그 검사, `components/hotel-comparison.tsx`, `components/hotel-detail.tsx`, `lib/hotel-facility-link.ts`). 지금 그 규칙을 판정하는 검사는 없다.
- `check-source-groups-worker.mjs`의 `1 !== 2`는 기대값이 낡았을 가능성이 높다: `lib/search-snapshot-build.ts`가 `const kept=rows.filter(r=>!mergedInto.has(r.id))`로 묶인 기록을 한 카드로 합친다(주석 “mergedInto (D08 PR 6)”). 직접 가르는 실험은 하지 않았다(미확인 3 그대로). 55번째 줄 앞의 단언(연결 PUT, 409 둘, 상세와 비교의 합성)은 통과하고 그 줄에서 멈추므로 뒤의 단언은 실행되지 않는다.

### 한꺼번에 지운 결과(B1~B10)

- 사본에서 B1~B9의 77개 파일을 모두 지우고 B10의 export 여섯 개를 지운 상태(`git status`: 삭제 77, 수정 6)로 `python3 scripts/cloud-check.py --full`을 돌렸다 → `combined full check exit=0 secs=1139 steps=55`, 마지막 줄 `Cloud checks passed. Browser/mobile checks and production deployment are separate.`(`logs/combined-full-summary.txt`, `logs/combined-full.log`). 그 안에서 빌드도 다시 됐다(`Running: node scripts/run-framework.mjs build`, `Static page: dist/client/index.html (45.5KiB)`). 검사가 끝난 뒤에도 삭제 77·수정 6이 그대로였다(검사가 파일을 되살리지 않음).
- 같은 상태에서 개발 서버도 떴다: `node scripts/run-framework.mjs dev --port 5391` 뒤 `curl http://127.0.0.1:5391/` → 15초 만에 `200`, 68,074바이트, `<title` 있음.
- 그러므로 B1~B8과 B10은 ‘지워도 됨’이다(빌드, 공통 전체 검사, 개발 서버 첫 화면이 그 파일 없이 통과). B9는 같은 검사를 통과하지만 `package.json`·`run-framework.mjs`에 없는 파일을 가리키는 줄이 남으므로 그 줄과 함께 지울 때만 ‘지워도 됨’이다.
- 보지 않은 것: 브라우저 검사(`*-browser.mjs`)와 `pnpm start`는 지운 상태에서 돌리지 않았다. Sites 관리형 환경(`managed-linux`)에서의 설치와 빌드는 그 환경이 없어 볼 수 없다(B9가 거기서만 쓰임).
- 검사를 마친 뒤 두 사본은 `git checkout HEAD -- .`로 되돌렸다.

## 미확인(재현하지 못했거나 보지 못한 것)

1. private 실행기 레포(`jihune/yukemuri-script-runner`)의 백업·예약 코드가 지금 어느 주소를 읽는지. 이 세션에서 그 저장소를 열지 않았다. F-04·F-05의 “날마다 도는 백업은 실행기 사본이 한다”는 `docs/db-backups.md`의 문장에 기댄 것이다.
2. `catalog-checkpoint.py`의 요청이 User-Agent 없이 Cloudflare를 통과하는지. 운영에 요청하지 않았다.
3. `scripts/check-source-groups-worker.mjs`의 `1 !== 2`가 낡은 기대값인지 회귀인지. 코드(`mergedInto`)로는 낡은 기대값으로 보이나 가르는 실험을 하지 않았다.
4. 운영 D1에 `googlePlaceId`를 가진 숙소가 있는지(있으면 상세마다 `/google` 요청이 하나씩 더 나감). 운영에 요청하지 않았다.
5. 브라우저 검사 25개가 지금 통과하는지. 브라우저가 필요해 돌리지 않았다. 그 가운데 20개는 과거 날짜 문서에서만 불린다.
6. `/`가 실제 Cloudflare에서 Worker를 거치지 않는지(F-10). 설정과 주석만 대조했다.

## 요약

- 검토한 기준: 사본을 만든 때의 HEAD `d5caa7c`. 끝낼 때 원본 HEAD는 `e8d5289`였고 그 사이 바뀐 것은 `docs/` 아래 23개 파일뿐이다(`git diff --name-only d5caa7c HEAD | grep -vc '^docs/'` → 0).
- 지적 10개: P0 0, P1 0, P2 6(F-01, F-04, F-05, F-06, F-07, F-09), P3 4(F-02, F-03, F-08, F-10). 미확인 6.
- 죽은 줄 알았는데 운영 경로에서 실행되는 코드는 찾지 못했다. 반대쪽(이름은 옛것인데 지금도 실행되는 것)은 3절 첫 표에 있다: `build/sites-worker.ts`의 연결 앱 싸개, 빌드 때마다 만드는 수집기 묶음과 `/api/collector-release`, `dist/.openai/` 복사.
- 열린 PR 파일에서 나온 것: F-05의 `AGENTS.md` 줄(#291), 4절의 `collection-budget*`·`collection-chain*`·`daily-check.mjs`(값은 서로 맞음), `lib/hotel-repository.ts`(#292, 지적 없음).

끝: 2026-11-10T02:21Z (`date -u` 출력).
