# 유케무리 사이트

사이트 주소: https://yukemuri.jihune.workers.dev (Cloudflare Workers 무료 플랜, 2026-10-13 전환. 옛 Sites 주소는 더 이상 갱신하지 않는다.)

새 세션은 [START_HERE.md](START_HERE.md)부터 읽는다. 2026-10-09 사용자 요청에 따라 Codex 웹·Claude Code 웹 공통 개발 레포를 준비했다. 기존 Sites 호스팅·운영 D1·Python 예약은 유지한다.
개발 기준은 public [jihune/yukemuri](https://github.com/jihune/yukemuri)다(2026-10-11 private에서 전환). 실제 Sites 게시 커밋과 GitHub 커밋을 별도로 기록한다. 원래 Git 그래프는 [이력 보존 안내](docs/legacy-history.md)에 따라 복원할 수 있다.
환경 설정은 [클라우드 개발](docs/cloud-development.md), 배포 전달은 [Sites 인수인계](docs/sites-handoff.md), 최신 보존 범위는 [대화 인계](docs/conversation-handoff.md)를 따른다. [2026-10-09 이관 기록](docs/migration-20261009.md)은 이전 준비 시점의 기록이다.
현재 순서는 [작업 우선순위](docs/roadmap.md), 최근 결과는 [인수인계](docs/work-handoff-latest.md)에 있다.

최신 운영 점검: [2026-10-08 운영 체크포인트](docs/operations-checkpoint-20261008.md).

일본 온천 숙소의 시설, 객실탕, 평점과 출처를 비교하는 사이트다.

문서 기준: **2026-10-07T15:33:00Z / 한국시간 2026-10-08 00:33**. 해당 시점의 체크포인트다. 코드·배포·운영 DB는 이후에 바뀔 수 있다.

- [비교·확인량 체크포인트](docs/checkpoint-20261008.md): 새 동작, 집계 수정, 검사와 남은 작업.
- [이전 프로젝트 체크포인트](docs/checkpoint-20261007.md): 목적과 당시 구현.
- [문서 목록](docs/README.md): 현재 문서와 과거 기록.
- [개발 지침](AGENTS.md), [문장·용어 규칙](docs/writing-guide.md).

## 주요 동작

다국어 검색, 지역·온천 시설 필터, 지도, 숙소 상세, 최대 4곳 비교와 브라우저별 즐겨찾기를 제공한다. 원출처와 확인 범위를 표시한다. 수집 현황은 전체 기록과 상세·온천 조건 확인량을 구분한다. 실시간 요금 조회는 종료했다.

| 정보 | 우선 출처 | 표시 기준 |
|---|---|---|
| 평점·리뷰 수 | Trip.com, Google Maps | 출처별 점수와 원래 척도 유지 |
| 객실·호텔·온천 | 자란넷(Jalan) | 일부 객실·외부 온천 등 적용 범위 유지 |
| 대표사진 | Trip.com, Google Maps | 확인한 사진과 저자·출처 표시 |

Google Places 조회 코드는 있지만 운영 연결은 꺼져 있다. 미확인 평점·시설·사진을 만들지 않는다. 자세한 기준은 [출처 우선순위](docs/source-priorities-20261005.md)에 있다.

## 개발

Node.js 22.13 이상, pnpm 11.25.0, Python 3.10 이상을 사용한다. 버전은 `package.json`과 잠금 파일을 따른다.

```bash
bash scripts/cloud-setup.sh
pnpm dev
pnpm exec tsc --noEmit
pnpm build
```

React·TypeScript와 vinext/Vite로 Cloudflare Worker를 만든다. 운영 DB는 D1이다. 로컬 실행은 별도 DB를 사용한다. 관리형 Sites 환경에서는 제공되는 빌드·게시 절차를 따른다.

웹 클라우드에서는 Node 24를 선택한다. 초기 설정은 해시를 확인하며 공개 seed·이미지·fixture·Git 이력 보존본을 복원하고 잠금 파일대로 의존성을 설치한다. 공통 전체 검사는 `python3 scripts/cloud-check.py --full`이다. 원래 코드와 데이터 바이트를 바꾸지 않는다.

주요 회귀 검사:

```bash
python3 scripts/crawler/check_retry_policy.py
node scripts/check-listing-query.mjs
# Worker 빌드 후, 별도 로컬 D1에서 실행
node scripts/check-crawl-queue-worker.mjs
node scripts/check-collection-status-worker.mjs
node scripts/check-comparison-worker.mjs
```

## 코드와 운영 데이터

`app/`, `components/`, `lib/`는 화면·API·검색 로직이다. `scripts/crawler/`는 수집·유지보수 도구다. `db/`, `drizzle/`는 스키마·마이그레이션이다. `data/`와 일부 `lib/*.json`은 공개 자료의 소스 스냅샷이다.

Git이 실시간 D1 백업을 대신하지 않는다. 최신 관측, 큐, 번역과 즐겨찾기는 운영 DB에 있다. [내보내기·복원 절차](docs/catalog-operations.md)는 별도 관리 작업이다. 비밀, 개인 즐겨찾기와 운영 DB 파일은 Git에 넣지 않는다.

정기 수집은 GitHub의 Python 예약이 시작한다. 3시간 간격의 소량 처리이며 LLM을 호출하지 않는다. 번역·한국어 이름 조사·숙소 연결·폐업 판단은 이 예약에 포함하지 않는다.
Sites의 수집기를 예약 때 받아 실행하는 [전환 방식](docs/collector-runner-migration.md)을 준비했다. GitHub의 기존 예약 전환은 적용됐다. [자동 DB 백업](docs/db-backups.md)도 기존 실행기에서 운영한다.
