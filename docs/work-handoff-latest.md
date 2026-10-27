# 최근 작업 인수인계

이 문서는 지금 상태만 담는다. 세션은 시작할 때 이 문서를 읽으므로 짧게 유지한다(목표 16 KB 안팎). 옛 판은 `docs/history/work-handoff-<시각>.md`에 바꾸지 않고 옮겼고, 파일 이름의 시각까지의 기록이 그 파일의 「상위 세션 인계」 7(인계 결과)과 8(기록)에 있다. 가장 최근 것은 `docs/history/work-handoff-20261027T0537Z.md`(10-27T05:37Z까지, 줄이기 전의 전체 판)이고, 그 파일 첫 문단이 더 앞 판들(`20261027T0520Z`, `20261026T2157Z`, `20261026T1729Z`, `20261026T1345Z`, `20261026T1246Z`, `20261020T0812Z` 등)을 차례로 가리킨다. 아래에서 ‘옮긴 파일’은 2026-10-19T13:52Z까지의 전체 인계 `docs/history/work-handoff-20261019T1352Z.md`를 가리킨다.

끝난 일은 이 문서에서 줄이고 `roadmap.md`·`deployments.md`·작업 문서(`docs/<작업ID>-<날짜>.md`)에 남긴다. 이 문서가 다시 커지면 같은 방법으로 `docs/history/`에 옮긴다.

## 상위 세션 인계

열여섯 번째 상위 세션 `session_01Up3F23SSA9RsdSFsjsFQbE`(10-27T05:20:18Z 시작, 열다섯 번째가 `create_session`으로 엶, 계보 깊이 2/8, 하네스 `518c726`, 기록 브랜치 `claude/yukemuri-parent-16`)가 10-27T05:2xZ에 이어받았다. 열다섯 번째 `session_016cXkfBhXcZhHyyqPswYqAF`는 하네스 setup 42(`f8411ae`)가 전역 룰 본문을 바꿔 인계했다. 열여섯 번째는 아래 1의 결과를 7에 적었고, 10-27T05:4xZ 사용자 결정(아래 2의 ‘기록 파일 줄이기’)으로 이 문서를 다시 썼다(줄이기 전 판은 위 `20261027T0537Z`). 이 절의 사실은 적은 시각에 맞았다. 이어받는 세션은 아래 3의 확인 명령으로 다시 본다.

### 1. 다음 상위 세션이 이어받을 때 할 일

인계 방법: 지금 상위 세션의 계보 깊이(`get_session`의 `lineage`)가 한도에서 두 단계 안이 아니면, 지금 상위 세션이 다음 상위 세션을 `create_session`(그때의 상위 모델, `source_url`과 `outcome_branch` `claude/yukemuri-parent-<번호>`를 함께)으로 열고 ‘main의 docs/work-handoff-latest.md 「상위 세션 인계」를 열어 요약하지 말고 1의 순서대로 실행한 뒤 4를 이어 하라’는 한 줄만 보낸다. 두 단계 안이면 사용자가 웹에서 같은 한 줄로 연다(환경 `Default`, 저장소 `jihune/yukemuri`·`jihune/yukemuri-script-runner`·`jihune/agent-harness`). 안내와 다시 알리기는 아래 2의 ‘다음 상위 세션 안내’를 따른다. 사용자가 연 세션은 계보가 새로 시작한다(10-26 열네 번째가 깊이 0). 지금은 깊이 2/8이라 다음 인계도 상위 세션이 연다. 옛 상위 세션은 그 뒤 새 일을 하지 않고 자기 기록 브랜치에 push하지 않으며, 받은 메시지를 새 상위 세션에 넘긴다. 보관하지 않는다. 사용자가 웹에서 여는 경우에는 새 상위 세션이 이어받았다고 알릴 때까지 옛 상위 세션이 일을 이어 가고, 그 사이 바뀐 것은 기록 PR로 main에 넣는다.

이어받는 세션은 하네스 규칙(인계를 받은 세션의 누락 점검)대로 이 인계에 빠진 것이 없는지 스스로 점검한다. 옛 상위 세션의 사용자 메시지를 하위 에이전트가 `list_events(session_id=<옛 상위 세션>, kinds=["user"], limit=100)`로 첫 쪽부터 `before_id`로 거슬러, 그 뒤 첫 쪽의 `last_id`부터 `after_id`로 앞으로 읽게 하고, 하네스 `session-handoff`의 `scripts/user_messages.py extract <하위 에이전트 기록>`으로 사람이 입력한 것만 뽑아 아래 2·4와 대조한다. 쪽이 커서 파일로 저장되면 그 하위 에이전트에게 커서 세 값(`first_id`·`last_id`·`has_more`)만 뽑는 python 한 줄을 허락한다(10-27 열여섯 번째). 사용자의 작업이나 결정이 필요하면 사용자에게 묻는다(사용자 10-17T17:0xZ: ‘인계시 새 세션에서 작업한다면 인계한거 빠진거 없는지는 규칙에 따라 자동으로 검토하면 될거다. 사용자 작업이나 결정 필요사항 있다면 새 세션에서 역질문 하던가 답변해주면 된다.’).

1. 하네스를 확인한다. `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"`의 판을 아래 7에 적는다. 열여섯 번째는 `518c726 2026-10-27`이었다. 다음 상위 세션은 `24a9371`(setup 44, 10-27T10:38Z 하네스 관리 세션 알림)이거나 그 뒤 판이어야 한다(하네스 클론에서 `git merge-base --is-ancestor 24a9371 <설치된 판>`, 클론이 얕으면 먼저 `git fetch --unshallow origin main`). 하네스 저장소를 붙이지 못하면 설치된 `CLAUDE.md`에 setup 42의 두 줄(‘workspace check in 14 days’, ‘Mark each proposal recommended’)이 있는지 `grep`으로 보고, 조상 확인은 못 했다고 적는다. 하네스 관리 세션이 일과 관련 있는 하네스 변경을 알리면 묻지 않고 스스로 정한다. 룰 본문이 바뀌면 일의 경계에서 새 상위 세션에 인계하고, 스킬 몇 줄이면 이 문서와 그 줄에 걸린 예약 prompt에 옮겨 적고 다음 setup이나 다음 날까지 미뤄도 된다(`cloud-session-ops` §8). 인계할 때 교훈은 묻지 않고 제목이 「하네스 관리 세션」으로 시작하는 세션에 경로로 보낸다. 지금 이 일에 걸린 하네스 줄은 이렇다.
   - setup 42: 세션을 시작할 때 기록에 14일 안의 작업 폴더 점검 줄이 없으면 `context-engineering`의 `references/workspace-check.md` 점검을 하고 정리는 제안만 한다(이 프로젝트의 기록은 이 문서와 `roadmap.md`이고 두 번째 기록 묶음을 만들지 않는다, 마지막 점검은 아래 8의 10-27T05:33Z). 사용자 몫 목록의 제안마다 권하는지와 그 까닭을 적는다(사용자 10-27).
   - setup 44(`24a9371`, 열여섯 번째는 설치본을 읽지 못해 알림의 목록으로 적음): `pr-review-loop` 「Tier 2」 아래에, 이 PR이 만든 결함(회귀나 틀린 결과, 문체·이름·이 PR 전부터 있던 것은 아님)인 P2는 PR이 어차피 하는 다음 push에서 고치고 P2 때문에 회차를 새로 열지는 않는다는 줄이 들어갔다. 앱 `AGENTS.md` 병합 조건과 `docs/cloud-development.md` ‘Codex 클라우드 환경’ 1의 ‘P2는 그 PR에서 고치지 않고 다음 작업에 적는다’와 부딪혀 사용자에게 물었고, 사용자가 10-27T10:5xZ ‘권장대로 고침’으로 답했다(아래 2의 검토와 병합 줄). 두 저장소 문서는 문서 PR로 고친다.
   - setup 43(열여섯 번째는 설치본을 읽지 못해 알림의 목록으로 적음, 다음 세션은 설치본으로 확인): 세션의 클론은 얕으니 `merge-base --is-ancestor`나 `git cherry` 전에 `git fetch --unshallow origin main`(`cloud-session-ops` §1). 기록 줄은 모아 다음 기록 PR에 싣거나 작업 브랜치에 push하고, 다음 세션이 main에서 읽어야 하는 것만 따로 낸다(`pr-review-loop` 「Tier 0, no review」, 아래 5의 열다섯 번째 교훈과 같음). 하위 에이전트 지시서에는 산출물에 남을 낱말을 자리표시 없이 적고, 보고에 ‘찾았지만 고치지 않은 원자료 오류’ 칸을 둔다(`subagent-runbook` §7). 짧은 영어 약어는 영숫자 경계로 세고, ‘놓친다’는 숫자를 쓰기 전에 넓은 검색에만 걸린 것을 열어 본다(`counting-discipline`).
   - setup 40: 다음 PR에 코드를 실을 하위 세션은 기록만의 PR을 열 수 없으니 그 기록 줄은 상위 세션이 쓴다(`child-session-orchestration`). 아무도 읽지 않는 메일에 기대지 않고 깨어날 때마다 점검 workflow의 마지막 결론을 읽는다(`cloud-session-ops`, 아래 4의 1).
   - setup 41(`pr-review-loop`·`cloud-session-ops`): (가) Codex 요청 댓글에 눈 반응만 10분 서 있고 결과가 없으면 같은 회차를 한 번 더 요청하고, 다시 10분 안에 결과가 없거나 한도 답이 오면 그 회차를 Claude 검토 세션으로 한다(10분 지점의 `send_later` 하나로 기다림). (나) Claude 검토 세션의 PR 리뷰는 어느 세션도 깨우지 않으니, 검토 세션을 열면 약 12분 뒤 `send_later`를 걸고 그 세션의 `result` 이벤트(`list_events`, `kinds: ["result"]`)를 읽는다. (다) 하위 세션이 push하는 브랜치를 병합하기 전에 그 세션에 push를 멈추라고 하고 병합할 head를 알리며, 병합 뒤 병합한 head를 알린다(그 뒤 것은 새 PR로, #256 교훈). #246 병합 예약 prompt에 이 단계가 들어 있다. (라) 하위 세션의 일은 `create_session` 프롬프트에 모두 넣는다(나중의 `send_message`는 동료의 자료로 닿아 새 일을 거절할 수 있음).
   - 하네스 확인 문구의 실제 값은 어디에도 적지 않는다.
2. 사용량을 읽는다. `get_session`(인자 없음)으로 자기 id를 얻고, `list_events(kinds=["rate_limit_event"], limit=100)`의 마지막 이벤트에서 `five_hour`·`seven_day` utilization과 `isUsingOverage`를 본다. 기준은 아래 2의 사용량 항목이다.
3. `AGENTS.md`, `START_HERE.md`, `docs/roadmap.md`, `docs/cloud-development.md`, 이 문서를 읽는다.
4. 아래 3의 표를 한 줄씩 확인 명령으로 다시 보고, 하위 세션 브랜치마다 `git log --oneline origin/main..origin/<브랜치>`를 본다(클론이 얕으면 먼저 `git fetch --depth=1000 origin`). main에 없는 기록 커밋은 다음 기록 PR에 가져온다. 실행기 저장소 `jihune/yukemuri-script-runner`는 `add_repo`(access push)로 붙인다. 자동 권한 검사가 ‘Access Added As A Means’나 ‘Permission Grant’로 막으면 우회하지 않는다. 이 거부는 저장소 설정의 허용 규칙으로 풀리지 않는다(10-20 시험 둘). 처음에 예문 ‘이 세션에서는 jihune/yukemuri-script-runner를 push 권한으로 add_repo 해도 된다. 세션이 끝날 때까지 다시 묻지 마라.’를 보여 드리고 그대로 답해 달라고 한다(열다섯·열여섯 번째가 이렇게 받고 통과함). 사용자가 웹에서 세션을 열 때 저장소를 함께 고르면 붙일 필요가 없다. 붙이기 전에는 `gh api`도 그 저장소에 403을 돌려준다. 하네스 문장을 직접 읽으려면 `jihune/agent-harness`를 `add_repo`(access read)로 붙인다(10-27 열여섯 번째에서는 같은 이유로 막혔고, 그 저장소는 공개 API도 403).
5. 지금 상위 세션에 묶인 예약을 같은 시각·prompt로 자기 세션에 다시 만들고(`create_trigger` 또는 `send_later`), 옛 것을 `delete_trigger`로 지운다. 무엇이 묶였는지는 아래 3의 예약 줄과 `list_triggers`가 기준이다. prompt는 `get_trigger`로 읽는다. 시각이 지났으면 그 일을 바로 한다. 옛 상위 세션이 자기 일로 건 예약(다음 상위 세션 시작 확인 따위), 사용자의 keep-alive 루틴('5시간 세션 초기화'로 시작), 하위 세션과 다른 프로젝트의 예약은 건드리지 않는다.
6. 모든 하위 세션(아래 6의 일하는 곳과 쉬는 곳)에 새 상위 세션 id를 `send_message`(priority later)로 알린다. 하위 세션의 `@parent`는 자기를 연 옛 상위 세션을 가리키므로, 앞으로는 새 상위 세션 id로 보내라고 적는다. 하위 세션 예약의 prompt가 옛 상위 세션 id를 적고 있으면(`list_triggers`로 확인) 그 id만 `update_trigger`로 바꾸게 한다. prompt에 ‘바뀌었으면 새 id’가 이미 있으면 그대로 둬도 된다(10-27 C04). 옛 상위 세션에도 알리고, 그 세션은 보관하지 않는다. 하네스가 새 판이면 그 판의 줄 가운데 하위 세션의 일에 걸린 것만 이 알림에 붙여 전한다(setup 42에는 없었다).
7. 결과(돌린 명령과 실제 출력)를 이 문서 아래 7에 적어 기록 PR로 넣고, 사용자에게 한국어로 짧게 보고한다.

### 2. 지금도 따르는 사용자 지시

10-27T05:4xZ에 다시 줄였다. 줄이기 전 이 절의 원문은 `docs/history/work-handoff-20261027T0537Z.md` 「상위 세션 인계」 2에, 그 앞 판은 `docs/history/work-handoff-20261020T0812Z.md` 「상위 세션 인계」 2에, 지시가 나온 경위와 원문 전체는 `roadmap.md` 결정 기록과 `docs/history/work-handoff-20261018.md`·`docs/history/work-handoff-20261017.md`의 「상위 세션 인계」 2에 있다. 끝나 더 할 일이 없는 줄(열한·열두·열세 번째 상위 세션 마무리, 클라우드 환경 Environment variables의 API 키 건)은 그 `20261027T0537Z` 파일에만 남겼다. 괄호 안은 사용자가 정한 시각(UTC)이다.

일하는 방식:

- 기존 기록 체계를 유지한다. 새 기록 체계(`agents_work/`, `STATE.md`)를 만들지 않는다. 인계 문서는 지금 상태만 남기고 옛 내용은 `docs/history/`로 옮긴다(10-17T16:0xZ).
- 상위 세션의 기록 브랜치는 그 세션에 붙은 개발 브랜치를 쓰고, 바꿀지는 상위 세션이 정한다(10-18T23:5xZ). `create_session`으로 열 때는 `outcome_branch`로 `claude/yukemuri-parent-<번호>`를 준다.
- pnpm 11.25.0과 잠금 파일을 유지한다. 개발 검사는 임시 DB와 fixture로 하고, 운영 DB를 개발 환경에 직접 연결하지 않는다. GitHub 병합과 실제 운영 배포를 나눠 적는다.
- 운영 확인은 공개 GET만 한다. 유지관리 키와 즐겨찾기를 쓰지 않는다. 무료 요금제만 쓴다.
- 비밀값은 채팅·PR·로그에 쓰지 않는다. 사용자는 설정을 마치면 '완료'만 알린다. 공개 저장소라 비밀·개인정보·대화 원문·DB 백업을 커밋하지 않는다. 하네스 확인 문구의 실제 값은 어떤 문서·커밋·기록에도 복사하지 않는다.
- 검토와 병합(10-26T13:3xZ 사용자 결정, 하네스 `pr-review-loop` §2의 D-050을 앱·실행기 저장소에 적용, 원문은 선택 답 ‘하네스 규칙으로 바꿈(권장)’): 변경의 위험 등급(0 기록은 검토 없음, 1 문서·작은 코드는 1회, 2 코드·스크립트·workflow는 최대 3회, 3 인증·비밀값·데이터 삭제·결제·마이그레이션은 2에 병합 전 사용자 확인)으로 정한다. 등급과 병합 조건의 문장은 앱 `AGENTS.md` ‘작업 시작과 공동 작업’과 `docs/cloud-development.md` ‘Codex 클라우드 환경’(#251), 실행기 `AGENTS.md`(실행기 #17)가 기준이다. 상위 세션 몫: 등급 2·3의 1회차는 Codex 요청과 상위 세션이 여는 Claude 검토 세션을 같은 head에 두고, 검토 지시에는 세 줄(정확성·요구사항에 걸린 P0~P1만 막음, 지적마다 파일과 줄, 사소한 지적은 다섯 개까지)을 넣는다. P2 이하는 병합을 막지 않고 회차를 열지 않는다. 그 PR이 만든 결함(회귀나 틀린 결과)인 P2는 PR이 어차피 하는 다음 push에서 고치고, 그 밖의 P2·P3와 다음 push가 없는 P2는 다음 일로 적는다(10-27T10:5xZ 사용자 결정 ‘권장대로 고침’, 하네스 setup 44, `roadmap.md` 결정 기록 ‘그 PR이 만든 P2는 다음 push에서 고침’). Codex를 부르는 @ 표기는 검토 요청 댓글에만 쓰고, 병합은 40자 SHA로 한다. 옛 문장 원문은 `docs/history/work-handoff-20261026T1246Z.md` 「상위 세션 인계」 2에 있다.
- 등급 3의 병합 전 사용자 확인은 O04 PR B(실행기 #16)에 한해 상위 세션 판단으로 갈음했다(10-26T14:0xZ, 원문 ‘검토가 끝나면 병합해도 되는지는 너가 결정하면 된다.’). 다른 등급 3 PR은 지금처럼 사용자에게 묻는다(상위 세션의 해석, 사용자가 넓히면 고침).
- 하위 세션: PR은 상위 세션이 병합하고 병합 기록을 쓴다. 상위 세션은 하위 세션의 PR을 구독하지 않는다(구독하면 하위 세션이 CI·검토 알림을 못 받는다). 하위 세션은 PR을 열자마자 구독하고, PR을 열 때와 병합 준비가 됐을 때 상위 세션에 알린다. 다른 세션의 브랜치에 push하지 않는다. 병합 뒤 작업 브랜치는 최신 main에서 다시 시작한다. 공유 기록 파일의 절마다 누가 쓰는지 brief에 적는다(인계 문서는 상위 세션이 쓰고 하위 세션은 자기 작업 문서만 쓴다).
- 사용량 기준은 5시간 창 0.9, 7일 창 0.95다. 그 아래에서는 사용량을 이유로 일을 줄이지 않는다(10-13 ‘너무 보수적으로 작업하려고 하지는 마라. 사용량 낭비하지 말것’).
- 기준에 닿으면 잠깐 멈춘다(10-15T08:5xZ). 하던 단계만 커밋·push하고(끝나지 않은 수정은 'WIP:' 커밋), PR 구독을 풀고, CI·Codex·세션 메시지에 자동으로 답하지 않는다. 기준을 넘은 창 가운데 가장 늦은 `resetsAt`의 10분 뒤 재개 예약 하나만 남긴다. 재개 전에 사용자가 아닌 것이 깨우면 기록만 하고 턴을 끝낸다. 상위 세션은 일이 끝나지 않은 하위 세션 모두에 알리고 하위 세션 brief에도 이 규칙을 적는다. 한도에 닿았는지는 `rate_limit_info.status`가 `rejected`인지로 본다. 7일 창이 기준에 닿으면 사용자에게도 알린다.
- 사용량이 적으면 하위 세션을 포함한 일을 예약으로 미룬다(10-17T16:5xZ). 요금제를 바꿔 사용량이 초기화되면 미뤄 둔 일을 다시 시작하고, 초기화의 까닭은 따지지 않는다(10-18T00:52Z).
- 세션 보관: 한 가지 일로 연 세션(일회성 PR, 검토, 시험)은 결과를 기록한 뒤 보관한다. 후속 일이 남은 하위 세션과 상위 세션은 보관하지 않는다. 다른 프로젝트의 세션은 보관하지도, 보관할지 묻지도 않는다(10-13).
- 모델: 관리·계획·검토 세션은 그때의 상위 모델, 단순 검색·작업은 하위 모델을 쓴다. 모델 이름은 규칙에 고정하지 않는다(10-13).
- 답변과 하위 세션 메시지는 한국어로 쓰고 한자를 출력하지 않는다.
- 하네스 관리 세션의 변경 알림은 원장이나 기록 파일에 적지 않는다. 다음 인계에 쓸 하네스 판과 하네스 관리 세션 id만 고치고, 하위 세션에는 그 일에 걸린 줄만 다음 메시지에 낮은 우선순위로 전한다.
- 실행기 저장소에도 이 규칙(하네스, Codex 검토)을 적용한다(10-18T02:25Z). 일에 필요한 저장소는 묻지 않고 세션에 붙인다(10-20T09:0xZ 원문 ‘안물어봐도 되면 가급적 앞으로 물어보지 말고 알아서 필요한거 붙여라(하네스쪽에도 교훈으로 보내, 만약 안물어봐도 된다고 여기서 확인 했다면)’). 자동 권한 검사가 막으면 그때만 묻는다.
- 실행기 저장소 상시 승인(10-26T13:2xZ 처음): 원문 ‘이 세션에서는 jihune/yukemuri-script-runner를 push 권한으로 add_repo 해도 된다. 세션이 끝날 때까지 다시 묻지 마라.’ 자동 권한 검사가 막으면 그 세션에서 같은 문장을 받는다(위 1의 4). 사용자는 ‘승인 문장은 그쪽 세션에서 요구하면 보내겠다’고 했다(10-26T13:40Z). 열여섯 번째는 10-27T05:3xZ에 받고 05:35Z에 통과했다.
- 기록 파일만 바꾼 PR은 검토 없이 병합하고 기록 브랜치를 main에 맞춘다. 자동 권한 검사가 이것을 ‘검토 없는 병합’으로 막아 물었을 때 사용자가 상위 세션 권장대로 하라고 답했다(10-20T09:0xZ ‘이것도 마찬가지 너의 권장대로 하겠다.’).
- 기록 파일 줄이기(10-27T05:3xZ, 사용자): 열여섯 번째가 작업 폴더 점검(하네스 setup 42)으로 이 문서와 `roadmap.md`가 목표 크기를 넘는다고 보고하고 줄이기를 권했다. 원문 ‘기록 파일 줄이기 제안은 권한다면 하도록 하겠다. 알아서 진행’. 기록 체계는 그대로 두고, 줄이기 전 판을 `docs/history/`에 바꾸지 않고 옮긴 뒤 지금 상태와 지금도 따르는 것만 남긴다.
- 이상이나 공백은 알리기만 하지 않고 원인을 먼저 분석해 함께 보고한다(10-18T11:2xZ). 저장소와 로그만으로 모자라면 웹 검색 같은 바깥 자료로 더 조사하고, 출처와 읽은 날짜를 함께 적는다(10-20T04:3xZ).
- 중복 실행·중복 처리를 막는 장치처럼 완성도를 높이고 오류를 줄이며 최적화가 되는 일은 그대로 두자고 권하지 말고 넣는다(10-21T07:3xZ, 원문은 roadmap 결정 기록 ‘C06 겹침 막기·남은 후보·바깥 예약기’).
- 상위 세션의 정기 안전망 확인은 열린 PR이 있고 그 알림을 놓칠 수 있을 때만 둔다. 일하는 하위 세션이 자기 예약으로 결과를 알려 오면 두지 않고, 남는 사용량은 다른 일에 쓴다(10-19T11:3xZ).
- 다음 상위 세션 안내(10-26T14:0xZ, 사용자): 원문 ‘다음 상위 세션 열 필요 있을때 안내 및 내가 놓쳐도 remind 잊지말고 계속해주길 바람.’ 사용자가 웹에서 열어야 할 때(위 1) 상위 세션은 인계 문서를 main에 넣고, 사용자에게 여는 방법(환경 `Default`, 저장소 셋, 첫 메시지 한 줄)을 알린다. 사용자가 새 상위 세션을 열 때까지 모든 답의 ‘사용자께 남은 일’ 맨 위에 다시 적는다. 사용자가 답하지 않고 자리를 비운 것으로 보이면 `send_later`로 이 세션을 깨워 다시 알린다(처음은 약 1시간 뒤, 그 뒤 약 4시간마다, 휴대폰 알림 도구 `PushNotification`이 있으면 그것으로도). 새 상위 세션이 생겼는지는 `list_sessions`로 확인하고, 생기면 알림을 멈춘다. 상위 세션이 `create_session`으로 열 수 있을 때는 열고 나서 사용자에게 한 줄로 알린다(열네 번째의 해석).

제품과 작업의 결정(내용은 `roadmap.md` 결정 기록의 같은 이름 행이 기준이다):

- ‘숙소 이름·설명 표시’(10-17T16:5xZ): 이름은 한국어 → 영어 → 원어, LLM 번역은 쓰지 않는다. ‘Google 평점·사진’(10-17T17:0xZ): 구글 결제를 하지 않으므로 Places API를 쓰지 않는다.
- ‘Jalan 한국어·영어 이름 수집’(10-18T06:30Z), ‘제안 8~11 진행과 우선순위’(10-17T16:5xZ, 아직 열지 않은 흐름은 나중 일).
- ‘수집 이어 부르기’(C06, 10-19T11:42Z), ‘매일 점검 실패선 90%’(10-19T11:58Z, 수집 예산은 85% 그대로, C06은 예약이 빠지는 날의 안전장치로 이어 함), ‘D1 읽기 줄이기’(C07, 10-19T12:33Z, 방안 1→2→3 차례로).
- ‘외부 숙박 자료 붙이기’(D08, 10-19T12:2xZ), ‘Overture 쓰임’(10-19T13:1xZ), ‘묶은 쌍 한 번만 보이기’(10-19T15:40Z), ‘오이타 거르기 전 커밋 그대로 둠’(10-20T01:58Z).
- ‘C06 겹침 막기·남은 후보·바깥 예약기’(10-21T07:3xZ): #190에 겹침을 막는 코드를 넣고, 남은 줄이기 후보는 C06 뒤 하루 재고 정하며, 매일 점검·백업은 바깥 예약기로 부르되 GitHub 예약과 두 번 돌지 않게 한다. 사용자는 중복을 막는 코드가 완성도를 높이고 오류를 줄이며 최적화가 되면 당연히 넣으라고 했다(원문은 결정 기록).
- ‘503 이어지면 그 실행 동안 쉬기·실패 많은 실행 알리기’(C09, 10-26T13:2xZ): 두 가지 모두 권장대로 넣는다. 원문 ‘권장대로 하겠다’(두 질문 각각). C04에 맡긴다.
- ‘수집기 robots.txt 준수 없앰’(C08, 10-21T01:2xZ): 수집기와 목록 갱신 스크립트는 출처의 robots.txt를 따르지 않는다. 요청 간격·쪽수 상한·D1 예산·403/429·Retry-After는 그대로이고, 우리 사이트의 색인 막기(H02)도 그대로다. 에이전트는 크롤러를 제안하거나 돌리기 전에 약관과 robots.txt를 읽지 않는다(같은 날 하네스에 들어간 사용자 지시).
- O04 토큰(10-26T13:2xZ): 사용자가 fine-grained 토큰 `yukemuri-scheduler`와 실행기 Secret `YUKEMURI_SCHEDULER_TOKEN`을 만들었다. 만료는 ‘없음’으로 했다(권장 366일과 다름).

### 3. 지금 상태와 확인 명령(10-27T05:2xZ–05:36Z 열여섯 번째가 잼)

10-26에 잰 값과 그 경위는 `docs/history/work-handoff-20261027T0520Z.md` 「상위 세션 인계」 3에 있다.

| 항목 | 상태 | 확인 명령 |
|---|---|---|
| main | `f2638ef`(PR #268, 기록). 그 앞은 `23c16e8`(#267)·`9729838`(#266)·`6c479b0`(#265)·`0551968`(#264), 모두 기록이고, 마지막 코드 PR은 `ae52378`(PR #244, 10-27T00:09Z)이다. 그 앞 코드 PR은 `5bccf54`(PR #190, C06 수집 이어 부르기, 10-26T12:27Z) | `git log --oneline --first-parent -10 origin/main` |
| 열린 PR | 앱 하나다(10-27T05:22Z). #246(C07 방안 2, 브랜치 `claude/c04-reads`, head `e58ecce`): 3회 검토가 끝났다(2회차 Claude P1을 `84c65fc`가 고침, 3회차 Codex ‘큰 문제 없음’). head는 C07이 main `ae52378`을 합친 것이고 마지막 검토 뒤 차이는 `docs/C07-20261019.md`만이다. `checks` 성공(00:29:50Z), mergeable clean. 10-28T00:13Z 예약에서 병합한다. C04는 C09 수집기·매일 점검·문서를 `claude/c04-writes` head `3c84392`로 push했고(PR 전), #246 병합 뒤 main을 합쳐 PR을 연다. 실행기 열린 PR은 없다(05:36Z, `gh api`) | `curl -s "https://api.github.com/repos/jihune/yukemuri/pulls?state=open"`, head마다 `.../commits/<sha>/check-runs`, 실행기는 `gh api "repos/jihune/yukemuri-script-runner/pulls?state=open"` |
| 운영 배포 | 마지막 코드 배포는 PR #244(`ae52378`, run 40424620814, 10-27T00:09Z–00:18Z, Worker `91659e4b`, 마이그레이션 없음, 스냅숏 `8419a9c4c0873341` 25,773곳)이다. 상세는 `deployments.md` 마지막 줄에 있다. 그 뒤로는 수집 실행마다 스냅숏만 다시 배포된다 | `docs/deployments.md` 마지막 줄, Actions ‘Cloudflare deploy’와 `collect.yml` |
| 수집(C03·C05·C06) | #190이 들어가 10-26T12:27Z부터 수집 실행이 그날 몫이 남으면 다음 실행을 스스로 부른다(‘Yukemuri collection chain’). 10-27T05:22Z 확인(공개 API): `collect.yml` 마지막 셋은 `github-actions[bot]`이 부른 40451577819(04:46Z)·40446023600(03:46Z)·40440366501(02:46Z)로 모두 success이고, `collect-chain.yml`은 40449014200(04:18Z)·40443663445(03:20Z) success, 40454774548(05:20:36Z)이 기다리는 중이다. 10-26 저녁의 고리와 첫 겹침, 시간 한도에서 멈춘 실행은 `C06-20261019.md`에 있다. C07 방안 1 뒤 실행당 D1 읽기는 약 36% 줄었다(`C07-20261019.md`). 10-27이 C06 뒤 첫 UTC 하루 전체이고 C04가 잰다. 수집을 바로 멈추려면 실행기 `YUKEMURI_ENABLED`만으로는 부족하고 Actions의 ‘Yukemuri collection chain’을 끄고 기다리는 run을 취소한다(`cloudflare-deploy.md`) | `gh api "repos/jihune/yukemuri/actions/workflows/collect.yml/runs?per_page=20"`, `collect.yml` 실행의 ‘Size the run’ 줄 |
| 매일 점검·백업 | O04 바깥 예약기(`yukemuri-scheduler`)가 두 workflow를 부른다. 10-27T05:36Z 확인(실행기 `gh api`): 매일 점검 마지막은 바깥 부르기 run 40434036402(01:41:16Z, success, 늦음 0분)이고, 그것이 부른 앱 `usage.yml` run 40434049653(01:41:24Z)도 success다. 백업 마지막은 10-26 예비 schedule run 40417837776(23:09Z, success, 칸을 건너뜀)이고 그 칸은 바깥 부르기 run 40386302969(19:23Z, success)가 했다(기록 PR #263). 예약기 배포 마지막은 40339141494(10-26T14:23Z, success). 10-27 예비 schedule 매일 점검 건너뛰기는 O03이 08:00Z에 보고, 이상이 있을 때만 알린다. 그 전의 백업 지연(cron 19:23Z보다 2–3시간)과 `usage.yml` 10-26 failure 경위는 위 history 파일 3에 있다 | `gh api "repos/jihune/yukemuri-script-runner/actions/workflows/<yukemuri-daily-check.yml·yukemuri-backup.yml·yukemuri-scheduler.yml>/runs?per_page=3"`, 앱 `curl -s "https://api.github.com/repos/jihune/yukemuri/actions/workflows/usage.yml/runs?per_page=3"` |
| 하위 세션 | 일함 셋(10-27T05:25Z `get_session`, 모두 idle·review_ready): C04는 C09 코드를 head `3c84392`로 push했고(PR 전, #246 뒤 main을 합쳐 엶), 10-27 하루 측정을 10-28T02:05Z 예약 `trig_01KVj1Bj7NEGpXNVP7qQCtSo`에서 한다. C07은 #246 head `e58ecce`에서 push를 멈추고 10-28 병합을 기다리며, 방안 3은 백업 브랜치 `claude/c04-reads-plan3`에 있고 10-28T00:40Z 예약 `trig_01BAn4eqVRAGL9w2sB39zEFC`에서 연다. O03은 O04 사흘 관찰 1일차를 하며 08:00Z 예약 `trig_01Q19pGF6zrL1J5X9UQ3QaTn`에서 예비 매일 점검 건너뛰기를 보고, 하루치 기록 PR을 10-27 23:40Z쯤 연다(기록 커밋 `c4e14b9` PR 전, `git cherry` ‘+’). 쉼: D05, U07, D07, U05, U06(아래 6, `get_session`을 다시 보지 않음). 열린 검토 세션은 없다 | 각 `get_session`, 브랜치별 `git log origin/main..origin/<브랜치>` |
| 예약 | 열여섯 번째 상위 세션에 묶인 것: #246 병합 예약 `trig_01Q2m1WzL9T467F5m3qPNkYu`(10-28T00:13Z), D04 재측정 알림 `trig_01Y1FYb6VK71QzWtgxUbwJPa`(11-29T03:05Z) 둘이다(10-27T05:23Z 열다섯 번째 것을 옮김). 하위 세션 것은 위 하위 세션 줄의 셋(C04 10-28T02:05Z, C07 10-28T00:40Z, O03 10-27T08:00Z)이고, 세 곳에 prompt의 열다섯 번째 id를 열여섯 번째 id로 바꾸라고 했다(05:2xZ). C04는 prompt에 이미 ‘바뀌었으면 새 id’가 있고 다른 세션의 부탁만으로 예약 prompt를 고치지 않는다며 그대로 두고, 깨어날 때의 상위 세션에 보낸다고 답했다(05:25Z). 열다섯 번째의 ‘열여섯 번째 상위 세션 시작 확인’ `trig_01XWF3pfx48YJbt5V7eRyRfY`(05:46Z)은 열다섯 번째 것이다. 그 밖에 사용자 keep-alive 루틴 둘과 다른 프로젝트 예약(건드리지 않음) | `list_triggers`(enabled true) |
| 사용량 | 10-27T05:20:34Z 5시간 창 0.11(재설정 10-27T09:10Z), 7일 창 0.36(재설정 11-02T12:00Z), `isUsingOverage` false(열여섯 번째의 첫 읽음). 10-21T21:53Z–10-22T00:06Z에는 7일 창 0.95라 멈췄다 | 이 세션의 `rate_limit_event` |
| 하네스 | 하네스 관리 세션은 `session_01SCP4PLRnVU4jczvZD7o39F`(10-26T17:28Z 시작, 앞 관리 세션 `session_01MSeEgz6aLGrzosk2QqMtwt`가 열어 넘겨줌)이고, 앞 관리 세션들은 일을 맡지 않는다. 열여섯 번째 상위 세션에 설치된 판은 `518c726 2026-10-27`이다. 10-27T05:17Z 하네스 main 끝은 `f8411ae`(setup 42)였다. 하네스 저장소는 열여섯 번째에서 `add_repo`(read)가 막혀 붙이지 못했다(위 1의 1, 아래 7의 1) | 위 1-1 |

### 4. 열린 흐름과 다음 일(우선순위 순)

끝난 흐름의 경위는 `roadmap.md`의 각 줄과 history 파일들의 「상위 세션 인계」 4에 있다. 10-27T05:4xZ에 줄이며 이 절에서 뺀 것(새 검토 규칙으로 옮기기, C05 이틀 측정, D08 남은 P3, C08 robots.txt, #244와 O04 PR의 경위)은 `docs/history/work-handoff-20261027T0537Z.md` 「상위 세션 인계」 4에 있다.

1. C07 방안 3이 들어가기 전에는 한 UTC 날에 코드 병합을 몰아서 하지 않는다. 10-19는 코드 배포 9번의 스냅숏 읽기가 무료 한도의 24.2%라 읽기가 89.8%가 되어 22:36Z 수집이 0쪽이었다(`H01-20261011.md` 7일차, 하네스 `cloudflare-free-tier` §4). 상위 세션은 깨어날 때마다 점검 workflow(앱 `usage.yml`·`collect.yml`·`collect-chain.yml`·`deploy.yml`, 실행기 ‘Yukemuri daily check’·‘Yukemuri private database backups’·‘Yukemuri scheduler deploy’)의 마지막 결론을 읽는다. 실패 메일은 아무도 읽지 않으므로 메일이 온 날만 보던 전의 방식은 쓰지 않는다(하네스 setup 40). 10-27T05:22Z(앱)·05:36Z(실행기) 확인: 일곱 workflow 모두 마지막 결론이 success다(run id는 위 3). 10-27T10:40Z 확인도 모두 success다. 실행기 예비 schedule 매일 점검 40463443972(06:49Z)가 왔고 앱 `usage.yml`은 01:41Z run 하나뿐이라 두 번 돌지 않았다. 수집 고리는 `collect.yml` 40475870409(08:46Z) 뒤 기다림 run 40479151722가 09:46Z에 ‘Not dispatching (small-budget) … today 11139 rows written, 4127856 read; … reads -33’로 멈췄다. 그날 D1 읽기 예산(85%)을 다 쓴 정상 멈춤이다.
2. 병합 순서: 한 UTC 날에 코드 병합은 하나만 한다(위 1). 들어간 것은 C07 방안 1 #197(10-21T07:4xZ, `6a51ebb`), C06 #190(10-26T12:27Z, `5bccf54`), C06 후속 #244(10-27T00:09Z, `ae52378`, C06 P3 둘과 스냅숏 배포의 Cloudflare 일시 오류 `code: 10013` 다시 시도)다. 남은 코드 PR은 C07 방안 2 #246(10-28T00:13Z 예약에서 병합), C07 방안 3(#246 뒤 C07이 최신 main에서 엶), C09(C04, #246 뒤 main을 합쳐 엶)이고 하루 하나씩 병합한다. 병합 조건은 `AGENTS.md`대로 확인하고, 앞 PR이 들어가면 뒤 PR은 main을 merge로 합쳐 CI를 다시 돌린다.
   - C07 방안 2는 상위 세션이 10-19T13:3xZ에 (나)로 정했다: 수집기의 실행 끝 집계 GET을 없애고, 수집 뒤 배포 job이 스냅숏 빌드가 센 값으로 추이 행·집계 사본·카운터를 저장한다. O03의 `daily-check.mjs`를 고치면 O03에 알린다. 방안 3은 스냅숏 코드가 안 바뀐 push 배포에서 운영 스냅숏을 다시 쓴다. ‘스냅숏 코드’ 판정은 `data/overture-geo.json`·`data/jta-registered.json` 같은 근거 파일도 덮어야 하고, 손으로 적은 목록 대신 빌드가 읽는 파일에서 얻거나 검사를 둔다(10-19T13:50Z C07 세션에 전함).
3. 상위 세션의 새 일(10-26T12:00Z 7일 사용량 재설정 뒤 시작):
   - O04(O03 세션, brief와 경위 `docs/O04-20261026.md`): 바깥 예약기 `yukemuri-scheduler`가 매일 점검·백업을 부르고, GitHub 예약은 예비로 남아 이미 한 칸을 건너뛴다. 실행기 #15·#16은 10-26에 병합·배포됐고 사용자 토큰·Secret은 끝났다. 남은 것은 UTC 사흘 관찰(10-27 1일차, O03 하루치 기록 PR 23:40Z쯤)과 P3 여섯이다. 실행기 PR은 앱 배포를 일으키지 않아 하루 코드 병합 하나 규칙과 따로 넣는다.
   - O04 뒤 물을 것: 같은 예약 Worker에 Cron 하나를 더해 수집 부르기(C06)의 예비 트리거로 쓸지(수집 주기 변경이라 사용자 결정, C06 하루 측정을 본 뒤). 후속 후보: 앱 매일 점검이 Cloudflare를 읽지 못한 날 다시 부르기(앱 코드 PR, #246 뒤).
   - C06 뒤 하루(10-27 UTC)를 C04가 잰 결과가 오면(10-28T02:05Z 예약 뒤), C04의 남은 후보와 C07 방안 4–6(Trip 상세 받기 질의·색인, 이어 부르는 실행의 스냅숏 미루기, 백업 증분 내보내기)을 사용자에게 다시 묻는다(결정 기록 ‘C06 겹침 막기·남은 후보·바깥 예약기’의 2).
   - C09(10-26T13:2xZ 사용자 결정, 위 2): 같은 공급자의 Retry-After 없는 503이 잇달아 오면 그 실행 동안만 쉬기, 매일 점검이 retry·failed가 처리한 쪽의 절반을 넘는 실행을 실패로 알리기. brief `docs/C09-20261026.md`로 C04에 맡겼다. #246 뒤에 병합한다.
4. D04: PR #189로 끝났다. 11-29T03:05Z 예약으로 정기 재확인이 다 돌았는지 다시 잰다.
5. C01: Jalan 연결 오류는 사라졌고 Trip.com 목록 페이지 없음 1건이 남았다. 공개 응답에 주소가 없고 유지관리 키를 쓰지 않아 그대로 둔다(사용자가 허락하면 한 번 읽어 찾을 수 있다).
6. 쉬는 흐름: U07(끝), D07(끝, Jalan 이름 수집은 수집 실행마다 이어짐), U05(사용자 의견 대기), U06(새 일 없음. 범위 밖으로 남긴 것: 마을 검색이 0곳인 수집 우선 마을, Trip.com 상세에 규칙 판 표시가 없어 ‘출처에 없음’을 나누지 못하는 점), D05(11-29 재측정 대기).
7. 나중 일: Sites(옛 주소) 정리, U01 실기기 확인. `roadmap.md`에 ‘남음’으로 적힌 작업은 roadmap이 기준이다. 선택 과제: 더 세밀한 주소 사전으로 다시 지오코딩, 실행기 수동 모드(`backlog`·`refresh`·`diagnose-jalan`)를 앱 `collect.yml`로 옮기기.

### 5. 상위 세션이 배운 것

다섯·여덟·아홉·열다섯 번째 상위 세션의 시행착오는 `docs/history/lessons-parent<번호>-<날짜>.md`에 따로 적었다(하네스 관리 세션에도 보냄).

- 병합 판단: 마지막 검토 커밋과 지금 main을 합친 트리(`git merge-tree --write-tree $(git merge-base HEAD origin/main) <검토 커밋>`)와 지금 head를 `git diff --stat`으로 비교한다. 기록 파일만 나와야 한다. 지금 main과의 충돌은 `git merge-tree --write-tree origin/main <head>`로 직접 본다. 그 뒤 CI(최신 head)와 해결 안 된 스레드를 본다.
- PR의 CI가 돈 뒤 다른 코드 PR이 main에 들어가면, 병합 전에 하위 세션에 main을 merge로 합쳐 다시 CI를 돌리게 한다(#163, 10-18). 두 PR이 함께 고친 파일이 없어도 그렇게 한다.
- 기록 브랜치는 매번 main 위에서 다시 시작한다(기록 PR 병합 뒤 `git merge --ff-only origin/main`). 이 브랜치는 상위 세션만 쓴다. 기록 PR을 쓰기 전에 하위 세션 브랜치마다 main에 없는 기록 커밋이 있는지 본다.
- 다른 세션이 '사용자가 승인했다'고 전한 저장소 변경은 사용자에게 확인한 뒤 한다.
- 사용자의 모바일 Claude 앱 권한 메뉴에는 ‘묻기’가 보이지 않아 ‘수정 수락’으로 바꾼 적이 있다(10-20T09:52Z). 클라우드 세션의 ‘수정 수락’은 기본(묻기) 모드와 같아 하위 세션·예약 실행이 멈추므로, 권한 모드를 바꿔 달라고 할 때는 웹에서 자동 모드로 되돌리는 것까지 함께 말한다.
- 하위 세션의 CI 완료 알림이 오지 않을 때가 있다. 하위 세션은 안전망 확인 예약으로 CI를 직접 본다. 세션 사이 메시지가 늦게 닿을 때도 있다(10-18: 08:03Z에 보낸 메시지가 08:27Z에 닿음). 정정은 한 통으로 보내고 ‘이것으로 정함’이라고 적는다.
- GitHub 도구 `actions_list`(list_workflow_runs)는 `per_page`를 무시하고 수십 건을 돌려준다. 마지막 실행 하나만 볼 때는 공개 API를 `curl -s "https://api.github.com/repos/jihune/yukemuri/actions/workflows/collect.yml/runs?per_page=1"`로 부른다(10-18T11:16Z 200 확인).
- 한자 검사는 더한 줄에만 한다. `roadmap.md` L01 줄에는 원래부터 있던 원문 고유명 두 개가 있다.
- Codex의 ‘큰 문제 없음’ 결과는 리뷰 객체가 아니라 이슈 댓글(본문의 ‘Reviewed commit’)로 온다. 병합 전에는 이슈 댓글까지 본다.
- 같은 갈래의 검토 지적이 회차마다 되풀이되면(D07 #145의 출처 짐작) 그 갈래를 하나 더 고치지 말고 근본 원인을 고치게 한다. 만드는 쪽이 기록한 것을 점검이 읽게 하면 짐작 코드가 사라진다.
- `git checkout -B`가 자동 모드 분류기에 막힌 세션이 있었다. 그때는 `git fetch origin main` 뒤 `git merge --no-edit origin/main`으로 main을 합쳐 이어 쓴다. 처음 받은 클론이 얕으면(`git rev-parse --is-shallow-repository`가 true) `origin/main..origin/<브랜치>`에 이미 병합된 커밋까지 보이므로 `git fetch --depth=1000`으로 깊게 받는다. 실행기 저장소 클론에서는 브랜치를 `git fetch origin +refs/heads/<브랜치>:refs/remotes/origin/<브랜치>`처럼 refspec을 적어 받는다.
- 하위 세션이 마지막 검토 뒤 코드 파일을 고치면(#151의 `9819070`, 주석 한 줄) 병합 조건(마지막 검토 뒤 변경은 기록 파일뿐)에 걸린다. 등급의 회차가 남았으면 그 차이를 다음 회차로 보게 하고, 다 썼으면 더 받는 회차에 사용자 허락이 필요하므로 그 파일을 되돌리게 하고 고칠 것은 다음 PR로 넘긴다.
- 인계 8의 기록 줄은 한두 문장으로 쓴다. 숫자와 근거는 PR 본문·`deployments.md`·작업 문서에 두고 여기에는 가리키기만 한다(10-18: 기록 줄이 길어 문서가 4시간 만에 38 KB에서 53 KB가 됨).
- 마지막 검토가 P2·P3만 남기면 그 스레드에 ‘다음 일로 넘김’을 한 줄 답하고 해결한 뒤 병합하고, 남은 것은 하위 세션의 작은 후속 PR로 묶는다(#166, 10-18. P2까지 넓힌 것은 10-26 검토 규칙 결정).
- (열세 번째, 10-26) 등급 2 PR의 Claude 검토 세션은 하위 세션이 곧 push할 head에 열지 않는다. push 뒤 head에 열어 그 회차의 Codex와 같은 head를 보게 한다(#246: Codex 1회차 P2를 고치는 중이라 기다렸다가 `485214f`에 열어 2회차로 셈).
- (열세 번째, 10-26) 하위 세션이 기록 PR을 연 뒤 같은 브랜치에 커밋을 더하면, 상위 세션이 그 전에 병합했을 때 그 커밋은 main에 들어가지 않는다(#256 뒤 `b26a88f`). 상위 세션은 병합할 때 하위 세션에 병합한 head를 적어 알리고, 하위 세션은 더할 것을 다음 기록 PR로 낸다.
- (열세 번째, 10-26) Claude 검토 세션이 찾은 P1은 다른 회차가 놓친 경로였다(#246 lifecycle 배포, #16 토큰이 오류 줄에 찍힘). 1회차에 Codex와 함께 두는 값이 있다. 상위 세션은 지적을 하위 세션에 보내기 전에 그 줄을 직접 읽어 경로를 확인한다.
- (열다섯 번째, 10-27) 이 세션이 연 PR은 자동으로 구독되어, 곧바로 병합한 기록 PR 하나마다 구독·검사 끝·병합 알림 2–3건이 묶여 와 세션이 한 번 더 깨어난다(#262·#264–#266, 알림 아홉 건이 네 번). 하위 세션이 글로 보낸 기록은 급하지 않으면 모아 다음 기록 PR에 싣는다. 다음 세션이 main을 읽기 전(인계)이나 병합 기록처럼 main에 바로 있어야 하는 것만 따로 낸다.

### 6. 연결된 세션(보관하지 않은 것만)

보관한 세션 목록은 옮긴 파일들과 `docs/history/work-handoff-20261018.md`·`docs/history/work-handoff-20261017.md` 「상위 세션 인계」 6과 8에 있다. 옛 상위 세션마다의 시작 시각·하네스 판·기록 브랜치는 `docs/history/work-handoff-20261027T0537Z.md`(열한 번째부터)와 `docs/history/work-handoff-20261026T1246Z.md`·`docs/history/work-handoff-20261020T0812Z.md`(그 앞) 「상위 세션 인계」 6에 있다.

| 세션 | 맡은 일 | 상태 |
|---|---|---|
| `session_01Up3F23SSA9RsdSFsjsFQbE` | 열여섯 번째 상위 세션(10-27T05:20:18Z 시작, 열다섯 번째가 `create_session`으로 엶, 계보 깊이 2/8, 하네스 `518c726`, 기록 브랜치 `claude/yukemuri-parent-16`) | 지금 상위 세션 |
| `session_016cXkfBhXcZhHyyqPswYqAF`(열다섯 번째), `session_01J5NMunVX65CtiPJ9PgcLsn`(열네 번째), `session_01A4FGJTVNdacXg9v4xe6SVt`(열세 번째), `session_01SarDBHKWzi47RJ6veCY6oi`(열두 번째), `session_01K7Ngq8H1MFPV9E1sgVXSpW`(열한 번째), `session_01H1PVupTHtCDUN7hr4H8M6W`(열 번째), `session_01NNQyWcUC7714tEYd6CEkWZ`(아홉 번째), `session_01WLm1fDq57bsuP7dANpKmPD`(여덟 번째), `session_01KGKwywGmDoBP9sLbFaUVCU`(일곱 번째), `session_01T2rEzYyaSi8qtavjsZawQB`(여섯 번째), `session_01XUUTkd9FhQQbmKkqVnsnCj`(다섯 번째), `session_012tbsAbaHuG1Xhs94L4LatJ`(네 번째), `session_01PuNgLiSyMdn35DxmRigJmK`·`session_01KfLU3P8YrmZdyxehAEp9rp`·`session_01BSbr1zrttr8mSibf5bfz2R`(세 번째·두 번째·첫 번째) | 옛 상위 세션 | 모두 인계를 마쳤다. 열다섯 번째는 10-27T05:20Z 하네스 setup 42 때문에 열여섯 번째에 인계했다. 보관하지 않는다. 메시지를 받으면 지금 상위 세션에 넘긴다 |
| `session_01SPeE1gk4K6RXPY8wEmHF4G` | O03 사용량 점검 자동화와 C05 수집 예약 매시간(브랜치 `claude/o03-usage-check`, 앱·실행기), O04 바깥 예약기(brief `O04-20261026.md`) | 일함. O04 실행기 #15·#16 병합·배포 끝, 사흘 관찰 1일차(08:00Z 예약), P3 여섯이 남음 |
| `session_01BFCCsaQ7tWzZRYedC5aTVL` | C04 쪽당 D1 쓰기 줄이기와 P04(브랜치 `claude/c04-writes`), C06 수집 이어 부르기(brief `C06-20261019.md`), C09(brief `C09-20261026.md`) | 일함. C06 #190·#244 병합 끝. 10-27 하루 측정(10-28T02:05Z 예약), C09 코드 push 끝(`3c84392`, #246 뒤 PR). C04 남은 후보는 C06 하루 측정 뒤 사용자에게 다시 묻는다 |
| `session_011eZxw3sdBJd4VfNtNaaaki` | C07 수집과 배포의 D1 읽기 줄이기(브랜치 `claude/c04-reads`, brief `C07-20261019.md`) | 일함. 방안 1(#197) 병합·실측(실행당 D1 읽기 36.1% 줄어듦). 방안 2 PR #246은 3회 검토가 끝나 10-28T00:13Z에 병합한다. 방안 3은 로컬 준비 `a675df4`를 백업 브랜치 `claude/c04-reads-plan3`에 두었고, #246 병합 뒤 최신 main에서 PR로 연다(10-28T00:40Z 예약) |
| `session_017hnYhfmsAP8ERYLmQJfE4h` | U07 화면 보강(브랜치 `claude/u07-ui`) | 쉼. 할 일 1~8과 후속 PR #171·#176이 모두 병합·배포됨 |
| `session_01P9cAoY1mYPco2JKPBhvgqv` | D07 한국어·영어 숙소 이름 넓히기(브랜치 `claude/d07-names`) | 쉼. PR 1~3 병합, 정해진 다음 일 없음 |
| `session_01EKeavHcR5d8PKrSwVHyhn6` | U05 사이트 UI/UX(브랜치 `claude/u05-ui`) | 쉼, 사용자 의견 대기 |
| `session_015QRDYJDo2KtLmzZ681cnSe` | U06 수집 현황(브랜치 `claude/u06-status`) | 쉼, 새 일 없음 |
| `session_01EbPNydUi1HEGqL6GRQxwcD` | D05 객실 정보와 D04 시설 연도(브랜치 `claude/d05-rooms`) | 쉼. D04 다음 단계는 PR #189로 끝남, 11-29 뒤 재측정 알림 대기 |
| `session_01SCP4PLRnVU4jczvZD7o39F` | 하네스 관리 세션(`jihune/agent-harness`, 10-26T17:28Z부터, 앞 관리 세션 `session_01MSeEgz6aLGrzosk2QqMtwt`에서 넘겨받음, 그 앞은 `session_01WusoPNSswrf4gH76sh9bF2`) | 다른 저장소 |
| `session_01MALVa9n1yT47zFCALbhRPf` | 다른 프로젝트 | 건드리지 않는다 |

### 7. 인계 결과(다음 상위 세션이 적는다)

여섯 번째 → 열다섯 번째까지의 인계 결과는 각 history 파일 「상위 세션 인계」 7에 있다(가장 최근인 열네 번째 → 열다섯 번째는 `docs/history/work-handoff-20261027T0520Z.md`, 그 앞 판들의 위치는 `docs/history/work-handoff-20261027T0537Z.md` 「상위 세션 인계」 7 첫 문단).

열다섯 번째 → 열여섯 번째 결과(열여섯 번째 상위 세션 `session_01Up3F23SSA9RsdSFsjsFQbE`가 적음, 10-27T05:20:18Z 시작, 열다섯 번째가 `create_session`으로 엶, 기록 브랜치 `claude/yukemuri-parent-16`):

1. 하네스: `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"` → `518c726 2026-10-27`(rc 0). 하네스 저장소 `add_repo`(read)는 05:21Z 자동 권한 검사 ‘[Access Added As A Means]’에 막혔고, 공개 API `repos/jihune/agent-harness/compare/f8411ae...518c726`도 HTTP 403(‘GitHub access to this repository is not enabled for this session’)이라 `git merge-base --is-ancestor f8411ae 518c726`은 돌리지 못했다(조상 확인 못 함). 대신 설치된 `~/.claude/CLAUDE.md`에서 setup 42의 두 줄(5절 ‘if it dates no workspace check in 14 days, run `context-engineering`'s and propose cleanup’, 8절 ‘Mark each proposal recommended or not, with why *(user, 10-27)*’)을 `grep -n`으로 찾았다(64행·101행, rc 0). 옛 판의 사본이 이 컨테이너에 없어 이 `grep`의 대조는 없다. 설치된 `cloud-session-ops` §8에는 ‘Decide and hand off yourself’와 ‘A change to the rule body is not copied; hand off.’가 있다. 환경 변수 `CLAUDE_CODE_EFFORT_LEVEL`은 xhigh, `get_session`의 `lineage`는 깊이 2, 한도 8, `parent_session_id`는 열다섯 번째다. 다음 인계는 깊이 3이라 지금 상위 세션이 `create_session`으로 연다.
2. 사용량: 이 세션의 `rate_limit_event`(05:20:34Z)에서 5시간 창 0.11(재설정 10-27T09:10Z), 7일 창 0.36(재설정 11-02T12:00Z), `isUsingOverage` false.
3. `AGENTS.md`, `START_HERE.md`, `docs/roadmap.md`(우선 작업 표, 이후 아이디어, 사용자 결정 대기, 결정 기록), `docs/cloud-development.md`, 이 문서를 읽었다.
4. 표 확인(05:21Z–05:25Z): 클론은 얕았고(`git rev-parse --is-shallow-repository` true) `git fetch --depth=1000 origin` 뒤 false, main은 `23c16e8`(#267)이다. 원격 브랜치마다 `git rev-list --count origin/main..origin/<브랜치>`를 셌다. main에 없는 커밋은 `c04-reads` 8(#246 head `e58ecce`, 열다섯 번째 때의 6에 main 합치기 `6a41a27`과 기록 `e58ecce`가 더해짐), `c04-reads-plan3` 7, `c04-writes` 3(C09 `2898628`·`99e5161`·`3c84392`), `o03-usage-check` 1(`c4e14b9`, `docs/O04-20261026.md` 한 파일, `git cherry` ‘+’, O03이 23:40Z쯤 자기 기록 PR로 냄), `p02-search-snapshot` 11(옛 draft)이다. 가져올 기록 커밋은 없다. 앱 열린 PR은 #246 하나다(head `e58ecce`, `checks` success 00:29:50Z, GitGuardian success, mergeable clean). 앱 점검 workflow의 마지막 결론(공개 API, 05:22Z): `usage.yml` 40434049653 success(01:41Z), `collect.yml` 40451577819 success(04:46Z), `collect-chain.yml` 40449014200 success(40454774548은 05:20:36Z부터 기다림), `deploy.yml` 40424620814 success(00:09Z). 실행기 저장소 `add_repo`(push)는 05:21Z ‘[Access Added As A Means]’로 막혀 사용자에게 예문을 보였고, 사용자가 예문을 보낸 뒤 05:35Z에 통과했다(아래 8). 일하는 세 곳의 `get_session`(05:25Z)은 모두 idle, review_ready이고 요약은 C04 ‘C09 pushed (3c84392); PR waits on #246; 10-28 check set’, C07 ‘#246 CI 통과(e58ecce); 상위 세션 병합 대기, 00:40Z 재확인 예약’, O03 ‘10-26 judged; retargeting 08:00Z check to session 16’이다. 쉬는 다섯 곳은 `get_session`을 다시 보지 않았다.
5. 예약 이전(05:23Z): #246 병합 `trig_01Q2m1WzL9T467F5m3qPNkYu`(10-28T00:13Z), D04 재측정 `trig_01Y1FYb6VK71QzWtgxUbwJPa`(11-29T03:05Z)를 `list_triggers`의 prompt 그대로 이 세션에 만들고, 옛 `trig_01FmpaQFJdWqNPZLstkswcBx`·`trig_01TaZ7NoKCznfwaNPBcZ9Zoe`를 `delete_trigger`로 지웠다(둘 다 ‘Deleted’). 열다섯 번째의 ‘열여섯 번째 상위 세션 시작 확인’ `trig_01XWF3pfx48YJbt5V7eRyRfY`, 사용자 keep-alive 루틴 둘, 다른 프로젝트 예약은 건드리지 않았다.
6. 알림(05:24Z, priority later, 모두 delivered): 하위 세션 여덟 곳(C04·C07·O03·D05·U07·D07·U05·U06)과 열다섯 번째에 새 id를 알렸다. C04·C07·O03에는 자기 예약 prompt의 열다섯 번째 id만 바꾸라고 했고, setup 42에는 하위 세션의 일에 걸린 줄이 없다고 적었다. O03에는 08:00Z 결론을 이상이 없어도 보내 달라고 했다가, 실행기 저장소를 붙인 뒤 05:3xZ에 거뒀다(‘이것으로 정함’). D05에는 D04 새 예약 id를 적었다.
7. 누락 점검(05:25Z–05:3xZ): 하위 에이전트(sonnet)가 열다섯 번째의 `list_events(kinds=["user"], limit=100)`를 첫 쪽과 `before_id`로 9쪽 거슬러, `after_id`로 한 쪽 앞으로 읽었다. 첫 시도는 파일로 저장된 큰 쪽을 읽지 못해 멈췄고, 커서 세 값만 뽑는 python 한 줄을 허락해 이어 갔다. 하네스 `session-handoff`의 `scripts/user_messages.py extract` 결과는 `calls=11 ... read=11 ... chain_breaks=[] start=newest end=reached forward=reached ... user_events=263 typed={'web_claude_ai': 1} excluded={'synthetic': 2, 'origin': 1, 'claude_code_mcp_seed': 1} answers=0 tool_results=258 unknown=0 ... oldest=2026-10-26T21:53:43.159285Z newest=2026-10-27T05:24:36.137633Z PASS`(rc 0, 전체 줄은 `docs/history/work-handoff-20261027T0537Z.md` 7의 7)다. 사람이 입력한 것은 1건(10-26T22:19:35Z, 실행기 저장소 승인 예문 그대로)이고 위 2의 ‘실행기 저장소 상시 승인’ 줄에 이미 있다. 빠진 사용자 지시는 없다. 대조 원본은 이 세션의 임시 폴더에만 있다.

열여섯 번째 → 열일곱 번째: 받는 세션이 위 1의 결과를 여기에 적고, 위 열다섯 번째 → 열여섯 번째 결과와 8의 기록을 `docs/history/`로 옮긴다.

### 8. 기록

10-27T05:37Z까지의 기록은 `docs/history/work-handoff-20261027T0537Z.md` 「상위 세션 인계」 8과, 그 문단이 가리키는 더 앞 history 파일들에 있다(10-26T21:57Z–10-27T05:20Z 열다섯 번째의 기록은 `docs/history/work-handoff-20261027T0520Z.md` 「상위 세션 인계」 8).

- 10-27T05:24Z 인계 문서(71,129바이트, main `23c16e8`과 같음)를 `docs/history/work-handoff-20261027T0520Z.md`로 옮겼다(`cmp` 같음). 인계 받기 기록 PR #268을 05:30Z에 검토 없이 병합했다(`f2638ef`, head `cdac1e2`).
- workspace check 2026-10-27T05:33Z(하네스 setup 42 전역 룰 5절, `context-engineering`의 `references/workspace-check.md`): records state·handoff `docs/work-handoff-latest.md` 「상위 세션 인계」, plan·status `docs/roadmap.md` 우선 작업 표, ledger(지금도 따르는 지시) 같은 문서 2, decisions `roadmap.md` 결정 기록, archive `docs/history/`, 작업별 상세 `docs/<작업ID>-<날짜>.md`(`AGENTS.md` ‘기록’ 절이 이 체계를 적고 있어 지도 줄을 더하지 않음). 규칙 파일은 `AGENTS.md` 85줄 14,111바이트·`CLAUDE.md` 7줄로 한도 안이다. 발견 둘: 이 문서 67,713바이트(목표 16 KB의 약 네 배), `roadmap.md` 74,786바이트(같은 크기를 넘는 계획 파일). 최상위 항목 40개와 `docs/` 바로 밑의 날짜 붙은 검토 문서 넷은 앱 설정 파일과 `AGENTS.md`가 가리키는 문서라 발견으로 치지 않았다. 두 파일 줄이기를 제안했고, 사용자가 05:3xZ에 ‘권한다면 하도록 하겠다. 알아서 진행’이라고 답했다(위 2).
- 10-27T05:3xZ 사용자가 실행기 저장소 승인 예문을 그대로 보냈고, 05:35Z `add_repo`(push)가 통과해 `/home/user/yukemuri-script-runner`(main `4be2a33`)에 받았다. 실행기 열린 PR은 없고, 실행기 workflow 셋의 마지막 결론은 모두 success다(위 3). O03에 보낸 08:00Z 보고 부탁은 거뒀다.
- 10-27T05:37Z 이 문서와 `roadmap.md`를 바꾸지 않고 `docs/history/work-handoff-20261027T0537Z.md`·`docs/history/roadmap-20261027T0537Z.md`로 옮겼고(`cmp` 같음, 커밋 `a85dfbe`), 05:4xZ에 두 파일을 줄였다. 이 문서는 69,649 → 52,566바이트다. 1의 지난 세션별 경위, 2의 끝난 줄, 4의 끝난 흐름, 6의 옛 상위 세션 줄을 빼고 가리키는 문장을 남겼다. 지금도 따르는 지시는 모두 2에 남겼고(옛 2의 줄 35개 가운데 그대로 남지 않은 6개는 끝난 줄 넷과 고쳐 쓴 줄 둘), 2의 검토 규칙 줄은 `AGENTS.md`를 가리키게 줄였다. `roadmap.md`는 74,786 → 38,893바이트다. 우선 작업 표 37행을 지금 상태와 근거 문서로 줄이고, 10-08–10-11의 집계·체크포인트 절을 뺐다. 이후 아이디어·사용자 결정 대기·결정 기록은 바꾸지 않았다(줄이기 전 판과 바이트 비교로 같음). 목표 16 KB에는 닿지 않았다. 남은 크기는 지금도 따르는 지시(2), 이번 인계 결과(7, 다음 인계 때 옮김), 상태 표(3), 교훈(5)이고, `roadmap.md`는 결정 기록(약 22.6 KB)이 대부분이다. 줄인 두 파일은 PR #269로 05:46Z에 검토 없이 병합했다(`8137967`, head `0d670c1`).
- 10-27T06:2xZ 하네스 setup 43(`3989e0d`)은 스킬 몇 줄이라(위 1의 1) `cloud-session-ops` §8대로 이 문서와 #246 병합 예약 prompt에 옮겨 적고, 인계는 다음 날 10-28의 일의 경계(#246 병합과 그 기록 PR 뒤)로 미뤘다. 일하는 세 곳에는 걸린 줄만 전했다.
- 10-27T10:4xZ 하네스 setup 44(`24a9371`)도 스킬 한 줄이라 같은 방법으로 위 1의 1과 #246 병합 예약 prompt에 옮겨 적고 같은 10-28 경계에서 인계한다. 그 줄(이 PR이 만든 P2는 다음 push에서 고침)이 `AGENTS.md`·`cloud-development.md`의 P2 문장과 부딪혀 사용자에게 물었다.
- 10-27T10:5xZ 사용자가 P2 질문에 ‘권장대로 고침’으로 답했다. `roadmap.md` 사용자 결정 대기의 행을 결정 기록으로 옮기고 위 2에 적었다. 앱 `AGENTS.md`·`cloud-development.md`와 실행기 `AGENTS.md`를 문서 PR(등급 1, Codex 1회)로 고치고, 일하는 세 곳에 이 규칙을 전한다.
- 10-27T10:46Z 기록 PR #270(결정 기록)을 검토 없이 병합했다(`31af12e`). 10:50Z 앱 문서 PR #271(head `cedeac1`, Codex 1회 ‘Didn't find any major issues’, 리뷰 스레드 0, 문서만이라 `checks` 생략·배포 없음)을 병합했다(`aa455f5`). 10:53Z 실행기 문서 PR #18(head `087e481`, `AGENTS.md`와 `project-files.json` 항목, `check-project-files.py` 고치기 전 rc 1·뒤 rc 0, CI `verify` 둘 success, Codex 1회 ‘Didn't find any major issues’)을 병합했다(실행기 `8925d8f`, main push는 site checks만 부르고 예약기 배포는 부르지 않음). C04·C07·O03에 새 P2 규칙을 10:4xZ에 전했다.
- 10-27T23:4xZ O03 O04 1일차 기록 PR #272(`docs/O04-20261026.md` 한 파일, head `9a5c004`, `git merge-tree` rc 0)를 검토 없이 병합했다(`ccfa9c6`). 병합 전에 O03에 push 멈춤과 병합할 head를, 병합 뒤 병합한 head를 알렸다. 1일차 요약: 매일 점검 칸 10-26은 바깥 run 40434036402(늦음 0분)가 했고 예비 40463443972는 건너뜀, 백업 칸 10-27은 바깥 run 40568666215(19:23Z)가 실제로 했고 예비 40598866657(3시간 36분 늦음)은 건너뜀, 두 번 한 칸과 경고는 없음. 같은 때 점검 workflow 일곱의 마지막 결론은 모두 success였다(`collect.yml` 40599884975 23:07Z).

## 작업별 절

10-20T08:12Z까지 이 문서 끝에 있던 작업별 절(U05·U06·L01·D05·D04·D06·O03·C04·U07·D07)은 `docs/history/work-handoff-20261020T0812Z.md`에 그대로 있다. 작업마다 지금 상태는 `roadmap.md` 우선 작업 표와 위 「상위 세션 인계」 4·6이, 상세는 작업 문서(`docs/<작업ID>-<날짜>.md`)가 기준이다. 하위 세션은 이 문서를 고치지 않고 자기 작업 문서만 고친다.
