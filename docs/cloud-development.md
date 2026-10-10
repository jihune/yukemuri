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
Claude Code 클라우드(Ubuntu 24.04)의 기본 Node는 22.22.0이었다(2026-10-10 확인). `source /opt/nvm/nvm.sh && nvm install 24`로 Node 24를 설치하고 `/opt/nvm/versions/node/<버전>/bin`을 PATH 앞에 둔다.
서비스의 환경 캐시·작업 디렉터리는 첫 세션에서 확인한다.
클라우드 환경 설정 화면은 서비스 변경에 따라 달라질 수 있다.

## 구현과 검토

main의 기준 커밋을 확인하고 작업 브랜치를 만든다. 서비스의 브랜치 정책을 따른다.
한 에이전트가 구현하고 다른 에이전트는 같은 PR/커밋을 검토한다.
현재 분담은 Claude Code 웹이 구현, Codex 웹이 검토다(사용자 결정, 2026-10-10). 검토 담당은 PR 브랜치에 커밋하지 않는다.
검사 실패·충돌을 해결하고 인수인계를 갱신한 뒤 main에 반영한다.
Sites 배포는 `sites-handoff.md`의 별도 절차다.
서비스별 대화는 자동 공유되지 않는다. 결정·검사·중단 지점을 레포에 기록한다.

## Codex 클라우드 환경

기록: 2026-10-10. 사용자가 전달한 Codex 출력과 화면을 기준으로 했다.

- 환경 `yukemuri`에 세 저장소를 넣었다. 작업의 기본 폴더는 `/workspace`이고 저장소는 `/workspace/<저장소 이름>`에 있다.
- 설치 스크립트는 `cd /workspace/yukemuri && bash scripts/cloud-setup.sh`다. Node 24.19.0·Python 3.12.14·pnpm 11.25.0에서 `cloud-check.py --full`이 통과했다.
- 기본 폴더가 저장소 밖이라 `yukemuri/AGENTS.md`가 자동으로 읽히지 않을 수 있다(미확인). 작업 요청에 이 저장소의 `AGENTS.md`와 인수인계를 읽으라고 적는다.
- 설치 단계에서 `CODEX_HOME`(`/run/codex-environment/codex-home`)에 쓴 파일은 새 작업에 남지 않았다. 환경의 시작 스킬(`start_skill`)도 새 작업에 자동으로 적용되지 않았다. 개인 하네스는 작업마다 첫 메시지로 직접 적용한다.

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

새 클론의 로컬 D1(`.wrangler/state`, Git 제외)에는 테이블이 없다. 그대로 `pnpm dev`를 열면 `no such table: catalog_meta`로 실패한다. `cloud-check.py --full`의 빌드 뒤, 개발 서버를 멈춘 상태에서 마이그레이션을 한 번 적용한다(2026-10-10 확인). 다시 만들려면 `.wrangler/state`를 지운다.

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

작업마다 관련 지침·결정·검사·다음 작업을 `docs/work-handoff-latest.md`에 기록하고 코드와 같은 PR에 반영한다. 대화 원본은 비공개 아카이브에 보존하고 계정 전체 내보내기를 Git에 넣지 않는다. 긴 대화의 서비스 간 자동 이식은 완료됐다고 주장하지 않는다.

운영 D1은 기존 Sites에 있다. `docs/db-backups.md`를 읽는다. Python 실행기가 일일 백업과 복원 검사를 담당하므로 구독이나 코딩 서비스가 바뀌어도 사용자에게 매번 ZIP 보관을 요구하지 않는다. 스키마 변경 시 실행기의 복원 스키마도 함께 갱신한다.

대용량 공개 seed·이미지·검사 fixture·원래 Git bundle은 `source-assets/`에 해시와 gzip/base64 조각으로 보존한다. `bash scripts/cloud-setup.sh`가 원래 경로와 바이트를 복원한다. 이것은 전송 중단 후 재개를 위한 소스 저장 형식이며 개인 대화·DB 백업이 아니다. 복원된 자료를 수정하면 `python3 scripts/materialize-source-assets.py --pack` 후 `source-assets/` 변경도 같은 PR에 포함한다. 원래 Git 이력만 필요하면 의존성 설치 없이 `python3 scripts/materialize-source-assets.py`를 실행한다.
