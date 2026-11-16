# 열아홉 번째 상위 세션의 교훈(2026-11-03–11-10)

유케무리 열아홉 번째 상위 세션 `session_01Up3F23nhK2tW2PjhYzZYnC`이 적었다. 하네스 관리 세션에 보낼 것만 모았다. 경위는 `docs/history/work-handoff-20261110T0015Z.md` 「상위 세션 인계」 8과 이 판의 8에 있다.

1. 하위 세션에 push를 미루게 하면 Stop hook이 미룬 커밋을 push하게 만든다. 11-09 O02 앱 세션은 ‘main 합치기 push와 함께 올림’으로 정한 P2 고침을 로컬 커밋으로 두었다가, push하지 않은 커밋을 두고 push를 요구한 Stop hook 때문에 바로 push했다. push를 미루게 할 때는 커밋하지 말고 scratch의 patch 파일로 두게 지시한다(C04가 쓰는 방식). 하네스 후보: `child-session-orchestration`의 push 보류 지시에 이 한 줄.
2. `session-handoff` `scripts/user_messages.py extract`가 ‘[Request interrupted by user]’ 중단 표시를 `unknown`으로 세어 거짓 FAIL을 냈다(11-03, 이미 하네스 관리 세션에 알림). `get_event`로 두 이벤트의 본문을 보고 사람이 입력한 글이 아님을 확인한 뒤 결과를 썼다.
3. 사용자가 일을 주간 사용량 초기화 뒤로 미루게 했을 때, 하위 세션의 예약은 `update_trigger`의 `run_once_at`만 옮기고 메시지를 보내지 않았다(깨우면 큰 대화를 다시 읽어 토큰을 씀). 옮긴 까닭과 ‘prompt의 날짜를 옮긴 날짜로 읽으라’는 알림은 재개 날의 상위 세션 예약 prompt에 넣었다. 하위 세션 셋이 그대로 따랐다.
4. 사용자 승인이 세션마다 필요한 저장소(실행기 private 저장소의 `add_repo`가 자동 권한 검사에 매번 막힘)는, 그 저장소를 처음부터 `source_url`로 연 하위 세션에 맡기면 붙일 필요가 없다. O02를 앱 세션과 실행기 세션 둘로 나눠 열었다.
5. 서드파티 데이터 커넥터(Claude 디렉터리의 Tripadvisor·Booking.com)는 커넥터 전용 최종 사용자 약관이 없어서, 그 회사의 API·파트너 약관을 원문으로 읽어 판정했다. 두 곳 모두 저장·공개 재게시·다른 예약 사이트 옆 표시를 막았고, 커넥터는 Claude 세션 안에서만 불려 정기 수집기가 부를 수 없었다. 하네스 후보: `data-source-terms` 2절의 예시로 ‘Claude 커넥터는 그 회사 API 약관을 본다, 세션 밖에서 부를 수 없다’.
