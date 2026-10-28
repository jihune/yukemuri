# 열여섯 번째 상위 세션이 하네스에 보내는 교훈

기록: 2026-10-28T00:2xZ, 유케무리 열여섯 번째 상위 세션 `session_01Up3F23SSA9RsdSFsjsFQbE`(10-27T05:20Z–10-28T00:3xZ). 하네스 `session-handoff`의 ‘인계할 때 교훈을 하네스 관리 세션에 보냄’에 따라 쓴다.

## 1. 누락 점검의 하위 에이전트가 파일로 저장된 쪽에서 멈춘다

- 무슨 일: 인계를 받으며 옛 상위 세션의 `list_events(kinds=["user"], limit=100)`를 하위 에이전트에게 읽게 했다. 첫 쪽이 737,847자라 도구 결과가 파일로 저장됐고, 그 파일은 본문이 한 줄(약 59만 토큰)이라 Read로 열 수 없었다. 지시서가 ‘다른 도구는 쓰지 않는다’고 했으므로 하위 에이전트는 커서(`first_id`·`last_id`·`has_more`)를 읽지 못하고 멈췄다. 커서 세 값만 뽑는 python 한 줄을 허락하자 뒤로 9쪽, 앞으로 1쪽을 다 읽었고 `user_messages.py extract`가 PASS를 냈다.
- 제안: `session-handoff`의 대조 절차(하위 에이전트 지시서)에 ‘저장된 쪽에서는 커서 세 값만 python 한 줄로 뽑아도 된다, 본문은 출력하지 않는다’를 처음부터 넣는다. 또는 `user_messages.py`에 저장된 파일의 커서만 찍는 하위 명령을 둔다.
- 근거: 이 세션의 하위 에이전트 첫 보고(10-27T05:2xZ)와 두 번째 보고, `extract` 출력(`calls=11 ... PASS`).

## 2. `add_repo`로 받은 두 번째 저장소에서 새 브랜치를 push하면 stop hook이 ‘원격 브랜치 없음’이라고 한다

- 무슨 일: `add_repo`가 안내한 대로 실행기 저장소를 `git clone --depth 1`로 받았다. 이 클론의 fetch refspec은 `+refs/heads/main:refs/remotes/origin/main` 하나라, 새 브랜치를 `git push -u`로 올려도 원격 추적 ref가 생기지 않았다. stop hook이 ‘unpushed commit(s) and no remote branch’라고 알렸지만 `git ls-remote`로는 원격에 같은 커밋이 있었다. `git branch --set-upstream-to`도 ‘is not a branch’로 실패했다.
- 고친 방법: `git config --add remote.origin.fetch +refs/heads/<브랜치>:refs/remotes/origin/<브랜치>`, `git fetch origin`, `git branch --set-upstream-to=origin/<브랜치>`.
- 제안: `cloud-session-ops` §1(얕은 클론 줄 곁)에 한 문장으로 둔다.
- 근거: 이 세션 10-27T10:4xZ의 stop hook 알림과 실행기 PR #18.

## 3. 하네스 변경 알림의 ‘설치본을 직접 읽는다’를 돌고 있는 세션은 할 수 없을 때가 있다

- 무슨 일: setup 43·44 알림은 ‘영향을 판단하기 전에 설치본의 그 파일을 직접 읽는다’고 했다. 이 세션은 옛 판(`518c726`)으로 돌고 있었고, 하네스 저장소 `add_repo`(read)는 자동 권한 검사 ‘[Access Added As A Means]’에 막혔으며 공개 API도 403이었다. 그래서 알림의 목록만 보고 기록에 옮겨 적었다.
- 제안: 알림에 바뀐 줄의 원문(또는 이 일에 걸릴 만한 줄)을 함께 붙인다. 돌고 있는 세션이 직접 읽지 못하면 그 원문을 기록에 옮기고, 다음 세션이 설치본으로 확인하게 한다.
- 근거: 이 세션 10-27T06:16Z·10:38Z 알림과 인계 문서 「상위 세션 인계」 1의 1.

## 4. 한국어 기록 파일의 16 KB 목표

- 무슨 일: 사용자 결정으로 인계 문서와 `roadmap.md`를 줄였다. 지금도 따르는 사용자 지시는 모두 남기고 끝난 줄·경위는 history로 옮겼더니 인계 문서는 69,649 → 52,566바이트, `roadmap.md`는 74,786 → 38,893바이트였다(결정 기록 약 22.6 KB는 그대로). 한국어는 UTF-8로 한 글자에 3바이트라 16 KB는 약 5,400자이고, 지금도 따르는 지시와 이번 인계 결과만으로 그보다 크다.
- 제안: 크기 기준을 바이트로 두되, 지금도 따르는 지시 목록과 다음 인계 때 옮겨질 인계 결과는 따로 세거나 한국어 문서의 목표를 글자 수로 적는다.
- 근거: PR #269 본문과 인계 문서 「상위 세션 인계」 8의 10-27T05:37Z 줄.
