# Sites 수집기를 받는 Python 예약 실행

기록: 2026-10-08T15:20:15.454Z / 2026-10-09 00:20:15 KST.
상태: GitHub 기본 브랜치에 전환을 반영했다. 기존 Secret의 접근 검사와 gentle 수집이 성공했다. 새 방식의 다음 실제 cron 실행은 아직 관찰하지 않았다.

## 실행 방식

기존 `scripts/run-updates.py`가 같은 Secret을 읽고 환경에서 제거한다. `scripts/runner/bootstrap.py`는 고정 HTTPS 주소 `https://yukemuri.jihun7891.chatgpt.site/api/collector-release`로 인증 요청을 보낸다. 다른 주소 이동은 따르지 않는다. 최대 2 MiB, JSON 형식, 승인한 파일 5개, 경로와 SHA-256, 기본 수집 상한·간격을 검사한다.

검사한 파일은 매 실행의 임시 폴더에만 쓴다. 같은 배포 자료 하나로 기존 모드의 각 단계를 실행한 후 폴더를 정리한다. 다운로드·인증·검사 실패 시 실패로 끝낸다. 루트 `scripts/crawler/`나 `site/`의 오래된 사본을 대신 실행하지 않는다. 체크섬은 전송 오류 검사용이다. 신뢰 기준은 인증된 HTTPS와 승인된 Sites 게시 소스다.

## 유지한 예약과 제한

| 항목 | 값 |
|---|---|
| 예약 | `53 */3 * * *` UTC, 3시간 간격 |
| KST | 00:53·03:53·06:53·09:53·12:53·15:53·18:53·21:53 |
| 조건 | 기존 `vars.YUKEMURI_ENABLED == 'true'` 유지 |
| 모드 | 기존 `inputs.mode || vars.YUKEMURI_MODE || 'gentle'` 유지 |
| Secret | 기존 `YUKEMURI_ACCESS_JSON` 참조 유지; 값은 변경·출력하지 않음 |
| 권한 | `contents: read`, checkout `persist-credentials: false` |
| 동시 실행 | `yukemuri-catalog-updates`, `cancel-in-progress: false` |
| 작업 상한 | 6분 |
| 수집 실행 상한 | 다운로드 시간을 포함한 총 240초 |
| 기본 gentle | 16페이지 |
| 요청 간격 | 호스트별 8초 + 0~4초 흔들림; 순차 요청 |

수동 선택지는 verify-code·check-access·diagnose-jalan·gentle·backlog·refresh를 유지한다. verify-code는 비밀이나 네트워크 없이 검사한다. backlog는 건강 보고 → 준비 → refresh 40페이지 → Jalan 상세 120페이지 → Trip 상세 60페이지 → 목록 20페이지 → 건강 보고 순서다. refresh는 건강 보고 → 준비 → refresh 80페이지 → 건강 보고 순서다. 페이지 상한은 각 단계의 기존 값이며 모든 단계가 같은 240초 안에서 실행된다. 배포 자료의 16페이지는 기본 gentle 상한을 뜻한다.

robots·403/429·Retry-After·명확한 봇 확인, 저장된 임대와 재전송 정책은 Sites 수집기에서 유지한다. 시간 상한 도달 시 임대를 임의로 해제하지 않는다. 일반 이동·형식·연결 오류를 이유로 출처 전체에 임의의 긴 대기를 만들지 않는다. 정기 LLM 호출이나 새 예약을 만들지 않는다.

## 비밀과 검사

키는 기존 Secret에서 Python으로 읽고 자식 표준입력에만 전달한다. 인자·파일·로그·원출처 요청에 넣지 않는다. 자식 프로세스는 명시한 네트워크 프록시·인증서 설정과 기본 실행 환경만 받는다. 다른 workflow Secret은 받지 않는다. 오류와 시간 종료의 수집 로그에 키가 있으면 삭제한다.

로컬에서 새 실행기 9개와 배포 자료·이동·경로·비밀 경계 8개 검사가 통과했다. CI는 같은 검사와 기존 소스 안전·자료 해석·타입·Worker 빌드·회귀·전체 파일 목록 검사를 유지한다. `project-files.json.siteSourceCommit`은 보관한 `site/` 체크포인트의 커밋이다. 현재 Sites 배포와 자동으로 일치시킬 필요는 없다.

## 이후 작업과 실패 대응

일반 수정은 Sites 소스에서 검사하고 게시한다. 다음 예약은 그 게시 버전의 수집기를 받는다. 실행 로그의 `collectorRelease`로 적용된 자료를 식별한다. 정확한 예약 시작 시각은 GitHub가 보장하지 않으므로 실행 이력으로 확인한다.

수집기 결함은 Sites에서 수정·게시한다. 자료를 받을 수 없으면 실패 원인을 조사하고 중단 상태를 기록한다. 예전 사본을 자동 실행하거나 접근 제한을 우회하지 않는다. 시작 도구·GitHub Secret·예약 설정 변경이 필요할 때만 허가받고 GitHub를 수정한다. 복구는 실제 이전 버전과 데이터 영향을 검토한 뒤 수행한다.

다음 기능 작업은 Sites의 우선순위와 최신 인수인계를 따른다. 프로젝트 Sources나 프로젝트 지침에 파일을 연결했는지는 별도 설정이며 파일 저장만으로 설정 완료를 주장하지 않는다.

## 실제 반영과 검사

GitHub 기준 커밋은 `7196fb7c2dd031eddae209f10e886bccea209daa`였다. 별도 브랜치의 마지막 커밋 `273d9bc99c0898b5c739dce9a334652e53aadbc7`에서 전체 CI를 실행했다. [PR #1](https://github.com/jihune/yukemuri-script-runner/pull/1)을 병합했다. 기본 브랜치 커밋은 `b2bcbba732a70ca68369c19856396317613e86ba`다.

| 확인 | 결과 |
|---|---|
| 브랜치 전체 CI #19 | 성공 |
| PR 전체 CI #20·기존 보안 검사 | 성공 |
| [병합 후 전체 CI #21](https://github.com/jihune/yukemuri-script-runner/actions/runs/37798605098) | 성공, 전체 실행 2분 59초 |
| [기존 Secret 접근 검사 #12](https://github.com/jihune/yukemuri-script-runner/actions/runs/37798762691) | 성공, 전체 실행 20초 |
| [gentle 수집 #13](https://github.com/jihune/yukemuri-script-runner/actions/runs/37799070634) | 성공, 전체 실행 2분 57초·수집 단계 2분 41초 |
| 실제 저장과 조회 | 16페이지 처리, `jalan-302674` 저장 후 같은 ID 조회 성공 |
| 적용한 배포 자료 | `85f1605e213bb0cee3fe6ecba612c5bad9e2caf49a1ada76dccee4faa17fe44d` |
| 후속 건강 보고 | 2026-10-08T15:20:15.454Z, 활성 임대 0개 |

후속 집계는 기록 12,107개, 상세 1,317개, 좌표 1,268개, 온천 조건 확인 753개, 한국어 이름 617개, 현재 원문 대응 번역 528개다. 출처 간 같은 숙소가 중복될 수 있다. 전체 목록 완료는 아니다.
Jalan 형식 오류는 상세 8개·목록 3개다. 연결 오류 1개와 Trip 목록 404 1개도 남아 있다. 이번 수집은 `yad302674`를 다시 저장했지만 과거 ValueError의 원인을 확정하지 않았다. 임의의 파서 변경·시도 횟수 초기화·전체 출처 대기 해제는 하지 않았다.

[검사 근거 요약](evidence/collector-migration-20261008.json)과 [GitHub 실행 화면](evidence/github-collector-migration-20261008.jpg)을 같은 소스에 보관했다. 운영 DB 내보내기나 비밀을 포함하지 않는다.

## 다음 실제 예약의 관찰

기존 예약은 활성화되어 있고 모드는 gentle이다. 전환 전 마지막 확인한 자동 실행은 catalog #11, 2026-10-08 19:57 KST 시작·성공이었다. 그보다 앞선 문서의 마지막 성공 시각만으로 현재 예약 공백을 주장하지 않는다. 과거 실행 간 공백의 정확한 원인은 확정하지 않았다.
새 방식의 수동 실행 #12·#13은 실제 cron 실행과 구분한다. 다음 예정은 2026-10-08 15:53 UTC / 2026-10-09 00:53 KST다. 그 실제 실행을 아직 관찰하지 않았다. 필요할 때 허가받은 GitHub 이력에서 trigger·commit·collectorRelease·상한·저장 결과를 대조한다. 페이지 성공 시각만으로 예약 성공을 주장하지 않는다.

일반 새 세션은 이 Sites 소스로 복구한다. 다음 최우선 작업은 C01의 남은 Jalan 형식 오류 11개 진단이다. 프로젝트 지침·Sources 설정 화면은 이번에 변경하지 않았다.
