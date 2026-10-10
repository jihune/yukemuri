# 최근 작업 인수인계

작업: 전체 앱 private GitHub 레포 이관과 ChatGPT 프로젝트 대화/자료 보존.
기록: 2026-10-10T09:38:05.543499+00:00 UTC. 이전 준비 기록은 `history/work-handoff-migration-20261009.md`에 보존했다.

## 현재 기준

- 앱 레포: https://github.com/jihune/yukemuri (private). 사용자가 생성·접근을 허용했다.
- 시작 소스: Sites v49 `608a38042df8d101d28ae480debfdddc5f3de7dc`. 이관 준비 이력의 마지막은 `700b43fe26dc2bfbf87f826c2876bd9fb894a83f`다.
- 운영: 기존 Sites ID `appgprj_6abf95be6ea0819181cc3e93535413ac`, https://yukemuri.jihun7891.chatgpt.site . v49·public을 재확인했다. 이 GitHub 이관본을 Sites에 게시하지 않는다.
- 실행기: 기존 private `jihune/yukemuri-script-runner`. 기존 수집과 추가 DB 백업을 유지한다.

## 보존과 변경

계정 내보내기를 실제 받았다. 118개 대화에서 프로젝트 6개·1,723 mapping 노드·모든 분기의 JSON·읽기 보조본·첨부 19개·프로젝트 Library 자료와 Sites export 파일 109개를 비공개 보존했다. ZIP에서 빠진 과거 실행기 ZIP은 Library 원본에서 추가 확보했다. 이전 가이드의 옛 첨부 버전 1개는 실제 바이트가 없으며 현재 버전과 원래 참조를 보존했다.

원래 Sites bundle 51커밋을 검증했다. 계정 내보내기의 D1 SQL 16개 테이블을 새 임시 SQLite에 복원하고 integrity_check=ok를 확인했다. Secret 값은 내보내기 서비스가 가렸다. 운영 DB는 변경하지 않았다.

분할 대화 파일·native file ID·Library 참조·공유 첨부를 지원하도록 가져오기 도구를 보완했고 정상/거절 경로를 검사했다. 계정 ZIP·대화 원본·운영 DB는 Git에 넣지 않는다. 개발 공통 지침·원래 Git 이력 bundle·첨부 지침·대화에서 확정한 결정과 작업 기록을 이 레포에 넣는다. 자세한 범위와 한계는 `conversation-handoff.md`·`legacy-history.md`·`evidence/chat-export-20261010.json`에 있다.

내보내기 요청 시점 이후의 이 이관 세션 원본은 계정 ZIP에 없다. 이후 지시와 완료 근거를 별도 작업 기록으로 보존한다. 원본에 없는 Work 도구 실행 전체를 재구성했다고 주장하지 않는다.

## 검사와 운영

가져오기 도구의 shards/legacy 형식·모든 분기·공유 첨부 재사용·아이콘 제외·안전한 ZIP 파일명·잘못된 ID·덮어쓰기·추적 레포 출력 거절 검사를 통과했다. 준비본과 GitHub의 tree 해시 `87f1dea9e6aa45aa2bfcea8beb55fa0e737c40ac`가 같았다. 별도 깨끗한 클론에서 공개 소스 자료 15개를 원래 바이트로 복원했고 추적 파일 변경이 없었다. pnpm lock은 직접 추적한다. 기존 앱 빌드 입력의 바이트는 바꾸지 않았다.

[가져오기 PR #1](https://github.com/jihune/yukemuri/pull/1)을 병합했다. 가져오기 커밋 `278b1a2cbb1f1d21ba8a57ec19929a3b069c4ce2`, 병합 커밋 `f33db7465fe6b68358316a0c6b2fac5843d473af`다. [PR 전체 CI 38041633399](https://github.com/jihune/yukemuri/actions/runs/38041633399)와 push 전체 CI 38041602946은 새 클라우드 환경에서 설치·복원·타입·기존 앱/Worker 회귀 검사를 통과했다. 병합 후 [main 전체 CI 38041854782](https://github.com/jihune/yukemuri/actions/runs/38041854782)도 성공했다. 이후 완료 기록 변경은 문서뿐이다. 개인 Codex/Claude 웹 계정의 첫 세션 검사와는 구분한다. 근거는 `evidence/github-app-import-20261010.json`에 있다.

자동 DB 백업의 실제 예약 run [38003762428](https://github.com/jihune/yukemuri-script-runner/actions/runs/38003762428)은 성공했다. private artifact `11650770196`, 5,409,965바이트가 만료되지 않은 상태임을 확인했다. 매일 04:23 KST 예약은 지연될 수 있다. 일일 14일·주간 90일 보관이다. `db-backups.md`를 따른다.

호스팅·사이트 공개 범위·운영 DB·Secret 값·기존 수집 주기/상한·Google API·LLM 예약은 변경하지 않는다.

## 다음 작업

1. 사용하는 Codex/Claude 웹 서비스에서 이 레포 연결을 허용하고 Node 24·Python 3.10 이상에서 `scripts/cloud-setup.sh`와 `scripts/cloud-check.py --full`을 실제 실행한다. 해당 계정 연결·스킬 발견은 별도 확인이다. 이관을 다시 하거나 ZIP을 소스 대신 사용하지 않는다.
2. 다음 제품 작업은 U01 실제 360/390px 모바일·터치·키보드 검사다. 이후 D01 → D02 → U02 순서다. 호스팅 이전은 후속 결정이다.
