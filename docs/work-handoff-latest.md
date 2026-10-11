# 최근 작업 인수인계

작업: D01 후속 — Trip 주소 중복·빈 주소의 수집기 원인과 수정.
기록: 2026-10-11T04:40:00Z / 2026-10-11 13:40:00 KST.
이전 인수인계(U02 지도 키보드, PR #20의 병합 뒤 기록 포함)는 `history/work-handoff-U02-map-keyboard-20261011.md`에 보존했다.

## 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션이 맡긴 작업이다. 작업 브랜치: `claude/d01-trip-address`.
- 시작 기준: main `807dad9`(PR #19 병합). 인수인계를 쓰기 직전에 main `b8989ae`(PR #20 병합)를 충돌 없이 merge했다.
- 수집기·검사 코드 커밋은 `5aa8345`, 검토 반영 커밋은 `eef4fc7`이다. 그 뒤 커밋은 기록 문서만 바꾼다.
- 운영 D1·Secret·수집 예약·자동 백업·호스팅·공유 범위는 바꾸지 않았다. 이 환경에는 운영 접근 정보가 없다. 공급자 사이트에 요청하지 않았다.

## 환경 확인

- Node 24.21.0(`nvm install 24`), pnpm 11.25.0, Python 3.13.16이다.
- `bash scripts/cloud-setup.sh`는 exit 0이었다(04:12:37Z–04:12:58Z). 잠금 파일은 바뀌지 않았다.
- `python3 scripts/cloud-check.py --full`: 수정과 main merge 뒤 20개 명령 통과(04:16:28Z–04:19:30Z, rc=0). 검토 반영 `eef4fc7`에서도 20개 명령 통과(04:27:17Z–04:30:06Z, rc=0). 처음 실행(04:12:58Z–04:15:57Z, rc=0)은 실행 중에 이 세션이 `check.py`·`collect.py`를 고쳐 기준 커밋 측정으로 쓰지 않는다.

## 결과

상세는 `D01-20261011.md`, 근거는 `evidence/d01-trip-address-audit-20261011.json`(`node scripts/audit-trip-addresses.mjs <출력>`)이다.

- 체크인된 1,655개 중 Trip 24개가 모두 문제였다. 상세 관측 15개는 주소가 두 번 붙었고, 목록 관측 9개는 주소가 비었다. Jalan 1,611개와 큐레이션 20개는 해당 없다.
- 중복 원인(확인): `scripts/crawler/collect.py`의 `normalize`가 `addressRegion`·`addressLocality`·`streetAddress`를 구분자 없이 이었다. Trip의 `streetAddress`는 이미 나머지 둘을 포함한 전체 주소다. 체크인된 Trip 상세 fixture에서 수정 전 코드가 같은 형태의 중복을 만들었다. 15개 원문 HTML은 체크인되어 있지 않다.
- 수정: Trip 관측에서 `streetAddress`에 나머지 두 부분이 모두 들어 있으면 그것만 쓴다. 원문 글자를 버리지 않는다. Jalan 주소는 언제나 잇는다. Google Maps 검색 링크도 같이 고쳐진다.
- 빈 주소 원인(확인, 코드 수정 없음): Trip 목록 `ItemList` 항목에 `address`가 없다. 9개 ID가 모두 체크인된 목록 fixture에 있다. 상세 관측이 들어오면 채워진다. 추정해 채우지 않았다. 상세 관측이 없는 이유는 미확인이다.
- 검사: `scripts/crawler/check.py`에 단언 네 개(Trip 상세 주소, Jalan 상세 주소, Jalan 번지에 두 부분이 들어 있는 경우, Trip 목록 빈 주소). Trip 단언은 수정 전 코드에서 실패했다. 조건을 ‘항상 `streetAddress`’로 바꾼 대조에서는 Jalan 단언이 실패했다. 네 번째 단언은 `5aa8345`의 공급자 무관 조건에서 실패했다.
- 새 수집기 release: `08ca3bfe81af5c33bb8273a59fefa5aa0d7cf9d245c2729d3d474cf71b541bda`(`data/collector-release.generated.json`). `limits`는 그대로다.

## 미확인 사항

- 운영 D1의 Trip 중복 주소 수와 빈 주소 9개의 운영 상세 작업 상태.
- 영어 Trip 상세 원문의 구조는 한국어 fixture와 저장값 15개의 일치로 판단했다. 해당 원문은 보지 않았다.
- 이미 저장된 중복 주소는 Sites 게시 뒤 재수집될 때까지 상세·비교 화면에 두 번 보인다. 화면 정규화는 저장 문자열을 추정으로 나눠야 해서 하지 않았다.

## 이번 세션의 결정

1. 하네스(`jihune/agent-harness`의 `claude/START.md`)를 읽기용으로 붙여 적용했다. 전역 규칙 155줄, 스킬 37개다. 하네스는 수정하지 않았다.
2. 하네스와 충돌한 곳은 유케무리 지침과 요청을 따랐다. `START.md` 4단계의 ‘다음 메시지를 기다린다’는 요청이 작업을 지정해 따르지 않았다. `STATE.md`·요청 원장은 `AGENTS.md`의 ‘기록’이 별도 기록 폴더를 금지하므로 이 인수인계에 기록했다. push는 요청에 따라 했다. Windows 경로·PowerShell·winget 지침은 Linux 클라우드라 적용하지 않았다.
3. 수정 조건은 Trip 관측이면서 두 부분이 모두 `streetAddress`에 있을 때다. 처음에는 공급자를 가리지 않았으나, Jalan 번지에 도로명으로 두 부분이 들어 있으면 주소 앞부분이 빠지는 것을 Codex가 지적해 Trip으로 한정했다.
4. 운영 D1 직접 수정안은 만들지 않았다. 주소만 고치는 보호된 API가 없고, 게시 뒤 상세 재수집이 기존 저장 규칙으로 주소를 바꾼다.

## 검토

`cloud-development.md`의 ‘검토 요청’ 절차를 따른다. CI 통과 뒤 PR 대화창에 Codex 리뷰를 요청한다. 한도 안내가 오거나 15분 안에 반응이 없으면 다시 요청하지 않고 상위 세션에 알린다. 결과는 아래에 적는다.

- 1회째: CI(`checks`)가 `f66e653`에서 통과한 뒤 04:25Z에 Codex 리뷰를 요청했다. Codex가 04:27Z에 P2 1건을 남겼다. 조건이 공급자와 무관해서 Jalan 부분 `東京都`·`府中市`·`府中市東京都道15号1-2`가 `府中市東京都道15号1-2`만 남았다. 직접 재현했고, 단언을 더해 실패를 확인한 뒤 `eef4fc7`에서 Trip으로 한정했다. 검토 요청은 1회 썼다.
- 2회째: `9130ad6`의 CI가 통과한 뒤 04:37Z에 재검토를 요청했다. Codex가 04:38Z에 ‘큰 문제 없음(Didn't find any major issues)’으로 응답했다. P0~P2 지적은 모두 해결됐고 남은 P3는 없다. 검토 요청은 2회 썼다.
- 병합 판단: 마지막 검토(`9130ad6`) 뒤의 변경은 이 인수인계·로드맵·배포 대조표뿐이다. 최신 head의 CI 통과와 충돌 없음을 확인한 뒤 상위 세션에 head 커밋과 근거를 알린다. 병합과 병합 기록은 상위 세션이 맡는다.

병합은 `AGENTS.md`의 ‘상위 세션이 맡긴 작업’ 규칙을 따른다. 조건을 충족하면 상위 세션에 head 커밋과 근거를 알리고 상위 세션이 병합한다.

## Sites 전달

- 이 환경에는 Sites 도구가 없다. 게시하지 않았다.
- 수집기 변경 있음: `scripts/crawler/collect.py`의 주소 조합 한 곳. 새 수집기 release `08ca3bf…`. 실행기는 운영 Site의 `/api/collector-release`를 받으므로 게시 전까지 예약 실행에 반영되지 않는다.
- 앱 화면·Worker API·DB 스키마는 바꾸지 않았다.
- 검사한 커밋은 `eef4fc7`이다. U01·D01 1차·U02 1차·1차 후속·2차·지도 키보드도 아직 게시되지 않았다(`deployments.md`).

## 다음 작업

1. 이 작업: Codex 검토 2회 완료(지적 반영). 상위 세션의 병합.
2. D01 2차: 운영 체크포인트 기준 지역 대조·공급자 간 연결 후보 판정. 감사 스크립트 두 개(`audit-region-labels.mjs`, `audit-trip-addresses.mjs`)가 입력 경로를 받도록 넓히고 Trip 주소도 함께 센다.
3. Shinagawa Prince Hotel(`trip-994895`)의 Trip 상품 범위 확인. 이 기록도 빈 주소라 상세 관측이 먼저 필요하다.
4. Sites 게시 뒤 Trip 상세 재수집으로 중복 주소가 사라졌는지 확인한다.
