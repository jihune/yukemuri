# 유케무리 작업 시작

기록: 2026-10-08T12:52:11Z / 2026-10-08 21:52:11 KST.
이 문서는 새 Work 세션의 시작점이다. 수치와 배포 상태는 시작할 때 다시 확인한다.

## 소스와 읽기 순서

현재 개발 소스의 기준은 이 Sites 저장소다. GitHub 연결은 일반 작업 시작의 전제 조건이 아니다.
Sites ID는 `appgprj_6abf95be6ea0819181cc3e93535413ac`이다.
운영 주소는 https://yukemuri.jihun7891.chatgpt.site 이다.

1. Sites 도구로 같은 ID의 현재 사이트·게시 버전·공유 범위를 확인한다.
2. Sites hosting 절차로 현재 소스를 빈 작업 폴더에 복구한다. 짧은 소스 접근 키는 메모리와 숨긴 표준입력에서만 사용한다.
3. 이 파일과 [AGENTS.md](AGENTS.md)를 읽는다. Git 상태를 확인한다.
4. [우선순위](docs/roadmap.md)와 [최근 인수인계](docs/work-handoff-latest.md)를 읽는다. 작업에 필요한 문서만 추가로 읽는다.
5. 결과 하나를 구현·검사·게시한다. 실제 결과와 다음 작업을 UTC·KST로 기록한다.

첨부 안내나 프로젝트 Sources가 없어도 위 Sites ID로 현재 소스를 복구할 수 있다. Sites 접근이 없으면 그 제한을 알린다. 임시 폴더가 다음 세션에도 남아 있다고 가정하지 않는다.

## GitHub의 역할

GitHub `jihune/yukemuri-script-runner`는 Python 예약 실행을 시작하는 용도로 남긴다.
새 수집기 전달 방식은 [예약 실행 전환 안내](docs/collector-runner-migration.md)에 있다.
2026-10-08 GitHub 기본 브랜치에 전환을 적용했다. 실행마다 인증된 Sites 수집기를 한 번 받는다. 실제 검사·실행 결과와 다음 예약의 관찰 여부는 최근 인수인계에서 확인한다.

예약 설정·실행 이력 확인·workflow 전환처럼 GitHub 자체를 다루는 작업에 접근이 필요하면 먼저 사용자 허가를 받는다. 일반 화면·API·수집기 코드 수정 때문에 GitHub 연결을 다시 요구하지 않는다.

2026-10-08T16:33:14Z / 2026-10-09 01:33:14 KST 접근 방식 보완:
GitHub 작업은 허가받은 연결 도구·API 또는 인증된 `git`·`gh` 명령을 우선한다.
클라우드 브라우저로 GitHub를 조작하는 방식은 피한다.
도구의 404·권한 오류를 이유로 브라우저에 자동 전환하지 않는다.
다른 방식으로 처리할 수 없는 경우에만 이유를 설명하고 해당 방식의 허가를 받는다.
Sites 일반 개발과 화면 검증은 계속할 수 있는 범위에서 진행한다.

## 검사

수집기 변경은 `python3 scripts/crawler/check.py`, `python3 scripts/crawler/check_diagnostics.py`, `python3 scripts/crawler/check_retry_policy.py`와 관련 안전 검사를 실행한다.
배포 파일 변경은 `node scripts/build-collector-release.mjs` 후 `python3 scripts/runner/check_bootstrap.py`를 실행한다.
Worker 빌드 후 `node scripts/check-collector-release-worker.mjs`로 인증·DB 비변경을 검사한다.
큐·검색·비교를 바꾸면 해당 Worker 검사도 실행한다. 화면 변경은 실제 화면에서 로딩·실패·좁은 화면·키보드를 확인한다.

## 요청 예시

> 유케무리 Sites ID appgprj_6abf95be6ea0819181cc3e93535413ac의 현재 소스를 복구해. START_HERE.md와 AGENTS.md, 우선순위와 최근 인수인계를 읽어. 완료하지 않은 가장 높은 우선순위 작업 하나를 진행하고, 검사·게시·남은 일을 UTC와 KST로 기록해. GitHub 작업이 필요하면 먼저 허가를 요청해.

## 다음 U01 작업 요청

유케무리의 U01 작업을 진행해. 이번 결과는 비교·수집 현황 화면의 모바일·키보드 검사와 발견한 문제의 수정이야.

Sites ID `appgprj_6abf95be6ea0819181cc3e93535413ac`의 현재 소스를 복구해. `START_HERE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/work-handoff-latest.md`를 읽어. 현재 Git 상태·게시 버전·관련 운영 집계를 확인하고 시작해. 이전 수치는 현재값으로 가정하지 마.

일반 개발은 복구한 파일과 명령으로 진행해. GitHub 연결을 시작 조건으로 요구하지 마. 클라우드 브라우저로 GitHub를 조작하지 않는 방식을 우선해. GitHub 접근이 꼭 필요하면 이유를 설명하고 먼저 허가를 받아. 허가받은 작업도 연결 도구·API·인증된 git/gh 명령을 우선해. 사이트 화면 검사에 필요한 브라우저는 사용해도 돼.

360~390px 모바일 화면과 키보드로 비교 추가·제거, 비교→상세→비교 복귀, 포커스 이동·복귀, 닫기 동작을 확인해. 수집 현황의 로딩·빈 결과·실패·재시도도 확인해. 문제를 재현하고 필요한 수정과 관련 검사를 진행해. 실제로 확인한 범위와 미확인 범위를 구분해.

필요한 변경을 기존 Sites에 게시해. 종료 전에 변경·검사·게시 결과·남은 문제·다음 작업을 UTC와 KST로 기록하고 완료 보고를 남겨줘.
