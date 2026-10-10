# 최근 작업 인수인계

작업: D01 1차 — 체크인된 자료의 지역 표기 대조, 지역명 코드 오류 수정, 동일 숙소 후보 판정.
기록: 2026-10-10T14:03:40Z / 2026-10-10 23:03:40 KST.
이전 인수인계(U01)는 `history/work-handoff-U01-20261010.md`에 보존했다.

## 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 작업 브랜치: `claude/d01-region-labels`.
- 시작 기준: main `b624d67`(PR #3 병합).
- 작업 PR: [PR #5](https://github.com/jihune/yukemuri/pull/5). 코드 커밋은 `1cb5827`이다.
- [PR #4](https://github.com/jihune/yukemuri/pull/4)(검토 규칙·Codex 검토 절차)가 2026-10-10T14:08Z에 main에 병합됐다(`27bbac5`). 이 브랜치에 main을 merge했다. PR #4의 ‘후속 변경’ 절은 `history/work-handoff-U01-20261010.md`에 옮겼다.
- 운영 D1·Secret·수집 예약·자동 백업·호스팅·공유 범위는 바꾸지 않았다. 이 환경에는 운영 접근 정보가 없다.

## 환경 확인

- Node 24.21.0(`nvm install 24`), pnpm 11.25.0, Python 3.13이다.
- `bash scripts/cloud-setup.sh`는 exit 0이었다. 잠금 파일은 바뀌지 않았다.
- `python3 scripts/cloud-check.py --full`: 기준 커밋에서 16개 명령 통과(13:55:03Z–13:58:06Z). 수정 뒤 17개 명령 통과(13:59:04Z–14:02:04Z). 늘어난 1개는 이번에 목록에 넣은 `check-local-search.mjs`다.
- 변경 파일에 `eslint`를 실행해 오류가 없었다.

## D01 1차 결과

상세는 `D01-20261010.md`, 근거는 `evidence/d01-region-audit-20261010.json`이다.

- 체크인된 1,655개에서 저장된 도도부현과 주소의 도도부현이 다른 기록은 0개였다. 주소가 빈 Trip 9개는 판정하지 못했다.
- 코드 오류: 큐레이션한 홋카이도 숙소 8개의 지역명에서 온천 지역(노보리베츠·조잔케이·유노카와)이 빠졌다. `lib/japan-place-labels.ts`의 온천 패턴 준비 코드가 `\s`를 로마자로 보고, 로마자 주소의 붙은 접미사(`Yunokawacho`)를 단어 경계로 막았기 때문이다. 고친 뒤 1,655개 중 이 8개만 바뀌었다.
- 검사: `check-local-search.mjs`에 단언 네 줄을 추가했다. 각 원인만 되돌린 대조 세 가지에서 각각 실패했다. 이 검사를 공통 검사 목록에 넣었다.
- 새 감사 스크립트: `node scripts/audit-region-labels.mjs [출력.json]`. 도도부현을 일부러 틀리게 바꾼 대조에서 불일치 1개를 보고했다.
- 동일 숙소 연결: 기준을 충족한 새 연결은 0건이다. Shinagawa Prince Hotel(`trip-994895` ↔ `jalan-340595`)은 Trip 주소가 비어 있고 N타워 상품이 따로 있어 미확인으로 남겼다. 같은 주소의 Jalan 11곳은 별도 상품으로 보고 연결하지 않았다.

## 미확인 사항

- 운영 D1의 약 12,000개 기록은 대조하지 않았다. 체크인 자료는 그 일부다.
- 운영 D1 payload의 `location.label`이 이미 화면 지역명으로 덮였는지 확인하지 않았다. 주소로 온천을 찾는 경로는 그와 관계없이 동작한다. 한국어 표기 경로는 표기에 `·`가 없을 때만 쓰인다.
- Trip 주소가 두 번 붙는 원인과 빈 주소의 원인은 수집기 코드에서 확인하지 않았다.
- 화면 변경은 지역명 문자열뿐이다. 실제 브라우저 화면 검사는 하지 않았다.

## 이번 세션의 결정

1. 하네스(`jihune/agent-harness`의 `claude/START.md`)를 읽기용으로 붙여 적용했다. 전역 규칙 155줄, 스킬 38개다. 하네스는 수정하지 않았다.
2. 하네스와 유케무리 지침이 충돌한 곳은 유케무리 지침과 사용자 요청을 따랐다.
   - `START.md` 4단계는 적용 뒤 사용자의 다음 메시지를 기다리라고 한다. 사용자 요청이 같은 메시지에서 다음 단계를 지시했으므로 기다리지 않았다.
   - 하네스는 `STATE.md`·요청 원장 기록을 요구한다. `AGENTS.md`의 ‘기록’은 별도 기록 폴더를 금지한다. 하네스도 프로젝트의 기존 체계를 우선하라고 한다. 이 인수인계와 `roadmap.md`에 기록했다.
   - 하네스는 push를 요청이 있을 때만 하라고 한다. 사용자가 커밋·push·PR을 요청했다.
   - Windows 경로·PowerShell·winget 지침은 Linux 클라우드라 적용하지 않았다.
3. 첫 PR 범위를 체크인 자료와 코드 오류로 제한했다. 운영 자료 대조와 수집기 주소 문제는 다음 작업으로 남겼다.

## Codex 검토

`cloud-development.md`의 ‘Codex 클라우드 환경’ 절차를 따른다. CI 통과 뒤 PR 대화창에 `@codex review`를 남긴다. 리뷰 스레드 답글에는 `@codex`를 쓰지 않는다.

## Sites 전달

- 이 환경에는 Sites 도구가 없다. 게시하지 않았다.
- 앱 변경은 `lib/japan-place-labels.ts` 하나다. 화면·검색의 지역명 문자열만 바뀐다. Worker API·DB 스키마·수집기는 바꾸지 않았다.
- 검사한 커밋은 PR에 적는다. Sites 세션은 `sites-handoff.md`의 ‘전달 요청’에 이 PR과 커밋을 넣고, 운영 Sites의 현재 버전과 먼저 대조한다. U01 CSS 변경(PR #2)도 아직 게시되지 않았다.

## 다음 작업

1. 이 PR의 Codex 검토와 main 병합 결정(사용자).
2. D01 2차: 운영 체크포인트를 새 로컬 DB에 복원한 세션에서 지역 대조와 `audit-catalog.py` 연결 후보 판정.
3. Shinagawa Prince Hotel의 Trip 상품 범위 확인.
4. Trip 주소 중복·빈 주소의 수집기 원인 확인(별도 PR, Sites 게시 필요).
