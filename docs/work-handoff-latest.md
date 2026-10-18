# 최근 작업 인수인계

이 문서는 지금 상태만 담는다. 세션은 시작할 때 이 문서를 읽으므로 짧게 유지한다(목표 16 KB 안팎). 2026-10-18T09:10Z까지의 전체 인계(61,234바이트)는 `docs/history/work-handoff-20261018.md`에 바꾸지 않고 옮겼다. 다섯 번째 상위 세션의 기록(8절), 검토 회차, 끝난 PR의 상세는 그 파일에서 같은 제목의 절로 찾는다. 그보다 앞선 인계는 `docs/history/work-handoff-20261017.md`와 `docs/history/`의 다른 파일에 있다.

끝난 일은 이 문서에서 줄이고 `roadmap.md`·`deployments.md`·작업 문서(`docs/<작업ID>-<날짜>.md`)에 남긴다. 이 문서가 다시 커지면 같은 방법으로 `docs/history/`에 옮긴다.

## 상위 세션 인계

다섯 번째 상위 세션 `session_01XUUTkd9FhQQbmKkqVnsnCj`(10-18T00:54Z 시작, 브랜치 `claude/yukemuri-parent`, 하네스 `0366863`)가 이 절을 10-18T09:10Z에 다시 썼다. 하네스 setup 28(`9756172`)이 새 세션에 닿았고 이 세션의 하네스가 그보다 오래돼서, 하네스 `cloud-session-ops` §8 「When to hand off」(1)에 따라 D07 PR #145 배포 기록을 경계로 여섯 번째 상위 세션에 넘긴다. 이 절의 사실은 적은 시각에 맞았다. 이어받는 세션은 아래 3의 확인 명령으로 다시 본다.

### 1. 다음 상위 세션이 이어받을 때 할 일

인계 방법: 지금 상위 세션이 다음 상위 세션을 `create_session`(그때의 상위 모델)으로 열고 ‘main의 docs/work-handoff-latest.md 「상위 세션 인계」를 열어 요약하지 말고 1의 순서대로 실행한 뒤 4를 이어 하라’는 한 줄만 보낸다. 옛 상위 세션은 그 뒤 새 일을 하지 않고 `claude/yukemuri-parent`에 push하지 않으며, 받은 메시지를 새 상위 세션에 넘긴다. 보관하지 않는다.

이어받는 세션은 하네스 규칙(인계를 받은 세션의 누락 점검)대로 이 인계에 빠진 것이 없는지 스스로 점검한다. 옛 상위 세션의 사용자 메시지(`list_events(session_id=<옛 상위 세션>, kinds=["user"], limit=100)`을 `before_id`로 거슬러 읽음)를 아래 2·4와 대조한다. 결과가 커서 파일로 저장되면 스크립트로 글 블록만 뽑는다. 사용자의 작업이나 결정이 필요하면 사용자에게 묻는다(사용자 10-17T17:0xZ: ‘인계시 새 세션에서 작업한다면 인계한거 빠진거 없는지는 규칙에 따라 자동으로 검토하면 될거다. 사용자 작업이나 결정 필요사항 있다면 새 세션에서 역질문 하던가 답변해주면 된다.’). 다섯 번째 상위 세션이 받은 사용자 지시는 아래 2의 10-18T02:25:44Z(실행기 규칙), 06:13Z·06:30Z(Jalan 이름), 07:40Z(검토 상한과 요약 문장) 줄과, 끝난 일회성 지시 하나(교훈을 하네스 관리 세션에 넘기기, `docs/history/lessons-parent5-20261018.md`)다.

1. 하네스를 확인한다. `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"`의 판을 아래 7에 적는다. 여섯 번째 상위 세션은 `8e9695c 2026-10-18`이었다(하네스 main의 10-18T09:02:31Z 병합 커밋, setup 28 `9756172`보다 새 판). 이보다 새 판이면 정상이다. 하네스 확인 문구의 실제 값은 어디에도 적지 않는다.
2. 사용량을 읽는다. `get_session`(인자 없음)으로 자기 id를 얻고, `list_events(kinds=["rate_limit_event"], limit=100)`의 마지막 이벤트에서 `five_hour`·`seven_day` utilization과 `isUsingOverage`를 본다. 기준은 아래 2의 사용량 항목이다.
3. `AGENTS.md`, `START_HERE.md`, `docs/roadmap.md`, `docs/cloud-development.md`, 이 문서를 읽는다.
4. 아래 3의 표를 한 줄씩 확인 명령으로 다시 보고, 하위 세션 브랜치마다 `git log --oneline origin/main..origin/<브랜치>`를 본다. main에 없는 기록 커밋은 다음 기록 PR에 가져온다. 실행기 저장소 `jihune/yukemuri-script-runner`는 `add_repo`(access push)로 붙인다. 하네스 문장을 직접 읽으려면 `jihune/agent-harness`를 `add_repo`(access read)로 붙이고 GitHub 도구로 파일을 읽는다.
5. 지금 상위 세션에 묶인 예약을 같은 시각·prompt로 자기 세션에 다시 만들고(`create_trigger` 또는 `send_later`), 옛 것을 `delete_trigger`로 지운다. 10-18T09:18Z 기준으로 H01 6일차 `trig_01SLC7SRYDscnpeoA5wPGE8s`(10-19T01:20Z), 7일차 `trig_0125o8RtWneff6wxN7YfJEah`(10-20T01:20Z), 안전망 확인 `trig_01DsDXpmCKDrvzjspSPiTBjr`(10-18T11:15Z)이고, 그 뒤 바뀌면 `list_triggers`가 기준이다. prompt는 `get_trigger`로 읽는다. 시각이 지났으면 그 일을 바로 한다. 사용자의 keep-alive 루틴('5시간 세션 초기화'로 시작)과 하위 세션의 예약은 건드리지 않는다.
6. 모든 하위 세션(아래 6의 일하는 네 곳과 쉬는 네 곳)에 새 상위 세션 id를 `send_message`(priority later)로 알린다. 하위 세션의 `@parent`는 자기를 연 다섯 번째 상위 세션을 가리키므로, 앞으로는 새 상위 세션 id로 보내라고 적는다. 옛 상위 세션에도 알리고, 그 세션은 보관하지 않는다.
7. 결과(돌린 명령과 실제 출력)를 이 문서 아래 7에 적어 기록 PR로 넣고, 사용자에게 한국어로 짧게 보고한다.

### 2. 지금도 따르는 사용자 지시

지시가 나온 경위와 원문 전체는 `docs/history/work-handoff-20261018.md`·`docs/history/work-handoff-20261017.md`의 「상위 세션 인계」 2와 `roadmap.md` 결정 기록에 있다.

- 기존 기록 체계를 유지한다. 새 기록 체계(`agents_work/`, `STATE.md`)를 만들지 않는다.
- pnpm 11.25.0과 잠금 파일을 유지한다. 개발 검사는 임시 DB와 fixture로 한다. 운영 DB를 개발 환경에 직접 연결하지 않는다. GitHub 병합과 실제 운영 배포를 나눠 적는다.
- 운영 확인은 공개 GET만 한다. 유지관리 키와 즐겨찾기를 쓰지 않는다. 무료 요금제만 쓴다.
- 비밀값은 채팅, PR, 로그에 쓰지 않는다. 사용자는 설정을 마치면 '완료'만 알린다. 공개 저장소라 비밀, 개인정보, 대화 원문, DB 백업을 커밋하지 않는다. 하네스 확인 문구의 실제 값은 어떤 문서·커밋·기록에도 복사하지 않는다.
- 검토와 병합: Codex를 부르는 @ 표기는 검토 요청 댓글에만 쓴다. 코드 PR은 Codex 최대 3회(한도 때문에 대신한 Claude 검토 포함), 그 뒤 이어 가는 Claude 검토 세션 최대 2회까지 묻지 않고 하며 6회째는 사용자 허락이 필요하다. P0~P2가 남으면 병합하지 않고 보고한다. 기록 파일만 바꾼 PR은 검토 없이 병합한다. 병합은 40자 SHA로 한다. 기준 문장은 `AGENTS.md` 병합 조건과 `docs/cloud-development.md` ‘Codex 클라우드 환경’ 1·3번이다.
- 코드 없는 PR(지침·절차 문서, 스킬 문장만)은 하네스 `pr-review-loop`를 따른다(사용자 10-18T07:40Z: ‘코드 없는 PR의 검토 횟수 상한 관련은 하네스 규칙을 우선으로 하는게 맞다고 보는데, 혹시 모르니 하네스 관리 세션에 물어보고 문서를 고쳐라.’). Codex 요청은 두 번(대신한 Claude 검토 포함)이다. 두 번째 뒤 남은 P2는 지적된 줄만 고쳐 다시 검토 없이 병합하고, P0~P1이 남을 때만 이어 가는 Claude 검토를 두 번까지 받는다. CI workflow·마이그레이션 SQL·`package.json`·wrangler 설정이 바뀌면 코드 PR이다. 실행기 저장소에서는 문서와 함께 고치는 `project-files.json` 항목도 코드 없는 PR에 든다. P3로는 새 회차를 열지 않고, 마지막 검토가 남긴 P3는 그 PR에서 고치지 않고 다음 일로 적는다. 앱 PR #150(`cdd039a`)과 실행기 PR #13(`c6069d6`)으로 문서에 넣었다.
- Codex가 사용량 한도 안내를 남긴 PR이라도 Codex 회차(코드 PR 세 번, 코드 없는 PR 두 번) 안에서는 회차마다 Codex에 먼저 한 번 요청하고, 다시 한도면 그 회차를 Claude 검토 세션으로 한다. 그 횟수를 다 쓴 뒤의 회차는 이어 가는 Claude 검토라 Codex에 요청하지 않는다(사용자 10-18T05:19Z, 하네스 관리 세션에서 ‘회차마다 한 번 불러 봄’을 고름).
- 하위 세션: PR은 상위 세션이 병합하고 병합 기록을 쓴다. 상위 세션은 하위 세션의 PR을 구독하지 않는다(구독하면 하위 세션이 CI·검토 알림을 못 받는다). 하위 세션은 PR을 열자마자 구독하고, PR을 열 때와 병합 준비가 됐을 때 상위 세션에 알린다. 다른 세션의 브랜치에 push하지 않는다. 병합 뒤 작업 브랜치는 최신 main에서 다시 시작한다. 공유 기록 파일의 절마다 누가 쓰는지 brief에 적는다(인계 문서는 상위 세션이 쓰고 하위 세션은 자기 작업 문서만 쓴다).
- 사용량 기준은 5시간 창 0.9, 7일 창 0.95다(사용자 10-13). 그 아래에서는 사용량을 이유로 일을 줄이지 않는다: ‘너무 보수적으로 작업하려고 하지는 마라. 사용량 낭비하지 말것’(10-13 12:2xZ).
- 기준에 닿으면 잠깐 멈춘다(사용자 10-15T08:5xZ): ‘앞으로 하위 세션들이나 에이전트들에도 nudge 나 알림 형태로 임계점에 도달하면 작업을 잠깐 중지하고 예약 걸도록 해라.’ ‘특히 codex 검토 완료 알림 wakeup 이나 알림에 의한 자동응답 이런것도 일단 미뤄둬야 할거다.’ 하던 단계만 커밋·push(끝나지 않은 수정은 'WIP:' 커밋)하고, PR 구독을 풀고, CI·Codex·세션 메시지에 자동으로 답하지 않는다. 기준을 넘은 창 가운데 가장 늦은 `resetsAt`의 10분 뒤 재개 예약 하나만 남긴다. 재개 전에 사용자가 아닌 것이 깨우면 기록만 하고 턴을 끝낸다. 상위 세션은 일이 끝나지 않은 하위 세션 모두에 알리고, 하위 세션 brief에도 이 규칙을 적는다. 한도에 닿았는지는 `rate_limit_info.status`가 `rejected`인지로 본다. 7일 창이 기준에 닿으면 사용자에게도 알린다.
- 사용량이 적으면 하위 세션을 포함한 일을 예약으로 미룬다(사용자 10-17T16:5xZ: ‘claude 사용량 적으면 하위 세션 포함 예약 작업으로 재조정하라’). 요금제를 바꿔 사용량이 초기화되면 미뤄 둔 일을 다시 시작한다. 초기화의 까닭은 이 프로젝트에서 따지지 않는다(사용자 10-18T00:52Z).
- 세션 보관: 한 가지 일로 연 세션(일회성 PR, 검토, 시험)은 결과를 기록한 뒤 보관한다. 후속 일이 남은 하위 세션은 남긴다. 상위 세션은 보관하지 않는다(10-13 23:1xZ). 다른 프로젝트의 세션은 보관하지도, 보관할지 묻지도 않는다(10-13 22:1xZ).
- 모델: 관리·계획·검토 세션은 그때의 상위 모델, 단순 검색·작업은 하위 모델을 쓴다. 모델 이름은 규칙에 고정하지 않는다(10-13).
- 답변과 하위 세션 메시지는 한국어로 쓰고 한자를 출력하지 않는다.
- 인계 문서는 지금 상태만 남기고 옛 내용은 `docs/history/`로 옮긴다(사용자 10-17T16:0xZ, ‘권장대로 하겠다’).
- 하네스 관리 세션의 변경 알림은 원장이나 기록 파일에 적지 않는다(사용자 결정, 하네스 관리 세션이 10-17T11:25Z와 그 뒤 알림마다 전함). 다음 인계에 쓸 하네스 판과 하네스 관리 세션 id만 고친다. 하위 세션에는 그 일에 걸린 줄만 다음 메시지에 낮은 우선순위로 전한다.
- 실행기 저장소에도 이 규칙을 적용한다(사용자 10-18T02:25:44Z: ‘실행기 저장소도 우리 하네스 규칙을 적용하여 codex 검토나 여타 하네스 관련 내용을 적용’). 실행기 PR #12(`492ea75`)와 #13(`c6069d6`)으로 실행기 `AGENTS.md`·`CLAUDE.md`·`START_HERE.md`·`README.md`에 넣었다.
- 숙소 이름과 설명(사용자 10-17T16:5xZ, D03 결정): ‘가급적 한국어가 없으면 영어이름도 괜찮다’. 이름은 한국어 → 영어 → 원어 순으로 보이고, 원어·영어 이름은 복사 단추를 둔다. Gemini 같은 LLM 번역은 쓰지 않는다. 구글 지도·구글 검색 결과는 약관 때문에 쓰지 않는다(`D06-20261013.md` 4절). 설명 번역은 그 자리에서 번역되는 아이콘이 결제 없이 될 때만 넣는다. 구글 결제는 하지 않는다(사용자 10-17T17:0xZ: ‘구글 결제는 안할거다’). 그래서 Google 평점·사진(Places API)도 쓰지 않는다.
- Jalan 한국어·영어 목록 쪽(`www.jalan.net/kr/`, `/en/`)의 숙소 이름을 수집기에 낮은 우선순위로 넣어 이름만 저장한다(사용자 10-18T06:13Z ‘권장대로 조사부터 해라’, 조사 결과를 본 뒤 06:30Z ‘권장대로 2번으로 진행해라’). 연결은 Jalan 숙소 번호로만 하고, 옛 한국어 이름과 로마자만의 이름은 거르며, 수집 규칙은 지금과 같다(roadmap 결정 기록). D07 PR 2가 맡는다.
- 이후 아이디어 8~11은 모두 진행하고 기존 일보다 앞에 둘 수 있다(사용자 10-17T16:5xZ). 아직 열지 않은 흐름은 나중 일이다.

### 3. 지금 상태와 확인 명령(10-18T09:2xZ, 여섯 번째 상위 세션이 다시 봄)

| 항목 | 상태 | 확인 명령 |
|---|---|---|
| main | 이 기록 PR이 들어간다. 그 앞은 `95fdb23`(PR #155, 다섯 번째 상위 세션의 인계 기록), `17d66a6`(PR #145, D07 PR 1), `c30195b`(PR #153), `e7eedc8`(PR #152), `cdd039a`(PR #150, 코드 없는 PR 검토 상한) | `git log --oneline -5 origin/main` |
| 열린 PR | yukemuri #151(U07 PR 나, Codex 3회째 결과 09:08Z `394b271`, 지적 있음), #154(D07 PR 2, 09:10Z 열림, head `feb3d7f`, `checks` 성공 09:14Z, 마이그레이션 0015). 실행기 저장소는 없음 | `list_pull_requests`(state open), yukemuri와 yukemuri-script-runner |
| 운영 배포 | 마지막 코드 배포는 PR #145(`17d66a6`, run 39113387040, 10-18T08:56:33Z–09:07:30Z, Worker `ef25d892`, 스냅숏 `328a9a3b27cf2b8e`, 23,429곳, 생성 읽기 119,706행, 마이그레이션 없음). 그 뒤로는 수집 실행마다 스냅숏만 다시 배포된다 | `docs/deployments.md` 마지막 줄, Actions 'Cloudflare deploy'와 `collect.yml` |
| 수집(C03) | `collection-budget.mjs`는 `writesPerPage` 151, `snapshotReads` 330,000(PR #130). C04 PR #137·P04 PR #138 뒤 쪽당 쓰기와 스냅숏 읽기가 줄었고(스냅숏 257,099 → 약 12만 행), C04가 실측으로 두 값을 내리는 예산 PR을 준비한다. 앱 `collect.yml`의 마지막 실행은 10-18T05:13Z(실행기 예약 run 39099792423)이고, 09:10Z까지 다음 실행이 없었다(아래 4-4) | `H01-20261011.md` 「7단계 기록(매일)」, 실행기 'Yukemuri catalog updates'와 앱 `collect.yml` 실행 목록 |
| 하위 세션 | 일함: O03, U07, C04, D07(아래 6). 쉼: U05, U06, L01, D05 | 각 `get_session`, 브랜치별 `git log origin/main..origin/<브랜치>` |
| 예약 | 여섯 번째 상위 세션에 묶인 예약 세 개(위 1-5). 하위 세션 예약: U07 #151 확인(09:47Z), D07 #154 확인(09:31Z), C04 수집 실측(10:25Z), O03 첫 예약 실행 확인(10-19T02:45Z). 사용자 keep-alive 루틴 두 개 | `list_triggers`(enabled true) |
| 사용량 | 10-18T09:15:25Z 5시간 창 0.46(재설정 10:40Z), 7일 창 0.32(재설정 10-19T12:00Z), `isUsingOverage` false | 위 1-2 |
| 하네스 | 하네스 관리 세션은 `session_01M7TTyzzQPadBMiWAGFWCR4`(10-18T09:03Z 알림부터). 앞 관리 세션 `session_011ayTaQQUY8VUJQqLdxTrSz`·`session_01T99PGUq2MSWNS3NAJgNdrp`·`session_01Hb6mZa55hebUCaeC7z29mG`는 일을 맡지 않는다. 여섯 번째 상위 세션에 설치된 판은 `8e9695c`(하네스 main head와 같음, 10-18T09:16Z `list_commits`) | 위 1-1 |

### 4. 열린 흐름과 다음 일(우선순위 순)

1. H01 7단계: 6일차(10-19T01:20Z)와 7일차(10-20T01:20Z)를 예약대로 본다(`H01-20261011.md` 「7단계 기록(매일)」). 6일차에는 PR #130의 `writesPerPage` 151·`snapshotReads` 330,000으로 그날 쓰기가 85% 안에 들었는지 본다. 7일차 뒤 아래 6의 C1을 닫고 7단계를 정리한다. PR #130의 회차 경위는 옮긴 파일 4-1에 있다.
2. O03 사용량 점검 자동화(이후 아이디어 10, 하위 세션 `session_01SPeE1gk4K6RXPY8wEmHF4G`): 앱 PR #131(`48cc071`)과 실행기 PR #11(실행기 `31daed7`)이 병합됐다. 실행기 예약이 매일 01:41Z에 앱 점검을 부르고, 85% 이상·1102·0쪽 수집·26분 초과·백업 실패면 실패 메일이 간다. 첫 예약 실행(10-19T01:41Z)은 O03이 10-19T02:45Z에 확인한다. 7일차(10-20) 뒤 상위 세션의 Claude 매일 점검을 끝내고, 실패 메일이 온 날만 run 요약을 본다.
3. U07 화면 보강(하위 세션 `session_017hnYhfmsAP8ERYLmQJfE4h`, 상세 `U07-20261019.md`): PR #133(PR 가)과 #148(할 것 7)이 병합·배포됐다. PR #151(PR 나: 지도 표지를 묶음 구성원 점 위에, 꼬리 끝을 숙소 점에, 할 것 8: `names.ko`를 바로 쓰던 비교 표·지도·에이전트 도구·사진 출처 API를 `displayNames`로)은 Codex 1·2회째 P2를 고쳤고, 3회째(마지막 Codex)가 10-18T09:08Z `394b271`에서 끝났다(요약 댓글의 `has_unresolved_findings` true). U07이 지적을 고치면 다음은 이어 가는 Claude 검토(4번째 검토)이고 상위 세션이 연다. 그 뒤 PR 다(설명을 그 자리에서 번역)를 연다(로컬에 준비됨).
4. C04 쪽당 D1 쓰기 줄이기와 P04 스냅숏 읽기(하위 세션 `session_01BFCCsaQ7tWzZRYedC5aTVL`, 상세 `C04-20261019.md`와 아래 「C04」): 다음은 예산 PR이다. 배포 뒤 첫 수집 실행들의 실측으로 `writesPerPage`·`snapshotReads`를 내린다. D07 PR 2가 늘리는 양(스냅숏 1회 약 7,600행, 쪽당 쓰기는 D07이 PR 설명에 적음)을 넣어 정한다. #138의 P3 3건을 함께 고친다. C04는 05:13Z 뒤의 다음 수집 실행이 있어야 쪽당 쓰기를 구할 수 있어 10:25Z에 다시 본다. 수집 예약 공백: 실행기 예약의 최근 다섯 번 간격이 2시간 28분에서 5시간 42분이라 손으로 부르지 않고 기다린다. 11:15Z 안전망 확인에서 다시 보고, 그때까지 새 실행이 없으면 사용자에게 알린다.
5. D07 한국어·영어 이름 넓히기(하위 세션 `session_01P9cAoY1mYPco2JKPBhvgqv`, 상세 `D07-20261019.md`): PR 1(#145, Wikidata 이름을 정확한 Trip.com ID로만 붙임, 카드에 출처 표시 `wikidataNames`)을 10-18T08:56Z에 병합하고 배포했다(`17d66a6`). 검토는 다섯 번(Codex 3회, 이어 가는 Claude 검토 2회)이었다. 1~4회째 지적이 모두 점검 스크립트가 출처를 짐작하는 데서 나와, 상위 세션이 근본 원인(출처 표시)을 고치게 했다. 배포 뒤 확인(D07 09:09:21Z, 공개 GET만): 공개 `status.json`의 한국어 이름(`nameKo.filled`)이 1,543 → 1,565곳(Trip.com +22, Jalan 그대로)이고, 배포된 스냅숏 `328a9a3b27cf2b8e`에 돌린 `check-wikidata-names.mjs --public`은 이름 유지 23곳, `PASS`(rc 0)였다. 원문 줄과 근거 파일은 #154의 `D07-20261019.md` ‘결과(PR 1)’ 8과 `docs/evidence/d07-20261018/wikidata-names-deployed.json`이 기준이고, 상위 세션 기록은 이 한 줄만 둔다. PR 2(Jalan 한국어·영어 목록 이름)는 #154로 10-18T09:10Z에 열렸다(head `feb3d7f`, `checks` 성공). 새 표 `hotel_locale_names`(마이그레이션 0015), 새 작업 종류 `kind='names'`(우선순위 95), 쪽당 쓰기 한국어 79행·영어 49행·재방문 9행이라 `writesPerPage` 151과 `snapshotReads` 330,000은 바꾸지 않았다고 PR 설명에 적었다. PR 1의 남은 P3 2건(`prefecture-check.py`가 GET을 보냄, 설계 4의 결과 6 표시)도 넣었다. D07이 Codex 1회째를 09:17Z에 요청했다. 코드 PR이라 Codex 세 번과 이어 가는 Claude 검토 두 번까지다.
6. C1(유지보수 경로 CPU, PR #53 측정): 백업 `catalog-checkpoint.py`의 `limit=1000` 쪽과 수집 목록 PUT의 1102 위험은 지금 바꾸지 않는다. 7일차까지 1102가 0이면 ‘대응 없음’으로 닫고, 1102가 나오면 백업 `limit`을 250으로 낮추는 안부터 본다.
7. 나중 일: Sites(옛 주소) 정리, D04 다음 단계(D05 세션 몫), 외부 숙박 자료 출처 조사(라쿠텐 등, 약관상 공개 저장이 되는지), C01 남은 오류 2건, U01 실기기 확인. `roadmap.md`에 ‘남음’으로 적힌 작업은 roadmap이 기준이다. 선택 과제: 더 세밀한 주소 사전으로 다시 지오코딩, 실행기 수동 모드(`backlog`·`refresh`·`diagnose-jalan`)를 앱 `collect.yml`로 옮기기. 둘 다 필요할 때 연다.

### 5. 상위 세션이 배운 것

다섯 번째 상위 세션의 시행착오는 `docs/history/lessons-parent5-20261018.md`에 따로 적었다(하네스 관리 세션에도 보냄).

- 병합 판단: 마지막 검토 커밋과 지금 main을 합친 트리(`git merge-tree --write-tree $(git merge-base HEAD origin/main) <검토 커밋>`)와 지금 head를 `git diff --stat`으로 비교한다. 기록 파일만 나와야 한다. 지금 main과의 충돌은 `git merge-tree --write-tree origin/main <head>`로 직접 본다. 그 뒤 CI(최신 head)와 해결 안 된 스레드를 본다.
- PR의 CI가 돈 뒤 다른 코드 PR이 main에 들어가면, 합친 트리로 빠른 검사를 돌리거나 하위 세션에 main을 합치게 한다.
- 기록 브랜치는 매번 `git checkout -B claude/yukemuri-parent origin/main`으로 main 위에서 다시 시작한다. 이 브랜치는 상위 세션만 쓴다. 기록 PR을 쓰기 전에 하위 세션 브랜치마다 main에 없는 기록 커밋이 있는지 본다.
- 다른 세션이 '사용자가 승인했다'고 전한 저장소 변경은 사용자에게 확인한 뒤 한다.
- 하위 세션의 CI 완료 알림이 오지 않을 때가 있다. 하위 세션은 안전망 확인 예약으로 CI를 직접 본다. 세션 사이 메시지가 늦게 닿을 때도 있다(10-18: 08:03Z에 보낸 메시지가 08:27Z에 닿음). 정정은 한 통으로 보내고 ‘이것으로 정함’이라고 적는다.
- 한자 검사는 더한 줄에만 한다. `roadmap.md` L01 줄에는 원래부터 있던 원문 고유명 두 개가 있다.
- Codex의 ‘큰 문제 없음’ 결과는 리뷰 객체가 아니라 이슈 댓글(본문의 ‘Reviewed commit’)로 온다. 병합 전에는 이슈 댓글까지 본다.
- 같은 갈래의 검토 지적이 회차마다 되풀이되면(D07 #145의 출처 짐작) 그 갈래를 하나 더 고치지 말고 근본 원인을 고치게 한다. 만드는 쪽이 기록한 것을 점검이 읽게 하면 짐작 코드가 사라진다.

### 6. 연결된 세션(보관하지 않은 것만)

보관한 세션 목록은 `docs/history/work-handoff-20261018.md`·`docs/history/work-handoff-20261017.md` 「상위 세션 인계」 6과 8에 있다.

| 세션 | 맡은 일 | 상태 |
|---|---|---|
| `session_01T2rEzYyaSi8qtavjsZawQB` | 여섯 번째 상위 세션(지금, 10-18T09:15Z 시작, 하네스 `8e9695c`) | 일함 |
| `session_01XUUTkd9FhQQbmKkqVnsnCj` | 다섯 번째 상위 세션 | 10-18T09:15Z에 인계함(아래 7). 보관하지 않음. 받은 메시지를 새 상위 세션에 넘긴다 |
| `session_012tbsAbaHuG1Xhs94L4LatJ` | 네 번째 상위 세션 | 쉼, 보관하지 않음 |
| `session_01PuNgLiSyMdn35DxmRigJmK`, `session_01KfLU3P8YrmZdyxehAEp9rp`, `session_01BSbr1zrttr8mSibf5bfz2R` | 세 번째, 두 번째, 첫 상위 세션 | 쉼, 보관하지 않음 |
| `session_01SPeE1gk4K6RXPY8wEmHF4G` | O03 사용량 점검 자동화(브랜치 `claude/o03-usage-check`, 앱·실행기) | 일함. 10-19T02:45Z 확인 예약 |
| `session_017hnYhfmsAP8ERYLmQJfE4h` | U07 화면 보강(브랜치 `claude/u07-ui`) | 일함. PR #151(Codex 3회째 지적), 그다음 PR 다 |
| `session_01BFCCsaQ7tWzZRYedC5aTVL` | C04 쪽당 D1 쓰기 줄이기와 P04(브랜치 `claude/c04-writes`) | 일함. 예산 PR 준비(10:25Z 확인) |
| `session_01P9cAoY1mYPco2JKPBhvgqv` | D07 한국어·영어 숙소 이름 넓히기(브랜치 `claude/d07-names`) | 일함. PR 2(#154) 검토 |
| `session_01EKeavHcR5d8PKrSwVHyhn6` | U05 사이트 UI/UX(브랜치 `claude/u05-ui`) | 쉼, 사용자 의견 대기 |
| `session_015QRDYJDo2KtLmzZ681cnSe` | U06 수집 현황(브랜치 `claude/u06-status`) | 쉼, 새 일 없음 |
| `session_01B1EMNXwBFR86E9fRdWbW1N` | L01 신규·폐업·휴관(브랜치 `claude/l01-lifecycle`) | 쉼, 다음 일 미정 |
| `session_01EbPNydUi1HEGqL6GRQxwcD` | D05 객실 정보와 D04 시설 연도(브랜치 `claude/d05-rooms`) | 쉼, D04 다음 단계 시작 알림 대기 |
| `session_01M7TTyzzQPadBMiWAGFWCR4` | 하네스 관리 세션(`jihune/agent-harness`) | 다른 저장소 |
| `session_01MALVa9n1yT47zFCALbhRPf` | 다른 프로젝트 | 건드리지 않는다 |

### 7. 인계 결과(다음 상위 세션이 적는다)

다섯 번째 → 여섯 번째 상위 세션(10-18T09:15Z–09:2xZ, `session_01T2rEzYyaSi8qtavjsZawQB`). 위 1의 순서대로 했다. 네 번째 → 다섯 번째의 결과는 옮긴 파일 7에 있다.

1. 하네스: `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"` → `8e9695c 2026-10-18`(rc 0). 하네스 저장소 `list_commits`의 맨 위가 같은 `8e9695c`(10-18T09:02:31Z, PR #88 병합)이고, setup 28 `9756172`(08:54:16Z)보다 새 판이다.
2. 사용량: `get_session`(인자 없음) → `session_01T2rEzYyaSi8qtavjsZawQB`, 부모 `session_01XUUTkd9FhQQbmKkqVnsnCj`. `list_events(kinds=["rate_limit_event"], limit=100)`의 마지막 이벤트(09:15:25Z) → `five_hour` 0.46(재설정 10:40Z), `seven_day` 0.32(재설정 10-19T12:00Z), `isUsingOverage` false, `status` allowed.
3. `AGENTS.md`, `START_HERE.md`, `docs/roadmap.md`(204줄 끝까지), `docs/cloud-development.md`, 이 문서를 읽었다.
4. 표 확인: `git log --oneline -5 origin/main` → 맨 위 `95fdb23`(PR #155). 열린 PR: yukemuri #151·#154, 실행기 저장소 `[]`(`add_repo` access push 뒤 clone `c6069d6`). 하네스 저장소는 `add_repo`(access read)로 붙이고 GitHub 도구로만 읽었다. 하위 세션 `get_session`: D07 `RUNNING`, O03·U07·C04·U05·U06·L01·D05 `IDLE`. 처음 받은 클론이 얕아(`--is-shallow-repository` true) `origin/main..origin/<브랜치>`가 이미 병합된 커밋까지 보였다. `git fetch --depth=1000` 뒤 다시 보니 o03·u05·u06·l01은 비었고, d05에는 `d2f7d53`(이미 main `f2a3cc3`에 같은 문구), c04에는 `C04-20261019.md`와 근거 JSON만 바꾼 커밋, main 병합 커밋, P04 P3 고침 `6bbbd0e`(C04 예산 PR 몫)가 있었다(`git show --name-only`로 커밋마다 파일을 봄). u07·d07에는 #151·#154의 커밋이 있었다. 가져올 기록 커밋은 없었다. `collect.yml` 마지막 실행은 그대로 10-18T05:13Z(run 39099802372)다.
5. 예약: `list_triggers(enabled true)`의 prompt를 그대로 써서 `create_trigger`로 세 개를 이 세션에 만들고(`trig_01SLC7SRYDscnpeoA5wPGE8s` 10-19T01:20Z, `trig_0125o8RtWneff6wxN7YfJEah` 10-20T01:20Z, `trig_01DsDXpmCKDrvzjspSPiTBjr` 10-18T11:15Z), 옛 세 개를 `delete_trigger`로 지웠다. 사용자 keep-alive 루틴과 하위 세션 예약 넷은 그대로 두었다.
6. 알림: O03·U07·C04·D07·U05·U06·L01·D05와 다섯 번째 상위 세션에 새 id를 `send_message`(priority later)로 보냈다. 아홉 건 모두 `delivered`(09:19Z). C04에는 #154의 쪽당 쓰기와 스냅숏 증가 어림을 함께 적었다.
7. 누락 점검: 다섯 번째 상위 세션의 `list_events`를 10-18T09:16Z부터 시작(00:54:30Z)까지 거슬러 읽었다. 한 쪽은 종류와 관계없이 100개를 읽고 거른 뒤라 44쪽이 걸렸고, 쪽 넘기기는 하위 모델 서브에이전트에 맡겼다. user 이벤트의 글 블록 16개 가운데 사람이 친 메시지(`client_platform` 키가 있고 `isSynthetic`이 없는 것)는 여섯이다. 00:54:30Z 시작 메시지, 02:25:44Z ‘계속 진행해라, 그리고실행기 저장소도 우리 하네스 규칙을 적용하여 codex 검토나 여타 하네스 관련 내용을 적용’(위 2), 03:02:18Z 교훈을 하네스 관리 세션에 넘기라는 일회성 지시(끝남, 옮긴 파일 8), 06:13:25Z ‘권장대로 조사부터 해라’와 06:30:45Z ‘권장대로 2번으로 진행해라’(위 2, roadmap 결정 기록), 07:40:10Z 코드 없는 PR 검토 상한과 요약 문장 셈법(위 2, PR #150에서 끝남)이다. 나머지 열은 압축 요약, stop hook, 서브에이전트 보고, 작업 알림이다. 10-18T05:19Z 결정은 이 세션의 사용자 메시지가 아니라 하네스 관리 세션이 전한 것이라(옮긴 파일 8) 여기에 없다. 모두 위 2·4와 옮긴 파일 8에 들어 있어 사용자에게 물을 것은 없었다.

### 8. 기록

10-18T09:10Z까지의 기록은 `docs/history/work-handoff-20261018.md` 「상위 세션 인계」 8에 있다.

- 10-18T09:10Z 다섯 번째 상위 세션이 이 문서를 지금 상태만 남게 다시 쓰고, 여섯 번째 상위 세션에 넘기기로 했다(하네스 setup 28, 위 머리 문단).
- 10-18T09:15Z–09:2xZ 여섯 번째 상위 세션 `session_01T2rEzYyaSi8qtavjsZawQB`가 인계를 받았다(위 7).
- 10-18T09:20Z 다섯 번째 상위 세션이 인계 뒤에 받은 D07의 #145 배포 뒤 확인 두 통을 넘겼다. 기록이 겹치지 않게 D07 문서와 근거 파일을 기준으로 두고, 상위 세션은 위 4-5에 숫자 한 줄만 둔다고 D07에 알렸다. C04는 05:13Z 뒤 수집 실행이 아직 없어 10:25Z에 다시 본다고 알렸다.

## U05 2단계 — 화면 구현(B ‘탕 체크리스트’)

하위 세션 `session_01EKeavHcR5d8PKrSwVHyhn6`, 브랜치 `claude/u05-ui`(main `0cbd848`에서 다시 시작). 설계와 단계는 `U05-20261013.md`. 2단계 1~7번 PR과 왼쪽 필터 C안이 모두 병합·배포됐다(PR 번호는 `roadmap.md` U05 줄). 사용자 의견을 받으면 이 절에 이어 적는다.

## U06 — 수집 현황 한눈에 보기

하위 세션 `session_015QRDYJDo2KtLmzZ681cnSe`, 브랜치 `claude/u06-status`(main `863f1b7`에서 다시 시작). 설계는 `U06-20261015.md`. 자료 현황 화면(PR #114)과 날짜별 추이·그날 Cloudflare 사용량(PR #119)이 병합·배포됐다. 남은 것(이번 범위 밖): 마을 검색이 0곳인 수집 우선 마을, Trip.com 상세의 규칙 판 표시가 없어 ‘출처에 없음’을 나누지 못하는 점.

## L01 — 신규·폐업·휴관 반영

하위 세션 `session_01B1EMNXwBFR86E9fRdWbW1N`, 브랜치 `claude/l01-lifecycle`(main `9312055`에서 다시 시작). 상세는 `L01-20261013.md`. PR 1~3(#79·#93·#98)이 병합돼 남은 일이 없다.

## D05·D04 — 객실 정보와 시설 연도

하위 세션 `session_01EbPNydUi1HEGqL6GRQxwcD`, 브랜치 `claude/d05-rooms`. 상세는 `D05-20261013.md`, `D04-20261015.md`. D05(PR #77)와 D04 2단계(PR #94)가 병합됐다. 다음 단계(정기 재확인으로 채워진 연도 비율 측정)는 상위 세션의 시작 알림을 기다린다.

## D06 — 지도 좌표 보강

하위 세션은 보관했다. 상세는 `D06-20261013.md`. 한국어 이름 후속은 D07이 맡았다.

## O03 — 사용량 점검 자동화

하위 세션 `session_01SPeE1gk4K6RXPY8wEmHF4G`, 브랜치 `claude/o03-usage-check`(두 저장소 모두). 상세와 run 번호는 `O03-20261019.md`. 앱 PR #131(`usage.yml` 매일 점검, `scripts/daily-check.mjs`)과 실행기 PR #11(`yukemuri-daily-check.yml`, 매일 01:41Z)이 병합됐다. 끝나는 조건(정상인 날 성공, 대조 네 가지 실패, 실행기 수동 실행이 앱 점검을 부름)은 10-18T02:5xZ에 확인했다. 남은 것은 첫 예약 실행(10-19T01:41Z) 확인이고, O03이 10-19T02:45Z에 본다.

## C04 — 쪽당 D1 쓰기 줄이기

하위 세션 `session_01BFCCsaQ7tWzZRYedC5aTVL`, 브랜치 `claude/c04-writes`. 측정·설계·결과는 `C04-20261019.md`. 이 절은 상위 세션 기록 PR이 고치고, C04 세션은 `C04-20261019.md`만 고친다(10-18T03:3xZ 정함).

- C04 PR #137(`4caa224`): 마이그레이션 0014로 쓰지 않는 색인 8개를 지우고, 값이 그대로인 갱신 세 곳을 건너뛴다. 임시 D1에서 상세 쪽 21 → 11행, 새 숙소 30곳 목록 쪽 598 → 348행.
- P04 PR #138(`2653d84`): 스냅숏 생성 읽기를 257,099 → 117,433행으로 줄였다(운영 배포 run 39096592943). 그 뒤 배포들도 119,706행 안팎이다.
- 다음 예산 PR: 배포 뒤 첫 수집 실행들(Actions 로그의 `today … written, … read`)로 쪽당 쓰기와 스냅숏 읽기를 재서 `writesPerPage`·`snapshotReads`와 `check-collection-budget.mjs` 훑기의 기준값을 내린다(10-17 쪽 구성으로 어림하면 쪽당 66.2–72.7행). D07 PR 2의 증가분을 넣는다. #138의 Claude 검토(`session_01Cz7adKH5EFnx3nKicEkhkh`, 보관함)가 남긴 P3 3건을 같은 PR에서 고친다. P3-1: 근거 JSON `p04-snapshot-compare-grown-20261018.json`의 `base`·`current`가 실제로 잰 lib를 가리키지 못한다(`compare-snapshot-builds.mjs`가 작업 트리와 관계없이 HEAD를 적음). P3-2: 비교 자료가 근거 `openedAt`, 마스크 밖 `bath_known` 비트, 공급자 첫 묶음 밖의 최신 `fetched_at`, 둘째 출처의 상세 표시, `--remote` 문자열 매개변수를 판정하지 않는다. P3-3: `lib/search-snapshot-build.ts` 머리 주석이 예전 상태 행 조회를 설명한다.

## U07 — 화면 보강

하위 세션 `session_017hnYhfmsAP8ERYLmQJfE4h`, 브랜치 `claude/u07-ui`. 설계·검사·결과는 `docs/U07-20261019.md`. PR 가(#133, 필터 글자 밀림·옵션 도움말·이름 순서·이름 복사)와 할 것 7(#148, 지역만 준 주소가 지역을 비우던 결함과 #133의 P3 2건)이 병합·배포됐다. 지금은 PR 나(#151, 지도 표지와 할 것 8)이고, 그다음 PR 다(데스크톱 Chrome·Edge의 브라우저 내장 번역으로 설명을 그 자리에서 번역)를 최신 main에서 연다.

## D07 — 한국어·영어 숙소 이름 넓히기

하위 세션 `session_01P9cAoY1mYPco2JKPBhvgqv`, 브랜치 `claude/d07-names`(main `89fee8b`에서 시작, 10-18T05:54Z). 조사·설계·결과는 `docs/D07-20261019.md`. 이 절은 D07 세션만 고친다(처음 기록 10-18T06:28:52Z, 고침 10-18T08:25:04Z).

- PR 1(Wikidata 이름): Trip.com ID(P10425)가 정확히 같은 일본 Wikidata 항목의 한국어·영어 레이블을 스냅숏 생성과 상세·비교 API에서 붙인다. 수집 이름이 없을 때만 넣고, 항목의 영어 레이블이 우리 이름과 맞지 않으면(이름이 바뀐 숙소) 쓰지 않는다. D1 읽기·쓰기와 수집 경로는 그대로다. 공개 스냅숏 기준 한국어 제목 1,543 → 1,565곳, 영어 이름 1,277 → 1,278곳. 스냅숏 카드가 규칙이 붙인 이름을 `wikidataNames`로 적고, 표본 점검 `node scripts/check-wikidata-names.mjs --public`은 그 표시만 읽어 규칙이 쓰지 않는 신호(좌표 거리)로 판정한다. 붙는 23곳은 모두 우리 좌표가 없어 미확인이고, 한 번 손으로 한 확인에서 22곳은 항목의 소재 도도부현이 우리와 같았고 1곳은 같은 숙소로 판단했다(10-18T08:29Z, D07 문서 ‘결과(PR 1)’ 6). 검토: Codex 3회(P2 1·1·2건)와 Claude 1회(P2 2건·P3 1건), 모두 고침.
- Jalan 한국어·영어 사이트 조사(사용자 10-18T06:13Z ‘조사부터’): 목록 쪽에 우리 `jalan-<번호>`와 같은 숙소 번호와 공식 한국어·영어 이름이 있다(벳푸·오이타 60곳 중 57곳이 우리 기록, 그중 한국어 이름이 있는 곳 0). 오이타로 어림하면 Jalan 기록의 약 35%(약 7,600곳)에 붙일 수 있다. 약관은 일본어 규약과 같은 제5조·제8조(사적 이용 밖 복제 금지)다. 사용자는 10-18T06:30Z(상위 세션이 전함) 이 목록을 낮은 우선순위로 수집하기로 정했다(PR 2, PR 1 병합 뒤 연다).
- 다음: PR 1의 CI·검토, 병합·배포 뒤 공개 `status.json`의 `nameKo` 수 확인.
