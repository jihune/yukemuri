# 두 웹 환경에서 이어가기

기록: 2026-10-09. 구독이나 작성 에이전트가 바뀌어도 같은 private 레포를 사용한다.
호스팅·DB·기존 Python 수집기는 현 위치에 둔다.

## 최초 연결

1. 전체 앱 private `jihune/yukemuri`를 선택한다. 기존 실행기는 별도 레포로 유지한다.
2. 사용하는 서비스에서 GitHub 연결을 설정하고 전체 앱 레포에 접근을 허용한다. Work의 연결이 다른 서비스의 연결을 대신하지 않는다.
3. Codex 클라우드 또는 Claude Code 클라우드에서 같은 레포를 선택한다. Node 24와 Python >=3.10을 사용한다.
4. 환경의 설치 단계에서 레포 루트의 `bash scripts/cloud-setup.sh`를 실행한다. 설치 단계에 레포가 없으면 첫 작업에서 같은 명령을 실행한다.
5. 의존성 설치에 필요한 npm 레지스트리 네트워크를 허용한다. 검사에는 운영 Site Secret이나 공급자 사이트 접근이 필요하지 않다.
6. 첫 세션에서 `python3 scripts/cloud-check.py --full`을 실행하고 결과를 기록한다. Work 컨테이너의 검사와 실제 서비스 환경의 첫 검사는 별개다.

설치 스크립트는 Node 자동 설치나 잠금 파일 갱신을 하지 않는다.
pnpm이 다른 버전이면 환경에서 11.25.0을 준비한 뒤 다시 실행한다.
부족한 개발 도구는 Ubuntu 컨테이너 안에 설치한다. 잠금 파일과 제품 의존성은 바꾸지 않는다. 설치한 도구와 버전은 인수인계에 기록한다.
Claude Code 클라우드(Ubuntu 24.04)의 기본 Node는 22.22.0이었다(2026-10-10T11:21:18Z / 20:21:18 KST 기록). `source /opt/nvm/nvm.sh && nvm install 24`로 Node 24를 설치하고 `/opt/nvm/versions/node/<버전>/bin`을 PATH 앞에 둔다.
서비스의 환경 캐시·작업 디렉터리는 첫 세션에서 확인한다.
클라우드 환경 설정 화면은 서비스 변경에 따라 달라질 수 있다.

## 구현과 검토

이 절의 브랜치·인수인계·병합 절차는 작성 담당에게 적용한다. 검토 담당은 `AGENTS.md`의 검토 세션 규칙을 따른다.
main의 기준 커밋을 확인하고 작업 브랜치를 만든다. 서비스의 브랜치 정책을 따른다.
한 에이전트가 구현하고 다른 에이전트는 같은 PR/커밋을 검토한다. 기록 갱신 PR은 `AGENTS.md`의 예외에 따라 검토 없이 병합한다.
현재 분담은 Claude Code 웹이 구현, Codex 웹이 검토다(사용자 결정, 2026-10-10).
검사 실패·충돌을 해결하고 인수인계를 갱신한 뒤 main에 반영한다.
Sites 배포는 `sites-handoff.md`의 별도 절차다.
서비스별 대화는 자동 공유되지 않는다. 결정·검사·중단 지점을 레포에 기록한다.

## Codex 클라우드 환경

기록: 2026-10-10T12:57:03Z / 2026-10-10 21:57:03 KST. 사용자가 전달한 Codex 출력과 화면을 기준으로 했다.

- 환경 `yukemuri`에 세 저장소를 넣었다. 작업의 기본 폴더는 `/workspace`이고 저장소는 `/workspace/<저장소 이름>`에 있다.
- 설치 스크립트는 `cd /workspace/yukemuri && bash scripts/cloud-setup.sh`다. Node 24.19.0·Python 3.12.14·pnpm 11.25.0에서 `cloud-check.py --full`이 통과했다.
- 기본 폴더가 저장소 밖이라 `yukemuri/AGENTS.md`가 자동으로 읽히지 않을 수 있다(미확인). 작업 요청에 이 저장소의 `AGENTS.md`와 인수인계를 읽으라고 적는다.
- 설치 단계에서 `CODEX_HOME`(`/run/codex-environment/codex-home`)에 쓴 파일은 새 작업에 남지 않았다. 환경의 시작 스킬(`start_skill`)도 새 작업에 자동으로 적용되지 않았다. 개인 하네스는 작업마다 첫 메시지로 직접 적용한다.

검토 요청은 두 가지다. 검토 기준은 `AGENTS.md`의 ‘Code Review Rules’다. Codex GitHub 리뷰가 공식 문서에서 권장하는 절 제목이다.

1. PR 리뷰: 검토가 필요한 PR에 작성 담당이 `@codex review` 코멘트를 남긴다. 기록 갱신 PR에는 남기지 않는다. CI가 실행되는 PR은 CI 통과 뒤에 남긴다. 문서만 바꿔 CI가 생략되는 PR은 PR을 연 직후 남긴다. 리뷰는 PR 리뷰 코멘트로 남고 작성 세션이 PR 구독으로 받는다. 지적이 없으면 Codex가 👍 반응만 남긴다.
   재검토는 지적을 모두 반영하고 같은 규칙이 적힌 다른 문서까지 맞춘 뒤 한 번만 요청한다. Codex 리뷰는 사용자의 ChatGPT 구독 사용량을 쓰므로 한 PR에서 세 번까지만 요청한다. 세 번째 리뷰에도 지적이 남으면 더 요청하지 않는다. 남은 지적과 판단을 사용자에게 보고하고, 허락을 받은 뒤에만 다시 요청한다(사용자 결정, 2026-10-10).
   2026-10-10 [PR #4](https://github.com/jihune/yukemuri/pull/4)에서 확인했다. 요청 뒤 약 3분 만에 P2 지적 3건이 리뷰로 달렸다. 이 저장소의 Code review는 이미 켜져 있었다. 코멘트 없이 연 [PR #3](https://github.com/jihune/yukemuri/pull/3)에는 리뷰가 달리지 않았으므로 요청 코멘트를 남긴다. 리뷰 스레드 답글에 `@codex`를 쓰면 리뷰가 아니라 클라우드 작업 요청으로 처리되어 ‘환경을 만들라’는 안내가 달렸다. 답글에는 `@codex`를 쓰지 않는다.
2. 깊은 검토(브라우저 검사 등): 사용자가 Codex 작업을 열어 하네스를 적용한 뒤 검토를 요청한다. 결과를 PR 코멘트로 남기라고 요청에 적는다.

Codex GitHub 리뷰의 확인 사항(기록 2026-10-10T14:43:30Z / 2026-10-10 23:43:30 KST). 사용자가 전달한 ChatGPT·Codex 답변과 그 답변이 인용한 OpenAI 공식 문서를 기준으로 했다. 이 환경에서는 OpenAI 문서 주소가 차단되어 원문을 직접 열지 못했다.

- `@codex review`는 Code Review 기능이다. 사용자의 클라우드 환경 없이 실행된다. 위 `yukemuri` 환경의 설치 스크립트가 리뷰에 적용된다는 근거는 없다.
- `review`가 아닌 `@codex` 코멘트는 Legacy 클라우드 작업을 연다. Legacy 환경이 없으면 실패한다. 이 절차는 `@codex review`만 쓴다.
- 리뷰 모델은 공식 문서끼리 다르다. Business 요금표는 GPT-5.3-Codex, 변경 안내는 자동 선택되는 GPT-5.6 Sol이라고 쓴다. Plus의 모델과 추론 강도는 미확인이다. 웹 작업에서 고른 모델이 리뷰에 적용된다는 근거는 없다.
- 공식 문서는 리뷰가 P0·P1만 보고한다고 설명한다. PR #4에서는 P2가 달렸다. 차이의 원인은 미확인이다.
- 리뷰는 저장소 루트와 변경 파일 위치의 `AGENTS.md`에서 `## Code Review Rules`를 읽는다. 개인 하네스나 `~/.codex` 설정을 읽는다는 근거는 없다. 설정 화면의 ‘리뷰 지침’도 이 저장소의 `AGENTS.md`를 가리킨다.
- 사용량은 Plus 구독의 Codex 사용량 중 ‘Code Review’ 항목으로 집계된다. API 요금이 아니다. 별도 한도와 실패한 `@codex` 작업 요청의 차감 여부는 미확인이다. 사용량은 https://chatgpt.com/codex/cloud/settings/usage 에서 본다. 설정 화면의 ‘검토에 크레딧 사용’ 설명에 따르면 코드 검토에는 요청 한도가 있다. 이 설정이 꺼져 있으므로 한도에 닿은 뒤 크레딧으로 검토를 계속하지 않는다.
- 코드 리뷰 설정은 https://chatgpt.com/settings/code-review 에 있다. 아래는 사용자가 2026-10-10T14:52:06Z / 23:52:06 KST에 전달한 화면이다.
  - 저장소 `jihune/yukemuri` 화면: ‘자동 리뷰’ 스위치가 켜져 있다. 리뷰·트리거·철저한 검토는 ‘개인 설정 따르기’다. 저장소 목록은 ‘자동 코드 리뷰: 개인 설정에 따름’으로 표시한다.
  - 개인 선호 설정: 자동 검토 꺼짐, 검토 트리거 ‘PR이 열릴 때’, 철저한 코드 검토 꺼짐, 검토에 크레딧 사용 꺼짐.
  - 그래서 PR을 열어도 자동 리뷰는 실행되지 않는다고 본다. PR #3·#8의 관측과 맞다. 리뷰는 `@codex review` 요청으로만 받는다.
  - 저장소 화면의 ‘자동 리뷰’ 스위치가 정확히 무엇을 켜는지는 미확인이다. `@codex review`가 동작하는 지금 상태를 바꾸지 않는다.
  - 개인 자동 검토를 켜면 기록 갱신 PR도 리뷰하고 같은 사용량을 쓴다. ‘푸시할 때마다’ 트리거는 push마다 리뷰한다. 철저한 코드 검토는 새 문제가 나오지 않을 때까지 검토를 반복한다.

## 공통 스킬

| 대상 | 경로 |
|---|---|
| 원본 | `skills/yukemuri-maintenance/SKILL.md` |
| Codex 진입점 | `.agents/skills/yukemuri-maintenance/SKILL.md` |
| Claude 진입점 | `.claude/skills/yukemuri-maintenance/SKILL.md` |

진입점은 같은 원본을 읽도록 지시한다. 자동 발견 여부는 실제 서비스 첫 세션에서 확인한다.
발견되지 않으면 원본 경로를 직접 읽도록 요청한다. 배포 권한을 설치했다고 가정하지 않는다.

공식 근거(2026-10-09 확인):
https://learn.chatgpt.com/docs/build-skills,
https://code.claude.com/docs/en/skills,
https://code.claude.com/docs/en/cloud-environments,
https://learn.chatgpt.com/docs/environments/cloud-environment.

## 개발 DB와 화면 검사

`pnpm dev`는 클라우드 컨테이너에서 실행한다. 사용자 PC 이관이 아니다.
portable 모드는 개발용 인증을 모의한다. 운영 인증 검사를 대신하지 않는다.
Worker 검사는 임시 Miniflare DB를 만들고 정리한다.
개발 화면은 체크인된 자료를 사용하며 운영 D1에 직접 연결하지 않는다.
개인 자료와 운영 DB 백업을 에이전트 레포에 추가하지 않는다.

새 클론의 로컬 D1(`.wrangler/state`, Git 제외)에는 테이블이 없다. 그대로 `pnpm dev`를 열면 `no such table: catalog_meta`로 실패한다. `cloud-check.py --full`의 빌드 뒤, 개발 서버를 멈춘 상태에서 마이그레이션을 한 번 적용한다(2026-10-10T11:48:41Z / 20:48:41 KST 기록). 다시 만들려면 `.wrangler/state`를 지운다.

```bash
rc=0; for f in drizzle/*.sql; do node node_modules/wrangler/bin/wrangler.js d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file "$f" || { rc=$?; echo "실패: $f" >&2; break; }; done; [ "$rc" -eq 0 ]
```

U01 DOM 검사(기존 검증 버전 유지):

```bash
npm install --prefix .sites-runtime/u01-dom --no-save --package-lock=false jsdom@26.1.0
node scripts/check-u01-dom.cjs
```

이는 상태·포커스 회귀 검사다. 실제 360/390px·터치·키보드는 `scripts/check-u01-browser.mjs`로 검사한다. 준비와 판정은 `docs/ui-u01-20261010.md`에 있다.
수정 범위에 따라 `scripts/check-*.mjs`와 `docs/ui-u01-20261008.md`의 검사를 추가한다.

## 지속적인 코드·기록·백업 관리

작업마다 관련 지침·결정·검사·다음 작업을 `docs/work-handoff-latest.md`에 기록하고 코드와 같은 PR에 반영한다. 검토 결과는 검토 담당이 PR에 남기고 작성 담당이 인수인계에 반영한다. 대화 원본은 비공개 아카이브에 보존하고 계정 전체 내보내기를 Git에 넣지 않는다. 긴 대화의 서비스 간 자동 이식은 완료됐다고 주장하지 않는다.

운영 D1은 기존 Sites에 있다. `docs/db-backups.md`를 읽는다. Python 실행기가 일일 백업과 복원 검사를 담당하므로 구독이나 코딩 서비스가 바뀌어도 사용자에게 매번 ZIP 보관을 요구하지 않는다. 스키마 변경 시 실행기의 복원 스키마도 함께 갱신한다.

대용량 공개 seed·이미지·검사 fixture·원래 Git bundle은 `source-assets/`에 해시와 gzip/base64 조각으로 보존한다. `bash scripts/cloud-setup.sh`가 원래 경로와 바이트를 복원한다. 이것은 전송 중단 후 재개를 위한 소스 저장 형식이며 개인 대화·DB 백업이 아니다. 복원된 자료를 수정하면 `python3 scripts/materialize-source-assets.py --pack` 후 `source-assets/` 변경도 같은 PR에 포함한다. 원래 Git 이력만 필요하면 의존성 설치 없이 `python3 scripts/materialize-source-assets.py`를 실행한다.
