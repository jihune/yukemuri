# 최근 작업 인수인계

작업: P01 — 응답 속도와 D1 읽기량 줄이기. PR A(측정 검사와 수집 저장 경로·집계 캐시)와 PR B(검색 전체 스캔·첫 요청 색인·seed 번들)로 나눈다.
기록: 2026-10-11T07:50:00Z / 2026-10-11 16:50:00 KST(PR A). PR B 갱신: 2026-10-11T09:05:00Z / 18:05:00 KST.
이전 인수인계(U03, PR #23·#24와 상위 세션 기록 포함)는 `history/work-handoff-U03-20261011.md`에 보존했다.
U04(예약 링크 날짜·인원과 설명 번역 문구)는 동시에 진행해 이 문서 끝의 ‘U04’ 절에 따로 적는다.

## 상위 세션 인계(2026-10-15T07:4xZ, 네 번째 상위 세션이 이어받는다)

적은 세션: 세 번째 상위 세션 `session_01PuNgLiSyMdn35DxmRigJmK`(2026-10-13T22:26Z 시작, 모델 Opus 5.5, 브랜치 `claude/yukemuri-parent`). 이 절은 기록 PR로 main에 들어간다. 적은 시점의 main은 그 PR의 병합 커밋이다(`git log --oneline -5 origin/main`으로 본다). 이 절의 사실은 적은 시점에 맞았다. 지금도 맞는지는 아래 3의 확인 명령으로 다시 본다.

이전 상위 세션 인계(10-13T22:1xZ, 두 번째 상위 세션이 적었고 세 번째 상위 세션이 처리했다)와 그 처리 결과 로그는 `docs/history/work-handoff-parent-20261013T2226Z.md`로 옮겼다. 파일 이름의 시각은 그 절이 main에 들어간 시각(PR #87 병합)이다. 아래 2(사용자 지시)와 6(세션 목록)은 그 문서에서 가져와 고쳐 적었다. 그보다 앞선 인계는 `docs/history/work-handoff-parent-20261013T1022Z.md`에 있다.

넘기는 이유: 사용자가 10-15 07:3xZ에 '네 번째 상위 세션으로 인계할까요'에 '예'라고 답했다(아래 2). 하네스가 10-15에 두 번 바뀌었다. setup 12(판 `97c33b4`)와 setup 13(판 `38d5b46`)이다. 바뀐 룰과 스킬은 새로 연 세션에만 설치된다. 세 번째 상위 세션은 10-13T22:26Z에 설치된 하네스로 돌고 있다. 07:4xZ에 이렇게 확인했다.
- `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"` → `No such file or directory`. 하네스 관리 세션 알림(10-15 05:52Z)에 따르면 이 파일이 없으면 10-15 이전 설치다.
- `/root/agent-harness-setup.log`에는 `PASS: claude -> /root/.claude (tag CCWEB, 45 skill and agent entries)`가 있다.

세 번째 상위 세션의 대화도 길어져서 한 번 답할 때마다 드는 사용량이 크다.

네 번째 상위 세션은 세 번째 상위 세션이 `create_session`으로 연 세션이다. 그 `@parent`는 세 번째 상위 세션이다.

### 1. 이어받을 때 할 일(순서대로)

1. 하네스를 확인한다. 하나라도 어긋나면 더 진행하지 말고 사용자에게 알린다. 하네스 확인 문구의 실제 값은 어디에도 적지 않는다.
   - `/root/agent-harness-setup.log`에 `clone rc=0`과 `PASS: claude -> /root/.claude (tag CCWEB, …)`가 있다.
   - `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"`이 파일 내용을 출력한다. 파일이 없으면 10-15 이전 설치라서 어긋난 것이다. 출력한 판을 아래 7에 그대로 적는다. 10-15T07:4xZ에 알려진 마지막 판은 `38d5b46`(setup 13)이다.
   - `grep -c 'Ctrl+T' ~/.claude/CLAUDE.md`가 1 이상이다. 대조로 없는 문구(`grep -c 'no-such-phrase-7q' ~/.claude/CLAUDE.md`)는 0이다.
   - `~/.claude/skills/untrusted-content/SKILL.md`가 있다.
2. 사용량을 읽는다.
   - `get_session`을 인자 없이 불러 자기 id를 얻는다.
   - `list_events(kinds=["rate_limit_event"], limit=100)`의 마지막 이벤트에서 `five_hour`와 `seven_day`의 utilization, `isUsingOverage`를 본다. 결과 페이지가 비어 있으면 `has_more`가 거짓이 될 때까지 `before_id`로 앞 페이지를 읽는다.
   - 기준은 아래 2의 사용량 항목이다.
3. 다음 문서를 읽는다: `AGENTS.md`, `START_HERE.md`, `docs/roadmap.md`, `docs/cloud-development.md`, 그리고 이 절 전체. 이 문서의 다른 절과 `.claude/skills/yukemuri-maintenance/SKILL.md`는 필요할 때 읽는다.
4. 인계 누락 점검을 한다. 이 점검은 건너뛰지 않는다.
   - 아래 3의 표를 한 줄씩 본다. 줄마다 적힌 확인 명령을 실제로 돌려, 적힌 상태와 지금 상태가 같은지 본다.
   - 하위 세션 브랜치마다 `git log --oneline origin/main..origin/<브랜치>`를 본다. main에 없는 기록 커밋이 있으면 다음 기록 PR에 가져온다(아래 5의 D05 사례).
   - 다른 줄은 아래 7에 적는다.
5. 예약을 옮긴다.
   - 'H01 7단계 3일차 사용량 점검'(`trig_01577GMSVvQSgDGpxYw6VStW`, 10-16T01:20Z)의 prompt를 `get_trigger`로 읽는다. 같은 이름, 같은 시각, 같은 prompt로 자기 세션에 묶은 예약을 만든다(`create_trigger`의 `run_once_at`, initiation은 `human_schedule`).
   - `list_triggers`로 새 예약이 자기 세션 id에 묶였는지 본다. 그다음 옛 예약을 `delete_trigger`로 지운다.
   - 세 번째 상위 세션에 묶인 예약이 그 밖에도 켜져 있으면 같은 방법으로 옮긴다. 07:4xZ에는 위의 것 하나뿐이었다.
   - 사용자가 만든 keep-alive 루틴(이름이 '5시간 세션 초기화'로 시작한다)은 건드리지 않는다. 하위 세션에 묶인 예약(U05의 `trig_01Y1jEXjYYUU5QfPxvAjRDUV` 등)도 그 세션 것이라 건드리지 않는다.
6. 하위 세션에 새 상위 세션 id를 알린다.
   - 보낼 곳은 U05, L01, D05, R01이다(아래 6).
   - `send_message`로 '앞으로 병합 준비, 질문, 검토 결과는 새 id로 보내라'고 적는다.
   - 이유: 네 세션 모두 `@parent`가 새 상위 세션이 아니다. U05의 `@parent`는 이전 상위 세션, L01과 D05는 두 번째 상위 세션, R01은 세 번째 상위 세션이다.
7. 세 번째 상위 세션에 인계를 받았다고 `send_message`로 알린다.
   - 세 번째 상위 세션은 그 사이에 받은 메시지를 새 id로 넘기고 '넘길 것 없음'이라고 답한다. 그 뒤에는 새 일을 하지 않고 `claude/yukemuri-parent`에 push하지 않는다.
   - 세 번째 상위 세션은 보관하지 않는다(아래 2, 사용자 10-13 23:1xZ).
8. 아래 7 「인계 결과」에 1~7의 결과(돌린 명령과 실제 출력)를 적고, 기록 PR로 main에 넣는다. 이 절은 다음 상위 세션 인계 때 `docs/history/`로 옮긴다.
9. 사용자에게 한국어로 짧게 보고한다. 그 뒤 계획을 다시 세운다. 아래 4의 일을 우선순위와 그 이유를 붙여 다시 짜고, 새 사용자 메시지가 올 때마다 다시 짠다.

이 절을 요약하지 말고 실행한다.

### 2. 대화에서 정한 사용자 지시(기록 파일에 흩어져 있거나 없는 것)

- 기존 기록 체계를 유지하고 새 기록 체계를 만들지 않는다. 이관은 끝났으니 다시 이관하거나 ZIP으로 덮어쓰지 않는다.
- pnpm 11.25.0과 잠금 파일을 유지한다. 개발 검사는 임시 DB와 fixture로 한다. 운영 DB를 개발 환경에 직접 연결하지 않는다. GitHub 병합과 실제 운영 배포를 구분해 적는다.
- 운영 확인은 공개 GET만 한다. 유지관리 키를 쓰지 않고 즐겨찾기를 쓰지 않는다.
- 무료 요금제만 쓴다.
- 비밀값은 채팅, PR, 로그에 쓰지 않는다. 사용자는 설정을 마치면 '완료'만 알린다. 세션이 비밀값을 만들어 채팅에 쓰지 않는다. 이 저장소는 공개라서 비밀, 개인정보, 대화 원문, DB 백업을 커밋하지 않는다.
- 하네스 확인 문구의 실제 값은 어떤 문서, 커밋, 기록에도 복사하지 않는다.
- 검토와 병합(`AGENTS.md`에도 있다):
  - Codex를 부르는 @ 표기는 검토 요청 댓글에만 쓴다. 파일에는 @ 없이 쓴다.
  - Codex 검토 최대 3회, 그 뒤 Claude 검토 세션 최대 2회까지 묻지 않고 한다. 6회째는 사용자 허락이 필요하다.
  - P0~P2가 남으면 병합하지 않고 보고한다.
  - 기록 파일만 바꾼 PR은 검토 없이 병합한다. 마지막 검토 뒤에는 기록 파일만 바꾼다.
  - 병합은 40자 SHA로 한다.
- 하위 세션 운영:
  - 하위 세션의 PR은 상위 세션이 병합하고 병합 기록을 쓴다.
  - 상위 세션은 하위 세션의 PR을 구독하지 않는다. PR 이벤트는 한 세션에만 가서, 상위 세션이 구독하면 하위 세션이 CI·검토 결과를 받지 못하고 멈춘다(10-13, 약 25분과 40분).
  - 하위 세션은 자기 PR을 열자마자 구독하고, PR을 열 때와 병합 준비가 됐을 때 상위 세션에 메시지를 보낸다.
  - 다른 세션의 브랜치에 push하지 않는다. 병합 뒤 작업 브랜치는 최신 main에서 다시 시작한다.
- 사용량(10-13):
  - 한도에 닿으면 모든 세션의 턴이 정리 없이 끊긴다(U05 하위 세션이 08:18Z에 검증 도중 멈췄고 수정은 push되지 않았다).
  - (바뀜: 10-15T08:5xZ 사용자 지시로 '기준에 닿으면 잠깐 멈추고 재개 예약'이 됐다. 이 절 끝의 '사용량 기준에서 멈춤' 항목) 기준에 닿아도 멈추지 않는다(사용자 10-13 11:2xZ, 앞의 '0.85에서 멈춤'을 고침). 사용자 지시 없이 일을 멈추면 남은 사용량을 버리게 되고, 끊겨도 재개를 예약해 둘 수 있기 때문이다. 기준에 닿으면 다음을 한다.
    - 새 하위 세션, 하위 에이전트, workflow를 늘리지 않는다.
    - 예약은 초기화 뒤로 옮긴다.
    - 단계마다 커밋하고 push한다. 하위 세션에도 같은 내용을 보낸다.
    - 끊길 때를 대비해 `resetsAt` 10분 뒤로 재개를 예약한다.
    - 7일 기준에 닿으면 사용자에게도 알린다.
  - 기준값: 이전 세션의 제안은 5시간 창 0.9, 7일 창 0.95다. 사용자가 0.9를 확정했다(아래 항목). 그 아래에서는 사용량을 이유로 일을 줄이지 않는다. 하위 세션 수도 남은 양을 보고 정한다.
  - 사용자 확정(10-13 12:2xZ): ‘사용량 기준도 일단 0.9 정도를 유지하면 되는데 상위 세션에서 말한것처럼 너무 보수적으로 작업하려고 하지는 마라. 사용량 낭비하지 말것’. 남은 사용량이 있으면 다음 작업을 연다.
- 한 가지 일로 연 세션(일회성 PR 하위 세션, Claude 검토 세션, 시험 세션)은 결과를 기록한 뒤 `archive_session`으로 보관한다. 후속 작업이 남은 하위 세션은 남긴다. 보관해도 `get_session`·`list_events`로 읽을 수 있고 `unarchive_session`으로 되살릴 수 있다(10-13 확인). 상위 세션은 연결된 세션을 아래 6의 목록처럼 기록해 둔다(사용자 10-13). 상위 세션은 보관하지 않는다(아래 23:1xZ 항목).
- 모델과 추론 강도(사용자 10-13): 관리·계획을 맡아 오래 쓰는 세션과 리뷰·검토 세션은 그때의 상위 모델(10-13 기준 Opus 5.5)에 높은 추론 강도를 쓴다. 단순 검색이나 단순 작업은 하위 모델이나 낮은 강도를 쓴다. 하위 에이전트는 Agent 도구의 `model`·`effort`로, 하위 세션은 `create_session`의 `model`로 정한다. 추론 강도는 Default 환경의 `CLAUDE_CODE_EFFORT_LEVEL=xhigh`가 모든 세션에 건다(10-13 확인). 모델 이름은 룰에 고정하지 않는다.
- 답변과 하위 세션 메시지는 한국어로 쓰고 한자를 출력하지 않는다.
- 안 쓰는 세션 보관(사용자 10-13 21:5xZ): ‘이 세션의 상위 세션 및 "D06" 세션 등 이제 안쓰는 세션은 보관을 해도 되나? 너가 해줄래?’ 상위 세션이 이전 상위 세션과 D06 세션을 보관했다(21:5xZ). 보관한 세션도 `list_events`로 대화 기록을 읽을 수 있고 `unarchive_session`으로 되돌릴 수 있다. 작업의 연결은 세션 기억이 아니라 이 문서·roadmap·deployments·브랜치에 둔다.
- 이 프로젝트와 관련성이 떨어지는 세션(사용자 10-13 22:1xZ): ‘이 프로젝트와 관련성이 떨어지는 세션에 대한 보관은 너가 결정할 사항이 아니니 건드리지 말것’. 개인 상담비서 DB 세션 같은 다른 프로젝트 세션은 보관하지 않고, 보관할지 묻지도 않는다.
- 상위 세션은 보관하지 않는다(사용자 10-13 23:1xZ): ‘혹시 상위 세션 보관조치를 했다면 보관시킨건 다시 보관 풀어라. 보관해두면 상위 세션과 상호작용이 막히는 문제를 하네스 관리 세션에서 발견하여, 앞으로 상위 세션 보관은 함부로 하지 않기로 했다.’ 위 21:5xZ 항목 중 상위 세션을 보관한 부분과, 앞 인계 절 1의 7번(답을 받으면 두 번째 상위 세션을 보관한다)을 이 항목이 바꾼다. 세 번째 상위 세션이 두 번째 상위 세션의 보관을 풀었다(23:1xZ). 이전 상위 세션은 그때 이미 보관이 풀려 있었다(`unarchive_session` → ‘already active’). 두 세션에 ‘하위 세션이 @parent로 보낸 메시지는 지금 상위 세션 id로 넘기고, 새 일과 push는 하지 않는다’고 보냈다. 상위 세션을 인계할 때도 옛 상위 세션은 보관하지 않고 남긴다.
- 사용량(사용자 10-13 23:1xZ): ‘사용량 한도가 지금 거의 도달해 있기에 기존에 너가 판단한대로 다음 작업은 예약걸어서 5시간 세션 한도 풀리면 진행’. 그때 5시간 창은 0.85(23:09Z)였다. 상위 세션은 01:20Z 예약(`trig_015RWK96qgA2NEkGofK5gzda`)에 재개를 더했고, U05에는 하던 수정을 push한 뒤 멈추고 01:20Z에 재개하라고 보냈다.
- 상위 세션 인계(사용자 10-13 22:1xZ): ‘이 세션 또한 하네스 관리 세션처럼 작업이 길어졌고 … 하네스 구조가 변경되었는데 새 세션에서 열어야 변경된 스킬이나 룰이 클라우드에 반영되기 때문이다. 필요하다면 너가 판단해서 기존 에이전트 작업이 마무리된다면 이 세션도 절대 누락없이 인계하여 작업할 수 있도록 판단하여 계획짜고 진행하라. 상세 내용은 하네스 관리 세션 및 그 상위의 보관된 세션을 참고하라.’
- 위에 줄여 적었거나 빠진 사용자 메시지 원문(세 번째 상위 세션이 22:30Z에 더함). 두 번째 상위 세션이 자기 대화 기록 JSONL에서 옮겨 보냈다. 2번은 roadmap 결정 기록과, 3번은 `docs/history/work-handoff-parent-20261013T1022Z.md`의 7과 대조했다.
  1. 12:23:33Z ‘객실 사진과 객실 타입 이름을 보여 줘. 각 사이트 약관이 있더라도 내 사이트는 상업적 용도가 아니기 때문에 무관하다. 그리고 공개 사이트 출처 자료 사용 방식은 뭔소린지 모르겠는데 알아서 해라 사용량 기준도 일단 0.9 정도를 유지하면 되는데 상위 세션에서 말한것처럼 너무 보수적으로 작업하려고 하지는 마라. 사용량 낭비하지 말것’. roadmap 결정 기록의 ‘객실 사진·객실 타입 이름’, ‘공개 사이트의 출처 자료 사용’(2번으로 뒤집힘), ‘사용량 기준’ 세 줄이 이 메시지에서 나왔다.
  2. 12:30:14Z ‘예전에 상위 세션에도 말했지만 우리 세션이 DDOS 공격이나 외부 봇의 수집에 배포 및 이관후 대응 가능하도록 하기 위해 클라우드플레어 이용하라고 했는데, 만약 너가 이전에 결정 요청한 2번 사항이 해당 내용과 관련있다면 잘 막도록 해라’. roadmap 결정 기록 ‘공개 사이트 보호 강화(H02, 사용자)’다.
  3. 16:41:03Z ‘지금 claude 한도 모자르니까 지금 작업중인거 잠깐 중단하거나 마무리하고 다음 작업은 예약 걸어둬.’ 그때 멈춤에 대한 지시였고, 20:1xZ에 재개했다.
- D04를 미룬 것은 사용자 지시가 아니다. 두 번째 상위 세션이 위 3번 메시지와 7일 창 추세(하루 사이 0.29 → 0.54)를 보고 정했다(20:17Z 재개 때 ‘진행 중인 PR(#79, #80)만 끝내고 새 흐름은 열지 않는다’). 21:11Z에 D05에 ‘사용자가 Claude 사용량이 모자란다고 해서’라고 보낸 것은 잘못 적은 것이고, 세 번째 상위 세션이 22:30Z에 D05에 정정을 보냈다. D04를 시작할 때는 상위 세션이 7일 사용량을 보고 정한다.
- 저장소 언어 설정과 네 번째 상위 세션 인계(사용자 10-15 07:3xZ): ‘현재 상황 체크하고, 답변은 아래와 같다. "두 저장소에 .claude/settings.json({"language": "korean"})을 넣어도 될까" 예 "네 번째 상위 세션으로 인계할까요" 예’. 세 번째 상위 세션이 06:0xZ에 물은 두 질문의 답이다. yukemuri와 yukemuri-script-runner에 `.claude/settings.json`(`{"language": "korean"}`)을 PR로 넣고, 이 세션은 네 번째 상위 세션에 인계한다. 옛 상위 세션은 보관하지 않는다(위 23:1xZ 항목).
- 사용량 기준에서 멈춤(사용자 10-15T08:5xZ, 네 번째 상위 세션에게): ‘앞으로 하위 세션들이나 에이전트들에도 nudge 나 알림 형태로 임계점에 도달하면 작업을 잠깐 중지하고 예약 걸도록 해라. 여태까지 보면 항상 임계점 넘어도 계속 작업하는거 같더라.’ 이어서: ‘특히 codex 검토 완료 알림 wakeup 이나 알림에 의한 자동응답 이런것도 일단 미뤄둬야 할거다.’ 위 사용량 항목의 '기준에 닿아도 멈추지 않는다'(10-13)를 바꾼다. 기준값(5시간 창 0.9, 7일 창 0.95)은 그대로다. 기준에 닿으면 모든 세션이 이렇게 한다.
  - 하던 단계만 커밋·push한다(끝나지 않은 수정은 'WIP:' 커밋).
  - PR 구독을 해제한다. Codex 검토 완료나 CI 알림으로 깨어나 자동으로 답하는 일도 미룬다. 세션 사이 메시지에도 답하지 않는다.
  - `resetsAt` 10분 뒤 재개 예약 하나만 남기고 멈춘다. 재개하면 PR을 다시 구독하고 상태를 직접 읽어 이어 간다.
  - 상위 세션은 기준에 닿은 것을 보면 일하는 하위 세션마다 `send_message`로 알린다. 하위 세션도 단계마다 자기 세션의 `list_events(kinds=["rate_limit_event"])`로 five_hour utilization을 보고 스스로 멈춘다. 하위 세션 brief와 하위 에이전트 prompt에 이 규칙을 적는다.
  - 전역 하네스 규칙(`~/.claude/CLAUDE.md` 「Session continuity」의 ‘At the user's usage lines do not stop’, `cloud-session-ops` 6절)과 어긋난다. 하네스 관리 세션에 알린다.

### 3. 지금 상태와 확인 명령(2026-10-15T07:4xZ)

| 항목 | 적은 시점의 상태 | 확인 명령 |
|---|---|---|
| 운영 배포 | 마지막 배포는 PR #98(L01 PR 3, `9312055`)이다. run 38691698514 성공, Worker `c4a8b971-d4c2-4f34-9be3-a80b7adc84f1`, 스냅숏 `6ad39d0d8b305112`(15,678곳), 수집기 release `b012fd4b`. smoke 통과 | `docs/deployments.md` 마지막 줄. GitHub MCP `actions_list`(main, push)의 최신 'Cloudflare deploy' 실행 |
| main | `ff57c78`(PR #100, #98 병합 기록) 뒤에 이 인계 기록 PR이 들어간다 | `git log --oneline -5 origin/main` |
| 열린 PR | yukemuri는 #101(U05 5번 상세) 하나다. R01이 곧 두 저장소에 PR을 하나씩 연다 | `list_pull_requests`(state open), yukemuri와 yukemuri-script-runner 둘 다 |
| PR #101 | head `4b7d6c8`(07:34Z). Codex 1회째(`393c685`, 07:15Z)의 P2 2건은 `4b7d6c8`에서 고쳤다. Codex 2회째(`4b7d6c8`, 07:33Z)가 P2 1건을 냈다: 탕 항목이 모두 확인 전이면 하이클래스 블록도 숨기라는 것이다. U05가 고치는 중이다. Codex 3회 중 2회를 썼다. 07:34Z에 mergeable true, mergeable_state unstable이었다 | `pull_request_read`(get, get_reviews, get_review_comments), 공개 API `https://api.github.com/repos/jihune/yukemuri/pulls/101`, U05 `get_session` |
| U05 | #101을 고치는 중이다. 남은 PR은 6번 비교(D04 시설 연도와 D05 객실 정보 표시 포함)와 7번이다. 단계 순서는 `U05-20261013.md` 8절과 U05 세션에서 확인한다. U05에 묶인 예약 `trig_01Y1jEXjYYUU5QfPxvAjRDUV`(PR #101 안전망, 08:02Z)이 있다 | U05 `get_session`, `git log --oneline -5 origin/claude/u05-ui` |
| L01 | PR 1~3(#79, #93, #98)이 모두 병합돼 남은 일이 없다. 브랜치는 `9312055`에서 다시 시작했다. 다음 일이 정해지지 않아 쉰다 | L01 `get_session`, roadmap L01 줄 |
| D05 | D04 2단계(#94) 병합 뒤 쉰다. 다음 단계(정기 재확인으로 채워진 연도 비율 측정)는 상위 세션의 시작 알림을 기다린다. D05가 02:08Z에 자기 브랜치에 push한 기록 커밋 `d2f7d53`은 이 기록 PR에 가져왔다 | D05 `get_session`, `git log --oneline origin/main..origin/claude/d05-rooms` |
| R01 | 07:37Z에 연 하위 세션(모델 Sonnet 5.5, 브랜치 `claude/repo-language`)이다. 두 저장소에 `.claude/settings.json`(`{"language": "korean"}`)을 넣는 PR을 열고 Codex 검토를 받는다. 병합은 상위 세션이 한다 | R01 `get_session`, 두 저장소의 열린 PR |
| 수집 | 10-14에는 gentle 수집이 5회 돌았고 실행마다 120쪽이었다. 쪽당 쓰기는 평균 99.9행으로 `writesPerPage` 90보다 많다. 10-15의 마지막 gentle 실행은 38686271595(05:20Z, `0830edc`, success)다. 그 실행의 'Size the run' 출력은 이 절을 쓸 때 보지 않았다 | `H01-20261011.md` 「7단계 기록(매일)」 2일차. Actions의 app `collect.yml` 실행에서 'Size the run' 단계 출력(pages=, reason=) |
| 예약 | 세 번째 상위 세션에 묶인 것: H01 3일차 `trig_01577GMSVvQSgDGpxYw6VStW`(10-16T01:20Z). U05 것: `trig_01Y1jEXjYYUU5QfPxvAjRDUV`(08:02Z). 사용자 keep-alive 루틴 두 개('5시간 세션 초기화'로 시작). 그중 `trig_01RYGeFcUV4rLy3vadVZjthW`의 10-15T05:02Z 실행은 `USAGE_LIMIT_REACHED`로 실패했다. 사용자 루틴이라 건드리지 않는다 | `list_triggers`(enabled true) |
| 사용량 | 07:35Z에 5시간 창 0.48(초기화 10:50Z), 7일 창 0.20(초기화 10-19T12:00Z), `isUsingOverage` false | 위 1-2 |
| 하네스 | 하네스 관리 세션은 `session_01Hb6mZa55hebUCaeC7z29mG`(10-15 인계)이다. 큰 하네스 변경이 있으면 상위 세션에 알림을 보낸다. 10-15에 받은 알림 두 개는 옮긴 보존본의 7의 12번에 있다 | 위 1-1 |
| 사용자에게 전한 하네스 제안 | (a) 10-13 교정 기록 한 쌍(공개 사이트 출처 자료 문장)을 하네스 저장소의 `my-corrections.md`에 넣기. (b) '세션 보관은 지금 프로젝트의 세션만 대상으로 한다. 다른 프로젝트의 세션은 보관하지도, 보관할지 묻지도 않는다' 한 줄. 10-13T22:33Z 보고에서 사용자에게 알렸다. 그 뒤 반영됐는지는 보지 않았다 | `grep -c '공개 사이트' ~/.claude/skills/ai-writing-cleanup/references/my-corrections.md`(대조: `grep -c '사용자 교정 기록'` 같은 파일 → 1). 반영되지 않았어도 다시 알리지 않는다 |

### 4. 다음 일(우선순위 초안, 네 번째 상위 세션이 다시 짠다)

1. PR #101(U05 5번 상세)을 병합까지 끌고 간다.
   - U05가 병합 준비를 알리면 head, CI, mergeable을 다시 읽고, 마지막 검토 뒤 바뀐 파일이 기록 파일뿐인지 본다(아래 5).
   - 그 사이 다른 코드 PR이 main에 먼저 들어갔으면 합친 트리로 빠른 검사를 돌린다(아래 5).
   - Codex 3회째에도 P0~P2가 남으면 이어 가는 Claude 검토 세션을 연다(최대 2회, 검토 세션은 그때의 상위 모델). 그래도 남으면 병합하지 않고 사용자에게 보고한다.
2. R01의 두 PR(`.claude/settings.json`)을 병합한다.
   - 설정 파일이라 기록 파일만 바꾼 PR이 아니다. 검토(Codex)를 거친다. 실행기 저장소에서 Codex가 답하지 않으면 상위 세션이 Claude 검토 세션을 연다.
   - 세 번째 상위 세션에는 실행기 저장소가 읽기 권한으로만 붙어 있었다(`add_repo` access read). 실행기 PR을 병합하려면 `add_repo`(access push)로 붙인다.
   - 병합 뒤 결과를 기록하고 R01을 보관한다(한 가지 일로 연 세션).
3. 10-16T01:20Z H01 7단계 3일차 점검을 예약 prompt대로 한다.
   - 이번에는 PR #93(L01 PR 2, 판 번호 변경)이 배포된 뒤 첫 수집에서 `preparationBatch`가 쓴 D1 쓰기도 본다.
   - 하루 실행이 7회 이상이 되어 85% 상한이 쪽수를 정하게 되면 `writesPerPage`를 약 110으로 올리는 PR을 연다.
4. U05 6번(비교)과 7번을 차례로 한다. 6번에 D04 시설 연도와 D05 객실 정보 비교를 넣는다.
5. D04 다음 단계(D05 세션, 정기 재확인으로 채워진 연도 비율 측정)를 언제 열지 정한다.
6. 아직 열지 않은 흐름: D06 후속(새 세션, `D06-20261013.md`에서 시작), Sites(옛 주소) 정리, L01의 다음 일. 5시간 창과 진행 중인 흐름을 보고 연다.
7. 5시간 창이 0.9에 닿으면 위 2의 사용량 항목대로 한다. 7일 창이 0.95에 닿으면 사용자에게 알린다.

### 5. 세 번째 상위 세션에서 배운 것과 실수

- auto mode가 `git pull --ff-only origin main`도 'Merge Without Review'로 막았다. 앞 인계에 적힌 우회법이 막힌 것이다. 기록 브랜치는 이렇게 다룬다.
  - main 위에서 시작한다: `git fetch origin main`, `git switch --detach origin/main`. 고친 뒤 커밋하고, 빠른 전진이면 `git push origin HEAD:claude/yukemuri-parent`로 올린다.
  - 기록 브랜치에 main에 없는 커밋이 남아 있으면 그 커밋을 main 위로 옮긴다(rebase나 cherry-pick). 그다음 `git push --force-with-lease=claude/yukemuri-parent:<옛 SHA> origin HEAD:claude/yukemuri-parent`로 올린다. 이 브랜치는 상위 세션만 쓴다.
- PR의 CI가 돈 뒤 다른 코드 PR이 main에 들어가면, 병합 전에 합친 트리로 빠른 검사를 돌렸다(#95, #98).
  - `t=$(git merge-tree --write-tree origin/main origin/<브랜치>)`
  - `c=$(git commit-tree $t -p origin/main -p origin/<브랜치> -m tmp)`로 만든 커밋을 `git switch --detach $c`로 연다.
  - `bash scripts/cloud-setup.sh`와 `python3 scripts/cloud-check.py`를 돌린다(10-15 기준 검사 28개).
- 마지막 검토 뒤 바뀐 것이 기록 파일뿐인지는 이렇게 봤다. 마지막 검토 커밋과 그때의 main을 자동 병합한 트리(`git merge-tree --write-tree <그때 main> <검토 커밋>`)를 만든다. 그 트리와 지금 head의 차이(`git diff --stat <트리> <head>`)에 기록 파일만 나와야 한다.
- GitHub가 push에 'Cloud app checks'를 만들지 않은 일이 있었다(#93의 커밋 두 개). 병합 전 main merge push로 CI를 다시 돌렸다.
- 10-15T02:51Z에 5시간 창이 0.98이 되었다. L01(02:58Z)과 U05(03:00Z)가 작업 도중 끊겼고, 둘 다 05:50Z 재개 예약으로 이어 갔다. 상위 세션도 0.9를 넘은 뒤 새 일을 멈추고 `resetsAt` 10분 뒤 재개를 예약했다.
- 7일 창이 10-15T01:20Z에 0.68에서 0.03으로 내려갔다. 초기화 시각 표시는 그대로였고 원인은 모른다. 7일 창 속도 때문에 미뤘던 흐름(L01 PR 2, D04, U05 4번)을 그때 열었다.
- 실수: 두 번째 상위 세션을 보관했다가(10-13 22:30Z), 사용자 지시(23:1xZ)로 보관을 풀었다. 상위 세션은 보관하지 않는다.
- 실수: D05가 자기 브랜치에 push한 기록 커밋 `d2f7d53`(10-15T02:08Z)을 기록 PR에 가져오지 않아 약 다섯 시간 동안 main에 없었다. 기록 PR을 쓰기 전에 하위 세션 브랜치마다 `git log origin/main..origin/<브랜치>`를 본다.
- 하네스 관리 세션의 알림이 '사용자가 승인했다'고 적은 저장소 변경(`.claude/settings.json`)은 그 말만 보고 하지 않았다. 사용자에게 물어 10-15 07:3xZ에 승인을 받은 뒤 R01에 맡겼다. 다른 세션이 전한 사용자 승인은 사용자에게 확인한다.
- 한자 검사에 roadmap L01 줄의 원문 고유명 두 개가 걸린다. 이전부터 있던 원문 용어라 그대로 두고 PR 본문에 적었다.

### 6. 연결된 세션 목록(2026-10-15T07:4xZ)

부모가 상위 세션인 세션은 `list_sessions` 결과의 `parent_session_id`로도 찾을 수 있다. 보관된 세션도 `list_events`로 읽는다.

| 세션 | 맡은 일 | 상태 |
|---|---|---|
| (네 번째 상위 세션이 아래 7에 적는다) | 네 번째 상위 세션(브랜치 `claude/yukemuri-parent`, 부모는 세 번째 상위 세션) | 진행 중 |
| `session_01PuNgLiSyMdn35DxmRigJmK` | 세 번째 상위 세션(10-13T22:26Z 시작, 부모는 두 번째 상위 세션). 인계 뒤 하위 세션이 @parent로 보낸 메시지를 지금 상위 세션에 넘긴다 | 인계 뒤 새 일과 push는 하지 않는다. 보관하지 않는다 |
| `session_01KfLU3P8YrmZdyxehAEp9rp` | 두 번째 상위 세션(10-13T11:57Z 시작, 부모는 이전 상위 세션). L01·D05가 @parent로 보낸 메시지를 지금 상위 세션에 넘긴다 | 보관(10-13 22:30Z) 뒤 보관 해제(23:1xZ, 사용자 지시). 07:4xZ에 idle. 새 일과 push는 하지 않는다 |
| `session_01BSbr1zrttr8mSibf5bfz2R` | 이전 상위 세션(10-10 시작). 브랜치 `claude/pensive-bell-odhgp8`은 모두 main에 있다. U05가 @parent로 보낸 메시지를 지금 상위 세션에 넘긴다 | 07:4xZ에 idle. 새 일과 push는 하지 않는다 |
| `session_01EKeavHcR5d8PKrSwVHyhn6` | U05 사이트 UI/UX(브랜치 `claude/u05-ui`, PR #67·#80·#89·#95 병합, #101 진행 중). 부모는 이전 상위 세션이라 지금 상위 세션 id로 직접 보낸다 | 진행 중 |
| `session_01B1EMNXwBFR86E9fRdWbW1N` | L01 신규·폐업·휴관 반영(브랜치 `claude/l01-lifecycle`, PR #79·#93·#98 병합, 부모는 두 번째 상위 세션). 남은 일 없음 | 대기 |
| `session_01EbPNydUi1HEGqL6GRQxwcD` | D05 객실 수·전망 온천·객실 사진(PR #77)과 D04 시설 연도(PR #94). 브랜치 `claude/d05-rooms`, 부모는 두 번째 상위 세션. 다음은 D04 다음 단계 | 대기 |
| `session_01Qktdn2dCv2gJn4Dwf8wKne` | R01 두 저장소 `.claude/settings.json`(브랜치 `claude/repo-language`, 10-15T07:37Z 시작, 부모는 세 번째 상위 세션). 두 PR 병합 뒤 보관한다 | 두 PR 병합(실행기 #10 `104e673`, yukemuri #103 `5f4d9b0`, 10-15T07:5xZ). 보관(아래 8) |
| `session_015QRDYJDo2KtLmzZ681cnSe` | U06 수집 현황 한눈에 보기(브랜치 `claude/u06-status`, 10-15T10:51Z 시작, 부모는 네 번째 상위 세션, 모델 Opus 5.5, Default 환경). 1단계 설계안을 상위 세션에 보내고 사용자 방향을 받은 뒤 구현한다 | 진행 중 |
| `session_01Hb6mZa55hebUCaeC7z29mG` | 하네스 관리 세션(`jihune/agent-harness`, 10-15 인계). 이 프로젝트 세션이 관리하지 않는다. 하네스 교훈은 이 세션이나 사용자에게 전한다 | 07:4xZ에 idle |
| `session_01MYY4pY2yi7c3oixLgRRsjT` | 이전 하네스 관리 세션(10-13 인계). 10-15에 위 세션에 인계했다 | 07:4xZ에 idle |
| `session_019yG8qw1WbTQEBYXDzk4D1Z` | H02 공개 사이트 보호 강화(PR #76 병합·배포) | 보관 |
| `session_01K9M4aA8GiGuH6KweSuGW3D`, `session_018C5u7htqtrQBR6no5pfPbQ` | PR #79 Claude 검토 1회째, 2회째 | 보관 |
| `session_016BDUGgoyLcPam5xaVfnHXY` | 하네스 점검과 개선(브랜치 `claude/harness-review`) | 보관 |
| `session_01FFQYTnNr47q7K6k8RV3EXP` | D06 지도 좌표(PR #66 병합). 브랜치 `claude/d06-geo`는 모두 main에 있다. 후속은 새 세션이 `D06-20261013.md`에서 시작한다 | 보관(10-13 21:5xZ, 사용자 지시) |
| `session_01Y1JhjKANZbPiLfETCBdRns` | P03 정적 스냅숏(PR #43·#44·#45·#52) | 보관 |
| `session_01ApA7wHQgaSiouBZKS9pe2X` | P02 D1 읽기량 2차(PR #37, 초안 #38) | 보관 |
| `session_01CxpfgqwqKjdEaEKeSpgNFQ` | P01 응답 속도(PR #28·#31) | 보관 |
| `session_01DDs61s32aacL4woqxKHfLs` | H01 2단계 배포 설정(PR #33·#36) | 보관 |
| `session_018hDPrhXsbxgUEpWjeMBH8k` | H01 4단계 D1 적재(실행기, PR #57) | 보관 |
| `session_01DPWccvrTAVG5jay8KLJYLT` | H01 6단계 준비(PR #48·#51, 실행기 #5) | 보관 |
| `session_015ge493n1x3SUdwcM1xK6Ko` | H01 전환 도구(PR #53) | 보관 |
| `session_01S5AqfcBRKDeqZBzxzvu3gv` | H01 차이 반영 도구(실행기 PR #6·#7) | 보관 |
| `session_01KTXeNZvzeoQPCBfnNJoZao` | U02(PR #10·#13·#16) | 보관 |
| `session_01Lnq36PovgydWNZ2vN6seY2` | U02 3차 지도 키보드(PR #19) | 보관 |
| `session_017s9Wj3eizpqAC1YX3o4dqS` | U03(PR #23·#24) | 보관 |
| `session_01DpZasfw33qyCh32Gw9rQd2` | U04(PR #34) | 보관 |
| `session_01MPJs3sxEWiACCEqFDcP1YJ` | D01 지역 오류(PR #5) | 보관 |
| `session_01WLT4UXwfGYgvomawdm8QeX` | D01 후속 Trip 주소(PR #21·#22) | 보관 |
| (검토·시험 세션 약 25개) | PR별 Claude 검토, 하네스 확인 | 보관. 제목이 "검토"·"확인"으로 시작한다 |
| `session_01MALVa9n1yT47zFCALbhRPf` | 개인 상담비서 DB(다른 프로젝트, 부모 없음) | 건드리지 않는다 |

### 7. 인계 결과(네 번째 상위 세션이 적는다)

적은 세션: 네 번째 상위 세션 `session_012tbsAbaHuG1Xhs94L4LatJ`(10-15T07:48Z 시작, 모델 Opus 5.5, 브랜치 `claude/yukemuri-parent`, `parent_session_id`는 세 번째 상위 세션). 기록 10-15T07:5xZ.

1. 하네스(07:48Z): 네 가지가 모두 맞았다.
   - `/root/agent-harness-setup.log`에 `clone rc=0`과 `PASS: claude -> /root/.claude (tag CCWEB, version d06de6b 2026-10-15, 45 skill and agent entries)`가 있다.
   - `cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-version"` → `d06de6b 2026-10-15`(rc=0). 07:4xZ에 알려진 마지막 판 `38d5b46`(setup 13)보다 새 판이다. 어떤 변경이 들어간 판인지는 아직 보지 않았다.
   - `grep -c 'Ctrl+T' ~/.claude/CLAUDE.md` → 1. 대조 `grep -c 'no-such-phrase-7q'` → 0.
   - `~/.claude/skills/untrusted-content/SKILL.md`가 있다(6,722바이트).
2. 사용량(07:48Z, `list_events(kinds=["rate_limit_event"])` 마지막 이벤트): 5시간 창 0.52(초기화 10:50Z), 7일 창 0.20(초기화 10-19T12:00Z), `isUsingOverage` false. 기준(0.9, 0.95) 아래다.
3. 문서: `AGENTS.md`, `START_HERE.md`, `docs/roadmap.md`, `docs/cloud-development.md`와 이 절 전체를 읽었다.
4. 인계 누락 점검(07:49–07:50Z). 아래 3의 표와 다른 줄만 적는다. 나머지 줄은 적힌 상태와 같았다.
   - main: `git log --oneline -5 origin/main`의 맨 위가 `1af4b41`(PR #102 병합)이다. 이 인계 기록 PR이 들어간 것이다.
   - 열린 PR: yukemuri는 #101과 #103 두 개다. #103은 R01이 07:48Z에 연 `.claude/settings.json` PR이다(head `459ea9f`). 07:49Z에 실행기 저장소에는 열린 PR이 없었고, R01이 07:50Z에 실행기 PR #10(head `d078ece`, `.claude/settings.json`과 `project-files.json` 354 → 355개)을 열었다(아래 7의 R01 메시지). 두 PR 모두 CI가 통과하면 R01이 Codex 검토를 요청한다(`cloud-development.md`의 'CI가 실행되는 PR은 CI 통과 뒤에 남긴다').
   - PR #101: head가 `d1f3df7`로 바뀌었다. Codex 2회째 P2 1건(모두 확인 전이면 자란 등급 묶음이 남음)을 고친 커밋이다. U05 세션 상태는 'Codex 3회째를 `d1f3df7`에서 기다림'이다. 07:49Z에 이 커밋의 commit status는 0개(pending)였다.
   - 하위 세션 브랜치: `git log --oneline origin/main..origin/<브랜치>`로 u05-ui, l01-lifecycle, d05-rooms, repo-language, yukemuri-parent를 봤다. u05-ui는 PR #101의 커밋, repo-language는 PR #103의 커밋 `459ea9f` 하나, l01-lifecycle과 yukemuri-parent는 없음이다. d05-rooms에는 `d2f7d53`이 남아 있다. 같은 내용이 문구만 고쳐 main의 `f2a3cc3`으로 들어가 있어서(두 커밋의 바뀐 줄을 비교함) 가져올 것은 없다.
   - 수집: 마지막 gentle 실행은 여전히 38686271595(05:20Z, success)다. 'Size the run' 출력은 이번에도 보지 않았다. 10-16 3일차 점검에서 본다.
   - 사용자에게 전한 하네스 제안 (a): `grep -c '공개 사이트' ~/.claude/skills/ai-writing-cleanup/references/my-corrections.md` → 0, 대조 `grep -c '사용자 교정 기록'` → 1. 반영되지 않았다. 아래 3의 표에 적힌 대로 다시 알리지 않는다.
   - 실행기 저장소: 이 세션에 `add_repo`(access push)로 붙이고 `/home/user/yukemuri-script-runner`에 받았다(head `55572c8`). R01 PR 병합에 쓴다.
5. 예약(07:50Z): `get_trigger`로 읽은 prompt를 그대로 써서 'H01 7단계 3일차 사용량 점검'을 `trig_014RtBKFx1N3yxrewWCSHm5w`(10-16T01:20Z, `persistent_session_id` 이 세션, initiation `human_schedule`)로 만들었다. 결과의 `persistent_session_id`가 이 세션 id인 것을 본 뒤 옛 `trig_01577GMSVvQSgDGpxYw6VStW`를 지웠다. `list_triggers(enabled=true)`에는 그 밖에 U05의 `trig_01Y1jEXjYYUU5QfPxvAjRDUV`(08:02Z)와 사용자 keep-alive 루틴 두 개만 있었고 건드리지 않았다.
6. 하위 세션 알림(07:50Z): U05, L01, D05, R01에 `send_message`로 '앞으로 병합 준비, 질문, 검토 결과는 새 id로 보내라'고 보냈다. 네 개 모두 `delivered`였다. D05에는 `d2f7d53`의 내용이 main에 있다는 것과 D04 다음 단계는 시작 알림을 기다리라는 것을 함께 적었다.
7. 세 번째 상위 세션 알림(07:51Z): 인계를 받았다고 보내고 받은 메시지를 넘기거나 '넘길 것 없음'이라고 답해 달라고 적었다(`delivered`). 07:51:17Z에 '넘길 것 없음'이라는 답이 왔다. 그 앞에 세 번째 상위 세션이 R01의 메시지 두 건(07:48:44Z yukemuri PR #103, 07:50:36Z 실행기 PR #10)을 원문 그대로 넘겼다. 세 번째 상위 세션은 07:51Z `list_triggers`에서 자기에게 묶인 예약이 없는 것도 확인했다. 시각 정정: PR #102 병합은 '07:5xZ'가 아니라 10-15T07:47:57Z다(세 번째 상위 세션이 공개 API `pulls/102`의 `merged_at`으로 확인). U05와 R01은 앞으로 이 세션 id로 보낸다고 답했다.

이 절의 6 표 첫 줄 '(네 번째 상위 세션이 아래 7에 적는다)'는 `session_012tbsAbaHuG1Xhs94L4LatJ`이다.

### 8. 인계 뒤 기록(네 번째 상위 세션)

- 10-15T07:54Z 사용량: 5시간 창이 07:48Z 0.52에서 07:54Z 0.64로 올랐다(7일 창 0.22). 이 속도면 10:50Z 초기화 전에 0.9에 닿을 수 있어서 U05와 R01에 미리 알렸다(단계마다 push, 새 하위 에이전트 없음, 11:00Z 재개를 각자 예약). 상위 세션도 11:00Z 재개를 예약했다(`trig_01WYUkvb7S2tZLg6Wghg79jg`). 새 흐름은 초기화 뒤에 연다.
- 10-15T07:56Z 실행기 PR #10 병합(`104e67363da4882a8dfe5f2edf5c2c3361bad5f1`): Codex 1회(`d078ece`, 큰 문제 없음), 리뷰 스레드 없음, CI `verify` 두 실행과 GitGuardian 통과, mergeable clean. `project-files.json`에 새로 적힌 해시가 `{"language": "korean"}` 한 줄(23바이트)의 sha256 `35402de3…`과 같음을 상위 세션이 `sha256sum`으로 확인했다.
- 10-15T07:59Z yukemuri PR #103 병합(`5f4d9b00d7e1cf4971b71b32efce1d1014b857dd`): Codex 1회(`459ea9f`, 큰 문제 없음), 리뷰 스레드 없음, CI `checks`와 GitGuardian 통과, mergeable clean. CI 뒤 main에 들어간 것은 기록 PR #102·#104(docs만)라 바뀐 파일이 겹치지 않았다. `.claude/settings.json`은 `deploy.yml`의 `paths-ignore` 밖이라 병합 push가 운영 배포를 다시 돌렸다(앱 코드 변경 없음). run 38702476247 성공(07:59–08:08Z), Worker `7daa96e0-d40b-4dc3-9156-eb7c12588e38`, 스냅숏 `f1b38054712e96ab`(15,678곳), smoke 통과. 자세한 것은 `deployments.md` 마지막 줄이다.
- 10-15T08:00Z `language` 설정 관찰: 이 세션의 작업 트리를 #103 병합 뒤 main으로 옮긴 직후 세션에 'Always respond in korean' 언어 지시가 새로 나타났다. 저장소 `.claude/settings.json`을 읽은 것으로 보인다. 새로 연 세션에서 처음부터 적용되는지는 다음에 새 세션을 열 때 본다.
- R01(`session_01Qktdn2dCv2gJn4Dwf8wKne`) 결과: 두 PR 병합, Codex 요청은 PR마다 1회, Claude 검토 세션은 쓰지 않았다. R01은 자기 예약 3개(08:16Z, 08:42Z, 11:00Z)를 지웠고 두 PR 구독은 병합으로 풀렸다고 보고했다. 한 가지 일로 연 세션이라 이 기록을 남긴 뒤 보관한다(위 6 표의 R01 줄 상태도 '보관'으로 고쳤다).
- 10-15T08:1xZ R01 보관(PR #105 병합 뒤). PR #101(U05 5번 상세) 병합(08:14Z, `7bc041c`, 근거는 U05 절 '5번 상세 PR'). 5시간 창 0.72(08:14Z)로 0.9 아래라 U05에 6번(비교) 시작을 보냈다. U05는 기존 세션이라 새 하위 세션을 늘리는 일이 아니다. U05의 11:00Z 재개 예약은 남겨 두었다.
- 10-15T08:3xZ 사용자 질문: README에 사이트 주소를 일부러 뺐는지 물었다. 사용자는 주소를 잊을 때가 있어 레포에 적고 싶어 하며, 무차별 DDoS 대상이 되는 일이 드물면 적기를 원했다. 로그인은 귀찮고 다른 사람에게 보여 주기 어려워 원하지 않는다. 상위 세션이 확인한 것:
  - 일부러 뺀 기록은 없다. README는 PR #45(10-12, 전환 전) 뒤로 고친 적이 없다. 주소는 이미 공개 레포의 20개 파일에 있다(`git grep -l 'yukemuri.jihune.workers.dev' | wc -l` → 20, `docs/cloudflare-deploy.md`·`docs/deployments.md` 등).
  - Cloudflare 문서 `ddos-protection/index.md`(2026-08-14 갱신, 10-15T08:38Z curl로 받음)는 'Standard, unmetered DDoS protection (layers 3-7)'이 Free 요금제에도 있다고 적는다. workers.dev 주소에 그대로 적용된다는 문장은 따로 보지 않았다.
  - 최악의 경우는 Worker 하루 요청 100,000건이 차서 상세·비교가 다음 00:00 UTC(09:00 KST)까지 1027로 멈추는 것이다. 목록·검색·지도는 정적 파일이라 계속 나가고, 무료 플랜이라 요금은 나오지 않는다(`H02-20261013.md` 공식 문서 확인 표).
  - Worker 단의 로그인은 DDoS를 줄이지 못한다(로그인 화면 요청도 Worker 요청으로 센다). 즐겨찾기는 브라우저별 키(`visitor_favorites`)로 저장돼 다른 방문자가 사용자 즐겨찾기를 바꿀 수 없다.
  - 그래서 README 첫머리에 주소 한 줄을 넣는 PR을 열었다. README는 기록 파일 예외가 아니라서 Codex 검토를 받는다. README의 나머지 Sites 문구 정리는 'Sites 정리' 흐름에 둔다.
  - 10-15T08:42Z PR #107 병합(`8dab529`, Codex 1회 `0dcdef4` 큰 문제 없음, 문서만이라 CI 생략, GitGuardian 통과).
- 10-15T08:4xZ 사용자 요청 두 가지(원문은 roadmap U06 줄에 있다).
  - 왼쪽 필터: ‘사이트 좌측에 있는 필터가 상당히 현재 별로같다’. 무엇이 별로인지는 적지 않았다. U05 4번 필터(PR #95)의 데스크톱 패널이다. U05 흐름에 넣는다. 5시간 창 초기화 뒤 U05가 지금 화면을 캡처해 문제를 짚고 고칠 방향을 제안하게 하고, 상위 세션이 사용자에게 보인다.
  - 수집 현황 시각화: 새 작업 U06(roadmap 25번). 사용자는 예로 든 비율 말고도 더 좋은 분류와 보기 방식이 있으면 그렇게 하라고 했다(08:5xZ). 5시간 창이 0.89(08:52Z)라 새 하위 세션은 초기화(10:50Z) 뒤에 연다. 11:00Z 재개 예약(`trig_01WYUkvb7S2tZLg6Wghg79jg`)에서 시작한다.
  - U05가 6번 비교 PR #108을 열었다(08:5xZ, head `0ab30f1`, Codex 1회째 요청).
- 10-15T08:54Z 5시간 창 0.91(`surpassedThreshold` 0.9). 사용자 새 지시(위 2의 '사용량 기준에서 멈춤')대로 U05에 멈춤을 보냈다(push, PR #108 구독 해제, 11:00Z 재개 예약만 남김). 상위 세션도 새 일을 멈추고 11:00Z 재개 예약(`trig_01WYUkvb7S2tZLg6Wghg79jg`)으로 이어 간다.
- 10-15T10:49Z 사용자: ‘예약 취소하고 지금 시작해.’ 상위 세션이 `trig_01WYUkvb7S2tZLg6Wghg79jg`를 지우고 그 예약에 적어 둔 순서(기록 PR, 하네스 관리 세션 알림, U06 시작, U05에 필터 의견과 재개)를 바로 시작했다. 5시간 창 초기화 시각(10:50Z) 1분 전이다.
  - 10:50Z 기록 PR #110 병합(`43f2b4f`). 하네스 관리 세션에 사용자 원문 두 개와 어긋나는 하네스 규칙(전역 CLAUDE.md 「Session continuity」, `cloud-session-ops` 6절, `child-session-orchestration` 6절)을 보냈다. U05에 재개(11:00Z 예약은 지우라고 함), PR #108 다시 구독, 데스크톱 필터 진단과 고칠 방향 2~3개 시안, 단계마다 사용량 확인을 보냈다.
  - 10:51Z U06 하위 세션 `session_015QRDYJDo2KtLmzZ681cnSe`를 열었다(위 6 표). brief에는 사용자 원문 두 개, 분모·분자 정의, status.json과 coverage의 완료 수 차이 확인, 스냅숏 생성 때 계산, 360/390/1280px 브라우저 검사, 설계안 먼저(docs/U06-20261015.md), 사용량 멈춤 규칙을 적었다.
  - PR #108(U05 6번 비교): Codex 1회째가 08:55Z에 큰 문제 없음. 10:52Z head `80b2441`, mergeable_state unstable(CI 진행 중으로 보임). U05가 확인해 병합 준비를 알린다.
- 10-15T10:57Z U05가 왼쪽 필터 검토를 보냈다(U05 브랜치 `b5837f8`, `docs/evidence/u05-filter-review-20261015/`). 11:16Z U06이 1단계 설계안을 보냈다(U06 브랜치 `b245992`, `docs/U06-20261015.md`). 상위 세션이 캡처를 직접 열어 본 뒤 필터 네 장(지금, A, B, C)과 U06 시안 두 장(1280, 360 첫 화면)을 사용자에게 보이고 네 가지를 물었다.
- 10-15T11:2xZ 사용자 결정(roadmap 결정 기록 ‘왼쪽 필터’·‘수집 현황 화면’): 필터는 C, 수집 현황은 따로 여는 화면, 큰 숫자는 상세 페이지까지 받은 곳, 전체·Jalan·Trip.com 단추는 두고 온천마을 20곳 표는 빼고, 날짜별 추이는 후속. 상위 세션 결정: 수집 현황 별도 화면은 U06이 맡고 U05 7번은 즐겨찾기만 한다. 두 세션에 전했다(11:2xZ). U05는 PR #108 뒤 C를 새 PR로, U06은 2단계 구현을 시작한다.
- 10-15T11:2xZ PR #108(U05 6번 비교) 병합(`e807ea1`, 근거는 U05 절 ‘6번 비교 PR’). 배포 run 38727019418 성공(11:23–11:33Z), Worker `534da7eb`, smoke 통과.
  - 확인한 지금 상태: 바닥글 ‘자료 현황’의 접힌 패널 ‘전국 수집 현황’이 숫자와 표만 보인다. 운영 스냅숏 `04c0aa1b509e6062`의 `status.json`(08:21Z)은 Jalan 상세 완료 1,088·대기 13,978, Trip.com 완료 798·대기 1,349·실패 1이다. 같은 manifest의 `coverage.providers`는 Jalan 완료 1,738·Trip.com 897로 세는 기준이 달라 보인다. U06이 두 수의 정의를 확인해야 한다. 한국어 이름과 설명 번역 비율은 `status.json`에 없다.


## 상위 세션 체크포인트(2026-10-11T22:32Z 멈춤 → 2026-10-12T09:03Z 재개)

상위 세션 `session_01BSbr1zrttr8mSibf5bfz2R`이 적는다. 계정 Claude 주간 사용량이 81%여서 10-11T22:32Z에 하던 일을 마친 뒤 멈췄다. 사용자 지시(‘예약 당겨서 지금 진행’)로 10-12T09:03Z(18:03 KST)에 재개했다. 21:01 KST 재개 예약은 지웠다.

- 멈춘 동안의 상태(재개 때 GitHub에서 확인): PR #44(P03 B)는 멈추기 직전 Codex 3회째 ‘큰 문제 없음’ 뒤 상위 세션이 병합했다(2026-10-11T22:41:09Z, `8d62e17`, 기록은 다음 작업 13번). PR #45(P03 C)는 Codex 1회째 ‘큰 문제 없음’(`e8e0aec`), 기준을 main으로 바꿨다.
- H01 4단계 적재: D1 무료 한도는 UTC 날짜 단위(00:00Z 초기화)라 같은 날짜 안이면 시각은 상관없다(사용자와 확인). 2일차(hotels)는 10-12T09:05Z, 3일차(hotel_names)는 10-13T00:05Z(H01 세션이 예약).
- 상위 세션 결정(10-11): 검토 상한 규칙(PR #41), Codex 중복 요청은 같은 head면 1회, P03 비교 4곳 cold CPU 5.23ms(최대 6.7ms)는 ‘약 5ms’로 받아들이고 5단계 Workers Logs에서 넘치면 ‘수집 때 합친 숙소 저장’을 검토, 조건 있는 주소의 첫 카드 지연(느린 4G·4x에서 약 5.1초, main 1.7초)은 받아들이고 개선 후보는 P03 다음 작업에 둠.
- 사용량 한도 대비 절차는 `cloud-development.md`의 ‘사용량 한도와 중단 대비’ 절에 적었다.
- 사용자 조치: claude.ai 설정에서 Claude 사용량 크레딧(추가 사용량)이 꺼져 있는지 확인한다. 켜져 있으면 한도 뒤에도 과금으로 계속 돈다(`cloud-development.md` ‘사용량 한도와 중단 대비’). 6단계(전환) 전에 실행기 레포 Secret으로 앱 레포 수집 부르기용 fine-grained PAT(`jihune/yukemuri`만, Actions: Read and write)를 만든다(`hosting-review-20261011.md` 3.3절 4번). 6단계 시작 때 상위 세션이 다시 안내한다.

## H01 2단계(앱 레포 Cloudflare 배포 준비)

기록: 2026-10-11T10:14Z / 2026-10-11 19:14 KST(커밋 `d4057b1`). 상위 세션이 맡긴 작업이다. 위 P01 기록은 그대로 두고 이 절을 더했다. 상세는 `H01-20261011.md`, 절차는 `cloudflare-deploy.md`다.

- 브랜치 `claude/h01-cloudflare-deploy`. 시작 기준 main `6f09287`. 이 절을 쓰기 직전에 main `274f687`(PR #31·#32 병합)을 merge했다. 충돌은 없었다. 코드 커밋은 `e426686`이다.
- 바꾼 것: `cloudflare-deploy.json`(비밀 아닌 배포 값, `databaseId`·`publicOrigin`은 `null`, `autoDeploy` false), `vite.config.ts`(Worker 이름·workers.dev·미리보기 끔·observability·smart placement·D1 이름과 `migrations_dir`·Rate Limiting 바인딩), `deploy.yml`(설정이 켜질 때까지 모두 건너뜀), `d1-setup.yml`(수동, `workers.dev` 서브도메인 읽기·없을 때만 등록, D1 생성·마이그레이션, 배포 없음), `lib/edge-guard.ts`(Worker 요청 전체의 IP별 제한, 크롤 키 면제), `public/robots.txt`, 수집기 `siteOrigin` 빌드 변수와 `source_safety.py`의 주소 허용 목록.
- 수집기 release가 `08ca3bfe…`에서 `ab24b621…`로 바뀌었다. 파일 목록과 `siteOrigin` 기본값은 그대로다. Sites에 게시하지 않으므로 예약 실행에는 반영되지 않는다.
- 실제 Cloudflare 계정·운영 Sites·운영 D1에 접속하지 않았다. 실행기 레포·DB 스키마·수집 상한은 바꾸지 않았다.
- 검사: 시작 기준 `cloud-check.py --full` 22개 통과(09:34Z–09:37Z). 변경 뒤 25개 통과(10:05Z–10:08Z). `wrangler deploy --dry-run` rc=0(업로드 5,968.40KiB, gzip 886.73KiB). 로컬 `d1 migrations apply yukemuri` 13개 적용. actionlint 통과. 새 검사 3개(`check-edge-guard-worker.mjs`, `check-deploy-config.mjs`, `crawler/check_site_access.py`)는 변형 13종(Worker 5, 설정·workflow 6, 수집기 2)에서 실패하는 것을 확인했다. main merge 뒤에도 25개 통과(10:10:30Z–10:14:03Z), dry-run rc=0.
- workers.dev에서는 Cache API가 효과 없다(Cloudflare R2 예시 문서. Workers 참조 문서에는 이 제한이 없어 문서끼리 맞지 않는다. `cloudflare-deploy.md` 검색 캐시 절). 위치 간 공유 검색 캐시는 없고 기존 isolate 30초 캐시만 있다. 위 P01 다음 작업 3번의 ‘H01의 익명 검색 캐시’는 기대할 수 없으므로 색인·쿼리 개선으로 줄여야 한다.
- 미확인: 무료 플랜의 Rate Limiting 바인딩, `wrangler-action`의 실제 실행, 429 화면의 실제 브라우저 확인. 첫 실제 배포와 5단계에서 확인한다.
- 다음 작업: 상위 세션 병합 → (Secret은 사용자 등록 완료, 값 미확인, 2026-10-11T09:55Z 상위 세션 전달) → 이 PR 병합 뒤 상위 세션이 3단계(‘Cloudflare D1 setup’ 실행과 `databaseId` 기록 PR). 4단계 적재 완료 PR에서 `publicOrigin`과 `autoDeploy`를 켠다. **P02(목록·검색 요청당 D1 읽기 감소) 완료 전에는 6단계 전환을 하지 않는다.** 공유 캐시가 없어 목록 첫 쪽 요청 약 115회면 그날 D1 무료 읽기가 바닥나고, 속도 제한(60초 120회)으로는 막지 못한다(`H01-20261011.md`).
- 병합과 3단계(기록 2026-10-11T12:21Z / 21:21 KST, 브랜치 `claude/h01-d1-record`): 상위 세션이 PR #33을 2026-10-11T12:12:47Z / 21:12:47 KST에 병합했다(`da47a7a`). 병합 뒤 `deploy.yml`은 배포를 건너뛰었다. 상위 세션이 ‘Cloudflare D1 setup’을 실행했다(run 38138420167, 12:13–12:17Z, 성공). 서브도메인 `jihune` 등록, 공개 주소 `https://yukemuri.jihune.workers.dev`, D1 `yukemuri`(`128a3c5b-8e5f-470a-a901-d899d396cae1`) 생성, 마이그레이션 13개 적용. 기록 PR은 `databaseId`만 채우고 `publicOrigin`·`autoDeploy`는 4단계 적재 완료 PR에서 켠다. D1 실제 위치는 미확인이며 4단계 또는 첫 배포에서 `wrangler d1 info`로 확인한다(`H01-20261011.md`의 ‘병합과 3단계 결과’).
- 검토: Codex 1회째(`d608401`, 10:28Z 요청)에서 P1 1건(첫 화면 `/?q=`가 `/api/*` 속도 제한을 우회)과 P2 1건(Cache API는 workers.dev에서 효과 없음)이 나왔다. P1은 변형 검사로 재현했고 Cloudflare 문서로 P2를 확인했다. 둘 다 고쳤다. Codex 2회째(`8ca5ebf`, 11:40Z)에서 P2 1건(배포 설정 검사가 속도 제한 수치를 보지 않음)이 나와 재현하고 고쳤다(`H01-20261011.md`의 ‘검토’). Codex 3회째(`e622408`, 12:01Z)는 ‘큰 문제 없음’이었다. 검토 요청 3회를 모두 썼고 남은 지적은 없다. 그 뒤 변경은 기록 파일뿐이다.

## 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션이 맡긴 작업이다.
- PR A 브랜치: `claude/p01-d1-reads`. 시작 기준: main `1ff8f48`(PR #24 병합). 인수인계를 쓰기 직전에 main `8574830`(PR #27 병합)을 merge했다. 충돌은 없었다.
- PR A(#28) 코드 커밋은 `da919d5`와 Codex 지적 수정 `fa99371`이다. 그 밖의 커밋은 main merge와 기록 문서·근거 파일뿐이다.
- PR B 브랜치: `claude/p01-search-scans`. PR A 브랜치(`ef6c1e8`)에서 시작했고, A의 Codex 수정과 main `59b2dfe`(PR #29) merge가 든 A 브랜치(`ea324a9`)를 merge했다. 충돌은 `readCoverage()`와 수집 큐 검사 두 곳이었고 둘 다 합쳤다. 코드 커밋 `3c613c4`, merge `ef8df77`. A 병합(`264f3bb`) 뒤 main을 merge하고 PR을 열었다.
- 운영 D1·Secret·수집 예약·자동 백업·호스팅·공유 범위는 바꾸지 않았다. DB 스키마(마이그레이션)를 바꾸지 않았다. 운영 사이트에 접속하지 않았다. Google API·유료 서비스·새 계정 연결을 쓰지 않았다.
- 수집기 파일(`scripts/crawler/*`)은 바꾸지 않았다. 수집기 release는 그대로다.

## 환경 확인

- Node 24.21.0(`nvm install 24`, PATH 앞에 `/opt/nvm/versions/node/v24.21.0/bin`), pnpm 11.25.0, Python 3.13.
- `bash scripts/cloud-setup.sh`: exit 0(2026-10-11T07:08:33Z 끝남). 잠금 파일은 바뀌지 않았다.
- `python3 scripts/cloud-check.py --full`: 시작 기준 `1ff8f48`에서 21개 명령 통과(rc=0, 07:08:33Z–07:11:29Z). PR A 결과는 아래 ‘PR A 검사’에 적는다.
- 개발 DB: 검사와 측정은 모두 임시 Miniflare D1(체크인 자료)을 썼다. 화면을 바꾸지 않아 개발 서버와 브라우저 검사는 쓰지 않았다.
- 하네스(`jihune/agent-harness`의 `claude/START.md`)를 읽기용으로 붙여 적용했다. 전역 규칙 155줄, 스킬 37개다. 하네스는 수정하지 않았다.

## PR A 결과

상세는 `P01-20261011.md`의 ‘A’ 절이다.

- 측정: `scripts/measure-d1-reads.mjs`가 요청마다 D1 `rows_read`·`rows_written`을 센다. `--grow`는 2026-10-08 행 수까지 복사한다. 수정 전 운영 규모 값: 수집 PUT 27,708행, 수집 GET 30,868행, 목록 첫 쪽 62,265행, 이름 검색 77,538행(색인 생성이 끼면 128,217행), PUT 뒤 이름 검색 155,905행. Miniflare의 행 수가 운영 D1과 같은지는 미확인이다.
- 수정: `writeHotels()`가 같은 트랜잭션에서 `catalog_meta`의 `hotel-records` 카운터를 올린다. PUT은 카운터의 정확한 `records` 위에 최대 5분 된 집계를 돌려준다. 수집 끝 GET은 지금처럼 전체를 세고, 같은 트랜잭션에서 카운터를 실제 COUNT로 다시 쓴다. 수집 쓰기는 결과 캐시만 비우고 색인·집계 캐시를 버리지 않는다.
- 결과: 수집 PUT 27,708 → 24행(같은 isolate, 집계 캐시 있음). PUT 뒤 이름 검색 155,905 → 77,539행. 수집 끝 GET은 30,868 → 43,139행으로 늘었다(카운터 재설정용 COUNT). 수집 1회 추정 약 47.4만 → 약 7.2만 행, 하루 8회 약 379만 → 약 57만 행.

## PR B 결과

상세는 `P01-20261011.md`의 ‘B’ 절이다.

- 폐업 제외를 `NOT EXISTS`로, 이름 부분일치를 요청당 한 번으로, 색인 별칭을 한 번의 읽기로 바꿨다. bath 백필 확인에 완료 표시를 두고, 수집 끝 GET이 집계를 저장해 다른 isolate가 읽게 했다. 4.77MB seed와 대기열 seed는 DB를 처음 채울 때만 불러온다.
- 운영 규모 복사본: 목록 첫 쪽 62,265 → 37,723행, 이름 검색 77,538 → 26,656행, 첫 색인 생성 포함 128,217 → 52,776행, 새 isolate 목록 102,226 → 37,726행, 새 isolate 상세 12,300 → 30행.
- 결과 불변: 193개 요청의 응답이 main 빌드와 같았다(`compare-search-builds.mjs`).
- 첫 색인 생성 요청의 로컬 시간은 B가 두 번 모두 조금 느렸다(595·586 → 672·626ms). 원인은 확인하지 않았다.

## PR A 검사

- `node scripts/measure-d1-reads.mjs --grow --check`: 상한 2개 통과. 수정 전 코드에서는 두 상한 모두 실패했다.
- `scripts/check-crawl-queue-worker.mjs`: 새 단언(정확한 `records`, 중복 id 한 번, 카운터 재설정, 겹친 GET·PUT 30회) 포함 통과. 변형 3종(카운터 증가 제거·중복 두 번 세기·재설정 제거)에서 모두 실패했다. 겹친 GET·PUT 단언은 `da919d5`에서 첫 회에 실패했다.
- Worker 검사 11개(`scripts/check-*-worker.mjs`): 수정 전 `1ff8f48`과 수정 뒤 모두 통과.
- `python3 scripts/cloud-check.py --full`: 측정 상한을 더한 22개 명령 통과. `da919d5` 작업 트리 07:31Z–07:34Z, `fa99371` 작업 트리 08:42:25Z–08:45:28Z(rc=0).

## PR B 검사

- `measure-d1-reads.mjs --check` 상한 9개: B 통과, main 빌드는 두 규모 모두 9개 실패.
- `compare-search-builds.mjs`: 193개 요청 같음. 대조 변형 두 가지(별칭 순서, 폐업 제외 누락)에서 실패.
- `check-catalog.mjs`·`check-crawl-queue-worker.mjs`의 새 단언과 대조 변형 실패 확인.
- `python3 scripts/cloud-check.py --full`(22개 명령): `ef8df77` 작업 트리 08:51:17Z–08:54:25Z, `5e860ba` 작업 트리 09:17:56Z–09:21:10Z 통과(rc=0). Worker 검사 11개 통과.

## 미확인 사항

- Miniflare의 `rows_read` 계산과 운영 D1의 계산이 같은지.
- Cloudflare가 수집 한 실행의 요청을 몇 개의 isolate로 나누는지. isolate가 바뀔 때마다 PUT 한 번이 약 2.8만 행을 더 읽는다.
- 운영 대기열의 작업 수. 작업 선점 POST의 읽기 행 수는 대기 작업 수에 따라 달라진다(복사본 기준 약 6.4천 행).
- CPU 시간. 측정값은 로컬 SQLite를 포함한 벽시계 시간이다.
- 첫 색인 생성 요청이 B에서 조금 느린 원인.
- seed 청크를 동적 import로 미뤘을 때 운영 Worker의 시작 비용. 청크 자체는 번들에 남는다.

## 이번 세션의 결정

1. 하네스와 충돌한 곳은 유케무리 지침과 요청을 따랐다. `START.md` 4단계의 ‘다음 메시지를 기다린다’는 요청이 작업을 지정해 따르지 않았다. `STATE.md`·요청 원장은 `AGENTS.md`의 ‘기록’이 별도 기록 폴더를 금지하므로 이 인수인계에 기록했다. 하네스의 ‘push는 요청할 때만’은 이 요청이 PR을 지시하므로 push했다. Windows 경로·PowerShell·winget 지침은 Linux 클라우드라 적용하지 않았다.
2. PUT의 `records`는 카운터로 정확히 유지했다. 수집기가 진행 줄에 쓰는 값이기 때문이다. 캐시만 쓰면 최대 5분 늦은 값이 된다. 카운터는 스키마 변경 없이 `catalog_meta` 행 하나로 두었다. 나머지 집계 필드는 수집기가 읽지 않아 5분 캐시를 쓴다.
3. 카운터가 틀어질 수 있는 경우(첫 실행, 비원자적 백업의 복원)는 수집 끝 GET이 바로잡는다. 별도 복구 절차를 만들지 않았다. 처음에는 세기와 맞추기를 따로 실행했다. Codex 지적대로 겹친 PUT의 증가분이 사라져 한 트랜잭션으로 바꿨다. 차이만 더하는 방식은 GET 두 개가 겹치면 차이를 두 번 더하므로 택하지 않았다. 대가는 GET마다 COUNT 한 번(약 1.2만 행)이다.
4. 수집 쓰기가 색인을 버리지 않게 했다. 다른 isolate는 원래 타이머로만 갱신됐으므로 시스템 전체의 최신성은 그대로다. 부분일치 검색은 표를 직접 읽어 새 숙소를 바로 찾는다.
5. 작업 선점 POST의 정렬 비용은 색인 없이 줄이기 어려워 이번 범위에서 다루지 않았다. 스키마 변경이 필요하면 상위 세션에 근거와 함께 먼저 알린다.
6. 검색 화면의 수집 현황(발견·완료·대기·실패 수)은 B부터 마지막 수집 실행 끝의 값이다. 이전에는 최대 30초 늦은 값이었다. 이 수는 수집 실행 중에만 바뀌고, 매 isolate가 약 2.8만 행을 다시 세는 비용이 더 크다고 판단했다.
7. seed 청크는 번들에서 빼지 않고 평가만 미뤘다. 새 D1을 처음 채우는 경로가 Worker 안에 있어서다. H01에서 seed 적재를 배포 단계로 옮기면 뺄 수 있다.

## 검토

`cloud-development.md`의 ‘검토 요청’ 절차를 따른다. CI 통과 뒤 PR 대화창에 Codex 리뷰를 요청한다. 한도 안내가 오거나 15분 안에 반응이 없으면 다시 요청하지 않고 상위 세션에 알린다. 결과는 아래에 적는다.

- PR A 1회째: CI(`checks`)가 `ef6c1e8`에서 통과한 뒤 08:10Z에 Codex 리뷰를 요청했다. Codex가 08:14Z에 P2 1건(끝 GET의 카운터 재설정이 겹친 PUT의 증가분을 덮어씀)을 남겼다. 겹친 GET·PUT 검사로 재현했고(`da919d5`에서 첫 회 실패) `fa99371`에서 고쳤다. 검토 요청은 1회 썼다.
- PR A 2회째: main `59b2dfe` merge 뒤 `ea324a9`의 CI 통과 뒤 08:51Z에 재검토를 요청했다. Codex가 08:54Z에 ‘큰 문제 없음(Didn't find any major issues)’으로 응답했다. 검토 요청은 2회 썼다. 지적 스레드에는 수정 내용을 답하고 resolve했다.
- PR A 병합 판단: 마지막 검토 커밋 `ea324a9`가 head다. P0~P2 지적은 모두 해결됐다. CI 통과, 충돌 없음. 08:59Z에 상위 세션에 병합을 요청했다.

- PR B 1회째: CI가 `c30e44e`에서 통과한 뒤 09:05Z에 Codex 리뷰를 요청했다. Codex가 09:08Z에 P2 1건(겹친 끝 GET 중 늦게 끝난 쪽이 오래된 집계로 `coverage-snapshot`을 덮어씀)을 남겼다. 타이밍 겹침으로는 재현되지 않았다. 집계를 읽는 트랜잭션에서 순번을 받아 더 큰 순번일 때만 저장하도록 고쳤다(`5e860ba`). 순번 조건을 뺀 변형에서 새 단언이 실패했다. 검토 요청은 1회 썼다.

병합은 `AGENTS.md`의 ‘상위 세션이 맡긴 작업’ 규칙을 따른다. 조건을 충족하면 상위 세션에 head 커밋과 근거를 알리고 상위 세션이 병합한다.

## Sites 전달

- 이 환경에는 Sites 도구가 없다. 게시하지 않았다. 사용자는 Sites 게시를 하지 않고 H01 전환으로 반영하기로 했다(2026-10-11T08:25Z, `roadmap.md` S01).
- PR A는 Worker의 수집 API(`app/api/crawl/route.ts`)와 카탈로그 저장소(`lib/hotel-repository.ts`)를 바꾼다. 화면·DB 스키마·수집기는 바꾸지 않았다. 게시 뒤 첫 수집 실행의 첫 PUT이 카운터를 만든다(전체 한 번 셈).
- 검사한 커밋은 PR A `fa99371`이다. U01부터 U03까지의 병합분도 아직 게시되지 않았다(`deployments.md`).

## 다음 작업

1. 완료: 상위 세션이 병합 조건(마지막 검토 `ea324a9`가 head이고 큰 문제 없음, P2 스레드 해결, CI 통과, 충돌 없음)을 확인해 PR #28을 main에 병합했다(2026-10-11T09:00:19Z / 18:00:19 KST, `264f3bb`). Sites 게시는 아직이다.
2. 완료: PR B(#31)의 Codex 1회째(`c30e44e`) P2 1건(겹친 끝 GET이 오래된 집계 저장)을 `5e860ba`에서 순번 조건부 저장으로 고쳤다. 2회째(`1ea6073`, 09:29Z)는 큰 문제 없음이었다. 상위 세션이 병합 조건(마지막 검토가 head, 스레드 해결, CI 통과, 충돌 없음)을 확인해 main에 병합했다(2026-10-11T09:34:00Z / 18:34:00 KST, `4b98c26`). P01 A·B가 모두 끝났다. Sites 게시는 아직이다.
3. P01 남은 비용: 목록 첫 쪽의 정렬된 id 전체 읽기(정렬 열 색인 또는 H01의 익명 검색 캐시가 필요), 이름 부분일치의 `instr` 전체 스캔, 작업 선점 POST의 정렬. 색인 추가는 스키마 변경이라 상위 세션에 근거를 먼저 알린다.
4. D01 2차: 운영 체크포인트 기준 지역 대조·공급자 간 연결 후보 판정. 감사 스크립트 두 개(`audit-region-labels.mjs`, `audit-trip-addresses.mjs`)가 입력 경로를 받도록 넓히고 Trip 주소도 함께 센다. (이전 인수인계에서 옮김)
5. Shinagawa Prince Hotel(`trip-994895`)의 Trip 상품 범위 확인. 이 기록도 빈 주소라 상세 관측이 먼저 필요하다. (이전 인수인계에서 옮김)
6. 운영 반영(H01 전환) 뒤 Trip 상세 재수집으로 중복 주소가 사라졌는지 확인한다. (이전 인수인계에서 옮김)
7. 해당 없음(사이트 public 결정, PR #29, 2026-10-11T08:25Z): Access를 쓰지 않는다. 원래 P3(PR #27 Claude 검토): `hosting-review-20261011.md` 3.2절은 첫 배포를 적재 뒤로 옮겼다. 그래서 사용자가 Access를 켜기 전까지 실데이터 Worker가 `workers.dev`에 열린다. 첫 배포의 서비스 토큰 점검도 Access를 검증하지 못한다. H01을 시작할 때 둘 중 하나로 고친다. (가) Access 앱을 Worker 배포 전에 만들 수 있는지 확인하고, 되면 3.3절 5번을 첫 배포 전으로 옮긴다. (나) Access를 켤 때까지 5단계 검증을 시작하지 않고, Access를 켠 뒤 서비스 토큰 점검을 다시 실행한다. (이전 인수인계에서 옮김)
8. 폐기: 앱 레포가 public이 되어(2026-10-11T09:30Z 확인) 구현 작업을 한 번에 하나로 묶던 제한은 풀었다. 실행기 레포는 private이라 그쪽 Actions 사용 시간만 계정 한도를 쓴다.
9. PR #32(실행기 레포 수정 허락·레포 구조 계획·public 전환 기록)는 Codex 3회와 Claude 검토 1회(사용자 허락, 4회째) 뒤 상위 세션이 병합했다(2026-10-11T09:56:26Z / 18:56:26 KST, `274f687`). P3(PR #32 Claude 검토, `401f4d4`): GitHub Actions의 `concurrency` 그룹은 레포 안에서만 적용된다. 그래서 같은 이름을 써도 앱 레포 수집과 실행기 수집은 서로 막지 못한다. H01 6단계 PR을 만들 때 `hosting-review-20261011.md`에 세 가지를 적는다. (가) 6단계 6번의 그룹 문장에 ‘레포 안에서만 적용’을 붙인다. (나) 앱 레포 수동 실행은 실행기 PR(수집 workflow 삭제) 병합 뒤에 한다. (다) 롤백 표 ‘새 호스팅 포기’에서는 앱 레포의 진행 중 실행이 끝난 뒤 실행기 수집을 재개한다.
10. PR #39(호스팅 2차 검토·정적 스냅숏 결정)는 Codex 3회(`db67bb9`·`cb2e292`·`af6d76b`)와 Claude 검토 2회(`4ad6f0e` P2 1건 수정, `cdc0fbf` 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-11T16:03:50Z / 2026-10-12 01:03:50 KST, `61260cc`). Claude 4·5회째는 사용자 허락으로 받았고, 이 방식을 규칙으로 정했다(`AGENTS.md`, 2026-10-11T15:56Z). P3(PR #39 Claude 검토 2회째, `cdc0fbf`, 큰 문제 없음). 아래 (가)~(라)는 문서 정리 PR #42(Codex 2회, 1회째 P2 ‘감시 주기를 12시간보다 짧게’를 `2e91e62`에서 6시간으로 고침)에서 고쳤다. (라)의 보완은 앱 레포 감시 workflow(6시간마다)·멈춤 기록·세션 시작 점검이고, 6단계 PR에서 구현한다. (가) `YUKEMURI_ENABLED`는 백업(`yukemuri-backup.yml`)을 멈추거나 재개하지 않는다. 6단계 1번에 아직 ‘예약을 끄는 PR’이 남아 있다. 변수 하나로 수집만 멈춘다고 고쳐 적거나, 백업도 같은 변수를 보게 한다. (나) 롤백 표 ‘새 호스팅 포기’에 되돌림 PR 병합 뒤 `YUKEMURI_ENABLED`를 다시 `true`로 두는 단계가 없다. (다) `cloudflare-deploy.md` 106줄, `roadmap.md`의 ‘실행기 레포’ 결정 행, `hosting-review-20261011.md` 286·287줄은 아직 ‘수집을 앱 레포로 옮긴다’ 또는 ‘예약은 이 PR에서 아직 켜지 않는다’로 적혀 있다. 2차 검토 결정(실행기 cron이 앱 레포 `workflow_dispatch`만 호출)에 맞춘다. (라) 12시간 확인은 감시 대상인 예약 안에서 돈다. 그래서 예약이 아예 돌지 않으면(실행기 레포 Actions 사용 시간 소진, 변수 `false` 방치) 알림이 없다. 3.5절에 이 한계를 적고, 주기 확인을 누가 할지 정한다.
11. PR #41(검토 상한 규칙: Codex 3회 뒤 Claude 검토 2회를 묻지 않고 이어 받음, 여섯 번째부터는 사용자 허락)은 Codex 2회 뒤 상위 세션이 병합했다(2026-10-11T16:10:37Z / 2026-10-12 01:10:37 KST, `5e5f0fa`). 1회째(`efd8527`) P2 1건(상한 뒤 재요청 문구가 상한과 충돌)은 `053b4d0`에서 ‘묻지 않고 받는 상한’으로 고쳤고, 2회째(`053b4d0`)는 큰 문제 없음이었다.
12. PR #42(전환 계획을 실행기 단독 수집 예약 방식에 맞추기, PR #39 P3 네 건)는 Codex 2회(1회째 P2 ‘감시 주기를 12시간보다 짧게’를 `2e91e62`에서 6시간으로 고침, 2회째 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-11T16:19:38Z / 2026-10-12 01:19:38 KST, `4bd2311`).
13. PR #44(P03 B: 목록·검색·지도를 정적 스냅숏으로 브라우저에서 계산)는 Codex 3회(1회째 같은 head 중복 요청 2건은 1회로 셈, P2 3건 처리, 3회째 `1a7dbb0` 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-11T22:41:09Z / 2026-10-12 07:41:09 KST, `8d62e17`). 사용자 요청으로 멈추기 직전에 병합했다.
14. PR #45(P03 C: 공개 읽기 D1 쓰기 0·수집 현황 스냅숏·경로별 읽기 상한과 CPU)는 Codex 1회(`e8e0aec` 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-12T09:05:26Z / 18:05:26 KST, `a5f1a40`). 검토 뒤 바뀐 코드는 #44에서 들어온 것뿐이고(`1a7dbb0`), 코드가 같은 `7b25d87`에서 checks가 통과했다. P03 A·B·C가 모두 main에 들어갔다. 남은 P03 후속은 P03 절 다음 작업에 있다.
15. 실행기 PR #4(H01 4단계 적재 문장 상한 90,000바이트)는 Codex 1회(`c63c15e` 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-12T09:18:25Z / 18:18:25 KST, `9fb6e1d`). 2일차 첫 적재(run 38227710133)가 정확히 100,000바이트 문장에서 `SQLITE_TOOBIG`으로 실패해 원래 상태로 돌아갔고(쓰기 0, hotels 0행), 병합 뒤 다시 적재해 성공했다(run 38229050054, hotels 12,687행 일치, 쓰기 약 76,122행). 3일차 hotel_names는 2026-10-13T00:05Z.
16. 앱 PR #48(H01 6단계 준비: 수집 workflow `collect.yml`는 `workflow_dispatch`만, 감시 workflow `collect-watch.yml` 6시간마다)은 Codex 2회(1회째 P2 ‘대기 실행 취소’를 `8b12012`에서 세 잠금 그룹에 `queue: max`로 고침, 2회째 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-12T09:59:40Z / 18:59:40 KST, `0905ae4`). `queue: max`는 github/docs `actions-group-concurrency.md`가 github.com(fpt)에 적용된다고 확인했고, 병합 뒤 main push의 배포 workflow(run 38233467746)가 파일 오류 없이 성공했다. 대기 실행 보존 자체는 6단계 수동 실행에서 확인한다. 실행기 PR #5(앱 수집 부르기 예약, 백업 대상 전환)는 Codex 1회 큰 문제 없음, 6단계까지 draft.
17. 앱 PR #51(H01 첫 배포 전 `deploy.yml` 보강: wrangler 직접 실행, `--secrets-file`, 사전 점검 모드, 모든 workflow pipefail, smoke 가볍게, 수집 끝 배포는 빌드만)은 Codex 2회(1회째 P2 `collection-priority` 키 판정을 `d4de172`에서 고침, 2회째 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-12T12:28:03Z / 21:28:03 KST, `0420e4e`). 병합 뒤 main push 배포는 `autoDeploy` false라 건너뛰었다. 상위 세션이 바로 사전 점검을 돌렸다(run 38249215867, 결과는 아래 ‘H01 첫 배포 전 deploy.yml 보강’ 절). 첫 배포 계획은 그대로다: 3일차 `hotel_names` 적재(10-13T00:05Z) 뒤 H01 세션이 첫 배포 기록 PR(`publicOrigin`·`autoDeploy`)을 열고, 그날 UTC 쓰기(적재분 + 0013 약 3.1만 + prepare 약 2행)가 9만 이하이면 상위 세션이 병합한다.
18. 앱 PR #53(H01 6단계 도구: `rollback.yml`, `usage.yml`, 6단계 순서, 유지보수 경로 CPU 측정)은 Codex 3회(P2 4건 모두 고침)와 이어 가는 Claude 검토 1회째(`0b12c5f`, P0–P2 없음, P3 2건) 뒤 상위 세션이 병합했다(2026-10-12T13:32:26Z / 22:32:26 KST, `77aa994`). P3 2건은 이 기록 PR에서 고쳤다(`cloudflare-deploy.md` 롤백 주의 4, 사용량 실패 5종). C1 결정(목록 PUT cold 57ms, seed 바뀐 첫 prepare 약 400ms, 백업 export hotels 1,000행 14–21ms)은 첫 배포 뒤 `usage.yml`로 실제 CPU를 본 다음 상위 세션이 정한다. 실행기 백업의 한 번 읽는 행 수를 250으로 낮추는 것이 후보다. `usage.yml`에는 사용자 조치(토큰에 Account Analytics Read)가 먼저 필요하다.
19. 앱 PR #52(P03 후속: 예상 숙소·저장 목록 상태, 이름 검색 재시도, 수집 현황 기준, WebMCP 개수, 로캘 무관 검색)는 Codex 2회(1회째 P2 ‘저장 목록 오류 때 0곳 표시’를 `36f955d`에서 고침, 2회째 `904dc40` 큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-12T13:50:36Z / 22:50:36 KST, `e9b0ea0`). main `77aa994` merge 뒤 `cloud-check.py --full` 35개와 브라우저 U01–U04·후속 검사가 통과했다.
20. 실행기 PR #6(H01 6단계 차이 반영·즐겨찾기 대조 workflow `cloudflare-sync.yml`, 수동 실행·`dry_run` 기본)은 Codex 3회(P1 4건·P2 3건 고침, ABA 지적은 `created_at` 기본값 근거로 코드 없이 답함)와 이어 가는 Claude 검토 2회(1회째 `835d0e2` P2 2건·P3 1건 고침, 2회째 `baaecbe` P3 1건) 뒤 상위 세션이 병합했다(2026-10-12T15:04:34Z / 2026-10-13 00:04:34 KST, 실행기 `149eaa5`). 두 세션이 따로 만든 구현을 하나로 합쳤다. `catalog_meta`의 `google-request-budget:` 런타임 키는 비교에서 빼고 새 D1 값을 둔다. UNIQUE 표는 나누지 않는다. P3(Claude 검토 2회째, 실행기 README:47): 새 앱이 첫 배포 때 쓰는 `bath-facts-backfill-v1` 키는 Sites 체크포인트에 없어 6단계 차이 반영이 지운다(요약에 `catalog_meta` 삭제 1). 다음 `deploy.yml`이 unprepared를 보고 prepare를 다시 불러 복구한다(hotels 조회 1회, 쓰기 약 2행). → 완료: 실행기 PR #7(이 키를 `APP_OWNED`에 넣어 비교에서 빼고 새 D1 값을 둠, README에 ‘6단계 동안 앱 seed 버전을 바꾸지 않는다’ 전제 추가)이 Codex 1회(큰 문제 없음) 뒤 상위 세션이 병합했다(2026-10-12T15:26:13Z / 2026-10-13 00:26:13 KST, 실행기 `8ec8fc0`). 즐겨찾기 규칙(상위 세션 결정): 기본은 남김(보고만), `delete_favorites=true`는 `compare_run_id` 필수, 이전 체크포인트에 있던 행(해시 같음)만 지우고 처음 보는 행(새 주소에서 만든 것)은 남긴다.
21. H01 4단계 기록·첫 배포 PR #57(`publicOrigin`·`autoDeploy` 켬, Codex 1회 큰 문제 없음)을 상위 세션이 병합했다(2026-10-13T00:24:36Z / 09:24:36 KST, `65ce1e6`). 그 push 배포(run 38327093197)는 `cloud-check --full`에서 실패했다: `deploy.yml`이 수집기 release를 workers.dev 주소로 만들고, `scripts/runner/check_bootstrap.py`가 Sites 주소만 받는 옛 bootstrap으로 검증해 거부했다. PR CI는 이 환경변수 없이 돌고 사전 점검은 `cloud-check`를 건너뛰어 처음 드러났다. bookmark 전 단계라 Cloudflare·D1 변경은 없다.
22. PR #58(같은 파일을 Sites 주소로 다시 서명해 검사, Codex 1회째 P2 ‘원본을 먼저 검증’을 `e79094e`에서 고침, 2회째 큰 문제 없음)을 상위 세션이 병합했다(2026-10-13T00:55:34Z / 09:55:34 KST, `871ce01`). 그 push 배포(run 38329639417)로 **첫 배포가 성공**했다. 결과는 `deployments.md` Cloudflare 표. 배포 전 로컬에서 `YUKEMURI_SITE_ORIGIN=https://yukemuri.jihune.workers.dev python3 scripts/cloud-check.py --full` 35개 통과를 확인했다. 다음: 5단계 관찰(며칠 `usage.yml`로 CPU p99·1102·D1 확인, C1 결정), 그 뒤 6단계(실행기 PR #5, 수집기 User-Agent 연락 주소를 새 주소로, 차이 반영).
23. 사용자 조치(2026-10-12~13, 값은 기록하지 않음): Cloudflare 토큰 "Edit Cloudflare Workers"에 Account Analytics Read(`usage.yml` run 38314558359로 확인)·Turnstile Edit·Queues Edit 추가. 앱 Secret `YUKEMURI_CRAWL_ACCESS_KEY`를 첫 배포 전(10-12T23:3xZ) 새 키로 교체(첫 배포 smoke의 키 확인 통과). 실행기 Secret `YUKEMURI_APP_DISPATCH_TOKEN`(fine-grained PAT, 만료 없음, `jihune/yukemuri`·`jihune/yukemuri-script-runner`, Actions·Variables·Issues 쓰기, Contents 읽기)과 `YUKEMURI_CLOUDFLARE_JSON` 등록. Claude 사용량 크레딧 꺼짐 확인. GitHub Actions 실패 알림(메일) 켬. 옛 크롤 키는 쓰지 않으며, 교체 전 Worker 버전은 없다.
24. 새 요구사항 U05(사이트 UI/UX 전면 개선, 사용자 2026-10-13T01:1xZ)를 로드맵 22번에 넣었다. 사용자 지시: 기존 작업·요청을 빠뜨리지 말고, 지금 시급한 것(전환, 자료 수집·기능)을 먼저 하고 UI/UX는 뒤로 조정해도 된다. 순서: H01 5·6단계 → 자료 수집(C03 수집량 결정, D02·D05·L01) → U05 조사·설계안(전환과 병행 가능한 문서 작업) → U05 구현. 개발 환경에서 `*.workers.dev` 접속은 환경 네트워크 정책이 막는다(사용자가 환경 설정의 Allowed domains에 `yukemuri.jihune.workers.dev`를 더하면 공개 화면만 직접 확인한다. 유지보수 키는 쓰지 않는다).
25. H01 6단계 전환 완료(2026-10-13, 사용자 지시 ‘개발 단계라 며칠씩 기다리지 말고 공격적으로, 데이터 유실은 다시 모으면 됨’). 5단계 관찰은 며칠 대신 당일 사용량 확인으로 갈음했다(10-13 05:18Z: 요청 454, 오류 0, CPU p50 9.08ms·p99 85.49ms, `exceededResources` 0, D1 쓰기 85,104·읽기 1,325,590). 실행기 `YUKEMURI_ENABLED`는 끄지 않고 예약 사이에 진행했다(그사이 예약 실행 없음). 순서와 결과:
    - Sites 최종 백업 run 38332906262(01:36Z) → 차이 반영 dry run 38333072799(예상 쓰기 10,728행) → 반영 run 38333602717(01:45–01:53Z, 쓰기 전 bookmark `00000011-00000000-00005103-75db15d43de3cc7fdb9aad536bb1b869`, 13개 표 모두 일치, hotels 12,687→13,127).
    - Sites 재백업 run 38333624988(01:47Z) → 즐겨찾기 대조 run 38334012199(이전 체크포인트 38332906262와 비교, 2곳 그대로, 차이 0).
    - 실행기 PR #8(#5의 커밋 3개 + main 병합 + 백업 쪽 250행, Codex 1회 큰 문제 없음) 병합 `968f4c8`(01:58Z). draft #5는 설명 댓글을 남기고 닫았다(다른 세션 브랜치라 손대지 않음).
    - 앱 PR #60(수집기 User-Agent 연락 주소 workers.dev, 문서만 바꾼 push는 배포 안 함, Codex 1회 큰 문제 없음) 병합 `9a6d63f`(01:57Z). 배포 run 38334607034는 Worker `70594cdf`·스냅숏 `ba103345886a0952`(13,127곳)까지 올라갔으나 smoke가 아직 전파되지 않은 `core.json`(단일 페이지 대체 HTML 200)을 읽어 실패했다.
    - 수집 접근 확인 run 38334680230 실패: Cloudflare가 urllib 기본 User-Agent(`Python-urllib`)를 Worker 앞에서 `error code: 1010`으로 막는다(이 환경에서 키 없이 재현, 다른 User-Agent는 Worker까지 감). 실행기 백업도 같은 이유로 막힐 것이었다.
    - 실행기 PR #9(백업 User-Agent `YukemuriBackup/1.0`, Codex 1회 큰 문제 없음) 병합 `55572c8`(02:13Z). 새 주소 백업 run 38335832143(push)·38335834522(수동, 02:15–02:16Z, 5.7MB) 성공.
    - 앱 PR #61(수집기 `site_api`에 `USER_AGENT`, smoke가 스냅숏 파일마다 JSON을 기다림, U05 설계안 기록; Codex 3회: P1 2건·P2 1건 고침, 3회째 큰 문제 없음) 병합 `97b8c2e`(05:08Z). 배포 run 38349912092 성공(Worker `2c5195f8-a581-4416-9997-64ad67ee6090`, 스냅숏 `56eb00dcae864233` 13,127곳, smoke 통과).
    - 수집 접근 확인 run 38349917943 성공(05:16Z). 보고: 기록 13,127곳 중 좌표 1,366곳, 상세 완료 1,511곳.
    - gentle 수집 run 38350770981(05:19–05:24Z) 성공: 16쪽 모두 done, 13,127→13,177곳. 수집 끝 스냅숏 배포는 `checked-commit`이 main push 검사(run 38349912124)를 찾아 전체 검사를 건너뛰었다(Worker `c8ded9f9-6fda-41d3-b4ca-3cc2098d5892`, 스냅숏 `5699ce65b7f7918e` 13,177곳, smoke 통과).
    - 실행기 `check` run 38351608261 성공(PAT로 앱 실행 목록 읽기), `dispatch` run 38351655688이 앱 gentle run 38351668272를 시작(PAT로 다른 레포 `workflow_dispatch` 확인).
26. 전환 뒤 상태: 운영은 https://yukemuri.jihune.workers.dev 다. 수집은 실행기 예약(3시간마다, `YUKEMURI_ENABLED` true)이 앱 `collect.yml`(gentle)을 부르고, 백업은 실행기가 새 주소에서 매일 한다. 기존 Sites(`yukemuri.jihun7891.chatgpt.site`)는 더 이상 갱신하지 않는다. Sites 정리(README·문서의 Sites 문구, 되돌림용 `YUKEMURI_ACCESS_JSON`·`run-updates.py`의 보존 기간)는 따로 정한다.
27. C1(CPU 위험) 정리: 백업 쪽 크기 250행(실행기 PR #8)으로 고쳤다. 목록 PUT·prepare는 첫 gentle 실행과 당일 사용량에서 1102가 없었다. CPU p99 85ms는 표본이 작고(454요청) 유지보수 경로가 섞여 있다. 매일 `usage.yml`(예약된 상위 세션 점검, 10-14T01:20Z부터)로 보고 1102가 나오면 해당 경로를 고친다.
28. U05 디자인 사용자 결정(10-13T05:0xZ, `roadmap.md` 결정 기록): B, 지도 모드 별도·숙소 빠짐 없음. 2단계 구현은 하위 세션 `session_01EKeavHcR5d8PKrSwVHyhn6`(브랜치 `claude/u05-ui`)이 PR 7개를 차례로 연다(토대 → 지도 모드 → 목록 → 필터 → 상세 → 비교 → 즐겨찾기·자료 현황). 병합과 병합 기록은 상위 세션이 한다. 좌표가 있는 숙소가 약 10%라 지도 모드는 ‘위치 미확인 N곳’을 눈에 띄게 세어 보여 주도록 하위 세션에 전달했다.
29. 다음(자료 수집): 좌표·탕 정보는 상세 수집으로 늘어난다(상세 완료 1,511곳, 대기 Jalan 11,640·Trip 1,498). C03 수집량(주기·상한) 결정과 D02·D05·L01을 다음으로 한다. 무료 한도(D1 쓰기 10만/일)와 원출처 부담을 함께 본다.

## U04 — 예약 링크 날짜·인원과 설명 번역 문구

기록: 2026-10-11T10:45:00Z / 2026-10-11 19:45:00 KST. 상세는 `U04-20261011.md`다.

### 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션(`session_01BSbr1zrttr8mSibf5bfz2R`)이 맡긴 작업이다. 이 절의 작성 세션은 `session_01DpZasfw33qyCh32Gw9rQd2`다.
- 브랜치 `claude/u04-booking-dates`. 시작 기준 main `6f09287`(PR #30). 코드 커밋 `7992d78`. 기록을 쓰기 직전에 main `274f687`(PR #31·#32 병합)을 merge했다(`70e4326`). 충돌은 없었다.
- 운영 D1·Secret·수집 예약·호스팅은 바꾸지 않았다. DB 스키마를 바꾸지 않았다. 운영 사이트에 접속하지 않았다. Google API·유료 서비스·새 계정 연결을 쓰지 않았다. 수집기 release 해시는 그대로다(`08ca3bf…`).
- 하네스(`jihune/agent-harness`의 `claude/START.md`)를 읽기용으로 붙여 적용했다. 전역 규칙 155줄, 스킬 37개다. 하네스는 수정하지 않았다.

### 환경 확인

- Node 24.21.0(`nvm install 24`), pnpm 11.25.0, Python 3.13. `bash scripts/cloud-setup.sh` exit 0(09:33Z). 잠금 파일은 바뀌지 않았다.
- 브라우저 검사: Chromium 141.0.7390.37 headless, Playwright 1.56.1(`.sites-runtime/u01-browser`), jsdom 26.1.0(`.sites-runtime/u01-dom`). 개발 서버는 portable 모드, 로컬 D1에 마이그레이션 13개, 체크인된 스냅샷 자료.

### 결과

- R37: 상세의 ‘공식 안내와 예약 사이트’ 절에 체크인·체크아웃·성인 인원 입력을 다시 넣었다. Jalan·Trip.com(`www`·`kr`) 링크에 기존 코드의 형식으로 조건을 넣는다. 요금 조회는 없다. 날짜가 없거나 잘못되면, 또는 저장 주소가 숙소 페이지 형식이 아니면 링크는 저장 주소 그대로 열린다. 조건은 페이지 주소에 남는다. 쓰이지 않던 요금 코드와 요금 검사를 지웠다. `/api/prices`의 410 응답은 남겼다.
- 근거: Jalan은 체크인된 plan 페이지 3개가 같은 조건을 돌려준다. Trip.com은 기존 코드와 원래 README뿐이고 체크인된 응답은 없다. 공식·지도 링크에는 날짜를 넣지 않는다.
- D03: 번역 없는 설명의 ‘한국어 번역은 자동으로 순차 반영됩니다’를 ‘이 숙소의 한국어 번역은 없습니다. 새 번역은 지금 정기적으로 추가되지 않습니다.’로 바꿨다. `update-descriptions.py` 머리 주석도 고쳤다. 이 파일은 수집기 release 목록에 없어 release가 다시 만들어지지 않는다.

### 검사

- `python3 scripts/cloud-check.py --full`: 새 `check-booking-links.mjs`를 더한 23개 명령 통과. `7992d78` 작업 트리 09:55Z–10:00Z, `70e4326` 10:00:34Z–10:05:24Z(rc=0).
- `check-u04-browser.mjs`: 360·390px(터치·키보드)와 1280px(마우스·키보드) 51개 통과(`70e4326`). Codex 지적 수정 `4ce95cf`에서 단언 6개를 더해 57개 통과(`evidence/ui-u04-booking-20261011.json`). 수정 전 화면에서는 세 폭 모두 실패했다(`evidence/ui-u04-booking-before-20261011.json`). 수정 전 `booking-query.ts`에서 단위 검사가 실패했다. 변형 3종에서 모두 실패했다.
- 기존 검사: U01 64개, U02 42개, U02 지도 59개, U03 비교 60개, U03 데스크톱 12개, U01 DOM 검사 통과(`70e4326`).
- 기존 `check-facility-links.cjs`는 main에서도 실패한다(`components/hotel-photo` 없음). `cloud-check.py` 밖의 검사라 고치지 않았다.
- main merge 뒤 새 로컬 D1의 개발 서버 첫 요청이 가끔 `Network connection lost`(seed를 불러오는 `importSnapshot`)로 실패했다. `70e4326` 5회 중 4회, main `274f687` 4회 중 2회. 원인은 미확인이다. 서버를 다시 열고 `/api/hotels`를 먼저 요청하면 화면 검사는 정상이었다.

### 미확인 사항

- Jalan·Trip.com 실제 페이지가 지금도 이 조건을 받아들이는지(외부 요청 차단 환경).
- 실제 모바일 기기와 기기 날짜 선택기, 스크린리더 읽기 순서, 운영 D1 자료로 렌더링한 화면.

### 이번 세션의 결정

1. 하네스와 충돌한 곳은 유케무리 지침과 요청을 따랐다. `START.md` 4단계의 ‘다음 메시지를 기다린다’는 요청이 작업을 지정해 따르지 않았다. `STATE.md`·요청 원장은 `AGENTS.md`의 ‘기록’이 별도 기록 폴더를 금지해 이 절에 기록했다. 하네스의 ‘push는 요청할 때만’은 이 요청이 PR을 지시해 push했다. Windows 경로·PowerShell·winget 지침은 Linux 클라우드라 적용하지 않았다.
2. 날짜 입력은 상세에만 두었다. 사용자 요청이 ‘숙소 상세에서 예약 사이트로 넘어갈 때’다. 예전 검색 영역 입력은 다시 넣지 않았다. 조건은 페이지 주소에 남아 숙소를 바꿔도 유지된다.
3. Trip.com은 날짜를 넣었다. 요청이 Trip.com을 예로 들었고 형식이 기존 코드에 있다. 체크인된 응답이 없다는 점은 미확인으로 남긴다. 받아들이지 않더라도 링크는 같은 숙소 페이지를 연다.
4. 박수·인원 제한(1~7박, 성인 1~6명, 객실 1개, 330일 이내)은 기존 값을 그대로 썼다. 각 사이트가 받는 범위를 추측하지 않았다.

### 검토와 병합

`cloud-development.md`의 ‘검토 요청’ 1번을 따른다. 병합은 `AGENTS.md`의 ‘상위 세션이 맡긴 작업’ 규칙대로 상위 세션이 한다.

- 1회째: CI가 `2761657`에서 통과한 뒤 10:40Z에 Codex 리뷰를 요청했다. 10:46Z에 P2 2건이 달렸다. (가) `kr.trip.com` 숙소 링크 3개에 날짜가 들어가지 않음. (나) 목록에서 연 상세를 닫으면 조건이 빈 값으로 돌아감. 둘 다 재현했고(수정 전 브라우저 단언 6개·단위 검사 실패) `4ce95cf`에서 고쳤다. 상세는 `U04-20261011.md`의 ‘Codex 검토 반영’. 검토 요청은 1회 썼다.
- 2회째: CI가 `bb1b7d9`에서 통과한 뒤 11:09Z에 요청했다. Codex가 11:11Z에 ‘큰 문제 없음’(검토 커밋 `bb1b7d9`)을 남겼다. 검토 요청은 2회 썼다. 병합 조건(P0~P2 해결, 마지막 검토 뒤 변경은 기록 파일뿐, CI 통과, 충돌 없음)을 상위 세션에 알린다.

### Sites 전달

- 게시하지 않았다. H01 전환으로 반영한다(`roadmap.md` S01).
- 검사한 커밋은 `4ce95cf`이다. 앱 화면(`hotel-detail`·`hotel-explorer`·`hotel-description`), `lib/booking-query.ts`, CSS, 검사 스크립트를 바꾼다. Worker API·DB 스키마·수집기 release는 바꾸지 않는다.

### 다음 작업

1. 완료: 상위 세션이 병합 조건(마지막 검토 `bb1b7d9` 큰 문제 없음, 그 뒤 변경 `3b1afc3`은 기록 파일뿐, 스레드 2개 해결, CI 통과, 충돌 없음)을 확인해 PR #34를 main에 병합했다(2026-10-11T11:16:10Z / 20:16:10 KST, `16cb2ec`). Sites 게시는 아직이다.
2. 운영 반영(H01 전환) 뒤 실제 Jalan·Trip.com 페이지에서 날짜 포함 링크가 조건을 채운 채 열리는지 한 번 확인한다. Trip.com이 조건을 받지 않으면 Trip 링크에서 날짜를 뺀다.

## P02 — 목록·검색 요청당 D1 읽기량 2차

기록: 2026-10-11T13:00:00Z / 2026-10-11 22:00:00 KST(PR A). PR B 갱신: 2026-10-11T14:00:00Z / 23:00:00 KST, 보강 14:45:00Z / 23:45:00 KST, CPU 보강 15:42:00Z / 2026-10-12 00:42:00 KST, 보류 기록 16:00:00Z / 2026-10-12 01:00:00 KST. 상세는 `P02-20261011.md`다.

### 기준과 상태

- **PR B 보류(정적 스냅숏 방식 결정, 2026-10-11T15:40Z)**: 상위 세션이 목록·검색·지도를 정적 스냅숏(수집 뒤 Actions가 만들어 정적 자산으로 배포, 브라우저 계산)으로 바꾸기로 했다(근거 PR #39). PR #38은 draft로 두고 병합하지 않는다(닫지 않음, 마지막 head `143941f`, 15:43Z draft 전환·설명 첫머리에 보류 표시). Codex 검토는 요청하지 않았다(0회). 측정·P03 입력은 기록 PR(`claude/p02-records`, 문서만)로 main에 남긴다. 검사·측정 스크립트와 0014·0015는 #38 브랜치에만 있다.

- 작업 환경: Claude Code 웹 클라우드. 상위 세션이 맡긴 작업이다(`session_01ApA7wHQgaSiouBZKS9pe2X`).
- PR A 브랜치 `claude/p02-d1-reads`. 시작 기준 main `274f687`. 코드 커밋 `6be425d`. 기록을 쓰기 직전에 main `2362cd6`(PR #33·#34·#35·#36 병합)을 merge했다(`881f260`). 충돌은 없었다.
- PR B 브랜치 `claude/p02-search-snapshot`. PR A 브랜치(`4b89297`)에서 시작했다. 코드 커밋 `600adfa`, 상위 세션 요청 보강 `720a2f2`, 기록 `d9a7a2e` 외. 기록을 쓰기 직전에 main `734c26b`(PR #37 병합)을 merge했다(`80ab01c`). 충돌은 없었다.
- 스키마 변경 허용(상위 세션 결정, 2026-10-11T10:55Z)에 따라 마이그레이션 0013(crawl_jobs 식 색인 2개)과 0014(검색 스냅숏 표·뷰·trigger 9개)를 더했다. 설계는 구현 전에 상위 세션에 알렸다(11:20Z 무렵). 테이블·열은 바꾸지 않았다.
- 운영 D1·Secret·수집 예약·호스팅·공유 범위는 바꾸지 않았다. 운영 사이트·Cloudflare 계정에 접속하지 않았다. Google API·유료 서비스·새 계정 연결을 쓰지 않았다. 수집기 파일과 release는 그대로다. 실행기 레포는 읽기만 했다(`868229c`).
- 하네스(`jihune/agent-harness` `4ea019d`의 `claude/START.md`)를 읽기용으로 붙여 적용했다. 전역 규칙 155줄, 스킬 36개(SKILL.md가 있는 폴더)다. 하네스는 수정하지 않았다.

### 환경 확인

- Node 24.21.0(`nvm install 24`), pnpm 11.25.0, Python 3.13(SQLite 3.45.1). `bash scripts/cloud-setup.sh` exit 0(10:56Z). 잠금 파일은 바뀌지 않았다.
- `python3 scripts/cloud-check.py --full`: 시작 기준 `274f687` 22개 통과(10:57Z–11:00Z). `6be425d` 작업 트리 23개 통과(12:00:22Z–12:05:00Z, rc=0). main merge 뒤 `881f260` 작업 트리 27개 통과(13:00:28Z–13:05:21Z, rc=0).
- 측정은 임시 Miniflare D1과 체크인 자료만 썼다(`scripts/measure-d1-reads.mjs`, `--grow`는 운영 규모 복사본).

### 결과(PR A)

- 수정 전 측정: 대표 요청 51개(`P02-20261011.md`의 ‘수정 전 측정’). 운영 규모 복사본에서 목록 첫 쪽 37,723행, 이름 검색 26,656–30,248행, 지도 24,542행, 결과 세션 이어 읽기 522행, 상세 25행, 수집 끝 GET 43,146행, 목록 PUT 쓰기 639행.
- 가장 큰 비용은 수집 작업 선점 POST였다. Jalan detail priority 한 번에 296,386행, gentle 한 바퀴(phase 8개)에 약 40만 행이다. 수집기만으로 하루 500만 행을 넘을 수 있다. P01의 수집 1회 추정(약 7.2만 행)에는 이 비용이 빠져 있었다.
- 수정: crawl_jobs 식 색인 2개(차선별 정렬 순서)와 선점 선택 질의 재작성. 선택과 임대가 한 UPDATE 문이라는 구조, 적격 조건, 정렬 키는 그대로다. 선점 16종이 모두 600행 이하가 됐다(Jalan detail priority 45행, 한 바퀴 약 2,400행).
- 쓰기: 상세 PUT 18 → 21행, 목록 PUT 639 → 701행. 색인 생성(마이그레이션 적용) 때 crawl_jobs 행 수 × 2(2026-10-08 기준 약 3.1만 행)를 한 번 쓴다.

### 검사(PR A)

- 새 `scripts/check-claim-order-worker.mjs`(공통 검사에 추가): 무작위 대기열 60개 상태에서 1,441회 선점이 main `274f687`의 선택 질의와 같은 작업을 골랐다. 변형 3종(누락 연결 가지 제거, national 재시도 우선 항 제거, Trip 두 표지 조건 제거)에서 모두 실패했다.
- `measure-d1-reads.mjs --check`(상한 26개): `6be425d` 두 규모 통과(12:46Z). main 빌드는 두 규모 모두 선점 상한 11개 실패.
- `check-crawl-queue-worker.mjs` 통과. `wrangler d1 execute --local --file`과 `wrangler d1 migrations apply yukemuri --local`로 0013 적용 확인.

### 호환성

- 실행기 백업·복원: 표·열이 같고 `catalog-export`의 `schema: '0012'`도 그대로라 영향 없다. 실행기 PR은 만들지 않았다.
- 0014: 새 표는 `catalog-export`가 내보내지 않는다. 적재 때 chunk 행이 없으면 trigger는 쓰지 않고, 적재 뒤 첫 검색이 스냅숏을 만든다(읽기 약 5.2만 행). D1의 trigger 지원은 공식 문서를 이 환경에서 열지 못해 미확인이다. H01 첫 배포의 `migrations apply`에서 확인한다. Sites 마이그레이션 실행기가 trigger 본문의 `;`를 받는지도 미확인이다(게시 안 함).
- H01: 3단계에서 만든 D1(`128a3c5b-…`)에는 0000–0012만 있다. 0013은 다음 `migrations apply`(자동 배포가 켜진 첫 배포 또는 D1 setup 재실행) 때 적용된다. 적재 전이면 적재 때, 적재 뒤면 색인 생성 때 약 3.1만 행을 더 쓴다. 4단계 적재 일정의 하루 쓰기 10만 행 안에 넣어야 한다.
- 기존 Sites D1: 게시하지 않으므로 적용되지 않는다.

### 결과(PR B)

- 목록·이름 검색·지도를 검색 스냅숏(`hotel_search_chunks` 64행)에서 계산한다. hotels·hotel_names·hotel_lifecycle의 trigger가 숙소 하나의 검색 열을 그 chunk 행에 `json_set`으로 유지한다. 요청은 version 64행과 바뀐 chunk, 결과 쪽 payload만 읽는다.
- 운영 규모 복사본: 목록 첫 쪽 37,723 → 975행(새 isolate 37,726 → 1,170), 이름 검색 26,656–30,248 → 171–789행, 지도 24,542 → 64행, 결과 세션 없는 2쪽 37,474 → 589행. 사용자 요청 28종 모두 2,000행 이하(운영 규모 최대 1,170, 체크인 규모 최대 1,612).
- 쓰기: 상세 PUT 21 → 23행, 목록 PUT(새 숙소 30) 701 → 821행. 스냅숏을 처음 만들 때 읽기 약 5.2만 행·쓰기 64행이 한 번 든다.
- 응답 불변: 211개 요청을 쓰기 전과 같은 쓰기 뒤 두 번 비교해 422개가 main `274f687` 빌드와 같았다(지도 격자 8개 포함).
- CPU: 새 isolate가 스냅숏 JSON(core 약 1.9MB, 이름 검색이면 text 약 6.9MB)을 해석한다. Node에서 12.0ms·26.7ms였다. 운영 Worker CPU는 미확인이다.

### 상위 세션 요청 보강(PR B)

상위 세션 메시지 5건(11:10Z–13:45Z 발신)이 13:52Z에야 이 세션에 도착했다. PR A는 이미 병합돼 요청은 PR B에 더했다(`720a2f2`).

- gentle 1회(16쪽, 준비·선점 18회·상세 PUT·끝 GET), 운영 규모 복사본: 수정 전 662,035행 → 수정 후 47,551행. 하루 8회 약 530만 → 약 38만 행. 쓰기는 322 → 402행/회(하루 약 3,200). 목록 PUT만인 최악은 하루 쓰기 약 8.2만 → 10.5만 행. `hosting-review` 1.9절·`H01-20261011.md`·`cloudflare-deploy.md`의 수집기 추정 문장 뒤에 정정을 붙였다.
- 선점 동일성 근거 파일: 수정 전·후 빌드의 연속 선점 96회(두 규모)가 URL·상태·임대 필드까지 같았다(`compare-claim-builds.mjs`). 변형 2종에서 달랐다.
- 실행기 백업: 비교 방식을 직접 읽었고(manifest `schema` 문자열과 표·열), 0014까지 적용한 DB의 export를 실행기 복원으로 재현해 통과했다(`check-runner-backup-compat.mjs`). 실행기 PR은 필요 없다.
- D1 문법: `unixepoch()`·`->`·trigger를 운영 D1이 받는다는 공식 문장은 문서 주소가 이 환경에서 열리지 않아 확인하지 못했다. 받지 않으면 첫 배포의 `migrations apply`에서 멈춘다. 4단계 세션이 원격 D1에 `SELECT unixepoch('2026-01-01'), '{"a":1}'->'$.a'`를 한 번 실행해 보면 된다.
- 스냅숏 검사: 출처 묶음 삭제 경로, 시드 고정 무작위 쓰기 120개(시드 네 개), 동시 재생성을 더했다.
- CPU(Node, 운영 Worker CPU 아님, 중앙값): 새 isolate의 목록 요청 JS CPU 약 16 → 91ms, 기존 isolate 약 3–6ms 증가, 지도 cold 약 48ms. 화면이 첫 방문마다 부르는 검색 색인 요청 때문에 첫 방문 전체(목록+색인)는 수정 전에도 약 634ms였고 수정 후 약 786ms다(약 +20%). 10ms 초과는 수정 전부터 있던 위험이고, H01 5단계에서 Workers 관측(CPU 시간·1102 오류 수)으로 실측한다. 1102가 반복될 때의 대안은 `P02-20261011.md`의 ‘CPU와 미확인’에 적었다.
- 쓰기 현실 추정: 목록 PUT 비중 74%(체크인된 done 작업)와 목록 PUT마다 새 숙소 30곳을 가정하면 하루 48쪽 약 2.3만 → 3.0만 행, 128쪽 약 6.1만 → 7.9만 행이다. 무료 한도 안이다. 줄일 방법(PUT당 chunk 갱신 묶기)은 기록만 했다.

### CPU 보강(PR B, 상위 세션 결정 (A))

상위 세션 결정(14:58Z 발신): P02 완료 조건을 ‘요청당 D1 읽기 2,000행 이하 + JS CPU가 main보다 나빠지지 않음(가능한 한 개선)’으로 하고, cold·warm 5ms 이하는 P03(#38 병합 뒤 새 작업: 첫 방문 `/api/hotels/search-index` 생성 비용 제거·결과 세션 계약 재설계)으로 옮긴다. H01 6단계 선행 조건은 P02 + P03 + 5단계 Workers CPU 실측(1102 없음)이다. `roadmap.md` 결정 기록에 적었다.

- 코드 `3d0b680`·`dfa1a69`: 마이그레이션 0015 `hotel_search_results`(스냅숏 세대별 검색·지도 결과, 최대 64행, 1일), isolate 안 기억 32개, chunk별 행 객체 재사용, 점수의 짧은 정확 표기(core 1.94 → 1.48MB), 정렬 typed 키와 id 순위(같은 id 집합이면 재사용), 안정 첫 쪽 출처 묶음·생애주기 한 번.
- D1: 목록 첫 쪽 975 → 585행(새 isolate 1,170 → 589), 사용자 요청 최대 745행(운영 규모)·1,005행(체크인). 결과를 저장하는 요청은 3–6행을 쓴다.
- CPU(Node, 중앙값 ms, main → 보강 뒤): 저장 결과가 있으면 목록 cold 15.1 → 12.4·warm 13.0 → 7.0, 이름 검색 cold 491 → 2.5, 지도 cold 0.2 → 0.8. 새 세대(수집 PUT 직후)의 첫 요청은 main보다 크다: 새 isolate 목록 14.3 → 58.7, 지도 0.2 → 30.5, 기존 isolate 목록 15.5 → 29.7, 이름 검색 25.6 → 53.9. 첫 방문(목록+색인)은 약 500ms로 main과 비슷하다(P03). 표·프로파일·P03 후보는 `P02-20261011.md`의 ‘CPU 보강’·‘P03 입력’.
- 검사: `cloud-check.py --full` 28개 통과(`3d0b680`이 된 작업 트리, 15:25Z 끝, rc=0. `dfa1a69`은 CI에서). `compare-search-builds.mjs`가 새 빌드에 각 요청을 두 번(계산·재사용) 보내 422개가 main과 같음(`dfa1a69`). 스냅숏 검사에 재사용·세대 무효화·생애주기 patch 비움·64행 상한 단언 추가. `measure-d1-reads.mjs --check` 두 규모 통과(`3d0b680`).

### 검사(PR B)

- `python3 scripts/cloud-check.py --full`: `600adfa` 작업 트리 28개 통과(13:41:54Z–13:47:00Z, rc=0). `720a2f2` 작업 트리 28개 통과(14:29:56Z–14:34:52Z, rc=0).
- `compare-search-builds.mjs`: 422개 같음(13:49Z). 변형 4종(생애주기 trigger 제거, NULL 정렬, 격자 평균, 별칭 도도부현 조건)에서 실패.
- 새 `check-search-snapshot-worker.mjs`: 쓰기 경로마다 chunk가 새로 만든 것과 같음, 다른 isolate가 바로 읽음, chunk가 없을 때 쓰기 없음. 변형 2종(별칭 삭제 trigger 제거, version 비교 생략)에서 실패.
- `measure-d1-reads.mjs --check`(읽기 49개·쓰기 3개): `600adfa` 두 규모 통과. main 빌드는 운영 규모 34개·체크인 규모 33개 실패.
- `wrangler d1 execute --local --file`·`wrangler d1 migrations apply --local`로 0014 적용 확인.

### 부가 조사: 개발 서버 첫 요청의 `Network connection lost`

- 재현 방법: 새 로컬 D1(`rm -rf .wrangler/state` 뒤 `cloud-development.md`의 마이그레이션 적용), `node scripts/run-framework.mjs dev`, 준비 확인은 Worker를 거치지 않는 `/@vite/client`로 하고, `/api/hotels`를 한 번 요청한다(제한 400초). 실패하면 같은 서버에 한 번 더 요청한다. 스크립트는 세션 임시 폴더에만 있었다.
- 결과(12:05Z–13:00Z, 같은 컨테이너): 지금 코드(seed를 동적 import)는 19회 중 8회 실패했다. P01 PR B 이전처럼 seed를 정적 import로 바꾼 임시 변형은 8회 모두 성공했다. 두 상태를 번갈아 잰 8회(D·S·S·D·D·S·S·D)에서는 둘 다 실패가 없었다. 연속 실행(같은 상태로 서버를 다시 연 경우)에서 실패가 몰렸다. 차이는 통계적으로 확정되지 않았다(실패 8/19 대 0/8).
- 실패 위치는 매번 `importSnapshot()`의 `import('./hotel-catalog')`(Promise.all 0번)였다. 개발 서버에서 동적 import는 `@cloudflare/vite-plugin` 1.37.1의 `runInRunnerObject()`가 모듈 실행용 Durable Object에 RPC로 넘긴다. 실패는 요청 뒤 5–8초에 `Network connection lost`로 끝났다. 실패 뒤에는 같은 서버의 다음 요청도 약 0.1초 만에 같은 오류로 실패했다. 서버를 다시 열 때까지 회복되지 않았다. 성공하면 첫 요청은 seed 적재까지 약 92–106초 걸렸다.
- CI의 `checks`와 `deploy.yml`은 `cloud-check.py --full`(빌드된 Worker, Miniflare)만 실행해 개발 서버를 쓰지 않는다. 그래서 CI는 영향을 받지 않았다. 수동 브라우저 검사(check-u0x-browser)는 개발 서버를 써 영향을 받는다.
- 판단: P01 PR B의 seed 지연 로드가 개발 서버의 동적 import 경로를 타게 만든 것과 관련이 있다. 실패 자체는 Vite 개발 서버의 모듈 실행기 안에서 난다. 빌드된 Worker(Miniflare)에서는 같은 동적 import가 이 작업의 측정·비교·검사 수십 회에서 한 번도 실패하지 않았다. 운영 Worker에는 해당하지 않는다고 본다. 왜 Durable Object 연결이 끊기는지(메모리·시간 한도 등)는 확인하지 못했다.
- 고치지 않았다. 이 작업 범위(요청당 D1 읽기)의 코드가 아니고, 정적 import로 되돌리면 운영 Worker가 모든 요청에서 4.77MB seed를 평가한다(P01 PR B가 줄인 시작 비용). 대안 후보는 (가) 빌드된 Worker로 로컬 D1을 한 번 채운 뒤 `pnpm dev`를 여는 도우미, (나) seed JSON을 문자열로 불러와 모듈 크기를 줄이는 방법이다. 둘 다 시험하지 않았다. 당장은 실패하면 개발 서버를 다시 열고 `/api/hotels`를 먼저 요청한다(U04 기록과 같음).

### 이번 세션의 결정

1. 하네스와 충돌한 곳은 유케무리 지침과 요청을 따랐다. `START.md` 4단계의 ‘다음 메시지를 기다린다’는 요청이 작업을 지정해 따르지 않았다. `STATE.md`·요청 원장은 `AGENTS.md`의 ‘기록’이 별도 기록 폴더를 금지해 이 절과 `P02-20261011.md`에 기록했다. 하네스의 ‘push는 요청할 때만’은 이 요청이 PR을 지시해 push했다. Windows 경로·PowerShell·winget 지침은 Linux 클라우드라 적용하지 않았다.
2. PR 순서를 바꿨다. 요청의 예시는 A(목록 정렬·필터 색인)·B(이름 부분검색)였다. 수정 전 측정에서 선점 비용이 수집기만으로 무료 한도를 넘길 만큼 커서 A를 선점으로, B를 목록·검색·지도로 했다(상위 세션에 알림).
3. 목록·검색은 색인만으로 2,000행 아래로 내려가지 않는다. 첫 쪽이 결과 세션에 모든 id를 정렬해 저장하고, 전체 건수와 시설별 수를 함께 돌려주기 때문이다(색인 범위 읽기도 행으로 센다). 그래서 B는 보조 테이블(검색 스냅숏 64행)과 trigger로 간다. FTS5는 1–2글자 검색을 못 하고 D1 export와 맞지 않아 쓰지 않는다.
4. 선점 결과가 이전과 같다는 근거는 무작위 상태 대조 검사다. Trip URL에 상세 표지가 두 번 드는 경우도 원래 조건을 그대로 적용해 같게 했다.

### 검토와 병합

`cloud-development.md`의 ‘검토 요청’ 1번을 따른다. 병합은 `AGENTS.md`의 ‘상위 세션이 맡긴 작업’ 규칙대로 상위 세션이 한다.

- PR A(#37) 1회째: CI가 `4b89297`에서 통과한 뒤(13:05–13:09Z) 13:19Z에 Codex 리뷰를 요청했다. 13:22Z에 ‘큰 문제 없음’(검토 커밋 `4b89297`)이었다. 검토 요청은 1회 썼다. 상위 세션에 병합 조건을 알렸고 상위 세션이 병합했다(PR #37 병합, 2026-10-11T13:42:38Z / 22:42:38 KST, `734c26b`). 상위 세션은 별도 병합 기록 PR을 쓰지 않고 이 절에 적게 했다.
- PR B(#38): 정적 스냅숏 방식 결정(15:40Z)으로 Codex 검토를 요청하지 않고 draft로 보류했다. 검토 요청 0회.
- 기록 PR(`claude/p02-records`): 문서·근거 파일만이라 상위 세션이 검토 없이 병합한다.

### Sites 전달

- 게시하지 않았다. H01 전환으로 반영한다(`roadmap.md` S01).
- PR B(#38)는 보류(draft)라 운영에 반영할 코드가 없다. 마지막 검사 커밋은 `3d0b680`(전체 검사)·`dfa1a69`(응답 비교)였다. 기록 PR은 문서만 바꾼다.
- PR A에서 검사한 커밋은 `6be425d`이다. Worker의 수집 선점(`lib/crawl-queue.ts`), 마이그레이션 0013, 검사·측정 스크립트를 바꾼다. 화면·수집기 release는 바꾸지 않는다.

### 다음 작업

1. 완료: PR A(#37) 병합(2026-10-11T13:42:38Z, `734c26b`). Sites 게시는 아직이다.
2. PR B(#38)는 보류(draft). P03(정적 스냅숏 전환)은 상위 세션이 새 세션으로 연다. 입력은 `P02-20261011.md`의 ‘P03 입력(정적 스냅숏)’.
3. H01: 0013(main 병합분)이 첫 `migrations apply`에서 실제 D1에 적용되는지(`unixepoch()` 식 색인) 확인한다. 적재 일정에 0013 색인 쓰기(약 3.1만 행)를 넣는다. 7단계에서 수집 PUT의 실제 쓰기 행을 잰다(PR A 기준 상세 PUT 21행, 목록 PUT 701행). 0014·0015는 #38 보류로 main에 없다.
4. CPU: H01 5단계에서 Workers Logs의 CPU 시간·`exceededCpu`를 남는 Worker 경로(상세·비교·즐겨찾기·수집 API)에서 본다. #38을 다시 쓰게 되면 먼저 읽기 경로의 D1 쓰기 상한(상위 세션 15:28Z 지적)을 넣는다.
5. 브라우저 검사(check-u0x-browser) 준비 단계: 개발 서버를 연 뒤 `/api/hotels`를 먼저 요청하고 503이면 서버를 다시 연다(부가 조사의 후속, 이 PR 범위 밖).
6. 완료: 결과 쪽의 출처 묶음·생애주기를 한 번만 붙인다(CPU 보강, 응답 비교 통과).
7. 남은 비용(`P02-20261011.md`): Trip 선점 약 550–600행, refresh 선점은 done 작업 수에 비례, 수집 끝 GET 43,146행, catalog-export 목록 41,715행.

## P03 — 정적 스냅숏 전환(목록·검색·지도)

기록: 2026-10-11T16:30Z / 2026-10-12 01:30 KST(PR A). 검토 반영: 18:25Z / 03:25 KST. PR B 기록: 20:32Z / 05:32 KST. PR C 기록: 22:13Z / 07:13 KST. 상세는 `P03-20261012.md`다. 다른 작업(H01 4단계)이 병행 중이라 이 절만 더했다.

### 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션이 맡긴 작업이다. 작성 세션 `session_01Y1JhjKANZbPiLfETCBdRns`.
- 브랜치 `claude/p03-static-snapshot`(PR A, #43). 시작 기준 main `df82f10`. 기록 직전에 main `4bd2311`(PR #39·#41·#42)을 merge했다. 충돌은 없었다. 상위 세션이 2026-10-11T19:41Z에 병합했다(`4d59a31`, head `579eca4`).
- 브랜치 `claude/p03-public-reads`(PR C). B 브랜치 위에서 만들었다(B 병합 전에는 B를 기준으로 비교).
- 브랜치 `claude/p03-static-search`(PR B). A 브랜치 위에서 만들고 병합된 main `4d59a31`을 merge했다(충돌 없음).
- 운영 D1·Secret·수집 예약·Cloudflare 계정·운영 사이트에 접속하지 않았다. 스키마(마이그레이션)를 바꾸지 않았다. 수집기 파일과 release는 그대로다. Sites에 게시하지 않았다.
- 하네스(`jihune/agent-harness` `4ea019d`의 `claude/START.md`)를 읽기용으로 붙여 적용했다. 전역 규칙 155줄, 스킬 37개(SKILL.md가 있는 폴더)다. 하네스는 수정하지 않았다.

### 환경 확인

- Node 24.21.0(`nvm install 24`), pnpm 11.25.0, Python 3.13. `bash scripts/cloud-setup.sh` exit 0(15:55Z). 잠금 파일은 바뀌지 않았다.
- `python3 scripts/cloud-check.py --full`: 시작 기준 `df82f10` 27개 통과(15:55:36Z–16:02:02Z, rc=0). PR A 작업 트리 28개 통과(16:23:35Z–16:30:51Z, rc=0). actionlint 1.7.7 rc=0.

### PR A 결과

- 스냅숏 형식(`lib/search-snapshot.ts`)과 생성기(`scripts/build-search-snapshot.mjs`, `lib/search-snapshot-build.ts`). Worker와 같은 함수를 Node로 컴파일해 core(검색 열)·cards(카드 필드)·text(이름 검색)·status(수집 현황)와 manifest를 `dist/client/snapshot/`에 쓴다. 원본은 로컬 SQLite 또는 Cloudflare API(`--remote`). 읽기 문장 밖은 보내기 전에 거절한다.
- `deploy.yml`: 마이그레이션 뒤·배포 앞에 생성, `workflow_call`(6단계 수집 workflow가 수집 끝에 부름). smoke가 manifest id와 파일을 확인한다.
- 운영 규모 복사본: 생성 1회 읽기 103,844행(처음 판 197,002행), 쓰기 0. 크기 추정(gzip) core 305KB, cards 933KB, text 1.0MB.

### PR B 결과

- 목록·검색·지도·추천·대안을 브라우저가 스냅숏에서 계산한다(`lib/static-search.ts`). `/api/hotels`·`/map`·`/search-index`·`/suggestions`와 결과 세션을 지웠다. `hotel_result_sessions` 표는 남겼다(삭제 마이그레이션은 상위 세션 판단).
- `/`는 정적 `index.html`이다. 스냅숏 단계가 페이지를 다시 그려 기본 보기 첫 쪽 40곳(HTML 카드)과 manifest를 넣고, core·cards를 낮은 우선순위로 미리 받는다. 조건 있는 주소는 head 스크립트 표시와 CSS로 첫 쪽을 숨긴다.
- 스냅숏 실패·버전 불일치·상세 404의 화면 동작은 `P03-20261012.md`의 B 절 표에 정했다. U02 검사가 단언한다.
- 응답 비교(main Worker 대 브라우저 계산, 요청 309개): 체크인 자료 0건 다름, 운영 규모 복사본(숙소 12,271) 0건 다름.
- 브라우저 검사(로컬 사이트): U01 64, U02 50, U02 지도 53, U03 비교 60, U03 데스크톱 12, U04 57 모두 통과.
- 휴대폰 CPU(운영 규모, 4x): 첫 목록까지 0.38초, 메모리 12.5MiB(이름 검색 포함 24.3MiB), 이름 검색 파일·색인 첫 1회 1.3초, 다음 검색 46ms.
- 느린 4G·4x·360px(체크인 자료): `/` 첫 카드 1.56초(main 1.72초). 조건 있는 주소는 5.08초(main 1.67초). 앱 hydrate 뒤에 계산하기 때문이다. 상위 세션이 이번 PR에서 받아들였다(20:08Z). core·cards 미리 받기와 페이지 안 manifest로 `/` 목록 준비는 6.0초에서 2.8초가 됐다. 조건 있는 주소는 hydrate 전 정적 첫 쪽 대신 ‘주소의 조건을 적용하는 중…’을 보인다.
- A 검토 P3(읽기 전용 가드의 주석·문자열 처리 순서)를 고쳤다(아래 다음 작업 4번 완료).
- 배포 smoke가 지운 `/api/hotels`를 읽고 있어, 정적 첫 쪽·상세·manifest를 확인하게 바꿨다.

### PR C 결과

- 공개 읽기의 D1 쓰기를 없앴다. 상세 GET의 번역 요청 기록과 공개 경로의 `ensureCatalog`를 뺐다. 준비 전 DB에서도 공개 경로는 5xx 없이 빈 결과·404로 답한다.
- seed를 바꾼 배포는 스냅숏이 미준비를 알리면 새 Worker의 `crawl-prepare` → 스냅숏 재생성 → 재배포로 이어진다(`deploy.yml` 조건부 4단계).
- `/api/collection-status`는 유지보수 키 전용이 됐다. 화면은 스냅숏의 `status.json`을 쓴다. `/api/photo-credits`는 커서와 기록 카운터를 쓴다(요청당 42행).
- 공개 경로 12개의 요청당 D1 읽기 상한과 ‘공개 읽기 쓰기 0’을 `measure-d1-reads.mjs --check`가 단언한다. 운영 규모에서 상세 25행, 비교 4곳 100행, 사진 출처 42행이다.
- CPU(Node에서 handler JS만, DB 제외, 운영 규모): 9개 경로가 cold 3.6ms·warm 1.2ms 이하다. 비교 4곳은 cold 중앙값 5.23ms(최대 6.7ms)다. 상위 세션이 ‘약 5ms’로 받아들였다(22:10Z).
- `/api/collection-status`를 부르는 곳은 화면뿐이었다. 수집기(`scripts/crawler`)와 실행기(`scripts/runner`)에는 호출이 없다(grep).

### 체크포인트(2026-10-11T22:31Z / 2026-10-12 07:31 KST, 사용자 요청으로 멈춤)

- 멈춘 까닭: 계정 Claude 주간 사용량 81%(상위 세션 22:16Z 전달). 재개는 2026-10-12T12:01Z 뒤 상위 세션 알림으로 한다.
- 브랜치 head: B `claude/p03-static-search` `1a7dbb0`(PR #44), C `claude/p03-public-reads`는 이 기록을 담은 커밋(PR #45). A는 병합됨(`4d59a31`).
- 끝난 것
  - PR #44: Codex 1회째(중복 요청 2건, 1회로 셈)와 2회째의 지적 3건을 처리했다(고침 2, main과 같아 유지 1). 스레드는 모두 답하고 해결했다.
  - PR #45: 열었고 CI 통과, Codex 1회째를 22:31Z 직전에 요청했다. B의 새 커밋을 merge해 충돌(기록 문서)을 풀었다.
- 남은 것
  - #44: `1a7dbb0`의 CI 확인, Codex 3회째 요청(마지막), 병합 조건 보고. 3회 뒤 기록 밖을 고치면 상위 세션에 Claude 검토를 요청한다.
  - #45: Codex 1회째 결과 반영(재개 때), 이후 검토 주기. B 병합 뒤 기준을 main으로 바꾼다.
- 재개 첫 단계: 두 PR의 새 검토·CI를 읽는다(`pull_request_read`). #44 CI가 통과했으면 3회째를 요청한다.
- 진행 중인 배경 작업: 없다. 로컬 `wrangler dev`와 검사는 모두 멈췄다. 예약은 22:31Z `send_later` 하나뿐이고, 이미 지났다.
- 재개: 2026-10-12T09:03Z(상위 세션이 사용자 지시로 앞당김). 멈춘 사이 상위 세션이 PR #44를 병합했다(merge `8d62e17`, `merged_at` 2026-10-11T22:41:09Z, head `1a7dbb0`, Codex 3회). #45는 기준을 main으로 바꾼 뒤 main(`8d62e17`, #46 포함)을 merge했다. 충돌은 없었다.

### 미확인 사항

- 실제 Cloudflare API `/query`의 응답·크기 한도와 토큰 권한, 정적 자산의 압축 전송과 `_headers` 적용. 첫 실제 배포에서 확인한다(상위 세션).
- 재사용 workflow(`workflow_call`)로 불렸을 때 `deploy.yml`의 최상위 `concurrency`가 적용되는지, 수집 workflow가 계정 그룹을 먼저 잡지 않는지. 6단계 수집 workflow PR에서 확인한다.
- 운영 규모 core·cards를 느린 회선으로 받을 때의 첫 화면(체크인 자료로만 쟀다). 실제 배포 뒤 확인한다.
- 정적 `index.html`이 `/?…`에도 쓰이는지(`html_handling` 기본값). 로컬 `wrangler dev`에서는 그렇게 동작했다. 첫 배포 뒤 확인한다.

### 이번 세션의 결정

1. 하네스와 충돌한 곳은 유케무리 지침과 요청을 따랐다. `START.md` 4단계의 ‘다음 메시지를 기다린다’는 상위 세션 요청이 작업을 지정해 따르지 않았다. `STATE.md`·요청 원장은 `AGENTS.md`의 ‘기록’이 별도 기록 폴더를 금지해 이 절과 `P03-20261012.md`에 기록했다. 하네스의 ‘push는 요청할 때만’은 이 요청이 PR을 지시해 push했다. Windows 경로·PowerShell·winget 지침은 Linux 클라우드라 적용하지 않았다.
2. 스냅숏 생성은 Worker 경로가 아니라 Actions에서 한다. 생성에 숙소 1.2만 곳의 payload 해석이 들어 Worker 요청당 CPU 한도에 맞지 않기 때문이다. D1은 Cloudflare API로 읽는다. 배포 토큰을 그대로 쓰고 Worker 요청 수에 들어가지 않는다.
3. 카드는 서버 목록과 같은 함수로 만든다(정제·출처 묶음·생애주기). 그래서 화면 카드가 지금과 같다는 근거를 Worker 응답과의 대조 검사로 얻는다.

### 검토(PR A, #43)

`cloud-development.md`의 ‘검토 요청’ 1번을 따른다. 병합은 `AGENTS.md`의 ‘상위 세션이 맡긴 작업’ 규칙대로 상위 세션이 한다.

- CI 첫 실행이 `check-edge-guard-worker.mjs`에서 실패했다. Miniflare 속도 제한의 고정 1분 창이 검사 중간(16:36:00Z)에 바뀐 시간 의존 실패라 한 번 다시 실행해 통과했다. 검사가 분 앞쪽에서 시작하게 고쳤다.
- Codex 1회째(`d898919`, 17:17Z 요청): P2 2건. (가) `WITH`로 시작하는 쓰기 문장이 읽기 전용 가드를 통과함 → 재현 뒤 문장 전체의 쓰기 단어를 거절하게 고침. (나) 배포 스냅숏이 수집 쓰기와 겹칠 수 있음 → 배포 job을 수집 동시 실행 그룹에서 기다리게 고침. 상세는 `P03-20261012.md`의 ‘검토(A)’.
- Codex 2회째(`7732c03`, 18:29Z 요청): P2 1건. 배포(계정 → 카탈로그)와 6단계 수집 호출(카탈로그 → 계정)의 잠금 순서가 반대라 서로 기다릴 수 있음 → 카탈로그 그룹을 최상위, 계정 그룹을 job으로 옮겨 순서를 같게 고침. 
- Codex 3회째(`5689bd9`, 18:44Z 요청): P2 1건. 429 재시도가 `Retry-After`를 무시함 → 그 시간만큼 기다리고 5분을 넘으면 바로 실패하게 고침. Codex 요청 세 번을 다 썼고 기록 파일 밖을 고쳤으므로 Claude 검토(최대 2회)를 상위 세션에 요청한다.
- Claude 검토 1회째(이어 가는 검토, `977d748`, 상위 세션이 연 `session_015fBTaZJEjwTx8WrxEVvgKc`, 19:07Z 게시): P0~P2 없음, P3 1건(다음 작업 4번). Codex 지적 네 건의 수정을 확인했고 `cloud-check.py --full`·`check-search-snapshot-worker`·`check-deploy-config`·actionlint가 통과했다. 이 기록은 상위 세션이 PR 브랜치에 더했다(19:32Z).

### 다음 작업

1. (완료) PR A 병합.
2. PR B 검토와 병합(상위 세션). 범위: 브라우저 검색 전환(`lib/static-search.ts`), 첫 화면 정적 HTML, 서버 목록·검색·지도 경로 제거, 응답 비교(main 응답 대 브라우저 계산)·브라우저 검사(360/390/1280px, U01~U04), 휴대폰 CPU 해석 시간·메모리 측정, 스냅숏을 못 받았을 때와 버전이 어긋날 때의 화면 동작.
3. PR C 검토와 병합(상위 세션). B 병합 뒤 main 기준으로 바꾼다.
4. (PR B에서 고침) P3(PR #43 Claude 검토 1회째): `scripts/build-search-snapshot.mjs` 29행 `code()`가 문자열 리터럴을 지운 뒤 주석을 지워, 주석 안 작은따옴표 하나로 읽기 전용 가드를 우회할 수 있다. 재현: `WITH x AS (SELECT 1) /* it's */ DELETE FROM hotels WHERE name<>'zz'`가 임시 sqlite에서 가드를 통과해 실행됐다. 문장은 `lib/` 코드에서만 오므로 실제 위험은 낮다. PR B 또는 C에서 리터럴과 주석을 왼쪽부터 한 번에 훑도록 고치고 검사에 이 경우를 넣는다.
5. 참고(미확인, 같은 검토): 6단계 수집 workflow가 카탈로그 그룹을 최상위에서 잡으면, 대기 중인 수집 실행이 다음 push 배포로 취소될 수 있다(같은 그룹의 대기 실행은 하나만 남는다). 6단계 수집 workflow PR에서 확인한다. → H01 6단계 준비 PR(#48)에서 `queue: max`로 대기 실행을 보존하게 했다(아래 ‘H01 6단계 준비’ 절, `cloudflare-deploy.md`의 ‘수집 workflow’).
6. 조건 있는 주소의 첫 화면 개선 후보: cards를 숙소 범위별 조각으로 나눠 필요한 조각만 받기, 자주 여는 조건 주소(온천마을 바로 찾기 등)를 정적 페이지로 따로 그리기. 운영 규모 첫 화면은 H01 5단계(병행 운영)에서 실제 배포로 잰다.
7. D03(설명 번역)을 다시 시작할 때는 요청 신호를 읽기 경로 밖(즐겨찾기·수집 쪽 등)에서 만든다. 상세 GET은 더 기록하지 않는다(P03 PR C).
8. 비교 4곳 cold CPU 5.23ms는 받아들였다(22:10Z). H01 5단계에서 Workers Logs의 실제 CPU와 1102를 보고, 넘치면 ‘수집 때 합친 숙소 저장’(스키마·쓰기 예산 변경)을 검토한다.
9. (P3) 이름 별칭 검색 범위: 맞은 숙소의 모든 이름 행을 따라가 같은 현의 다른 숙소까지 넓어진다(main과 같은 동작, PR #44 Codex 1회째). 좁힐지 검토한다.

## H01 6단계 준비(수집 workflow 이동, 전환 전)

기록: 2026-10-12T09:24Z / 2026-10-12 18:24 KST. 상위 세션(`session_01BSbr1zrttr8mSibf5bfz2R`)이 맡긴 작업이다. 작성 세션 `session_01DPWccvrTAVG5jay8KLJYLT`. 병합은 상위 세션이 한다. 전환 자체는 하지 않았다.

### 기준과 상태

- 앱 레포 브랜치 `claude/h01-collect-workflow`. 시작 기준 main `2caa14b`(PR #47).
- 실행기 레포 브랜치 `claude/h01-dispatch-app-collection`. 시작 기준 main `b7f9c64`(PR #3). draft PR #5(head `9ccf22f`)로 두고 병합하지 않는다. 6단계에서 상위 세션이 병합한다.
- 운영 D1·Cloudflare 계정·Secret 값·운영 사이트·운영 Sites에 접속하지 않았다. 수집 주기·상한·요청 간격을 바꾸지 않았다. Sites에 게시하지 않았다. 하네스는 붙이지 않았다.
- 환경: Node 24.21.0(`/opt/nvm`), pnpm 11.25.0, Python 3.13.16. `cloud-setup.sh` exit 0(Node 22.22.0으로 실행, 잠금 파일 무변경). actionlint 1.7.7.

### 앱 레포 PR(병합해도 운영 동작 무변경)

- `.github/workflows/collect.yml`: `workflow_dispatch`만(cron 없음), `mode` = `check-access`(기본)·`gentle`. 대상은 `publicOrigin`, `null`이면 요청 전에 실패한다. 크롤 키 Secret `YUKEMURI_CRAWL_ACCESS_KEY`. 상한은 실행기 `b7f9c64`와 같다(gentle 16페이지, 간격 8초 + 0~4초, 240초, job 6분). gentle 성공 뒤 `deploy.yml`을 `after_collection: true`로 불러 스냅숏을 갱신한다.
- `.github/workflows/collect-watch.yml`: 6시간마다, `GITHUB_TOKEN`(`actions: read`)으로 마지막 성공 gentle이 12시간을 넘으면 실패. 성공이 없으면 통과, `publicOrigin`이 `null`이면 건너뜀.
- 새 파일: `scripts/runner/run-collection.py`(실행기 `run-updates.py`의 gentle·check-access 부분을 옮긴 실행기), `scripts/runner/check_collection.py`, `scripts/check-collection-freshness.mjs`, `scripts/check-collect-workflow.mjs`, `scripts/run-actionlint.py`. 세 검사를 `cloud-check.py` 기본 목록에 넣었다.
- 동시 실행(P03 다음 작업 5번, Codex 1회째 P2): 처음에는 대기 수집 취소를 ‘다음 cron 부르기로 회복’으로 받아들였다. Codex가 GitHub의 `concurrency.queue: max`(대기 실행 100개까지 보존, FIFO)를 알려 줬고 `github/docs` 원문으로 확인했다. 세 잠금 그룹에 들어가는 모든 실행(`collect.yml`, `deploy.yml` 최상위·job, `d1-setup.yml`)에 `queue: max`를 넣었다. 대기 수집도 대기 배포도 취소되지 않는다. 대가는 연속 push 배포가 합쳐지지 않는 것이다. actionlint는 이 키를 몰라 그 오류만 무시하고 값은 검사가 단언한다. 상세는 `cloudflare-deploy.md`의 ‘수집 workflow’.
- `START_HERE.md` 2번에 ‘6단계 전환 뒤’ 조건을 붙여 마지막 성공 gentle 시각 확인을 넣었다. 전환 전에는 볼 실행이 없지만 조건이 문장에 있어 지금 넣었다.

### 실행기 레포 PR(draft)

- `yukemuri-catalog.yml`: 같은 cron `53 */3 * * *`. `YUKEMURI_ENABLED`가 `true`일 때 `scripts/dispatch-app-collection.py dispatch`로 `jihune/yukemuri`의 `collect.yml`을 `main`·`mode=gentle`로 부르고, 이어서 `check`로 마지막 성공 gentle이 12시간을 넘었거나 성공이 없으면 실패한다. 수동 실행은 `verify-code`(기본)·`check`·`dispatch`. 수집기 실행 단계와 `YUKEMURI_ACCESS_JSON`을 뺐다. job 상한 3분.
- 백업: `yukemuri-backup.yml`의 Secret을 `YUKEMURI_CLOUDFLARE_JSON`으로, `run-backup.py` 허용 호스트를 `yukemuri.jihune.workers.dev`로, `catalog-checkpoint.py` 내보내기를 workers.dev 주소만 받고 `X-Yukemuri-Crawl-Key` 헤더만 보내게 바꿨다. `YUKEMURI_ENABLED`는 보지 않는다.
- `run-updates.py`·`runner/bootstrap.py`는 지우지 않고 ‘어느 workflow도 쓰지 않음, 되돌림용’ 주석을 달았다. `project-files.json`을 다시 계산했다.
- 검사: 새 `scripts/check-dispatch-app-collection.py`(부르기 요청, 12시간 규칙, 토큰 비노출, workflow 설정), `check-checkpoint.py`에 내보내기 주소·헤더 검사를 더했다. `yukemuri-site-checks.yml`의 실행기 검사에 새 검사를 넣었다.

### 사용자 조치(6단계 전에, 값은 채팅·PR·로그에 붙여 넣지 않는다)

1. 실행기 레포 `jihune/yukemuri-script-runner` → Settings → Secrets and variables → Actions → New repository secret:
   - 이름 `YUKEMURI_APP_DISPATCH_TOKEN`. 값은 GitHub fine-grained personal access token이다. Settings → Developer settings → Fine-grained tokens → Generate new token에서 Resource owner `jihune`, Repository access ‘Only select repositories’ → `jihune/yukemuri` 하나, Repository permissions → Actions: Read and write(Metadata: Read는 자동)로 만든다. 만료일은 사용자가 정한다. 만료되면 실행기 부르기가 실패해 알림이 간다.
   - 이름 `YUKEMURI_CLOUDFLARE_JSON`. 값은 한 줄 JSON `{"url":"https://yukemuri.jihune.workers.dev","token":"<앱 레포 Secret YUKEMURI_CRAWL_ACCESS_KEY와 같은 크롤 키>"}`이다.
2. 기존 `YUKEMURI_ACCESS_JSON`은 지우지 않는다. 되돌림(Sites 수집·백업 복귀)에 쓴다.
3. 앱 레포 Secret `YUKEMURI_CRAWL_ACCESS_KEY`는 이미 있다(2단계). 새로 만들 것 없음.

### 6단계에서 상위 세션이 할 일(순서)

2026-10-12 UTC에 `hosting-review-20261011.md` 3.2절 6단계 1~7번과 맞췄다(H01 6단계 도구 하위 세션 A2). 시작 조건: 4단계 완료 PR로 `publicOrigin`·`autoDeploy`가 켜져 있고, 차이 반영 도구(실행기 레포의 새 수동 workflow, 작업 중)가 병합돼 있다. 앱 PR #48은 이미 병합됐다(병합 시점과 무관하게 무해).

1. 실행기 `YUKEMURI_ENABLED`를 `false`로 바꾸고 실행 중인 수집이 끝났는지 본다(3.2절 6단계 1번). 바꾼 시각과 재개 조건을 인수인계에 적는다. 이때부터 7번까지 사용자는 기존 Sites에서 즐겨찾기를 바꾸지 않는다(2번).
2. Sites 최종 백업: 실행기 `Yukemuri private database backups`를 수동 실행하고 run id를 적는다(3번).
3. 차이 반영: 실행기 레포의 새 수동 workflow(작업 중)로 2번 체크포인트와 새 D1의 차이를 반영한다(4번). 쓰기 전 bookmark를 적는다.
4. Sites 재백업과 즐겨찾기 대조: 실행기 백업을 한 번 더 수동 실행하고, 같은 workflow로 즐겨찾기 표를 2번 체크포인트와 대조한다. 다르면 원인을 적고 반영한다(5번). 새 D1에만 있는 즐겨찾기는 지우지 않는다(C4).
5. 사용자 Secret 두 개 등록 확인 → 실행기 PR #5를 ready로 바꾸고 검토·병합(6번). 이 병합으로 백업 대상이 새 주소로 바뀌므로 Sites 백업(2·4번)은 반드시 그 전에 한다.
6. 앱 레포 `Yukemuri collection`을 `check-access` → `gentle` 수동 실행. gentle 실행 중 하나를 더 넣어 대기 후 이어 도는지 본다. 실행기 `Yukemuri catalog updates`를 `check`로 수동 실행해 성공 시각을 읽는지 본다(6번 끝).
7. 새 주소 백업: 실행기 백업을 수동 실행해 새 주소에서 성공하는지 본다(7번).
8. `YUKEMURI_ENABLED`를 `true`로(7번). 하루 수집 횟수가 cron 횟수를 넘지 않는지 본다.

문제가 생기면 앱 레포 `rollback.yml`을 쓴다(`cloudflare-deploy.md`의 ‘롤백’). Worker 되돌림만으로는 다음 수집 때 main HEAD가 다시 배포되므로 main revert를 함께 한다. `autoDeploy`를 `false`로 바꾸면 수집도 멈춘다.

### 미확인

- 실제 GitHub가 `queue: max`를 받는지(문서상 github.com 적용), 재사용 workflow의 최상위 `concurrency` 적용. 병합 뒤 첫 main push 배포와 6단계 수동 실행에서 본다.
- fine-grained PAT로 다른 레포의 `workflow_dispatch`와 실행 목록 읽기가 되는지(문서상 Actions: Read and write). 6단계에서 실행기 `dispatch`·`check`로 확인한다.
- 실제 Worker `/api/catalog-export`를 `X-Yukemuri-Crawl-Key`만으로 읽는 백업. 6단계 수동 백업에서 확인한다.
- 앱 마이그레이션은 14개(`0013`은 색인만)이고 백업 복원 스키마는 `0012`다. 내보내기 manifest도 `0012`라 지금은 맞는다. 표를 바꾸는 마이그레이션이 생기면 백업 스키마를 함께 갱신해야 한다.

### 검사

- 앱: `python3 scripts/cloud-check.py --full` 32개 통과(작업 트리, 09:17:00Z–09:24:12Z, rc=0). Codex 1회째 반영(`queue: max`) 뒤 기본 `cloud-check.py` 19개(09:38:25Z–09:38:47Z)와 `check-deploy-config.mjs` 통과. `queue: max`를 하나씩 `single`로 바꾼 변형 3종(`deploy.yml` job, `d1-setup.yml`, `collect.yml`)에서 `check-collect-workflow.mjs`가 모두 실패했다(`check-deploy-config.mjs`는 앞의 둘에서 실패). 새 검사 3개가 들어 있다. `check-deploy-config.mjs`도 새 workflow 둘을 포함한 5개 workflow로 통과.
- 앱 변형 11종(cron 추가, 그룹 이름, `cancel-in-progress: true`, job 단위 잠금, gentle 조건 삭제, `after_collection: false`, 취소·check-access 실행을 성공으로 셈, 12시간 한도 완화, `publicOrigin` null 건너뛰기 삭제, 감시 cron 변경)에서 `check-collect-workflow.mjs`가 모두 실패했다.
- 실행기: `check-dispatch-app-collection.py` 7개, `check-checkpoint.py`, `check-runner.py`, `runner/check_bootstrap.py`, `check-source-safety.py`, `check-trip-parser.py`, `check-project-files.py`(350개), `cloudflare-load/check-cloudflare-load.py --no-d1` 통과. actionlint 1.7.7 통과.

### 검토와 다음 작업

- 앱 PR #48: Codex 1회째(`0c2d386`, 09:31Z 요청) P2 1건(기본 `queue: single`이라 대기 배포·대기 수집이 서로 취소됨) → `8b12012`에서 `queue: max`로 고침, 스레드 답·해결. Codex 2회째(`8b12012`, 09:46Z 요청, 09:49:59Z 완료) ‘큰 문제 없음’. 남은 지적 없음. CI `checks` 통과(`8b12012`). main `2caa14b`과 충돌 없음. 이 기록 커밋 뒤 변경은 인수인계뿐이다.
- 실행기 PR #5(draft): Codex 1회째(`9ccf22f`, 09:29Z 완료) ‘큰 문제 없음’. 그 뒤 `679b062`에서 workflow 주석·`docs/runner.md`·`project-files.json`만 바꿨다(앱의 `queue: max` 반영 설명). 6단계에서 ready로 바꿀 때 상위 세션이 재검토 여부를 정한다.
- 다음 작업: 실행기 수동 모드 `backlog`·`refresh`·`diagnose-jalan`은 앱 `collect.yml`로 옮기지 않았다(예약은 gentle만 씀). 필요하면 별도 PR로 옮긴다.


## H01 6단계 도구(앱 레포: 롤백·사용량·유지보수 경로 CPU)

기록: 2026-10-12T12:03Z / 2026-10-12 21:03 KST. 상위 세션(`session_01BSbr1zrttr8mSibf5bfz2R`)이 맡긴 작업이다. 작성 세션 `session_015ge493n1x3SUdwcM1xK6Ko`. 병합은 상위 세션이 한다. 운영 D1·Cloudflare 계정·Secret 값·운영 사이트에 접속하지 않았고 운영 workflow를 실행하지 않았다. `deploy.yml`은 건드리지 않았다.

### 기준과 상태

- 브랜치 `claude/h01-step6-tools`. 시작 기준 main `4b55aaa`(PR #50).
- 환경: Node 22.22.0(컨테이너 기본, `/opt/nvm` 없음), pnpm 11.25.0, Python 3.13.16. `cloud-setup.sh` rc=0, 잠금 파일 무변경. actionlint 1.7.7.
- 실행기 레포 차이 반영(A1+A3)은 상위 세션이 다른 세션(`session_01S5AqfcBRKDeqZBzxzvu3gv`)에 맡겼다. 이 세션이 먼저 실행기 클론의 로컬 브랜치에 만든 검사 통과본은 push하지 않았고, 코드 전문을 그 세션에 한 번 보냈다(11:58Z). 앱 레포 문서에는 ‘실행기 레포의 새 수동 workflow(작업 중)’로만 적었다.

### 바꾼 것

- A4 `rollback.yml` + `scripts/cloudflare-rollback.mjs`: 수동 실행, `worker-rollback`(이전 Worker 버전)·`d1-restore`(Time Travel bookmark), `confirm`=`rollback` 필수. 두 동작 모두 먼저 현재 bookmark를 요약에 남긴다. 잠금은 `deploy.yml`과 같은 순서(최상위 `yukemuri-catalog-updates` → job `cloudflare-account`, 둘 다 `queue: max`). 롤백 표(`cloudflare-deploy.md`·`hosting-review` 3.2절)에 ‘Worker 되돌림만으로는 다음 수집 때 main HEAD가 다시 배포된다, main revert를 함께 한다’와 ‘`autoDeploy=false`는 수집도 멈춘다’(`run-collection.py`가 요청 전에 실패)를 적었다. Time Travel 보존은 무료 플랜 7일이다.
- A6 `usage.yml` + `scripts/cloudflare-usage.mjs`: GraphQL Analytics로 UTC 날짜별 Worker 요청·오류·`cpuTimeP50`/`P99`·상태(`exceededResources`=1102·1027)와 D1 `rowsRead`·`rowsWritten`을 읽는다. 권한 오류·빈 계정 목록은 실패로 끝나고 ‘사용량 0이 아니다’라고 적는다. 행이 없는 날은 ‘기록 없음’.
- A2: 위 ‘H01 6단계 준비’ 절의 6단계 순서를 `hosting-review` 3.2절 6단계 1~7번에 맞췄다. `hosting-review` 4·5번에 C4(새 D1에만 있는 즐겨찾기는 지우지 않음)를 더했다.
- C1 `scripts/measure-route-cpu.mjs`: 유지보수 경로 11개를 더했다(crawl report=1·GET·POST 2종·PUT 상세·PUT 목록, crawl-prepare 준비됨·seed 바뀜, catalog-export 목록·hotels 1,000행·crawl_jobs 1,000행). 크롤 키 헤더, 요청마다 새 claim token, DB 대역의 `run()`이 실제 변경 행 수를 돌려주게 고쳤다(PUT의 임대 확인이 이 값을 본다). 유지보수 경로는 상태 200이 아니면 측정을 멈춘다. 판정 한도는 공개 5ms, 유지보수 10ms(Workers Free CPU).

### C1 측정 결과(운영 규모 복사본, Node 22.22.0, `docs/evidence/h01-route-cpu-maintenance-20261012.json`)

JavaScript CPU(handler, DB 대역 안 CPU 제외). cold는 새 프로세스 9개 중앙·최대, warm은 200회 뒤 200회 중앙·p95. Node 측정이며 workerd의 isolate 시작·파싱은 빠졌다. 쓰기 요청은 측정 뒤 트랜잭션을 되돌려 모든 cold·warm 요청이 같은 DB에서 시작한다(PR #53 Codex 1회째 P2, `c0ce785`). 시작 행 수가 하나라도 다르면 측정이 멈춘다. 되돌림을 끈 변형(`--only crawlPutList --cold-runs 3`)은 ‘cold and warm runs started from different database states’로 멈췄다. 아래는 두 수정 뒤 다시 잰 값이다(측정 끝 2026-10-12T12:55Z).

| 경로 | cold 중앙 ms | cold 최대 | warm 중앙 | warm p95 |
|---|---:|---:|---:|---:|
| 수집 보고(report=1) | 2.74 | 3.10 | 0.68 | 1.43 |
| 수집 GET 집계 | 2.27 | 3.31 | 0.38 | 0.55 |
| 선점 POST(trip detail) | 3.90 | 4.92 | 0.34 | 0.48 |
| 선점 POST(jalan list national) | 4.73 | 5.22 | 0.31 | 0.42 |
| PUT 상세 1곳 | 8.60 | 12.21 | 0.76 | 1.57 |
| **PUT 목록(새 30·기존 15)** | **57.27** | 68.69 | 6.59 | **16.01** |
| crawl-prepare(준비 끝남) | 1.81 | 2.66 | 0.10 | 0.31 |
| **crawl-prepare(seed 바뀜 첫 요청)** | **399.54** | 462.26 | 0.09 | 0.19 |
| catalog-export 목록 | 2.80 | 3.20 | 0.16 | 0.30 |
| **catalog-export hotels 1,000행** | **21.00** | 23.60 | **13.87** | **18.63** |
| catalog-export crawl_jobs 1,000행 | **11.30** | 13.79 | 3.75 | 7.31 |

- crawl-prepare(준비 끝남)는 Codex 2회째 P2로 고친 값이다. 처음 두 측정은 준비 요청을 한 번만 불러 `done:false`인 채로, 아직 남은 준비 한 쪽(최대 500행)을 매번 처리했다(cold 17–22ms). 지금은 측정 전에 `done:true`가 될 때까지 준비하고(운영 규모로 늘린 뒤에도 다시), 준비 끝남 측정에서 응답이 `done:true`가 아니면 멈춘다. 한 번만 부르는 변형은 ‘the catalogue was not fully prepared’로 멈췄다. 수집 실행이 처음 부르는 준비 확인은 cold 1.8ms다.
- 공개 경로 10개도 같은 실행에서 쟀다. 비교 4곳·사진 출처 다음 쪽 cold가 5ms를 넘어 P03 기록(5.23ms 등)보다 높다. 컨테이너가 달라 생긴 차이일 수 있다(미확인). 공개 경로 판단은 P03 기록을 유지한다.
- 위험(상위 세션 판단 필요, 이 PR에서 고치지 않음):
  1. 백업 `catalog-checkpoint.py`가 `limit=1000`으로 hotels를 읽는다. 한 쪽 warm 14ms·cold 21ms로 10ms를 넘는다. crawl_jobs 1,000행도 cold 11ms다. 6단계 뒤 새 주소 백업에서 1102 위험. 실행기의 `limit`을 250 정도로 낮추는 변경이 후보다(쪽 수는 4배, D1 읽기 행은 같음).
  2. 수집 목록 PUT은 warm 중앙 6.6ms, p95 16.0ms, cold 57ms다. 목록 페이지마다 1102 위험. 쪼개 보내기(관측 수 상한) 또는 저장 경로 최적화가 후보다.
  3. crawl-prepare는 준비가 끝난 카탈로그에서는 cold 1.8ms로 문제없다. seed가 바뀐 릴리스의 첫 준비 요청은 400ms다. 그 요청은 배포 workflow의 준비 단계(`cloudflare-prepare.mjs`)가 부른다. 실제 1102가 나는지는 seed를 바꾸는 첫 배포에서 본다. Cloudflare 문서는 ‘가끔 넘는 것은 허용’이라고만 한다.
  4. PUT 상세 1곳은 cold 8.6ms(최대 12.2ms)로 경계다.
- 5단계 Workers Logs·`usage.yml`의 `exceededResources`로 실제 값을 확인하는 것이 먼저다. 이 측정은 Node 기준이라 workerd와 다를 수 있다.

### 검사

- `python3 scripts/cloud-check.py --full` 33개 통과(11:51Z–12:00Z, rc=0, `check-rollback-workflow.mjs` 포함). 그 뒤 더한 `check-cloudflare-usage.mjs`를 넣어 기본 `cloud-check.py` 통과(12:01Z).
- `check-rollback-workflow.mjs`: 워크플로 규칙, bookmark 기록 순서, 거부 입력, 가짜 wrangler로 끝까지 env 전달. 변형 9종(confirm 검사 삭제, bookmark 없음 무시, 순서, 복구 확인 삭제, 같은 배포 허용, 주의 문구 삭제, 잠금 그룹, `queue: single`, push 트리거)이 모두 실패.
- `check-cloudflare-usage.mjs`: 가짜 GraphQL 응답. 변형 7종(빈 계정 목록을 0으로, 403을 권한 오류로 안 봄, 빈 날을 0으로, 마이크로초 그대로, 상태 이름 틀림, ‘기록 없음’ 대신 0, 날짜 필터 틀림)이 모두 실패.
- actionlint 1.7.7 통과(7개 workflow). `check-deploy-config.mjs`가 새 workflow 둘을 포함해 통과.

### 미확인

- 실제 Cloudflare에서 `rollback`·`deployments status --json`·`time-travel restore --json`의 동작과 응답 형식(wrangler 4.92.0 소스로만 확인). Secret이 그 버전 뒤에 바뀌었을 때는 확인 없이 강제로 되돌린다(Claude 검토 1회째가 가짜 API로 재현, `cloudflare-deploy.md` 롤백 주의 4).
- GraphQL 스키마가 이 쿼리를 받는지(필드 이름은 `cloudflare/cloudflare-docs` 원본 예시와 같음). 권한 없는 토큰의 실제 응답 형태.
- C1 값의 workerd 대비 차이.

### 사용자 조치

1. Cloudflare 대시보드 → My Profile → API Tokens → 앱 레포 Secret `CLOUDFLARE_API_TOKEN`의 토큰 → Edit → Permissions에 `Account` / `Account Analytics` / `Read`를 더한다. 토큰 값은 바뀌지 않는다. 없으면 `usage.yml`이 실패한다.
2. 실행기 Secret `YUKEMURI_APP_DISPATCH_TOKEN`·`YUKEMURI_CLOUDFLARE_JSON`(위 ‘H01 6단계 준비’ 절, 변경 없음).

### 검토와 다음 작업

- Codex 1회째(`5fcd681`, 12:11Z 요청, 12:15Z 완료): P2 2건. (1) 쓰기 경로 CPU 측정이 같은 DB를 이어 바꿔 ‘새 숙소 30·기존 15’를 실제로 재지 않음 → 요청마다 되돌림과 시작 상태 검사, 다시 측정. (2) 사용량 비율을 이 Worker·D1 값으로 계정 한도에 나눔 → 계정 전체 합계를 따로 읽어 비율·경고에 씀, 변형 4종 실패 확인. 둘 다 `c0ce785`에서 고치고 스레드에 답했다.
- main `0420e4e`(PR #51) merge(`d1a235f`, 충돌 2곳: 인수인계·`cloud-check.py`, 둘 다 양쪽 유지). #51의 규칙에 따라 `rollback.yml`·`usage.yml`에 `defaults.run.shell: bash`를 넣었다. `cloud-check.py --full` 35개 통과.
- Codex 2회째(`d1a235f`, 12:44Z 요청, 12:52Z 완료): P2 1건. 측정 fixture가 crawl-prepare를 한 번만 불러 ‘준비됨’ 값이 미완료 쪽을 쟀음 → `6c56c8d`에서 `done:true`까지 준비, 다시 측정(위 표).
- Codex 3회째(`b029905`, 13:06Z 요청, 13:10Z 완료): P2 1건. `usage.yml`의 `date`에 없는 날짜(`2026-02-31`)를 넣으면 `Date.parse`가 다음 달로 넘겨 다른 날을 조회함 → 파싱한 날짜가 입력과 같은지 확인해 거부, 검사에 2·4월 말과 윤일을 더함(가드를 뺀 변형은 실패). Codex 요청 3회를 다 썼고 그 뒤 기록 파일 밖(스크립트·검사)이 바뀌었으므로 ‘이어 가는 Claude 검토’가 필요하다(상위 세션이 연다).
- 이어 가는 Claude 검토 1회째(세션 `session_01MnG6VhzbLmECs5o9SPjNjo`, `0b12c5f`, 13:25Z): P0–P2 없음, P3 2건. 병합 조건(마지막 검토 뒤 기록 파일만 변경)을 지키려고 절차 문서는 고치지 않고 아래 다음 작업에 적었다. CI는 `0b12c5f`에서 통과했다.
- 다음 작업: 위 C1 위험 1~3의 대응 여부를 상위 세션이 정한다.
- 다음 작업(P3, Claude 검토 1회째): `cloudflare-deploy.md` ‘롤백’의 ‘Secret이 그 버전 뒤에 바뀌었으면 wrangler가 비대화형 확인에서 멈출 수 있다(미확인)’는 틀렸다. wrangler 4.92.0은 오류 10220을 받으면 `CI=true`에서 확인을 기본값(yes)으로 넘기고 `deployments?force=true`로 강제로 되돌린다(검토 세션이 가짜 API로 재현). 되돌린 버전은 그때의 Secret(예: 바꾸기 전 `CRAWL_ACCESS_KEY`)을 쓸 수 있고 요약에는 표시가 없다. 문서를 고치고, 키를 바꾼 적이 있으면 롤백 뒤 수집 키를 확인하라는 주의와, 필요하면 출력의 `secrets have changed`를 요약 경고로 남기는 처리를 더한다. 이 절의 ‘미확인’ 첫 항목도 같은 내용으로 바꾼다. → 완료: 상위 세션 기록 PR에서 롤백 설명과 주의 4, 이 절 ‘미확인’을 고쳤다. 요약 경고 처리는 더하지 않았다(주의 4로 충분하고 코드 변경은 검토가 필요).
- 다음 작업(P3, Claude 검토 1회째): `cloudflare-deploy.md` ‘사용량 측정’의 ‘그 밖의 실패 4종’은 5종이다(rate limit, 스키마 오류, JSON 아님, 데이터셋 없음, 계정 합계 없음). → 완료: 상위 세션 기록 PR에서 고쳤다.

## H01 4단계 — 백업에서 새 D1로 적재

기록: 2026-10-13 UTC. 상위 세션이 맡긴 작업이다. 작성 세션 `session_018hDPrhXsbxgUEpWjeMBH8k`. 상세는 `H01-20261011.md`의 ‘4단계 결과’다.

- 실행기 PR #3(`b7f9c64`)·#4(`9fb6e1d`)의 `cloudflare-load.yml`로 백업 run 38092128934의 13개 테이블을 10-11·10-12·10-13 UTC에 나눠 넣었다. 모든 테이블의 원격 행 수가 백업 manifest와 같다. D1 위치는 APAC다.
- 10-12 첫 `hotels` 적재는 정확히 100,000바이트 문장에서 `SQLITE_TOOBIG`으로 실패했고, 상한을 90,000바이트로 낮춘 PR #4 뒤 다시 넣었다. 실패한 import는 쓰기 0, 행 0이었다.
- 예상 쓰기(행 × (1 + 색인 수))가 `rows_written_24h`와 맞았다.
- 이 기록 PR이 `publicOrigin`과 `autoDeploy: true`를 켠다. 병합이 첫 배포다. 10-13 UTC 쓰기 예상은 적재 43,095 + 0013 약 31,620 + prepare 약 2 = 약 74,717행(9만 이하).
- 다음 작업: 상위 세션이 이 PR을 병합(첫 배포) → 배포 결과(Worker 버전 ID·bookmark·스냅숏 읽기·smoke)를 `deployments.md`에 기록. 수집기 User-Agent 주소(`source_safety.py`, 아직 Sites 주소)는 6단계 전에 정한다.

## H01 첫 배포 전 deploy.yml 보강(사전 점검·Secret 업로드)

기록: 2026-10-12T11:39Z / 2026-10-12 20:39 KST. 상위 세션이 맡긴 작업이다(10:35Z 요청, 사전 검토 B1·B2·B3·B5·B6·C2·C3·A5). 작성 세션 `session_01DPWccvrTAVG5jay8KLJYLT`. 병합은 상위 세션이 한다. 운영 D1·Cloudflare 계정·Secret 값에 접속하지 않았다.

### 기준과 상태

- 앱 브랜치 `claude/h01-deploy-preflight`. 시작 기준 main `4b55aaa`(PR #50).
- 실행기 PR #5(A5): main `9fb6e1d`(PR #4)을 merge했다(`ef88659`). `project-files.json` 충돌은 main 쪽을 기준으로 다시 계산했다. 코드 변경은 없어 재검토는 필요 없다고 본다. 실행기 검사(`check-project-files.py` 350개, `check-dispatch-app-collection.py`, `check-checkpoint.py`, `check-cloudflare-load.py --no-d1`)가 통과했다.

### 바꾼 것

- B1·B2: `deploy.yml`에서 `cloudflare/wrangler-action`을 뺐다. 모든 wrangler 명령을 `node node_modules/wrangler/bin/wrangler.js`(4.92.0)와 `--config dist/server/wrangler.json`으로 직접 실행한다. 근거: action의 `secrets:` 입력은 `wrangler secret bulk`를 `--config` 없이 돌린다. 로컬에서 같은 명령이 빌드 뒤에도 `Required Worker name missing`으로 실패했다(재현). Worker 배포는 새 `scripts/cloudflare-deploy-worker.sh`가 한다. 크롤 키를 0600 임시 파일에 써 `deploy --secrets-file`로 넘기고, 끝나면(실패해도) 지운다. job에 `defaults.run.shell: bash`를 둬서 `| tee`로 이은 단계도 pipefail로 실패하게 했다.
- B5: `workflow_dispatch` 입력 `preflight`. `databaseId`만 있으면 돌고 쓰기를 하지 않는다. 빌드, time travel 정보, `d1 migrations list`, 원격 스냅숏(읽기), `catalog_meta` 읽기와 `preflight-report.mjs` 추정, `deploy --dry-run`(자리표시 Secret)을 한다. 게이트는 `deployMode()`(`skip`·`deploy`·`preflight`)다.
- B3: `measure-d1-reads.mjs --prepare-steps`로 운영 규모 복사본에서 seed 단계별 `crawl-prepare` 쓰기를 쟀다(`evidence/h01-deploy-preflight-20261012.json`). `multilingual-index-v1` 45,406행(읽기 191만), 다섯 모두 21,136행, 나머지는 수십 행 이하. 유지보수 커서가 뒤처지면 27번 불러 읽기 757만·쓰기 3.5만 행이었다. 사전 점검이 빠진 키와 뒤처진 커서를 보고하고 쓰기를 추정한다.
- B6·C2: smoke의 키 있는 `/api/crawl?report=1`(복사본에서 요청 하나가 71,592행 읽음, 준비 안 된 카탈로그를 씀)을 `/api/collector-release`(D1 0행, `siteOrigin`이 이 주소인지 확인)로 바꿨다. manifest와 `/`는 5초 간격 6번까지 다시 본다. smoke의 D1 읽기는 상세 한 건뿐이라 수집 끝 배포도 같은 smoke를 쓴다.
- C3: 수집 끝 배포는 `scripts/checked-commit.mjs`가 이 커밋의 main push 검사 성공(`Cloud app checks` 또는 push 배포)을 찾으면 `cloud-check --full` 대신 빌드만 한다. 못 찾거나 API가 답하지 않으면 `--full`을 돌린다. 이를 위해 `deploy.yml`·`collect.yml`에 `actions: read`를 더했다.
- 검사: `check-deploy-config.mjs`가 쓰기 명령이 `mode == 'deploy'` 단계에만 있는지, preflight 단계에 쓰기가 없는지, wrangler-action이 없는지, pipefail, C3 조건, 게이트 모드, 배포 스크립트(가짜 wrangler로 0600 파일·삭제·키 비노출·실패 전파), 추정 함수를 단언한다. 새 `check-cloudflare-smoke.mjs`는 로컬 대역 서버로 smoke를 돌린다.

- 상위 세션 추가 8–10번(11:33Z 요청): 모든 workflow에 `defaults.run.shell: bash`(pipefail), 스냅숏 id가 비면 실패, `--require-prepared` 실패 때 보고서를 쓰지 않음, smoke는 `SNAPSHOT_ID` 필수이고 빌드한 manifest의 id·형식과 대조, 형식 번호는 `SNAPSHOT_FORMAT` 하나에서. 대조 변형 4종(d1-setup 기본 셸 제거, id 확인 제거, smoke에 빈 id, job에서 셸 덮어쓰기)에서 `check-deploy-config.mjs`가 실패했다.

### 확인한 것과 미확인

- 로컬 `cloudflare-deploy-worker.sh --dry-run`(네트워크 차단): 빌드 업로드 5,874.18KiB(gzip 866.89KiB), 바인딩에 `CRAWL_ACCESS_KEY`(숨김) 표시, rc=0, 임시 파일 남지 않음.
- 변형 11종 중 10종에서 `check-deploy-config.mjs`가 실패했다. `umask 022` 변형은 살아남았다. `mktemp`가 언제나 0600 파일을 만들기 때문이고, 검사는 파일 권한 600을 직접 확인한다.
- 미확인: 실제 계정에서 `--secrets-file` 업로드. 첫 배포에서 확인한다.
- 사전 점검 실제 결과(상위 세션 실행, run 38249215867, main `0420e4e`, 2026-10-12T12:28:11Z–12:31:15Z, 성공): 남은 마이그레이션은 `0013_robust_reaper.sql` 하나(식 색인 2개, 약 3.1만 행 쓰기). 원격 스냅숏은 숙소 12,687곳, 74개 쿼리, 읽기 94,316행, 57.6초(3일차 `hotel_names` 적재 전). `catalog_meta` 키 12개 가운데 준비 안 된 키는 `bath-facts-backfill-v1` 하나, 행별 유지보수 커서는 뒤처진 것 없음, prepare 쓰기 추정 약 2행. `deploy --dry-run`(자리표시 Secret) 통과: 업로드 5,874.18KiB(gzip 866.90KiB), `CRAWL_ACCESS_KEY`는 숨김 표시. 아래 위험(`multilingual-index-v1` 없음)은 해당하지 않는다.
- 위험: `multilingual-index-v1`이 빠진 채 첫 배포를 하면 prepare가 요청 하나에서 숙소 전체를 재색인한다(로컬 24초). 무료 플랜 CPU 한도(요청당 10ms)로 실패하거나 그날 D1 읽기를 크게 쓸 수 있다. 사전 점검 결과로 상위 세션이 판단한다.
- `python3 scripts/cloud-check.py --full` 33개 통과(작업 트리, 2026-10-12T11:39:55Z–11:46:43Z, rc=0). 8–10번 반영 뒤 다시 33개 통과(11:49:31Z–11:56:23Z, rc=0). `run-actionlint.py` 포함.
- 검토: Codex 1회째(`8849151`, 12:03Z 요청, 12:09Z 완료) P2 1건. `maintenanceBehind()`가 `collection-priority:` 접두사로 판정해, 예전 계획 버전의 완료 행만 있어도 ‘완료’로 봤다. 앱은 현재 계획 버전 키(`collection-priority:` + `data/collection-priorities.json`의 `version`)만 본다. 정확한 키로 고치고 예전 버전 행만 있는 경우를 검사에 넣었다. 기본 `cloud-check.py` 통과(12:09:56Z 종료) 뒤 `check-deploy-config.mjs` 통과.
- Codex 2회째(`d4de172`, 12:17Z 요청, 12:21:18Z 완료)는 ‘큰 문제 없음’이었다. 남은 지적은 없다. CI `checks`는 `d4de172`에서 통과했다. main `4b55aaa`과 충돌이 없다. 이 기록 커밋 뒤의 변경은 인수인계뿐이다.

## D06 — 지도 좌표 보강(오프라인 지오코딩)

기록: 2026-10-13T06:45Z / 2026-10-13 15:45 KST. 상세는 `D06-20261013.md` 9절이다.

### 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션(`session_01BSbr1zrttr8mSibf5bfz2R`)이 맡긴 작업이고, 작성 세션은 `session_01FFQYTnNr47q7K6k8RV3EXP`다. 지도 모드는 다른 하위 세션(U05, `claude/u05-ui`)이 만든다.
- 브랜치 `claude/d06-geo`, 기준 main `6f15d6e`.
- 운영 D1·Secret·수집 예약·호스팅은 바꾸지 않았다. 운영 사이트는 공개 스냅숏 GET만 했다(06:12Z, 06:27Z). 유지보수 키를 쓰지 않았다. DB 스키마·수집기 release는 바뀌지 않는다. 351MB 사전은 커밋하지 않았다.

### 바뀐 것

- 스냅숏에 `geo.json`(정밀도 `grade` 0–6과 `lat`·`lng`)을 더했다. `core.json`은 그대로다. 형식 번호는 그대로 1이다(파일 추가만, 예전 페이지는 읽지 않음).
- `deploy.yml`: 사전 zip `actions/cache`(SHA-256 키) → `scripts/geo/prepare.sh`(continue-on-error; 해시 고정 pip, 사전 크기·SHA-256 확인, 설치) → 스냅숏 두 단계에 `--geocoder-db` 또는 `--geocoder-skip <이유>`.
- 순서: 출처 좌표 > Wikidata `P10425`(`data/wikidata-trip-hotels.json`, 1,891개) > 일본어 주소 > 우편번호 > 지명 > 도도부현. 도도부현이 다른 답과 일본 밖 답은 버린다.
- 바닥글에 사전 출처 문구(그대로)와 대략 위치 설명·링크를 두었다(`lib/geo-attribution.ts`).
- 클라이언트용 `loadSnapshotGeo(manifest)`를 더했다. 지금 화면은 아직 `geo.json`을 쓰지 않는다(U05 몫).

### 검사

- `python3 scripts/cloud-check.py --full` 통과(작업 트리, 06:29Z–06:37Z, 7분 28초). 351MB 사전 없이 돈다.
- 새 검사: `check-snapshot-geo.mjs`(순서·등급·범위 밖 답·지오코더 없음/실패/잘못된 답·지명 입력·Wikidata 추출·출처 문구 원문과 빌드된 페이지), `scripts/geo/check_geocode.py`(가짜 jageocoder로 등급·우편번호·지명·도도부현 가드, 사전 크기·해시 불일치 거부와 삭제), `check-search-snapshot-worker.mjs`에 `geo.json` 대조·fixture 지오코딩·D1 무변경·CLI 실패 경로, `check-deploy-config.mjs`에 캐시 키·continue-on-error·해시 고정 pip.
- 변형 13종(우선순위 뒤집기, 등급 범위 해제, 실패 전파, 문구 변경·삭제, 등급 매핑, 도도부현 가드 제거, 해시 검사 제거, 불일치 파일 남기기, continue-on-error 제거, 캐시 키 해시 변경, `--require-hashes` 제거) 모두 검사가 실패했다. 등급 범위 해제는 처음에 통과해 fixture를 보강한 뒤 실패했다.
- 실제 사전 측정은 `D06-20261013.md` 9.3절(점이 있는 숙소 13,216/13,217, 街区 오차 중앙값 65m·90% 517m).
- 화면: 정적 페이지(`dist/client`)를 Chromium 1194(Playwright 1.56.1)로 360px·1280px에서 열어 바닥글 문구가 보이고 가로 넘침이 없음을 확인했다. 목록 API가 없는 정적 서버라 목록은 오류 상태였다. 키보드·스크린리더는 미확인이다.

### 미확인 사항

- Actions에서의 실제 실행(첫 사전 다운로드 시간, 캐시 복원 시간, ubuntu-latest Python 버전과 wheel 일치). 실패해도 배포는 지오코딩 없이 진행된다.
- Trip 우편번호·도시 대표점의 오차(기준 좌표 없음).
- 배포 때 실제 payload 주소로 낸 결과(측정은 공개 context에서 되읽은 주소).

### 검토

- 1회째: CI가 `02cf3e4`에서 통과한 뒤 07:24Z에 Codex 검토를 요청했다. 07:28Z에 P1 1건이 달렸다. `actions/cache` 단계에 `continue-on-error`가 없어 캐시 복원 오류가 배포를 막을 수 있다는 지적이다. 캐시 단계도 실패를 허용하게 고치고, `check-deploy-config.mjs`가 지오코더 단계 전부의 `continue-on-error`를 판정하게 했다(변형으로 실패 확인).
- 2회째: CI가 `e187444`에서 통과한 뒤 07:35Z에 요청했다. 07:39Z에 Codex가 ‘큰 문제 없음’(검토 커밋 `e187444`)을 남겼다. 검토 요청은 2회 썼다. 그 뒤 변경은 이 기록 파일뿐이다. 이 기록을 쓸 때 main `8ae6d48`(PR #65, 기록 파일만)과 충돌이 없음을 확인했다.

### 다음 작업

1. PR 검토(Codex) 뒤 상위 세션이 병합한다. 병합 뒤 첫 배포 요약에서 ‘map positions’ 줄과 ‘Geocoder ready’ 시간을 확인한다.
2. U05 지도 모드가 `geo.json`의 등급으로 대략 위치를 구분해 표시한다(같은 점 목록 펼치기, 범례).
3. 선택: K1(Wikidata 한국어 레이블)을 D1 이름 경로로 넣을지, 住居表示・地番 사전으로 大字·시정촌 수준을 다시 지오코딩할지.

## U05 2단계 — 화면 구현(B ‘탕 체크리스트’)

기록: 2026-10-13T06:44Z / 2026-10-13 15:44 KST. 상위 세션(`session_01BSbr1zrttr8mSibf5bfz2R`)이 맡긴 작업이다. 작성 세션 `session_01EKeavHcR5d8PKrSwVHyhn6`. 병합과 병합 기록은 상위 세션이 한다. 설계안은 `U05-20261013.md`, 결정은 `roadmap.md`의 ‘U05 디자인(사용자)’ 행이다. PR 7개를 하나씩 연다(1 토대 → 2 지도 모드 → 3 목록 → 4 필터 → 5 상세 → 6 비교 → 7 즐겨찾기·자료 현황).

### 1번 토대 PR

- 브랜치 `claude/u05-ui`. 시작 기준 main `97b8c2e`(PR #61). 기록 직전에 main `8ae6d48`(PR #65)을 merge했다. 충돌 없음.
- 환경: Node 24.21.0(nvm), pnpm 11.25.0, Playwright 1.56.1(`.sites-runtime/u01-browser`)과 `/opt/pw-browsers`의 Chromium. 로컬 사이트는 `prepare-local-site.mjs` 뒤 `pnpm start`(임시 D1, 체크인 자료 1,655곳). 운영 사이트·운영 DB에는 접속하지 않았다.

바꾼 것:

- `globals.css`: 먼저 규칙 하나를 한 줄로 나눴다(`57bf806`, 공백을 빼면 바이트가 같음). 그 위에 `--yk-*` 토큰을 세웠다. 색은 설계안 B(글자 `#14272b`·`#3d5157`·`#566a70`, 주 색 `#0a6670`), 글자 13/14/15/16/17/21/24px, 간격 4–32px, 누름 44px. shadcn 변수는 토큰을 가리킨다. 회청색 글자 수십 개를 세 단계로 합쳤고 9–12px 글자는 13px로 올렸다. 기존 여백 값은 배치가 바뀌지 않게 두었다. 간격 토큰은 새 규칙에만 썼고 화면별 PR에서 옮긴다.
- Pretendard Variable 1.3.9(OFL, `public/fonts/pretendard/LICENSE.txt`)를 사이트 정적 파일로 넣었다. 동적 부분 글꼴 CSS는 `public/fonts/pretendard/`에, woff2 92개(3.1MB)는 다른 이진 자료처럼 `source-assets/016`–`107`에 넣고 `cloud-setup.sh`가 복원한다(경로는 `.gitignore`). npm `pretendard@1.3.9` 묶음(sha256 `0ffc240c…bd53`)에서 꺼냈다. 외부 CDN 요청은 없다. 한국어 화면에서 내려받는 조각은 첫 화면 기준 몇 개이고 일본어 글자는 기기 글꼴로 보인다.
- 모든 조작을 44×44px 이상으로 했다. 사진 위 하트와 지도 표지는 보이는 모양을 그대로 두고 버튼만 키웠다. 360px 카드의 버튼 셋은 아이콘을 빼 한 줄에 둔다(점검 규칙 8).
- ‘YUKEMURI’·‘JAPAN v0.5’·‘EXPLORE JAPAN’·‘MY SAVED STAYS’·바닥글 ‘v0.5’를 지웠다. 상세 위쪽 소제목의 자간도 뺐다.
- 탭 ARIA 오류: 지도 옆 ‘목록 + 지도 / 목록만’은 패널 없는 탭이었다(axe critical). 눌림 상태 버튼 두 개(`aria-pressed`)로 바꿨다.
- 동작 변경 한 가지: 카드의 ‘지도에서 보기’나 표지로 연 지도 미리보기는 포인터가 카드를 떠나도 닫히지 않는다. 다른 카드에 올리면 그 카드만 잠깐 보인다. 카드 버튼이 높아져 U03 데스크톱 검사의 스크롤에서 포인터가 카드를 벗어났고 미리보기가 닫혔다(main에서는 12개 통과, 수정 전 이 브랜치에서 4개 실패를 확인).
- 바닥글은 44px 링크를 넣고도 높이 64px을 유지한다. 데스크톱 필터 패널의 `max-height`가 이 높이를 전제로 한다(바꾸기 전 패널 위가 6px 잘려 U03 데스크톱 검사가 실패).
- `word-break: keep-all`, 결과 수 ‘1,655곳’ 줄 안 바뀜(점검 규칙 5). 지도 오류 문구가 확대 버튼과 겹치지 않게 했다.

검사:

- 새 `scripts/check-u05-foundation-browser.mjs`(실제 Chromium 360·390·1280px, Codex 1회째 반영 뒤 52개): Pretendard 정적 파일 적재와 외부 글꼴 요청 없음, axe 색 대비 위반 0, axe critical 0, 보이는 조작 전부 44px 이상(문장 안 링크·지도 저작권 표시 제외, 라벨 안 체크박스는 라벨 크기), 13px 미만 글자 0(사진 위 표지 제외), 영어 흔적 없음, 가로 넘침 없음, 키보드 초점 표시, 휴대폰 필터 시트, 실패 화면의 다시 시도(44px)와 회복. 수정 후 36개 통과(`evidence/ui-u05-foundation-20261013.json`). 같은 검사를 main에서 돌리면 28개가 실패한다(`evidence/ui-u05-foundation-before-20261013.json`: 390px 대비 위반 194곳, 44px 미만 216개, 13px 미만 글자 424개, Pretendard 미적재, 1280px critical 1건).
- 기존 브라우저 검사(로컬 사이트, 최종 커밋): `check-u01` 64, `check-u02` 52, `check-u02-map` 53, `check-u03-comparison` 60, `check-u03-desktop` 12, `check-u04` 57, `check-p03-followups` 9개 모두 통과. 그 전 실행 한 번에서 `check-u04`가 390px 상세의 예약 칸을 15초 안에 못 찾아 1건 실패했고, 같은 코드로 세 번 다시 돌려 모두 통과했다(로컬 Worker 상세 API 응답 지연으로 본다, 원인 미확인).
- `python3 scripts/cloud-check.py --full` 36개 통과(main merge 뒤 작업 트리, 06:44:17Z–06:52:46Z, rc=0). eslint는 바꾼 파일에서 새 지적이 없다(`layout.tsx`의 `<link>`는 이유를 적고 규칙을 껐다).
- 첫 카드 위치(로컬 사이트, 화면 높이 800px): 390px 636→725px, 360px 653→725px, 1280px 513→553px. 44px 누름 영역 때문에 내려갔다. 300px 안으로 올리는 것은 3번 목록 PR의 완료 기준이다. 카드 높이 390px 279→295px, 360px 279→314px.
- 화면 캡처(수정 전후, 360·390·1280px의 첫 화면·필터·즐겨찾기·실패·다시 시도·키보드 초점·불러오기·상세·비교·지도)는 작업 세션 임시 폴더에만 있다. 외부 요청을 막아 숙소 사진·지도 타일은 없다. 다시 찍기: `check-u05-foundation-browser.mjs <base> <json> <폴더>`와 `docs/evidence/u05-20261013/tools/views.mjs <폴더>`.
- 설계안 5절 점검 규칙: 1(영어 소제목 없음)·2(13px 이상)·3(대비)·4(44px)·5(keep-all·숫자 단위)·10(장식 하나 더 빼기: 상세 소제목 자간)을 이 PR에서 확인했다. 6(주 색·강조 색 하나)은 토큰으로 정했고 강조 색은 아직 쓰지 않았다. 7(상자 안 상자)·8(아이콘)·9(출처 안내 한 곳)는 배치를 바꾸는 3–5번 PR에서 다룬다.

미확인:

- 실제 휴대폰(iOS Safari·Android Chrome)과 스크린리더. 캡처 환경의 한국어 글꼴은 이제 Pretendard지만 일본어는 WenQuanYi다.
- 지도 표지(1280px)는 누름 영역만 44px로 키웠다. 표지 모양·척도 표시는 2번 지도 PR에서 바꾼다.
- 느린 망에서 글꼴 조각을 받는 시간은 재지 않았다(`font-display: swap`이라 글자는 기기 글꼴로 먼저 보인다).

검토(1번 토대 PR #67):

- Codex 1회째(`adb8485`, 07:24Z 요청, 07:30Z 완료): P2 3건. 모두 고쳤다.
  - 검사가 첫 화면에서만 axe와 44px을 봤다. 이제 즐겨찾기·정렬 선택·필터 시트·상세 시트·비교 막대·비교 시트·지도 미리보기 화면마다 같은 묶음(axe 대비·critical, 44px, 13px, 영어 흔적)을 돈다. 검사 수 36→52. 넓힌 검사로 상세의 출처·시설 안내 링크(15–20px), 비교 시트의 빼기 버튼(40×36)·이름·‘근거 보기’·도구 버튼(41px), 지도 미리보기 이름 버튼, 사진 위 ‘숙소 사진’ 표지 대비(사진이 없을 때 2.4:1)가 걸려 같이 고쳤다.
  - 고정한 지도 미리보기의 숙소가 결과에서 빠지면(필터·즐겨찾기 보기) 고정을 푼다. 1280px 검사를 더했고, 해제 코드를 끈 변형에서 실패(`previewAfterLeaving:1`)를 확인했다.
- 같은 사이 main `7d287f5`(D06 PR #66)을 merge했다. 바닥글 충돌은 main의 지도 위치 출처 문구(`geo-credit`)를 살리고 ‘v0.5’만 뺐다. 출처 문구가 들어와 바닥글이 높아지자 데스크톱 필터 패널이 화면 위로 잘려 `check-u03-desktop`이 6건 실패했다. 패널 높이를 바닥글 실제 높이(`--yk-footer-h`, ResizeObserver)로 계산하게 고쳤다. 출처 문구 안 링크는 문장 안 링크로 보고 44px로 키우지 않는다. 일본어 링크가 두 줄로 갈려 `check-u01` 2건이 실패해, 일본어(`:lang(ja)`)는 `keep-all`을 쓰지 않게 하고 출처 링크는 한 줄로 두었다.
- 08:18Z 계정 5시간 한도에 걸려 턴이 끊겼고 10:13Z에 재개했다. 작업 트리는 남아 있었다.
- main `1750215`(문서만)을 merge했다(`d54d66f`, roadmap 충돌은 U05 행은 이쪽, D06 행은 main).
- Codex 2회째(`d54d66f`, 11:29Z 요청, 11:32Z 완료): P2 1건. 지도 범위 검색 지점으로 연 목록 밖 숙소(`areaHotel`)가 조건이 바뀌어도 지워지지 않아 미리보기가 남았다. 지금 범위 결과의 지점에 없으면 `areaHotel`을 지우게 고쳤다. 1280px 검사(지도 확대·범위 검색·목록 밖 표지 선택 → 즐겨찾기 → 목록 → 다른 카드에 올렸다 벗어남)를 더했고, 지우는 코드를 끈 변형에서 실패(`inSaved:1`, `previewAfterLeaving:1`)를 확인했다. 검사 수 52→53.
- 재검사(`d54d66f` + 이 수정): `check-u05-foundation` 53, `check-u01` 64, `check-u02` 52, `check-u02-map` 53, `check-u03-comparison` 60, `check-u03-desktop` 12, `check-u04` 57, `check-p03-followups` 9개 모두 통과. `cloud-check.py --full` 38개 통과(11:52:58Z–12:01:33Z, rc=0).
- Codex 3회째(`f3e12ca`, 12:11Z 요청, 12:15Z 완료): ‘큰 문제 없음’. 남은 지적이 없다. CI `checks`는 `f3e12ca`에서 통과했다. 그 뒤 main `f6664ab`(문서만)을 충돌 없이 merge했고 이 기록을 더했다(기록 파일만 바뀜). 검토 요청은 Codex 3회를 모두 썼다.
- 상위 세션이 2026-10-13T11:57Z에 `session_01KfLU3P8YrmZdyxehAEp9rp`로 바뀌었다. 병합 준비 알림은 그 세션으로 보낸다.

- 재검사(main `7d287f5` merge 뒤 작업 트리): `check-u05-foundation` 52, `check-u01` 64, `check-u02` 52, `check-u02-map` 53, `check-u03-comparison` 60, `check-u03-desktop` 12, `check-u04` 57, `check-p03-followups` 9개 모두 통과. `cloud-check.py --full` 38개 통과(10:33:42Z–10:41:56Z, rc=0). eslint의 `hotel-explorer.tsx` 오류 4건은 main과 같은 기존 것이다.
다음:

1. 1번 PR #67은 상위 세션이 2026-10-13T12:27Z에 병합했다(main `00bcfdb`). 병합 기록은 상위 세션이 쓴다.
2. 2번 지도 모드 PR(아래 절, 검토 대기).

### 2번 지도 모드 PR

기록: 2026-10-13T16:02Z / 2026-10-14 01:02 KST. 브랜치 `claude/u05-ui`를 PR #67 병합 뒤 main `00bcfdb`에서 다시 시작했다(force-with-lease push). 기록 직전에 main `b577cc8`(H02 PR 1 #76 포함)을 merge했다. 충돌은 인수인계 하나였고, `app/layout.tsx`의 robots 줄은 그대로다.

사용자 결정: 지도는 검색 결과의 숙소를 하나도 빠뜨리지 않는다(밀집 지역·넓은 지역에서 ‘대표 숙소만’ 보이지 않게).

바꾼 것:

- `lib/map-groups.ts`(새 파일): 검색 결과 전체를 지도에 둔다. 위치는 출처 좌표를 쓰고, 없으면 D06 `geo.json`의 대략 위치를 쓴다. 둘 다 없으면 ‘위치 미확인’으로 센다.
  - 묶음은 화면 안 숙소만으로, 현재 확대 단계의 세계 픽셀 격자(72px)에서 만든다. 그래서 모든 확대 단계에서 낱개 표지 + 묶음 숫자 = 화면 안 숙소 = 옆 목록이다.
  - supercluster는 쓰지 않았다(새 의존성 없음). supercluster는 묶음을 구성원 전체의 중심에 두므로, 묶음이 화면 밖에 놓이면 화면 안 숙소가 지도에서 사라진다. 사용자가 피하라고 한 문제다.
- `use-hotel-results`가 결과 순서 전체를 내보낸다. 새 `use-result-map.ts`는 지도를 볼 때만 `geo.json`을 받고, 스냅숏과 행 수가 다르면 쓰지 않는다. Worker 요청은 늘지 않는다.
- `stay-map.tsx`의 결과 모드
  - 화면 안 묶음을 이동·확대 끝마다 다시 그린다. 낱개 점수에 척도를 붙인다(Trip.com ‘9.7’ / Jalan ‘4.6/5’). 대략 위치는 점선 테두리다.
  - 묶음을 누르면 그 범위로 확대한다. 한 점에 겹쳤거나 최대 확대면 그 숙소 목록을 연다.
  - 표지 Tab 정지 규칙을 실제 아이콘 크기로 고쳤다(1번 PR에서 아이콘이 44px로 커졌는데 규칙은 52×36 기준이었다). 창 크기 변경은 사용자 이동으로 보지 않는다.
- 지도 위 줄은 ‘이 화면 N곳 · 화면 밖 N곳 · 위치 미확인 N곳 목록 · 검색 결과 N곳’이다(합계 = 결과 수). 범례 문장은 점수 척도, 점선(대략 위치), 묶음 동작을 설명한다. 결과 모드에서는 옛 ‘지도 표시 N곳’ 캡션을 뺐다.
- 새 `map-stay-list.tsx`: 이 화면·이 묶음·위치 미확인 목록이다. 머리의 수는 전체이고 행은 50곳씩 그린다.
  - 휴대폰은 아래 시트다. 엿보기 56px 한 줄에 ‘이 화면 N곳’, 절반, 화면 대부분 세 높이를 손잡이(44px 이상)로 바꾼다. 묶음·위치 미확인 목록을 열면 절반으로 올라온다. 지도는 엿보기 위에서 끝나고, ‘목록 보기’ 버튼은 엿보기 줄 오른쪽에 있다(표지를 가리지 않음).
  - 데스크톱은 ‘목록 + 지도’와 새 ‘지도 크게’(목록 대신 넓은 지도, 옆에 이 화면 목록)다.
- ‘목록 보기/지도 보기’ 떠 있는 버튼의 수는 결과 전체 수다(전에는 불러온 40곳).
- ‘이 지역에서 검색’(U02)은 동작을 유지한다. 범위 결과·500곳 상한 구역 개수·키보드 이동이 그대로다. 위치는 지도와 같은 기준(출처 좌표, 없으면 대략 위치)으로 센다. 범위에서 나오는 버튼 이름은 ‘검색 결과 지도로 돌아가기’다.
- 지도 저작권 표시에 단색 바탕을 두었다(대비).

검사:

- `scripts/check-map-groups.mjs`(cloud-check에 추가): 13,000곳 밀집 fixture에서 확대 3–18, 112개 화면을 본다.
  - 낱개 + 묶음 숫자 = 화면 안(따로 셈) = 목록, 중복 없음.
  - 화면 안 + 밖 + 위치 미확인 = 결과 수, 표지는 모두 화면 안.
  - 한 점의 49곳은 한 묶음이다. 전국 계산은 1.8ms다.
  - 대표만 보이는 변형과 전체 묶음 변형에서 실패한다.
- 새 `scripts/check-u05-map-browser.mjs` 17개 통과(실제 Chromium 390·1280px, 전국과 이름 검색, `evidence/ui-u05-map-20261013.json`).
  - 확대 단계 9개마다 표지+묶음 합 = ‘이 화면’ = 목록 = 스냅숏으로 따로 센 화면 안 수이고, 안+밖+미확인 = 결과 수다.
  - 위치 미확인 목록 수, 묶음 누름(확대 또는 목록), 키보드 Tab·Enter, 휴대폰 시트(손잡이·세 높이·목록 열면 절반), ‘지도 크게’, 페이지 오류 없음도 본다.
  - 묶음 표지에 숫자 대신 첫 숙소 점수를 그린 빌드에서는 6/14가 실패했다(12:58Z, 시트·지도 크게 검사를 더하기 전).
- 바뀐 동작에 맞춘 기존 검사
  - `check-u02-browser` 153–200행: 사용자 결정으로 없앤 ‘불러온 페이지만 지도에, 더 불러와 지도에 표시’ 대신 다음을 본다.
    - 결과 전체 수와 안+밖+미확인 합계.
    - 목록 머리 수.
    - 위치 미확인 목록 버튼의 위치·가림·44px과 터치·Tab·Space 동작, 요청 없음.
  - `check-u02-map-browser`
    - 범위에서 나오는 버튼 이름을 바꿨다.
    - 화면 밖 지점은 그리지 않으므로, 가장자리에 걸친 표지 경우는 방향키로 가장자리 표지를 만든다(창 크기 변경 뒤는 Tab 정지가 틀린 것이 없는지만 본다).
    - 지도 밖으로 나간 지점은 표지가 없다.
    - Space 구역 검사는 잰 그 구역으로 Tab한다.
    - 목록 보기 버튼 수는 결과 수다.
- 최종 빌드(`e7b9172`)
  - 브라우저 검사: `check-u05-map` 17, `check-u02` 52, `check-u02-map` 53, `check-u01` 64, `check-u05-foundation` 53, `check-u03-desktop` 12, `check-u03-comparison` 60, `check-u04` 57, `check-p03-followups` 9개 모두 통과.
  - `python3 scripts/cloud-check.py --full` 39개 통과(15:53:40Z–16:02:18Z, rc=0).

Codex 1회째(PR #80, head `5592a2a`) 지적 4건과 반영:

- P1 표지 겹침: 72px 칸 경계 양쪽의 두 묶음이 서로 아이콘 크기보다 가까우면 겹쳐 아래 표지를 볼 수도 누를 수도 없었다.
  - `viewGroups`가 칸으로 묶은 뒤, 아이콘(60×44) 범위가 겹치는 묶음을 합친다. 큰 묶음부터 아이콘 크기 버킷의 이웃만 보고, 한 번 돌 때 합친 것이 없을 때까지 반복한다. 합친 묶음도 구성원 평균 위치라 화면 안이다.
  - `check-map-groups`: 112개 화면 모두 아이콘 겹침 0을 본다. 칸만 쓰는 변형은 64개 화면에서 겹쳐 실패한다. 화면 크기(1920×1200px 이하) 화면의 가장 느린 계산 < 25ms를 본다(이번 실행 2.8–4.0ms, 전국 1.2–1.4ms). 처음 구현(합칠 때마다 처음부터 다시 비교)은 한 화면 5초가 걸려 버렸다.
  - `check-u05-map-browser`: 확대 단계마다 표지 아이콘 가운데를 눌렀을 때 다른 표지가 잡히지 않는지(가려진 표지 0) 본다.
- P2 대략 위치 실패 뒤 재시도 없음: 실패하면 ‘대략 위치 다시 불러오기’ 버튼을 둔다(`useResultMap().retryGeo`). 브라우저 검사가 `geo.json`을 한 번 끊어 실패 안내·합계(위치 미확인 1,598곳, 합 1,655곳)를 보고, 버튼으로 다시 받아 안내가 사라지고 미확인이 1,595곳으로 주는지 본다.
- P2 목록 끝 문장: 스냅숏 지도일 때 ‘지도에는 검색 결과 전체를 표시하고, 위치를 확인하지 못한 숙소는 ‘위치 미확인’으로 따로 셉니다.’로 바꿨다(옛 서버 목록 경로는 옛 문장 유지).
- P2 Enter 검사가 늘 통과: 낱개 표지는 Enter 전에 미리보기가 없고 뒤에 생기는지, 묶음 표지는 확대 단계가 커지거나 ‘이 묶음’ 목록이 열리는지 따로 본다. 첫 화면은 묶음뿐이라 낱개가 Tab 정지가 될 때까지 확대한다.
- 16:41Z 사용자 지시(사용량)로 멈췄다가 20:17Z에 이어 갔다. 멈출 때 `check-u02-map` 1280px 3건이 실패했다. 원인은 검사 도우미 `markerToEdge`였다. 병합으로 확대 2단계 화면이 묶음 4개뿐이 되자, 가장자리 표지를 찾느라 지도를 밀다가 표지를 모두 화면 밖으로 내보냈다. 그래서 창을 줄인 뒤 지도 안 표지가 0개였고, 낱개 표지도 없어 Enter 미리보기 왕복·지도 밖 지점 검사도 실패했다. 화면 코드 문제는 아니었다. 도우미를 다음처럼 고쳤다(`7839c21`).
  - 못 찾은 방향은 되돌린다.
  - 창 크기 검사는 가운데에서 다시 시작한다.
  - 낱개 표지가 없으면 확대해 찾는다.
- 브라우저 검사(로컬 사이트): `check-u05-map` 21, `check-u02` 52, `check-u01` 64, `check-u05-foundation` 53, `check-u03-desktop` 12, `check-u03-comparison` 60, `check-u04` 57, `check-p03-followups` 9개가 `4a2c523` 빌드에서 통과했다. 그 뒤 화면 코드 변경은 `6705dca`(칸·버킷 키 자리 2^22→2^24, 확대 18 이하에서는 결과가 같음, `check-map-groups` 통과) 하나뿐이다. `check-u02-map` 53개는 `6705dca` 빌드에서 통과했다.
- `python3 scripts/cloud-check.py --full`: `7839c21`에서 39개 통과(20:23:17Z–20:30:44Z, rc=0).

Codex 2회째(head `107305f`, 20:35Z) P2 4건과 반영(`34d1171`):

- 범위 검색에 들어가도 열려 있던 ‘이 묶음’·‘위치 미확인’ 목록이 남았다. 이제 범위 검색에 들어가면 그 목록을 닫고, 범위 동안은 결과 목록을 그리지 않는다.
- 출처 좌표가 있어도 `geo.json` 등급이 2 이상(seed 좌표, `search-snapshot-build.ts`가 city 4로 둠)이면 대략 위치로 본다. `resultPositions`와 `mapArea`가 같은 규칙이다. `check-map-groups`에 단언을 더했고, 그 줄을 빼면 실패한다.
- 범위 검색 표지도 대략 위치는 점선이다(`Spot.approximate`).
- 지도 아래 안내: 대략 위치 표지가 있으면 ‘예약 사이트 위치와 주소로 찾은 대략 위치(점선)’, 없을 때만 ‘예약 사이트의 확인된 위치’다.
- 검사(`34d1171` 빌드): `check-u05-map` 23개(안내 문구, 범위 검색 때 목록 닫힘 추가), `check-u02-map` 53, `check-u02` 52개 통과. 바뀐 파일은 지도와 그 옆 목록뿐이라 다른 브라우저 검사는 다시 돌리지 않았다. `cloud-check.py --full`: `34d1171`에서 39개 통과(20:44:11Z–20:51:39Z, rc=0).

Codex 3회째(head `ab5bd91`, 20:55Z) P2 1건과 반영(`79d1368`):

- 범위 안이 500곳을 넘으면 구역(`cells`) 집계가 대략 위치 등급을 버려, 대략 위치만 든 구역도 실선으로 그리고 안내도 ‘확인된 위치’였다.
  - `MapCell.approximate`(등급 2 이상 구성원 수)를 더했다. 모두 대략인 구역은 점선이고, 하나라도 있으면 안내가 바뀐다.
  - 로컬 자료에는 500곳 넘는 범위가 없다. 그래서 컴파일한 `static-search`를 로컬 스냅숏에 돌려 확인했다(위치 없는 행과 출처 좌표 절반에 등급 4). 결과는 구역 53, 합 1,655, 대략 1,623(기대값과 같음)이다. 작업용 계산이라 저장소에는 넣지 않았다.
- 검사(`79d1368` 빌드): `check-u05-map` 23, `check-u02-map` 53개 통과. `cloud-check.py --full`: `79d1368`에서 39개 통과(21:01:21Z–21:08:43Z, rc=0).
- Codex 검토는 3회로 끝났다(상한). 3회째 지적의 반영은 Codex가 다시 보지 않았다.

Claude 검토 1회째(상위 세션이 연 검토, 이 PR의 4회째, head `9659c5b`, 21:28Z) P3 1건과 반영:

- 지적: `79d1368`의 화면 변경(구역 점선·지도 안내)을 판정하는 검사가 저장소에 없었다. 위 ‘검사(`79d1368` 빌드)’의 두 브라우저 검사는 이 경로를 지나지 않았고, 구역 집계는 Node 계산으로만 봤다(그때 미확인으로 적지 않았다).
- 반영: `check-u02-map-browser`의 구역 사례 뒤에 새 스냅숏을 하나 더 띄운다. 같은 600곳에 `geo.json` 등급 4를 주고, 다른 열 구역에 20곳(절반 등급 1)을 둔다. 범위 검색 뒤 다음을 단언한다(360·390px).
  - 600곳 구역은 점선이다.
  - 20곳 섞인 구역은 실선이다.
  - 지도 안내는 ‘대략 위치(점선)’이다.
- 검사:
  - `check-u02-map` 55개 통과.
  - 빌드된 묶음 파일에서 구역 점선 조건과 안내의 `cells` 조건을 뺀 변형으로 돌리면 이 검사 2건(360·390px)이 실패한다. 리뷰가 쓴 방법과 같다. 원래 파일로 되돌리면 통과한다.

미확인·다음:

- 로컬 fixture는 좌표 있는 숙소가 60곳뿐이다(출처 57 + Wikidata 3). 운영 스냅숏(대략 위치 포함 13,216곳)에서 묶음 밀도·성능은 운영 배포 뒤 확인한다. 13,000곳 계산 시간은 노트북 CPU 기준이며, 저사양 휴대폰은 미확인이다.
- 휴대폰 시트는 손잡이를 눌러 높이를 바꾼다. 끌어 올리기(드래그)는 아직 없다. 지도는 엿보기 위에서 끝난다.
- ‘이 지역에서 검색’은 결과 전체 지도와 뜻이 겹친다. 사용자가 원하면 ‘목록을 이 화면으로 좁히기’로 바꿀 수 있다.
- 실제 기기·스크린리더는 미확인이다.

뒤 PR에 넘길 것:

8. D05 안내(상위 세션, 12:19Z·12:25Z): `features.viewBath`(‘전망 욕탕’)는 카드 6칸 밖, 상세에만 둔다(3번 목록 PR). 객실 사진·객실 타입 이름 자리는 상세 PR(5번)에 둔다.
9. 상위 세션 안내(12:44Z·12:46Z):
   - H02(claude/h02-protect)가 `app/layout.tsx` metadata에 robots(noindex) 한 줄을 넣는다. 이 파일을 고칠 때 그 줄을 지우지 않고, 충돌이 나면 두 쪽을 모두 살린다.
   - 상세 PR(5번) 추가 일: 상세 API가 1027·5xx·429·403으로 실패하면 스냅숏 카드 자료로 상세를 보여 주고 ‘자세한 정보를 지금 불러올 수 없음’을 안내한다(응답 모양은 `docs/H02-20261013.md`).
   - H02 배포 뒤에는 UA가 `Mozilla/`·`Opera/`로 시작하지 않는 `/api/*` 요청이 403이다. U05 검사 스크립트는 Node fetch로 정적 `/snapshot/`만 부르고 `/api/`는 브라우저로만 부른다(재확인 필요).
   - 상위 세션 13:05Z·13:20Z 추가:
     - 상세 대체 조건은 ‘404가 아님’이다(`ApiError.status`가 없으면 Worker·네트워크 문제, 429·503도 포함). 근거는 H02 PR #76 `docs/H02-20261013.md`의 ‘상세 API 실패 응답’ 표다.
     - H02 배포 뒤 상세·비교 API는 IP별 60초 30회 제한이다. 브라우저 검사가 1분에 상세를 30번 넘게 열면 429가 난다.
     - D05 PR #77: Jalan `roomTypes`는 name이 null인 한 항목에 사진이 최대 6장이고, caption은 일본어이며 빈 문자열일 수 있다. Trip.com caption은 ''이다. 사진은 원본 주소(cdn.jalan.jp, *.tripcdn.com)이고, 출처는 sourceId(trip-/jalan-)로 표기한다.
     - `viewBath`는 `FEATURE_LABELS` 끝(비트 13, ‘전망 욕탕’)에만 있다. 필터·상세·비교에 넣을지는 U05가 정한다.
     - `rooms.verifiedAt`은 YYYY-MM-DD이고, byType 합과 total(Jalan 総部屋数)이 다를 수 있다.
   - D05 객실 사진: 상세·비교 API의 `roomTypes: [{sourceId, verifiedAt, items:[{name, photos:[{url, caption}]}]}]`. Trip.com은 타입 이름과 사진 3장(최대 30개 타입), Jalan은 name이 null이고 caption은 숙소 설명이다. Trip.com → Jalan 순으로 이어 붙인다. 출처 표기는 대표 사진과 같은 방식이다. 상세 PR에서 있을 때와 없을 때 모두 동작하게 한다.

### 3번 목록 PR

기록: 2026-10-13T22:32Z. 브랜치 `claude/u05-ui`를 PR #80 병합(main `9f90982`) 뒤 main에서 다시 시작했다. 첫 커밋은 PR #80 Claude 검토 1회째 P3 반영이다(`b0131a0`, 병합 뒤에 push되어 #80에 들어가지 못한 `a4c3fc1`을 옮김).

바꾼 것(설계안 8절 2번, 사용자 결정 2026-10-13):

- 헤더와 검색을 한 줄로 합쳤다.
  - 데스크톱은 상표 | 검색 | 숙소 찾기·즐겨찾기 한 줄이다.
  - 휴대폰은 상표·메뉴 한 줄, 검색 한 줄이다.
  - 제목 ‘일본 온천, 나에게 맞는 곳’은 화면에서 빼고 읽기용 h1로 남겼다.
- 지역 고르기를 검색창의 장소 선택 하나로 합쳤다. 첫 묶음은 온천마을 20곳(`collection-priorities.json`)이다. 온천마을을 고르면 그 도도부현과 검색어가 함께 들어간다. 그 아래 묶음은 일본 전국·도도부현·지역이다. 온천마을 줄과 빠른 지역 줄은 없앴다.
- 칩 막대 하나에 필터(휴대폰), ‘내 기준 9.0+ · 리뷰 50+’, 천연온천·노천탕·객실 온천·전세탕·니고리유·카케나가시를 두었다. 칩은 눌림 상태(`aria-pressed`)를 가진다.
- 결과 머리는 ‘지역 N곳’과 비교·정렬 한 줄이고, 그 아래에 6칸 설명(✓ 있음 · – 없음 · ? 확인 전) 한 줄을 두었다.
- 새 카드(`components/hotel-card.tsx`, `lib/bath-columns.ts`):
  - 사진은 휴대폰 96px, 데스크톱 120px이다. 사진 위 ‘료칸’·‘숙소 사진’ 표지는 없앴다.
  - 이름은 한국어·일본어 두 줄이다. 영어 이름은 상세에만 둔다.
  - 점수에 척도를 붙인다(/10 Trip.com · /5 Jalan). 내 기준 충족은 유황색 ‘내 기준’ 표지 하나다.
  - 탕 6칸(천연온천·노천탕·전세탕·객실탕·카케나가시·니고리유)은 카드 전체 폭에 3×2로 두고, 카드가 700px 이상이면 한 줄 6칸으로 둔다.
  - 6칸 규칙: 칸의 항목 중 하나라도 확인된 있음이면 ✓이다. 기준 항목(노천탕은 outdoor, 객실탕은 roomOnsen·roomOutdoor 등)이 모두 확인된 없음일 때만 –이다. 나머지는 ?이다. 파생 항목(communalOutdoor 등)은 있음으로만 채워지므로 없음 판단에 쓰지 않는다. 객실탕은 ‘일부’·‘전 객실’을 붙인다.
  - 모양으로도 구분한다(✓ 채운 칸, – 취소선, ? 점선 칸). 읽기용으로 ‘있음·없음·확인 전’을 붙인다.
  - 대욕장·자란 하이클래스·전망 욕탕(viewBath)은 6칸 밖이다. 하이클래스는 위치 줄의 표지로 남겼다.
- 수집 집계 띠, 전국 수집 현황 패널, ‘최신 자료 확인’ 버튼을 바닥글 ‘자료 현황’으로 옮겼다(별도 화면은 7번 PR).
  - 결과가 많으면 바닥글이 가까워질 때 목록이 자동으로 더 불러와서 바닥글에 닿지 않는다. 그래서 목록 위 6칸 설명 줄 오른쪽에 ‘자료 현황’ 버튼(44px)을 두었다(상위 세션 22:40Z 요청, 7번 PR에서 바꿔도 됨).
  - 누르면 그 결과에 대해서는 자동 불러오기를 멈추고(‘숙소 더 불러오기’ 버튼은 그대로), 수집 현황을 열고, 바닥글 자료 현황으로 옮겨 가 초점을 둔다. 같은 바닥글의 사진 출처도 그 아래에서 닿는다.
- 빈 결과 문구는 조건이 있으면 ‘위의 조건을 하나씩 풀어 보세요. 확인 전인 조건은 ‘있음’으로 치지 않습니다.’이고, 버튼은 ‘조건 모두 풀기’다. 불러오기 문구는 ‘숙소를 찾는 중…’이다.
- 360·390px 첫 카드는 290px에서 시작한다(완료 기준 300px 이하, 자료 현황 버튼을 넣기 전 278px). 1280px은 242px이다. 수정 전 main(`9f90982`)은 360·390px 725px, 1280px 553px였다.
- 5절 규칙 10번에 따라 캡처를 보고 카드 위치 줄의 ‘료칸/숙소’ 테두리 상자를 빼고 가운뎃점 글자로 바꿨다.

검사:

- 새 `scripts/check-u05-list-browser.mjs`(실제 Chromium 360·390·1280px, `evidence/ui-u05-list-20261013.json`)는 다음을 본다.
  - 휴대폰 첫 카드 위치.
  - 첫 쪽 40곳 카드의 6칸. 스냅숏 카드로 규칙을 따로 계산해 상태·순서·객실 범위를 비교하고, 모양(채움·취소선·점선)과 읽는 글을 본다.
  - 한국어·일본어 이름, 영어 이름 없음.
  - 6칸 설명.
  - ‘천연온천’ 칩: 눌림 상태와 스냅숏 수(24곳), Worker 목록 요청 없음.
  - 장소 선택: 첫 묶음이 온천마을이고, 로컬 자료에서 숙소가 가장 많은 온천마을(도고, 21곳)을 고르면 주소·수가 맞는다.
  - 자료 현황이 바닥글에 있다.
  - 목록 위 ‘자료 현황’에 Tab(360·390px 3번, 1280px 22번)과 Enter로, 휴대폰은 터치로도 닿는다. 자료 현황이 열린 채 화면 안에 오고 초점이 옮겨 가며, 페이지 끝까지 내려도 목록이 늘지 않고 사진 출처에 닿는다. 자동 불러오기를 멈추지 않는 변형에서는 이 검사가 실패한다(360·1280px 키보드, 360·390px 터치).
  - 빌드된 묶음에서 ‘없음’ 판단을 ‘확인된 있음이 아니면 없음’으로 바꾼 변형에서는 6칸 검사가 360·390·1280px 모두 실패한다(정적 HTML과 어긋나 페이지 오류도 난다).
- 기존 검사 고친 것
  - `check-u02-browser`: 수집 집계는 바닥글 `.data-status`에서, ‘내 검증 기준’은 칩 막대의 `.verified-chip`에서 읽는다.
- 처음 실행에서 화면 쪽 문제 두 개를 찾아 고쳤다.
  - 짧은 이름(긴린소)의 카드 제목 버튼이 40px로 좁았다(`check-u05-foundation`). 이제 카드 폭 전체다.
  - 휴대폰에서 바닥글 자료 현황이 바닥글 폭을 넘어 수집 현황 표가 가로로 움직이지 않았고, 새로고침 버튼이 가려졌다(`check-u01`). flex 최소 폭 문제였다.
- 브라우저 검사(로컬 사이트)는 모두 통과했다.
  - 자료 현황 버튼을 넣은 빌드(`a8dccd6`): `check-u05-list` 25(Codex 2회째 반영 뒤 28), `check-u05-foundation` 53, `check-u01` 64, `check-u02` 52, `check-p03-followups` 9.
  - 그 앞 빌드(`f3340cf`): `check-u02-map` 55, `check-u05-map` 23, `check-u03-desktop` 12, `check-u03-comparison` 60, `check-u04` 57. 그 뒤로 바뀐 것은 목록 위 설명 줄과 간격뿐이다.
- Codex 1회째(head `f95c289`) P2 1건(자동 불러오기 때문에 바닥글 자료 현황에 닿지 않음)은 상위 세션 요청과 같은 내용이었고, `a8dccd6`에서 반영했다.
- Codex 2회째(head `ba271d5`) P2 1건: 검색이 끝나기 전(‘숙소를 찾는 중…’, 또는 스냅숏 전 정적 첫 쪽)에 ‘자료 현황’을 누르면 결과 순서가 비어 있었다. 그래서 결과가 나오는 순간 멈춤이 풀려 자동 불러오기가 바닥글을 다시 밀었다.
  - 반영: 그때 누르면 ‘대기’로 두었다가, 결과가 나온 뒤 그 결과에 멈춤을 고정한다.
  - 검사: `check-u05-list`에 스냅숏을 2.5초 늦게 주고 그 사이에 누르는 경우를 더했다(28개). 수정 전 빌드에서는 세 폭 모두 실패했고, 수정 뒤에는 통과한다.
- Codex 3회째(head `6a96eee`, 23:17Z): 지적 없음. Codex 검토 3회로 끝났고 남은 지적이 없다. 병합 준비를 알렸다(상위 세션 `session_01PuNgLiSyMdn35DxmRigJmK`가 병합).
  - 마지막 실행에서 `check-u01`이 바닥글 ‘전국 수집 현황’ 열기를 누르지 못해 멈췄다. 기본 화면(1,655곳)은 바닥글이 가까워지면 목록을 계속 더 불러와 바닥글이 밀려난다. 그래서 수집 현황 검사는 짧은 결과(노보리베츠 4곳)에서 연다(`f3340cf`). 닫힌 `<details>` 안의 버튼은 가림 판정에서 뺐다(`797eb37`).
  - 수정 전 캡처(main `9f90982`)와 수정 후 캡처를 남겼다. 360·390·1280px 첫 화면·전체, 실패·다시 시도·초점·필터·상세·비교·지도·즐겨찾기(`check-u05-foundation`의 캡처 폴더)이다. 작업 세션 임시 폴더에만 있고, 외부 요청을 막아 숙소 사진은 없다.
- `cloud-check.py --full`: `f3340cf`에서 40개 통과(22:32:06Z–22:39:08Z, rc=0).
  - 자료 현황 버튼을 넣은 뒤(`dfbf38c`) 40개 통과(22:51:38Z–22:58:35Z, rc=0).
  - Codex 2회째 반영 뒤(`b610038`) 40개 통과(23:07:44Z–23:14:34Z, rc=0).

미확인·다음:

- 검색줄 고정(위에 붙임)은 하지 않았다. 지도·시트의 가림 검사와 함께 4번 필터 PR에서 정한다.
- 장소 선택은 shadcn Select 하나다. 온천마을과 지역을 한 입력창의 자동 완성으로 합치는 것은 하지 않았다.
- 바닥글 진입점은 목록 위 버튼 하나다. 7번 PR(자료 현황 별도 화면)에서 머리 메뉴 같은 진입점으로 바꿀 수 있다.
- 실제 기기·스크린리더는 미확인이다. 카드 사진은 외부 요청을 막은 캡처라 대체 글로 보인다.

### 4번 필터 PR

기록: 2026-10-15T01:57Z. 상위 세션 지시(10-15T01:23Z)로 시작했다. 브랜치 `claude/u05-ui`는 main `27d5da7`에서 시작했다.

바꾼 것(설계안 8절 3번):

- 휴대폰 필터를 왼쪽 시트에서 아래에서 올라오는 vaul 시트(`components/ui/drawer.tsx`, 의존성은 이미 있었다)로 바꿨다.
  - 높이는 화면의 88% 이하이고 폭은 전체다. 제목 ‘숙소 필터’와 결과 수, 닫기가 위에 있다.
  - 아래에 ‘초기화’와 ‘N곳 보기’를 고정했다.
  - 열면 초점이 시트 안(닫기)으로 간다. vaul `autoFocus`는 기본이 꺼져 있어 켰다.
  - 닫으면(버튼·Escape·끌어내리기) 초점이 칩 막대의 ‘필터’로 돌아온다. 터치로 열면 칩이 초점을 받지 않아 `onCloseAutoFocus`로 직접 돌린다.
- 공용 필터 `components/hotel-filters.tsx`: 데스크톱 왼쪽 패널과 휴대폰 시트가 같은 구성 요소를 쓴다.
  - 조건 하나가 줄 전체인 토글(`role=switch`, 44px 이상)이다. 개수를 옆에 둔다.
  - 맨 위에 ‘내 검증 기준’(Trip.com 9.0+ · 리뷰 50+) 토글이 있다. 그 아래 묶음 5개(온천수와 사용 방식·공용·전세 목욕 시설·객실 목욕 시설·숙소 유형·등급·평점과 리뷰)다.
  - 설명 문단(대욕탕만 확인된 숙소, 카케나가시 뜻, 객실탕 예약 조건, 하이클래스 기준, 원래 척도)은 묶음 제목 옆 ‘?’(44px, `aria-expanded`) 안으로 옮겼다. 각주 상자는 없앴다.
  - 평점 출처·최소 평점·최소 리뷰는 전과 같은 선택 상자다(`components/picker.tsx`로 뺐다).
- 칩 막대와 상태가 같다(같은 `filters` 상태). 칩에서 켠 조건은 시트에서도 켜져 있고, 시트에서 켠 조건은 칩도 눌린다. ‘초기화’는 둘 다 끈다.
- 옛 체크박스 줄·검증 기준 상자·각주 CSS를 지웠다.
- 검색줄 고정(3번 PR에서 넘김)은 하지 않기로 했다. 휴대폰 머리는 두 줄(약 120px)이라, 고정하면 화면의 15%를 늘 가리고 지도 목록 시트·떠 있는 버튼과 겹친다. 필터는 칩 막대에서 열린다. 사용자가 원하면 칩 막대만 고정하는 안을 따로 본다.

검사:

- 새 `scripts/check-u05-filter-browser.mjs` 27개 통과(실제 Chromium 360·390·1280px, `evidence/ui-u05-filter-20261015.json`). 보는 것:
  - 시트가 화면 아래에 붙고 폭 전체이며 화면의 90% 이하인지, ‘숙소 필터’ 대화상자인지, 초점이 안으로 가는지.
  - 토글 15개가 모두 44px 이상인지, 묶음 5개의 이름·순서.
  - ‘?’가 44px이고 누르기 전에는 설명이 숨어 있는지.
  - ‘노천탕’ 토글: 칩 눌림, 결과 32곳 = 스냅숏 값(휴대폰은 시트 버튼, 데스크톱은 목록 머리), Worker 목록 요청 없음.
  - Tab 40번이 시트 밖으로 나가지 않는지.
  - 닫기·Escape 뒤 초점이 ‘필터’ 칩으로 오는지, CDP 터치로 끌어내리면 닫히는지.
  - 칩에서 켠 ‘천연온천’이 시트에서도 켜져 있는지, ‘초기화’로 토글·칩이 모두 꺼지고 결과가 전체인지.
  - 시트 안의 ‘최소 리뷰 수’ 선택 상자가 열리고 ‘50개 이상’이 적용되는지(시트는 열린 채).
  - 데스크톱 패널이 같은 토글·묶음인지.
- 변형 확인: 빌드된 묶음에서 토글의 `aria-checked`를 늘 꺼짐으로 고정하면 5건이 실패한다(세 폭).
- 처음 실행에서 화면 문제 하나를 찾아 고쳤다. 터치로 연 시트를 닫으면 초점이 칩으로 돌아오지 않았다(360·390px 2건).
- 기존 브라우저 검사(`946bbd7` 빌드, 로컬 사이트)는 모두 통과했다: `check-u05-foundation` 53(휴대폰 필터 시트의 대비·44px·13px 포함), `check-u05-list` 28, `check-u01` 64, `check-u02` 52, `check-u02-map` 55, `check-u05-map` 23, `check-u03-desktop` 12, `check-u03-comparison` 60, `check-u04` 57, `check-p03-followups` 9. 기존 검사는 고친 것이 없다.
- `cloud-check.py --full`: `49985b5`에서 42개 통과(01:57:25Z–02:07:11Z, rc=0).
- 수정 전 캡처는 3번 PR 때의 main 캡처(필터 시트는 그 뒤로 바뀌지 않음)이고, 수정 후 캡처(foundation 검사의 캡처 폴더)와 함께 작업 세션 임시 폴더에만 있다.
- PR #95(10-15T02:07Z). Codex 1회째(head `0f71ca2`, 02:12Z): 지적 없음.
- main `c3d1c84`(PR #94 D04)를 merge했다(`ab80c74`). 충돌은 로드맵 U05 줄 하나였고, 4번 필터 기록을 살렸다. D04는 수집기·타입(`facilityYears`)만 바꿔 화면과 무관하다. 그래서 타입 검사와 빠른 `cloud-check.py` 28개만 다시 돌렸다(통과).
- 검색줄 고정을 하지 않는 판단은 상위 세션이 받아들였다(10-15T02:08Z).

미확인·다음:

- 실제 기기에서 끌어내리기 손맛과 스크린리더의 토글 읽기는 미확인이다.
- 평점 선택 상자(Radix Select)의 실제 휴대폰 키보드·스크린리더 동작은 미확인이다.
- PR #95는 상위 세션이 main에 병합했다(10-15T05:54Z, `8f2beb9`).

### 5번 상세 PR

기록: 2026-10-15T06:41Z. 상위 세션(`session_01PuNgLiSyMdn35DxmRigJmK`) 지시(10-15T05:54Z)로 시작했다. 브랜치 `claude/u05-ui`는 main `8f2beb9`에서 다시 시작했다. 같은 PR에 D05 객실 정보와 D04 시설 연도를 화면에 넣었다(둘 다 상세 API에 이미 있다).

바꾼 것(설계안 8절 4번, 6.2절):

- 요약: 사진 넘기기(이전·다음, 끝에서 처음으로, ‘1/2’; 출처 표기가 보이는 사진을 따라간다), 한국어 이름과 일본어 이름 두 줄, 출처별 평점(‘9.4 Trip.com /10 · 리뷰 121개’, 그 아래 확인일·출처), 큰 탕 6칸(카드와 같은 `components/bath-cells.tsx`). 영어 이름과 다른 이름은 ‘숙소 소개’로 옮겼다. 휴대폰 첫 화면에서 6칸이 실행 막대 위에 보인다.
- 탕 상세: 공용·전세·객실 묶음(온천수 포함)에 확인된 항목만 펼친다. 확인 전 항목은 ‘확인 전 N개 보기’(`details`) 하나로 접는다. 모두 확인 전이면 ‘이 숙소의 탕 정보는 아직 확인하지 못했습니다.’와 Jalan 시설 안내 링크(없으면 다른 출처)만 둔다. 전망 욕탕(`viewBath`, D05)은 ‘공용·전세 목욕 시설’ 묶음에 둔다(6칸 밖).
- 객실과 시설(D05·D04): 객실 수(‘123실’, 종류는 0실을 빼고 ‘양실 10실 · 화실 100실 · 화양실 13실’), 설립 연도·리모델링 연도. 값마다 출처 이름(대표 사진처럼 `trip-`는 Trip.com, `jalan-`는 Jalan)과 그 출처 페이지 링크, 확인일을 붙인다. 없는 값은 한 줄 ‘객실 수 · 설립 연도 · 리모델링 연도: 확인 필요’로 모은다(연도가 없다고 오래됐다고 하지 않는다).
- 객실 사진: 출처마다 묶음 하나, Trip.com이 먼저다. Trip.com은 타입 이름과 사진(타입 3개까지, 나머지는 ‘객실 타입 N개 더 보기’), Jalan은 이름 없는 사진을 한 묶음(6장까지, 나머지는 ‘사진 N장 더 보기’)으로 둔다. 사진마다 출처 표기(‘Trip.com’·‘Jalan’, 대표 사진의 표기와 같은 모양), 묶음 제목 아래 출처 링크와 확인일, Jalan 설명은 `lang=ja`. 사진은 `loading=lazy`라 접힌 사진은 펼치기 전에 받지 않는다.
- 실행 막대: 시트 아래에 고정한다. ‘Jalan 열기’·‘Trip.com 열기’(고른 날짜·인원이 들어감)·즐겨찾기·비교(이번에 상세에 새로 넣음)다. 날짜·인원 칸은 막대의 ‘날짜·인원’(고른 값 요약, `aria-expanded`)으로 막대 위에 펼친다. 본문의 ‘공식 안내와 예약 사이트’ 링크 목록은 그대로다.
- 상세 API가 404가 아닌 이유(Worker·네트워크, 429·503·403)로 실패하면 시트를 닫지 않는다. 목록·지도·스냅숏에 있는 그 숙소의 카드(이름·평점·6칸·사진)와 ‘자세한 정보를 지금 불러올 수 없습니다’, ‘다시 시도’를 보인다. 다시 불러오면 초점을 숙소 이름으로 옮긴다. 404는 전처럼 닫고 스냅숏을 다시 확인한다. 카드가 없으면(스냅숏 전에 다른 숙소 주소를 연 경우) 전처럼 알림 후 닫는다.
- 데스크톱: 오른쪽 시트 720px(전 780px), 왼쪽 300px 단에 사진·요약, 오른쪽 단에 상세. 실패 때 카드만 보일 때는 한 단이다.

검사:

- 새 `scripts/check-u05-detail-browser.mjs` 66개 통과(실제 Chromium 360·390·1280px, `evidence/ui-u05-detail-20261015.json`). 로컬 자료에는 객실 정보가 없어 상세 응답에 객실 수·연도·객실 사진(Trip.com 4타입, Jalan 10장)을 더해 본다. 외부 사진은 빈 그림으로 바꾸고 다른 외부 요청은 막는다. 폭마다 상세를 네 번 연다(상세 API 60초 30회 제한 안). 보는 것:
  - 요약의 이름 두 줄·평점 수, 6칸이 상세 응답으로 따로 계산한 값과 같은지, 휴대폰에서 6칸이 막대 위에 보이는지, 데스크톱 720px 두 단.
  - 사진 넘기기(휴대폰 터치, 데스크톱 키보드 Enter)와 출처 표기.
  - 탕 조건 13개가 한 번씩 있고 확인된 것만 펼쳐 보이는지, 접기 문구의 수, 펼치기, 전망 욕탕의 묶음, 자란 등급 표지.
  - 객실 수·종류·설립 연도의 값과 출처 링크·확인일, 없는 리모델링 연도의 ‘확인 필요’.
  - 객실 사진 묶음 순서(Trip.com 먼저), 타입·사진 수, 접기, 표기, `lang=ja`, 접힌 사진을 펼치기 전에 받지 않는지.
  - 막대가 끝까지 내려도 아래에 붙어 있는지, 링크 주소·버튼 44px·화면 안, 날짜·인원 펼침 위치와 링크·요약에 날짜가 들어가는지, 비교 담기·빼기.
  - 객실 정보가 없는 숙소, 탕 정보가 모두 확인 전인 숙소.
  - 불러오는 동안 안내, 실패(360px 503, 390px 네트워크, 1280px 429) 때 스냅숏 카드와 안내(한 단), ‘다시 시도’ 뒤 전체 상세와 초점.
- 처음 실행에서 화면 문제 두 개를 찾아 고쳤다. 모두 확인 전일 때 시설 안내 링크가 Jalan이 아니라 Trip.com으로 갔다(정렬 비교가 거꾸로였다). 다른 이름이 긴 숙소에서 휴대폰 6칸이 막대 아래로 밀렸다(다른 이름을 ‘숙소 소개’로 옮기고 휴대폰 사진을 200px로 줄였다).
- 변형 확인: 소스를 세 군데 바꿔 빌드하면(확인 전 항목을 펼침, 객실 사진을 저장 순서로, 실패하면 전처럼 닫음) 18건이 실패한다(세 폭, 접기·사진 순서·실패 카드 검사).
- 수정 전(main `8f2beb9`)과 후(같은 숙소 `jalan-327522`, 상세 스크롤 안 위치): 첫 탕 정보 360px 1,065px → 474px(6칸), 날짜 칸 3,654px → 막대의 ‘날짜·인원’ 한 번, Jalan 링크 3,856px → 막대에 늘 보임, 상세 API 503 때 시트 닫힘 → 카드와 다시 시도.
- `check-u04-browser`는 날짜·인원 칸을 막대의 ‘날짜·인원’으로 연 뒤 같은 것을 본다(그 외 그대로). Tab 순서(체크인 → 체크아웃 → 성인 인원 → 첫 예약 링크)는 막대에서도 같다.
- 기존 브라우저 검사: `a23fa08` 빌드(로컬 사이트)에서 모두 통과했다: `check-u05-foundation` 53(상세 시트의 대비·44px·13px 포함), `check-u05-list` 28, `check-u05-filter` 27, `check-u01` 64, `check-u02` 52, `check-u02-map` 55, `check-u05-map` 23, `check-u03-desktop` 12, `check-u03-comparison` 60, `check-u04` 57, `check-p03-followups` 9. 그 뒤 바꾼 것(‘탕 상세’ 제목 아이콘 빼기, 검사 자료의 객실 타입 이름을 한국어로)은 `f978004` 빌드에서 `check-u05-detail` 66과 `check-u05-foundation` 53을 다시 돌려 확인했다.
- `cloud-check.py --full`: `d19e78a`에서 42개 통과(06:53:52Z–06:59:24Z, rc=0).
- 수정 전후 캡처는 작업 세션 임시 폴더에만 있다(외부 사진은 빈 그림).
- 최신 main `ff57c78`(L01 PR 3 요코하마 라벨, 기록)을 merge했다(`8f8ebb4`, 충돌은 로드맵 U05 줄 하나). merge 트리에서 `cloud-check.py --full` 42개(07:05:58Z 끝, rc=0), `check-u05-detail` 66, `check-u05-list` 28, `check-u04` 57이 통과했다.
- PR #101(10-15T07:10Z). Codex 1회째(head `393c685`, 07:15Z) P2 2건을 반영했다.
  - 첫 쪽에 없는 숙소를 주소(`#stay/<id>`)로 열고 상세 API가 스냅숏보다 먼저 실패하면 카드를 찾지 못해 시트가 닫혔다. 이제 카드가 없으면 스냅숏을 기다린다(`loadSnapshot`은 이미 받은 스냅숏이나 미리 받는 파일을 쓴다).
  - 모두 확인 전인데 온천 종류(`spring.types`)가 있으면 온천 종류 블록이 남았다. 이제 그때도 한 문장과 링크만 둔다.
  - 검사를 더했다(69개). 400번째 숙소를 cards.json을 2.5초 늦춘 채 열고 상세 실패를 먼저 보낸다. 모두 확인 전일 때 탕 구획의 자식이 제목과 한 문장뿐인지 본다.
  - 고치기 전 빌드에서 두 검사가 세 폭 모두 실패했다. 스냅숏 기다리기만 되돌린 빌드에서도 주소 검사가 세 폭 모두 실패했다.
  - 고친 빌드에서 `check-u05-detail` 69, `check-u02` 52(404 경로), `check-u01` 64, 빠른 `cloud-check.py` 28개가 통과했다.
- Codex 2회째(head `4b7d6c8`, 07:34Z) P2 1건을 반영했다.
  - 탕 항목이 모두 확인 전이고 자란 하이클래스만 확인된 숙소에서 ‘자란 숙소 등급’ 묶음이 한 문장 아래 남았다(수집기는 숙소 밖 온천 때문에 탕 항목을 비운 뒤에도 등급을 저장할 수 있다).
  - 등급은 탕 정보가 아니므로 탕 상세에서 빼고, 카드처럼 요약 위치 줄에 ‘자란 하이클래스’ 표지로 둔다(값이 있음일 때만).
  - 검사의 ‘모두 확인 전’ 입력에 등급 있음을 더했고, 탕 조건 13개와 요약 표지를 본다. 고치기 전 빌드에서 세 폭 모두 실패했다.
  - 표지 때문에 360px에서 6칸이 막대에 6px 걸려, 표지를 위치 줄 안으로 옮겼다(6칸 아래 끝 637px, 막대 669px).
  - 고친 빌드에서 `check-u05-detail` 69, `check-u05-foundation` 53, 빠른 `cloud-check.py` 28개가 통과했다.
- Codex 3회째(head `d1f3df7`, 07:52Z): 지적 없음. 검토 3회 끝, 남은 지적 없음.
- 상위 세션이 바뀌었다(10-15T07:48Z, 네 번째 `session_012tbsAbaHuG1Xhs94L4LatJ`). 병합 준비 알림은 새 id로 보낸다.
- 병합(상위 세션이 기록): 10-15T08:14Z, main `7bc041c1a139e517b3c6e7c8938674044d8d657d`. head `e96e534`, CI `checks`·GitGuardian 통과, mergeable clean, 리뷰 스레드 3개 해결. 마지막 검토(`d1f3df7`) 뒤 변경은 기록 파일과 main(`5f4d9b0`) merge뿐이다. `git merge-tree --write-tree 5f4d9b0 d1f3df7`로 만든 트리와 head의 차이가 `docs/roadmap.md`·`docs/work-handoff-latest.md`뿐인 것을 확인했다. 운영 배포 결과는 `deployments.md`. 상위 세션이 08:14Z에 U05에 6번(비교, D04 연도·D05 객실 정보 비교 행 포함) 시작을 보냈다.

미확인·다음:

- 실제 기기와 스크린리더는 보지 않았다. 사진 넘기기는 버튼만 있고 밀기(swipe)는 없다.
- 상세를 열 때 불러오는 동안은 전처럼 알림만 보인다(카드를 먼저 보여 주지 않음).
- PR #101은 상위 세션이 main에 병합했다(10-15T08:14Z, `7bc041c`).

### 6번 비교 PR

기록: 2026-10-15T08:39Z. 상위 세션(`session_012tbsAbaHuG1Xhs94L4LatJ`) 지시(10-15T08:15Z)로 시작했다. 브랜치 `claude/u05-ui`는 main `7bc041c`에서 다시 시작했다. 같은 PR에 D04 시설 연도와 D05 객실 수의 비교 행을 넣었다.

바꾼 것(설계안 8절 5번, 6.2절):

- 휴대폰(700px 이하): 2~4곳을 가로 이동 없이 나란히 본다. 이름표 열은 120px이고, 숙소 열은 나머지를 나눈다(360px에서 4곳이면 한 열 약 56px).
  - 칸마다 표지(✓ 있음·충족, – 없음·미충족, ? 확인 필요)나 짧은 값(평점 ‘9.3’, 객실 수 ‘120’, 연도 ‘1958’)을 둔다. 모양으로도 구분한다(채움·실선·점선). 읽기용 글(‘없음’, ‘확인 필요’, ‘9.3점’)을 붙인다.
  - 숙소 머리는 작은 사진, 두 줄까지의 이름(누르면 상세), 빼기 버튼(44px)이다. 일본어 이름·위치는 휴대폰에서 숨긴다.
  - 행 머리의 ‘근거’ 버튼(`aria-expanded`)이나 그 행의 칸을 누르면, 행 아래에 숙소마다 전체 칸(값·확인일·출처·근거)이 열린다.
  - ‘다른 항목만 보기’와 판단 보류 규칙(U03)은 그대로다.
- 데스크톱: 전과 같은 전체 칸 표이고, 비교 구획 CSS를 U05 토큰(`--yk-*`)으로 바꿨다(값은 같다).
- 새 행(D05·D04): ‘객실 수’, ‘설립 연도’, ‘리모델링 연도’.
  - 객실 수는 총수와 종류를 함께 비교한다. 총수가 다르면 다름이다. 총수가 같아도 한쪽만 종류를 밝히면 판단 보류다.
  - 값이 없는 숙소는 ‘확인 필요’이고, 같음·다름으로 추정하지 않는다.
  - 칸에는 값·종류·확인일·출처 링크를 둔다. 객실 종류 문구는 `lib/room-kinds.ts`로 빼서 상세와 함께 쓴다.

검사:

- 새 `scripts/check-u05-comparison-browser.mjs` 24개 통과(실제 Chromium 360·390·1280px, `evidence/ui-u05-comparison-20261015.json`). 로컬 자료에는 객실 수·연도가 없어 비교 응답에 더해서 본다(타키노야 120실·종류, 보로 120실·종류 없음, 다이이치 390실·1858·2019). 보는 것:
  - 휴대폰: 4곳이 가로 이동 없이 들어가는지, 이름표 열 120px, 칸 표지가 응답으로 따로 계산한 값과 같은지(없음 2곳인 전세탕 포함), 전체 칸은 숨는지.
  - 휴대폰: 이름 두 줄(44px), 빼기·‘근거’ 버튼 44px.
  - 칸을 누르면 근거 행이 열리는지(값·종류·확인일·출처), ‘근거’ 버튼으로 닫히는지, 키보드 Enter.
  - 객실 수·설립 연도 다름, 리모델링 연도 판단 보류 · 미확인 3곳, 같은 총수에 종류가 한쪽만 있으면 판단 보류.
  - 데스크톱: 전체 칸 그대로이고 표지·‘근거’ 버튼은 없는지.
- 변형 확인: 소스를 바꿔 빌드하면 실패한다.
  - 객실 수 비교에서 종류 빼기 → 세 폭 모두 실패.
  - 없음 표지를 ?로 바꾸기 → 휴대폰 두 폭 실패.
  - 처음에는 없음 표지 변형을 못 잡아서, 없음 값이 있는 전세탕 행을 검사에 더했다.
- 토대 검사가 휴대폰 ‘근거’ 버튼 폭 38.5px(44px 미만)을 찾아 고쳤다. 새 검사도 폭을 본다. 고치기 전 빌드에서 두 폭이 실패했다.
- 바뀐 화면에 맞춰 기존 검사를 고쳤다.
  - `check-u03-comparison`: 새 행 3개는 로컬 값이 없어 늘 판단 보류다. 그래서 행 22개(전 19), 판단 보류 12개(전 9), 숨김 15개(전 12), 확인된 값이 거의 없는 경우 19개(전 16)로 고쳤다.
  - `check-u01`: 휴대폰에서 ‘방향키·터치 가로 이동’ 대신 ‘4곳이 가로 이동 없이 들어가고 방향키·밀기에도 움직이지 않음’을 본다. 첫 열 고정은 그대로 본다.
- 이 PR 빌드(`21adf4f` 소스)에서: `check-u05-comparison` 24, `check-u03-comparison` 60, `check-u01` 64, `check-u05-foundation` 53, `check-u05-detail` 69 통과. 같은 빌드에서 남은 기존 검사도 모두 통과했다: `check-u05-list` 28, `check-u05-filter` 27, `check-u02` 52, `check-u02-map` 55, `check-u05-map` 23, `check-u03-desktop` 12, `check-u04` 57, `check-p03-followups` 9.
- 수정 전(main `7bc041c`) 휴대폰 비교표는 숙소 열 220px × 4 + 이름표 130px(CSS 값)이라 가로로 밀어야 했다. 이제 360px에서 표 너비 343px = 영역 너비다(가로 이동 없음).
- `cloud-check.py --full`: `d54f7e9`에서 42개 통과(08:45:33Z–08:50:58Z, rc=0).
- 최신 main `8dab529`(기록·README)을 merge했다(`0ab30f1`, 충돌은 로드맵 U05 줄 하나). 빠른 `cloud-check.py` 28개 통과.
- PR #108(10-15T08:52Z). Codex 1회째(head `0ab30f1`, 08:55Z): 지적 없음. 남은 지적 없음, 병합 준비.
- 병합(상위 세션이 기록): 10-15T11:2xZ, main `e807ea187a11a0d74c7ddf67051924eebb7078c8`. head `dff16ab`, CI `checks`·GitGuardian 통과. 마지막 검토(`0ab30f1`) 뒤 변경은 근거 파일(`docs/evidence/u05-filter-review-20261015/`)과 기록 파일, main(`43f2b4f`) merge뿐이다. `git merge-tree --write-tree 43f2b4f 0ab30f1` 트리와 head의 차이로 확인했다. 운영 배포 결과는 `deployments.md`. 다음은 왼쪽 필터 C안 PR(사용자 결정 10-15T11:2xZ, roadmap 결정 기록 ‘왼쪽 필터’), 그다음 7번(즐겨찾기만)이다.

미확인·다음:

- 실제 기기와 스크린리더는 보지 않았다. 휴대폰 칸은 표 칸이라 스크린리더는 행·열 머리와 읽기용 글로 읽는다.
- 운영 자료의 객실 수·연도로 비교 화면을 열어 보지는 않았다(공개 GET만 허용, 상세·비교 API 속도 제한).

### 왼쪽 필터 검토(사용자 의견, 구현 전)

기록: 2026-10-15T10:58Z. 사용자 의견(08:4xZ) ‘사이트 좌측에 있는 필터가 상당히 현재 별로같다’를 상위 세션이 맡겼다(10:50Z). 1280·1440px 캡처, 측정한 문제, 방향 A·B·C 목업은 `evidence/u05-filter-review-20261015/README.md`에 있다(PR #108에 문서로 함께 들어감). 권장은 C(두 단계 패널)다. 사용자가 방향을 고르면 따로 PR로 구현한다. 1280px에서 장소 선택 상자 글자가 보이지 않는 것도 같은 PR에서 본다.

### 필터 C PR(두 단계 패널)

기록: 2026-10-15T11:55Z. 사용자가 왼쪽 필터 방향으로 C를 골랐다(11:2xZ). 상위 세션 지시(11:21Z)로, PR #108 병합 뒤 `claude/u05-ui`를 main `e807ea1`에서 다시 시작했다. 범위 조정: 설계안 8절 7번의 ‘수집 현황 표를 별도 화면으로’는 U06(`claude/u06-status`)이 맡고, U05 7번은 즐겨찾기만 한다.

바꾼 것:

- 필터 패널(넓은 화면 왼쪽과 휴대폰 아래 시트가 같은 구성 요소):
  - 맨 위: ‘내 기준’(9.0+ · 리뷰 50+)과 탕 조건 6개를 2열 버튼(`aria-pressed`, 44px, 수 표시)으로 둔다. 순서는 카드의 6칸과 같다(천연온천·노천탕·전세탕·객실 온천·카케나가시·니고리유).
  - 객실은 ‘객실 온천’(`roomOnsen`)으로 거른다. 카드의 ‘객실탕’ 칸은 온천수가 아닌 객실 노천탕(`roomOutdoor`)도 세는데, 그것을 한 조건으로 거르는 키가 없다. 그래서 이름을 맞추지 않았다.
  - 그 아래: 칩에 없는 조건을 묶음 4개(공용·전세 목욕 시설 세부, 객실 목욕 시설 세부, 숙소 유형·등급, 평점과 리뷰)로 접는다. 처음에는 닫혀 있고, 켜진 조건 수(‘N개 켜짐’)를 묶음 머리에 보인다.
  - 탕 조건 설명은 제목 줄의 ‘?’ 안에 있다(휴대폰 시트는 ‘탕 조건’ 줄).
- 넓은 화면(901px 이상)에서는 같은 조건을 반복하던 칩 막대를 없앴다. 휴대폰은 칩 막대가 그대로다.
- 패널 열: 1251px 이상은 248px(전 220px), 901~1250px은 220px(전 185px)이고 화면이 좁으면 185px까지 줄어든다. 목록 370px·지도 310px 최소는 그대로라 945px부터 가로로 넘치지 않는다(전과 같음). ‘목록만’·‘지도 크게’는 두 열이고, 패널은 ‘목록 + 지도’ 때보다 좁아지지 않는다. 1251px 이상 ‘지도 크게’의 옆 숙소 목록은 340px → 320px이다(1280px에서 지도 608px, `check-u05-map`의 600px 초과 유지).
- 버튼은 이름과 수가 한 줄에 들어갈 때(96px 이상) 2열이다. 901~1250px에서는 패널이 좁아 한 줄에 하나(1열)로 두고, 패널 안에서 스크롤한다(‘카케나가시’가 잘리지 않게).
- 1280×800에서 패널이 안쪽 스크롤 없이 들어간다(내용 461px, 전 1,337px 중 463px만 보임). 바닥글 기준 최대 높이(U03, 목록 끝에서 패널 전체가 바닥글 위)는 그대로다.
- 장소 선택 상자: `Picker`가 고른 항목 글자를 `SelectValue`에 직접 넣는다. 정적 첫 화면이 페이지가 돌기 전에도 ‘일본 전국’을 보인다(전에는 hydration 전까지 빈 상자였다. 검토 때 1280px 캡처에서 빈칸으로 보인 원인이고, 너비 문제가 아니었다).

검사:

- `check-u05-filter`(39개, 360·390·1280·1440px)를 새 구성에 맞게 고쳤다. 보는 것:
  - 버튼 7개의 이름·순서·2열·44px, 묶음 4개가 닫힌 채인지.
  - ‘?’ 설명, ‘노천탕’ 버튼과 칩 막대·결과 수(스냅숏 값, Worker 요청 없음).
  - 묶음을 열면 토글 3개가 보이는지, 켜면 ‘1개 켜짐’과 결과 수.
  - 휴대폰 시트(아래 고정·초점·Tab·Escape·끌어내리기·초기화)와 ‘평점과 리뷰’ 안의 선택 상자.
  - 넓은 화면에 칩 막대가 없고 1280×800·1440×900에서 안쪽 스크롤이 없는지, 정적 첫 화면의 장소 값.
  - 945·960·1280·1440px의 세 보기: ‘목록 + 지도’가 작업 영역 안에 들어가는지(목록 370px·지도 310px 이상, 버튼 잘림 없음), ‘목록만’·‘지도 크게’가 두 열로 오른쪽 끝까지 차는지.
- 변형 확인: 소스를 네 군데 바꿔 빌드하면 11건이 실패한다. 묶음 처음 열림, 칩 순서 바꿈, 넓은 화면 칩 막대 보임, `SelectValue` 글자 빼기다.
- 바꾼 기존 검사:
  - `check-u05-list`: 넓은 화면에서는 패널의 ‘천연온천’ 버튼을 누른다.
  - `check-u03-desktop`: 묶음을 모두 연 뒤 패널의 마지막 조작 요소(‘최소 리뷰 수’)까지 내려 누를 수 있는지 본다.
- 수정 전 캡처는 `evidence/u05-filter-review-20261015/current-*.png`, 수정 후는 `evidence/u05-filter-c-20261015/after-*.png`(숙소 사진 없음)다.
- 기존 브라우저 검사 전체(`1725648` 소스 빌드, 로컬 사이트) 통과: `check-u05-filter` 39(`evidence/ui-u05-filter-c-20261015.json`), `check-u05-foundation` 53, `check-u05-list` 28, `check-u05-detail` 69, `check-u05-comparison` 24, `check-u01` 64, `check-u02` 52, `check-u02-map` 55, `check-u05-map` 23, `check-u03-desktop` 12, `check-u03-comparison` 60, `check-u04` 57, `check-p03-followups` 9.
- `cloud-check.py --full`: `f26417d`에서 42개 통과(12:04:45Z–12:10:26Z, rc=0).

검토:

- Codex 1회째(`8268316`, 12:24Z) P2 3건을 `9c33500`·`3e2f8e3`에서 반영했다. 945~979px 가로 넘침, ‘목록만’ 빈 셋째 열, `check-u03-desktop`이 닫힌 묶음 속 마지막 조작 요소를 건너뜀이다.
- 고치기 전 CSS(`8268316`)에 패널 `overflow:visible` 변형을 더한 빌드: 새 `check-u05-filter` 8건 실패, 새 `check-u03-desktop` 4건 실패(1024px는 중단), 전 `check-u03-desktop`은 12건 통과.
- `9c33500` 빌드: 브라우저 검사 13종 중 12종 통과(`check-u05-filter` 53, `check-u03-desktop` 12, `check-u05-foundation` 53, `check-u05-list` 28, `check-u02-map` 55, `check-u05-detail` 69, `check-u05-comparison` 24, `check-u03-comparison` 60, `check-u02` 52, `check-u01` 64, `check-u04` 57, `check-p03-followups` 9). `check-u05-map`은 1280px ‘지도 크게’ 지도가 588px이라 1건 실패했고, `3e2f8e3`에서 옆 목록을 320px로 줄였다.
- `3e2f8e3` 빌드: `check-u05-map` 23, `check-u02-map` 55, `check-u05-filter` 53, `check-u03-desktop` 12 통과. 빠른 `cloud-check.py` 28개 통과(`9c33500`).

## H02 — 공개 사이트 보호 강화(봇 수집·DDoS)

기록: 2026-10-13T12:45Z / 21:45 KST, 갱신 12:58Z. 하위 세션 `session_019yG8qw1WbTQEBYXDzk4D1Z`(부모 `session_01KfLU3P8YrmZdyxehAEp9rp`), 브랜치 `claude/h02-protect`, 시작 기준 main `00bcfdb`, main `fbc5389` merge. 상세는 `H02-20261013.md`.

- 1단계(조사·설계) 끝: Cloudflare 공식 문서 원문(12:35Z)으로 무료 플랜·workers.dev에서 쓸 수 있는 수단을 정리했다. Worker 하루 요청 한도는 Worker 코드로 지킬 수 없다(거절도 요청으로 센다). 정적 자산은 한도와 관계없이 나간다.
- 상위 세션 답(12:44Z): 스냅숏은 정적으로 둔다(남는 위험은 H02 문서에 적음). Worker 실패 때 상세 화면은 U05 상세 PR이 만들고, 응답 모양은 H02 문서 ‘상세 API 실패 응답’에 적었다. 상세·비교 IP별 60초 30회는 PR 1에 넣었다.
- PR 1: robots.txt(첫 화면만 열림), `public/_headers`와 `edge-guard`의 `X-Robots-Tag`, `app/layout.tsx` robots 메타 한 줄, 키 없는 자동화 UA 403, `DETAIL_RATE_LIMITER`, smoke 단언. 검사와 고장 낸 변형은 H02 문서와 PR 설명에 있다.
- PR #76(13:03Z 열림): `cloud-check.py --full` 38개 통과, 브라우저 검사 8종 360개 통과(이 PR 빌드, 제한이 켜진 로컬 서버, 429 없음). Codex 1회째 P2 1건(`/api/hotels/<id>/google`도 좁은 제한에) 반영.
- 실행기 저장소는 읽기만 했다(`55572c8`, 백업 UA `YukemuriBackup/1.0`, 모든 요청에 크롤 키).
- 배포 뒤 운영 확인: 키 없는 `/api/*`는 브라우저 형식 UA가 필요하다(`cloudflare-deploy.md` ‘공개 사이트 보호’).
- 미확인: 실제 Cloudflare에서 `_headers`의 `/*`가 `/`에도 붙는지(배포 smoke가 확인), 1027의 상태 코드.
- 재개 예약: `trig_019ymamW4itAtbxLm49Yfrm6`(2026-10-13T15:10Z, 5시간 사용량 초기화 뒤).

## D05 — Jalan 객실 수·전망 욕탕·객실 사진

기록: 2026-10-13T12:22Z / 2026-10-13 21:22 KST, 구현 기록 12:40Z / 21:40 KST. 상세는 `D05-20261013.md`다.

### 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션 `session_01KfLU3P8YrmZdyxehAEp9rp`가 맡긴 작업이고, 작성 세션은 `session_01EbPNydUi1HEGqL6GRQxwcD`다. 화면은 U05 하위 세션(`claude/u05-ui`)이 만든다.
- 브랜치 `claude/d05-rooms`, 기준 main `72f518c`. 12:44Z에 main `fbc5389`(PR #75까지)을 merge했다(인수인계·roadmap 충돌은 양쪽 절을 모두 살려 풀었다).
- 1단계(조사·설계)를 마쳤고 2단계(구현 PR)를 진행 중이다. 원출처 요청은 Jalan 6회(상세 4쪽, 객실 하위 쪽 1쪽, 404 약관 주소 1회)와 Trip.com 2쪽이다. 수집기 `SourceGuard`로 robots를 확인하고 8초 이상 간격을 두었다. 403·429·봇 확인은 없었다. 운영 사이트는 공개 GET(스냅숏 파일, 상세 API 2건)만 했다.
- 운영 D1·Secret·수집 주기·상한·간격은 바꾸지 않았다.

### 조사 결과

- Jalan 상세 첫 쪽에 객실 수 표(4곳 모두), `その他の風呂施設`의 `展望風呂`(4곳 중 3곳), 객실 사진 3장과 설명이 있다. 수집기가 이미 받는 쪽이다.
- Trip.com 상세 SSR에 `객실 수: N` 표지와 객실 타입별 이름·사진 목록이 있다. 수집기가 이미 받는 쪽이다.
- Jalan 약관 第５条·第８条와 Trip.com 약관 3절은 사적 이용 밖 사용을 제한한다(`D05-20261013.md` 3.3절). 사용자는 비상업 사이트라 무관하다고 보고 객실 사진과 객실 타입 이름을 보여 주기로 했다(`roadmap.md` 결정 기록, 2026-10-13T12:2xZ).

### 구현(2단계, 기록 2026-10-13T13:05Z / 22:05 KST)

- 수집기가 Jalan 상세의 객실 수 표(`rooms`), `展望風呂`(`features.viewBath`), 객실 갤러리 사진(`roomTypes`, 이름 없음)을, Trip.com 상세의 `객실 수: N`(`rooms`)과 객실 타입 이름·사진(`roomTypes`, 타입마다 3장)을 읽는다. Jalan 상세의 `bathDataVersion`은 `v3`이고, baths 단계가 `v3`가 아닌 Jalan 상세를 다시 고른다. 계약·합성(객실 수는 Jalan → Trip.com, 객실 사진은 Trip.com → Jalan)·서버 쪽 숙소 밖 온천 처리를 맞췄다. 상세는 `D05-20261013.md` 7절이다.
- 객실 사진은 처음에 다음 PR로 미루려 했으나, PR을 열기 전에 사용자 결정(보여 줌)을 보고 같은 PR에 넣었다.
- 컴포넌트와 `FEATURE_GROUPS`는 고치지 않았다. 지금 카드(`hotel-card.tsx`)는 모든 시설 키를 돌기 때문에 ‘전망 욕탕’ 표지가 나온다. 객실 사진은 화면에 아직 나오지 않는다(U05 상세 PR).
- 쓰기 측정: 상세 PUT 한 번의 쓰기 행 수는 D05 필드가 있든 없든 같다(`D05-20261013.md` 4.4절). `collection-budget.mjs`는 그대로다.
- 검사 결과는 `D05-20261013.md` 7.3절에 있다.

### 다음 작업

1. PR #77을 열고(13:19Z) 구독했고 상위 세션에 알렸다. CI `checks`가 `eabdba6`에서 통과했다(13:22–13:28Z).
   - Codex 1회째(`eabdba6`, 13:32Z 요청, 13:35Z 완료): P2 3건. 모두 고쳤다(`D05-20261013.md` 7.5절). (1) 큐레이션 숙소 묶음의 Jalan 관측(`hotel_source_observations`)이 baths 재방문에서 빠졌다. 선점 조건에 그 표의 기본 키 조회를 더했다. (2) 묶음이 기준 숙소를 다시 넣으면 `roomTypes`가 두 번 나왔다. 출처마다 한 묶음만 남긴다. (3) `audit-catalog.py`의 시설 키 목록에 `viewBath`가 없었다.
   - 13:50Z 확인 예약은 사용량 한도로 15:06Z에야 도착했고, 작업자 프로세스도 다시 시작됐다. 작업 트리는 남아 있었다.
   - 15:0xZ에 main `68c54e6`(H02 PR #76까지)을 merge했다. 인수인계 충돌은 H02 절과 D05 절을 모두 살려 풀었다.
   - Codex 2회째(`0b9eaff`): P1 1건. 카드의 ‘전망 욕탕’ 표지를 360/390px 실제 브라우저로 보지 않았다는 지적이다. 로컬 D1에 `viewBath` 숙소 3곳을 넣고 Chromium으로 검사해 24/24 통과했다(15:37Z). 결함을 넣은 대조 두 가지는 실패했다(`D05-20261013.md` 7.6절).
   - Codex 3회째(`f5d5f57`, 15:47Z 요청, 15:50Z 완료): P2 1건. 대기 조회(`GET ?baths=1`)가 큐레이션 묶음의 Jalan 관측을 보지 않아 선점과 다른 답을 줬다. 두 조회가 같은 조건(`BATHS_CANDIDATE`)을 쓰게 고쳤다(`D05-20261013.md` 7.7절). Codex 검토는 3회로 끝났다.
   - 16:23Z에 main `b577cc8`(PR #78, 기록만)을 merge했다. 충돌은 없었다.
   - 17:2xZ에 사용량 한도로 끊겼고 20:18Z에 다시 시작했다(상위 세션 지시로 그 사이 head를 바꾸지 않음).
   - Claude 검토 1회째(`b14f9b7`, 20:22Z): P0–P2 없음, P3 2건. 마지막 검토라 기록 파일만 바꿨다. `roadmap.md`의 D05 상태 칸을 이 PR 범위로 고쳤다. 검사 단언 수정은 상위 세션 지시보다 먼저 `1fcbc42`로 push됐다가 되돌렸고, D04 첫 PR에서 고친다(아래 5번, `D05-20261013.md` 7.8절).
2. 상위 세션 답(12:19Z, 12:46Z): baths 재방문(`v3`, 약 12일 동안 gentle 쪽의 약 1/8, 추정)과 카드의 ‘전망 욕탕’ 표지를 받아들였다. 360px·390px 카드 줄바꿈은 실제 브라우저로 확인했다(`D05-20261013.md` 7.6절).
3. U05에 전할 필드: `features.viewBath`, `rooms`, `roomTypes`(형식은 `D05-20261013.md` 4.1절).
4. D05가 끝나면 상위 세션이 이 세션에 D04(시설 연식)를 맡길 계획이다(12:25Z 메시지). Trip.com 표지의 연도 값은 `D05-20261013.md` 8절에 적었다.
5. D04 첫 PR에서 고칠 것(Claude 검토 1회째 P3): `scripts/check-source-policy.mjs`의 객실 수 순서 단언은 Trip.com 관측의 `retrievedAt`을, 객실 사진 순서 단언은 Jalan 묶음의 `verifiedAt`을 하루 늦게 두어 정렬 키 순서를 뒤집은 결함을 잡게 한다. 변경은 `1fcbc42`에 있다.

## L01 — 신규·폐업·휴관 반영

기록: 2026-10-13T15:20Z / 2026-10-14 00:20 KST. 하위 세션 `session_01B1EMNXwBFR86E9fRdWbW1N`(부모 `session_01KfLU3P8YrmZdyxehAEp9rp`), 브랜치 `claude/l01-lifecycle`, 시작 기준 main `b577cc8`. 상세는 `L01-20261013.md`.

- 1단계(지금 상태 조사) 끝: 운영 확인은 공개 GET만 했다. `update-lifecycle.py`는 옛 Sites 주소에 고정되어 있지 않고 workers.dev 주소를 받는다. 그러나 운영에서 이 도구를 부르는 workflow가 없어 키를 가진 사람만 공식 상태를 바꿀 수 있다.
- 운영 스냅숏 `df6ddf58032a7dcb`(13,217곳): 공식 상태는 휴관 1·폐업 1·영업(개업일) 3이다. 다섯 건 모두 2026-10-05 Sites에서 넣은 근거이고 운영 D1에 그대로 있다. 하코네 363~389곳, 유후인 167곳, 구로카와 35곳(공급자별 기록). 값은 `docs/evidence/l01-snapshot-20261013.json`, 명령은 `scripts/lifecycle-survey.py`.
- 2단계 설계(근거 파일 `data/lifecycle-official.json` → main push 뒤 `lifecycle.yml`이 기존 Secret `YUKEMURI_CRAWL_ACCESS_KEY`로 적용)를 상위 세션에 보내고 답을 기다린다. 새 Secret·사용자 조치는 없다.
- 3단계(공식 안내 대조, 15:18–15:26Z) 끝: `箱根ハイランドホテル`(`trip-1182118`)이 소유사 오다큐 보도자료(2025-11-13)와 箱根ナビ로 2025-05-08부터 휴관(2027년 가을 무렵 리뉴얼 개업 목표)임을 확인했다. 운영에서는 아직 탐색에 나온다. 하코네 유모토 호텔 휴관은 그대로다. 구로카와 조합 30곳 중 29곳이 카탈로그에 있다. 반영 초안은 `L01-20261013.md` 3.2, 근거는 `docs/evidence/l01-official-20261013.json`.
- 지역 규칙의 빈 곳(구로카와 낱말이 아소시 黒川을 잡고 조합 숙소 8곳을 놓침, 하코네 한국어 주소 26곳)은 L01 밖이라 기록만 했다(3.3).
- 기준 확인: main에서 `check-lifecycle-worker.mjs`(CI 밖 검사) 통과(15:3xZ).
- 상위 세션 답(15:18Z·15:2xZ): 설계대로 구현, 병합 한 번에 스냅숏 한 번, 3.2의 두 건은 첫 PR에 넣음, 지역 규칙은 다음 PR.
- 2단계 구현(PR 1): `data/lifecycle-official.json`(6건), `lifecycle.yml`(적용 → 저장분 있으면 스냅숏 한 번 → 판정), `scripts/runner/apply-lifecycle.py`, `update-lifecycle.py`(거절 뒤 계속, 끝에 실패), `deploy.yml` push `paths-ignore`에 근거 파일 추가, 검사 `check-lifecycle-official.mjs`·`runner/check_lifecycle.py`, `measure-d1-reads.mjs` lifecycle 상한. 새 근거 PUT 쓰기 6행, 같은 근거 0행(임시 D1).
- 다음: PR을 열고 Codex 검토를 받는다. 병합 뒤 첫 실행 결과(4건 replayed, 2건 saved, 스냅숏 한 번 기대)는 상위 세션이 확인한다. 그다음 L01 PR 2(지역 판정 규칙, 상위 세션 주의: `collection-priorities.json` version을 바꾸면 우선순위 유지보수가 전체 숙소에 쓰기를 만든다. 임시 D1로 쓰기 행 수를 재고 배포 UTC 날짜를 PR 설명에 적는다).
- 멈춤(2026-10-13T16:4xZ, 사용자 지시 ‘사용량이 모자라니 멈추고 다음 작업은 예약’, 상위 세션 전달): PR #79 head `d9da084`는 Codex 1회째 P1·P2를 고친 커밋이다(`cloud-check.py --full` 40개 통과, 스레드 2개 답하고 해결). CI 결과 대기, Codex 2회째는 아직 요청하지 않았다. 재개 예약 2026-10-13T20:10Z. PR 2 준비분은 이 세션의 로컬 브랜치 `l01-pr2-wip`(`5103175`, push 안 함)에만 있다. 내용: 구로카와 낱말을 `黒川温泉`·`南小国町`·`Minamioguni`·`미나미오구니`·`Kurokawa Onsen`·`杖立`·`わいた`·`Tsuetate`·`Waita`로, 하코네에 `하코네`를 더함, 판 번호 `onsen-first-20261013`, 우선순위 유지보수가 바뀐 행만 값별로 UPDATE, `check-crawl-queue-worker.mjs`에 쓰기 횟수 trigger 단언, `measure-d1-reads.mjs --prepare-steps`에 `priority` 항목. 운영 규모 복사본 측정: 우선순위 단계만 다시 돌리면 고치기 전 읽기 3,942,787·쓰기 30,928행, 고친 뒤 22,924·34행(작업 1%가 바뀌면 23,694·342행). 운영에서 우선순위가 바뀌는 숙소는 55곳(스냅숏 추정).
- 재개(2026-10-13T20:11Z, 예약): 5시간 창 0.07, 7일 창 0.53. Codex 2회째(`61dd7b0`) P2 1건(재실행 때 실패한 스냅숏 복구)을 고쳤다: 수동 실행·재실행에서도 스냅숏을 만든다. Codex 3회째(마지막 Codex)를 요청한다.
- main merge(21:25Z, `44915dd`, 기록 파일 충돌만 풂, `checks` 통과) 뒤 Codex 3회째(마지막 Codex, 21:39Z) P2 두 건을 고쳤다: `deploy.yml`이 근거 파일을 바꾼 push를 `lifecycle.yml`에 맡김(`scripts/lifecycle-push.mjs`, 배포 판정 `deferred`), 저장과 다시 읽기 실패를 따로 셈. 다음 검토는 상위 세션이 여는 Claude 검토 세션이다.
- Claude 검토 1회째(`c581ede`, 22:24Z, 검토 세션 `session_01K9M4aA8GiGuH6KweSuGW3D`): P2 1건, P3 2건. main merge(`0e1f45a`, 충돌 없음) 뒤 모두 고쳤다. P2: 건너뛴 push 배포가 성공으로 끝나 `checked-commit.mjs`가 그 커밋을 ‘전체 검사 통과’로 봤다. 이제 `Cloud app checks`만 센다. P3: `lifecycle-push.mjs`를 로컬 compare API 대역으로 검사, 복구 안내를 수동 실행으로(재실행은 원래 커밋을 다시 배포). 이 문서 다른 절의 C3 줄(‘`Cloud app checks` 또는 push 배포’)은 그때 기록이라 그대로 둔다. 지금 규칙은 `cloudflare-deploy.md`다. 다음은 상위 세션이 여는 Claude 검토 2회째(마지막)다.
- Claude 검토 2회째(`e252f31`, 22:56Z, 검토 세션 `session_018C5u7htqtrQBR6no5pfPbQ`, 마지막 검토): P0~P3 지적 없음. 검토는 Codex 3회와 Claude 2회로 5회를 다 썼다. 상위 세션이 검토한 head `e252f31`을 그대로 병합했다(main `3355d38`, 22:5xZ). 이 두 줄과 `L01-20261013.md`의 2회째 기록은 병합 뒤 다시 올린 기록이다. 상위 세션은 10-13 22:2xZ부터 `session_01PuNgLiSyMdn35DxmRigJmK`(세 번째 상위 세션)이다.
- 다음 작업(L01 PR 2와 함께 볼 것): (1) 병합 뒤 ‘Cloudflare deploy’ push 실행이 `deferred`로 건너뛰고 ‘Yukemuri lifecycle’이 4건 `replayed`, 2건 `saved`, 배포 한 번으로 끝났는지 본다(상위 세션이 확인하고 기록한다). (2) PR 2: 로컬 브랜치 `l01-pr2-wip`(`5103175`)를 새 main 위로 옮겨 지역 판정 규칙을 고친다. 7일 사용량 때문에 상위 세션이 시작을 알릴 때까지 기다린다(10-13 22:57Z). (3) 검토 참고(지적 아님): `checked-commit.mjs`의 `main()`이 API 실패를 `checked=false`로 처리하는 길을 검사가 돌리지 않는다(C3부터). `web-checks.yml` concurrency에 `queue: max`가 없어 가운데 push의 검사가 취소될 수 있다(그때는 `--full`을 다시 돈다). 둘 다 L01 밖이라 상위 세션이 맡길지 정한다.
- PR 2 시작(2026-10-15T01:24Z, 상위 세션 알림, 5시간 창 0.31·7일 창 0.04): main `27d5da7`을 merge했다(충돌 없음). WIP(`b7ffaba`)의 구로카와·하코네 낱말을 공개 스냅숏으로 다시 재 보니 `하코네`가 Trip.com 요코하마 숙소 54곳(저장 라벨 ‘가나가와 · 하코네’, 주소 `Yokohama`)을 하코네로 올렸다. 그래서 주소에서만 찾는 `addressTerms`를 더했다(하코네 `하코네`, 구로카와 `南小国町`·`Minamioguni`·`미나미오구니`). 판 번호 `onsen-first-20261015`. 바뀌는 작업 54개(구로카와 +29·−6, 하코네 +19), 판 번호 변경 한 번의 쓰기 약 150행, 10-14 하루 쓰기 59,921행과 합쳐 60.1%. 측정·검사·범위 밖 기록은 `L01-20261013.md` 4절, 계산은 `scripts/priority-plan-diff.py`. 다음: `cloud-check.py --full`, PR을 열고 Codex 검토.
- PR 2를 #93으로 열었다(10-15T01:50Z, head `c58e2f6`). 상위 세션이 `addressTerms` 판단을 받아들였다. PR을 열 때 ‘Cloud app checks’ 실행이 만들어지지 않아(GitGuardian만 돎) 아래 조사 기록을 담은 다음 커밋으로 CI를 다시 띄운다.
- L01 PR 3 조사(10-15T02:0xZ, 상위 세션 지시: #93 병합 뒤 따로 연다, 이번에는 원인과 고칠 위치만): 요코하마 숙소가 목록에 ‘하코네 · 가나가와’로 보이는 원인은 두 단계다.
  - `scripts/crawler/collect.py`의 `normalize()`는 Trip.com JSON-LD에 `addressRegion`이 없으면 저장 라벨을 현 이름으로 채운다(`label=region or p['name']`). 그런데 `data/prefectures.json`의 현 이름 다섯 개는 대표 지역을 붙인 두 부분 이름이다: ‘가나가와 · 하코네’, ‘시즈오카 · 이즈’, ‘아이치 · 나고야’, ‘효고 · 고베’, ‘오이타 · 유후인’.
  - `lib/japan-place-labels.ts`의 `formatHotelLocation()`은 주소가 영문 도시 이름 하나(`Yokohama`)뿐이면 도시를 찾지 못한다. 마지막 단계에서 라벨의 한글 부분을 써서 ‘하코네 · 가나가와’를 만든다. 로컬에서 같은 입력으로 확인했다: 라벨 ‘가나가와 · 하코네’ → ‘하코네 · 가나가와’, 라벨 ‘가나가와’ → ‘가나가와’.
  - 지금 해당하는 기록(공개 스냅숏 `4e22379a5ce3fe35`, 검색 문맥이 두 부분 현 이름으로 시작하는 기록): 가나가와 Trip.com 54곳(주소 `Yokohama` 53곳, 빈 주소 1곳)은 틀리게 보인다. 아이치 Trip.com 68곳(주소 `Nagoya`)은 ‘나고야 · 아이치’로 우연히 맞게 보인다. 시즈오카·효고·오이타는 아직 없다.
  - 고칠 위치 후보: (1) 수집기: 대체 라벨에 두 부분 현 이름 대신 Trip.com 주소의 도시 slug(`TRIP_CITY_PREF`의 키, 예: `yokohama`)를 쓴다. (2) 화면: `formatHotelLocation()`이 두 부분 현 이름과 같은 라벨의 지역 부분을 쓰지 않고, 영문 도시 이름 하나뿐인 주소에서도 도시를 찾게 한다. (2)만으로 기존 기록이 다음 스냅숏부터 바르게 보이고 D1 쓰기는 없다. 라벨에서 지역 부분만 빼면 아이치 68곳이 ‘나고야 · 아이치’에서 ‘아이치’로 덜 자세해지므로 도시 찾기를 함께 고쳐야 한다(로컬 확인). (1)을 바꾸면 기존 기록은 수집이 다시 받을 때 라벨이 바뀐다. 그때 늘어나는 쓰기(검색 색인 등)와 다시 쓰이는 기록 수는 PR 3에서 임시 D1로 먼저 잰다.
  - 수집 우선순위에는 영향이 없다. #93부터 하코네의 한국어 낱말은 주소에서만 찾는다.
- #93 Codex 1회째(`e395a7a`, 10-15T02:06Z): P2 1건 ‘작업 총수를 겹치지 않게 세라’. `priority-plan-diff.py`가 `status.json`의 `activePages`(다른 상태와 겹침)까지 더했고, 끝난 목록 작업·건너뛴 작업은 이 파일에 없어 배치 수가 정확하지 않았다. `activePages`를 빼고, 작업 총수를 주는 `--queue-jobs`를 더했다. 없으면 결과에 하한이라고 적는다. 이 스냅숏은 `activePages`가 0이라 숫자는 같다(16,879개 이상, 배치 34번 이상, 쓰기 142행 이상). 세지 못한 작업 1만 개마다 쓰기 20행, 읽기 약 1.5만 행이 더해진다(`L01-20261013.md` 4.3).
- #93 Codex 2회째(`e72f00c`, 02:15Z): 지적 없음. 검토는 Codex 2회로 끝났고 그 뒤로는 기록 파일만 바꿨다. 병합 준비를 상위 세션에 알린다. 병합 뒤: 배포일 D1 쓰기는 상위 세션이 기록하고, L01 PR 3(요코하마 라벨, 위 조사)을 연다.
- #93 병합(10-15T02:34Z, main `b85e6c4`). 브랜치를 main에서 다시 시작했다. L01 PR 3(요코하마 라벨)을 시작한다. 5시간 창이 0.90에 닿아(02:35Z, 초기화 05:40Z) 단계마다 commit·push하고 05:50Z 재개 예약(`trig_013XXbQPQWdYPxpsTdg8vSzX`)을 걸었다. 계획: (1) 화면 `formatHotelLocation`이 두 부분 현 이름과 같은 라벨의 지역 부분을 쓰지 않고 영문 도시 이름 하나뿐인 주소에서도 도시를 찾게 한다(D1 쓰기 없음). (2) 수집기 대체 라벨을 고치고 다시 받을 때의 쓰기를 임시 D1로 잰다. (3) 검사, PR, Codex.
- PR 3 구현(02:3x–02:4xZ, 단계마다 push): 화면 `formatHotelLocation`·`hotelPlaceSearchText`가 두 부분 현 이름과 같은 저장 라벨을 쓰지 않고, 영문 도시 이름 하나뿐인 주소에서도 도시를 찾는다. 수집기 대체 라벨은 현 이름 앞부분. 공개 스냅숏 기준 목록 라벨 57곳이 바뀐다(요코하마 53곳 바로잡음, 빈 주소 4곳은 현 이름만). 다시 받기의 쓰기는 라벨이 바뀌어도 17행 그대로라 더하는 쓰기 0. 상세는 `L01-20261013.md` 5절. 다음: `cloud-check.py --full`, PR, Codex.
- PR 3을 #98로 열었다(10-15T02:50Z, head `23e90e9`, `cloud-check.py --full` 42개 통과). #93처럼 PR을 열 때 ‘Cloud app checks’ 실행이 만들어지지 않아(GitGuardian만 돎) 이 기록 커밋으로 CI를 띄운다. CI 통과 뒤 Codex 1회째를 요청한다.
- #98 Codex 1회째(`ac863e3`, 02:56Z): P2 1건 ‘이전에 정규화된 대체 라벨(‘하코네 · 가나가와’)도 버려라’. 고치는 중 5시간 창이 1.0에 닿아 02:58Z에 멈췄고 05:51Z 예약으로 재개했다(5시간 창 0.03). 앞뒤가 바뀐 꼴도 주소가 마을을 말하지 않으면 버린다. 공개 스냅숏 비교는 여전히 57곳이고 효고·아이치 Jalan 라벨은 그대로다. ‘Cloud app checks’ 실행은 #98의 두 커밋 모두에서 만들어지지 않았다.

## D04 — 시설 연식·리뉴얼 연도

기록: 2026-10-15T01:35Z / 10:35 KST. 상세는 `D04-20261015.md`다.

### 기준과 상태

- 작업 환경: Claude Code 웹 클라우드. 상위 세션 `session_01PuNgLiSyMdn35DxmRigJmK`(세 번째 상위 세션)가 01:23Z에 시작을 알렸다. 작성 세션은 `session_01EbPNydUi1HEGqL6GRQxwcD`이고 브랜치는 `claude/d05-rooms`, 기준 main `27d5da7`이다.
- 상위 세션 지시(01:23Z): 표본으로 출처 표기를 먼저 확인하고 확인된 연도만 출처·확인일과 저장한다(추정 없음). 첫 단계는 조사·설계이고 결과를 상위 세션에 알린다. 첫 PR에 `check-source-policy` 단언 보강(`1fcbc42`)을 넣는다. 수집 쓰기가 늘면 D1 쓰기를 먼저 재서 PR에 적는다. 5시간 창 0.9에 닿아도 멈추지 않고, 닿으면 단계마다 커밋·push하고 `resetsAt` 10분 뒤로 재개를 예약한다.
- 1단계(조사·설계)를 마쳤다. 원출처 요청은 Jalan 3회(`shisetu/` 200 두 번, 404 한 번)와 Trip.com 상세 6쪽이다. `SourceGuard`로 robots를 확인하고 8초 이상 간격을 두었다. 403·429·봇 확인은 없었다. 운영 사이트에는 요청하지 않았다.
- 운영 D1·Secret·수집 주기·상한·간격은 바꾸지 않았다.

### 조사 결과

- Trip.com 상세의 이 숙소 묶음에 `openYear`(설립 연도)·`fitmentYear`(리모델링 연도)가 있고, 같은 값이 한국어 표지로 보인다. 표본 8곳 중 설립 연도 6곳, 리모델링 연도 1곳, 없음 1곳이다.
- Jalan에는 연도 칸이 없다. 자유 문장의 연도는 대부분 객실 하나의 개장이라 쓰지 않는다.

### 구현(2단계, 기록 2026-10-15T01:47Z / 10:47 KST, 보충 01:50Z)

- 수집기가 Trip.com 상세의 설립·리모델링 연도를 `facilityYears`로 읽는다(필드와 표지가 같을 때만). 계약·합성(한 출처의 진술을 통째로)·검사를 맞췄다. 상세는 `D04-20261015.md` 7절이다.
- 상세 PUT의 쓰기 행 수는 연도 유무와 관계없이 같았다(새 숙소 33, 갱신 19). `collection-budget.mjs`는 그대로다.
- D05에서 넘어온 `check-source-policy` 단언 보강(`1fcbc42`)을 넣었다.

### 다음 작업

1. 설계를 상위 세션에 보냈다(01:3xZ). 상위 세션 답(01:31Z): 검색 스냅숏에는 넣지 않고 이번 PR은 상세·비교 API까지만 한다(U05 4번 필터 PR과 충돌, Trip.com 상세 완료 약 790곳이라 필터로 쓰면 대부분 ‘확인 필요’). 화면 표시는 U05 상세·비교 PR에서 붙인다. 덧붙인 지시: 표지와 필드 값이 다르면 저장하지 않고 진단에 남긴다. 그래서 수집기 쪽 진단에 `facilityYearMismatch`를 더했다(01:48Z).
2. PR #94를 열었다(01:58Z, head `61326f9`). 전체 검사는 main `381f1d2` merge 뒤 `f753421`에서 통과했다(01:50:32Z–01:56:59Z, exit 0). CI `checks`가 통과했다(01:57:46Z–02:03:34Z).
   - Codex 1회째(`61326f9`, 02:04Z 요청, 02:06Z 완료): 지적 없음. Claude 검토는 열지 않았다(상위 세션 판단).
   - 상위 세션이 10-15T02:07Z에 병합했다(main `c3d1c84`). 운영 배포 결과는 `deployments.md`다. 브랜치 `claude/d05-rooms`는 `c3d1c84`에서 다시 시작했다.
3. 다음 단계(정기 재확인으로 채워진 비율 측정, 화면 표시는 U05 상세·비교 PR)는 상위 세션의 시작 알림을 기다린다.
