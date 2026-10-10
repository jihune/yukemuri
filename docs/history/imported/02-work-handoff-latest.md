# 최근 작업 인수인계

검증 기준: 2026-10-08T15:20:15.454Z / 2026-10-09 00:20:15 KST.
작업: C02 — 기존 GitHub Python 예약을 인증된 Sites 수집기 실행으로 전환.
사용자가 이 저장소의 브라우저 접근과 기존 예약의 전환을 명시적으로 허가했다.
Sites 시작 기준은 v43, 소스 `c48efdbb8c814ff4b9b9d85640748f4036de8cac`다. 이번 문서와 시작 도구 보완을 같은 Sites 소스에 저장·게시한다. 최종 저장 버전·소스 커밋·게시 시각은 새 세션 안내와 Sites 현재 버전에서 확인한다. 본문 수치를 새 세션의 현재 수치로 가정하지 않는다.

## 완료한 변경

- GitHub 현재 예약과 기본 브랜치 `7196fb7c2dd031eddae209f10e886bccea209daa`를 직접 확인했다. 새 예약이나 LLM 예약을 만들지 않았다.
- 기존 `scripts/run-updates.py`가 실행마다 현재 Sites의 보호된 `/api/collector-release`에서 수집기를 한 번 받는다. 다운로드·인증·자료 검사에 실패하면 수집을 시작하지 않는다. 사본으로 자동 대체하지 않는다.
- 기존 gentle·backlog·refresh·check-access·diagnose-jalan의 단계 순서와 페이지 상한을 유지했다. verify-code는 비밀·네트워크 없이 검사한다.
- Sites `scripts/runner/bootstrap.py`에 검증 후 임시 파일을 만들고 정리하는 공통 처리를 추가했다. 실행 환경은 필요한 프록시·인증서와 기본 실행 설정만 보존한다.
- 수집 키는 Secret에서 읽어 환경에서 제거하고 자식 표준입력에만 전달한다. 인자·파일·로그·원출처 요청에 넣지 않는다. 출력의 키는 삭제한다.
- GitHub START_HERE·AGENTS·README와 전환 안내도 Sites 소스로 시작하도록 갱신했다. GitHub에 있는 `site/`와 옛 수집기 사본은 과거 체크포인트로 보존한다. 전체 파일 목록 검사는 그대로 유지했다.
- 브랜치의 모든 파일과 해시를 맞춘 마지막 커밋에서 전체 CI를 실행했다. [PR #1](https://github.com/jihune/yukemuri-script-runner/pull/1)을 병합했다. 기본 브랜치 커밋은 `b2bcbba732a70ca68369c19856396317613e86ba`다. PR 설명도 실제 검사·실행 결과로 갱신했다.
- [G00 인수인계 보존본](history/work-handoff-g00-20261008.md)과 [전환 검사 근거](evidence/collector-migration-20261008.json), [실행 화면](evidence/github-collector-migration-20261008.jpg)을 저장했다.

## 보존한 조건

| 항목 | 확인한 값 |
|---|---|
| cron | `53 */3 * * *` UTC, 3시간 간격 |
| 예약 변수 | `YUKEMURI_ENABLED=true`, `YUKEMURI_MODE=gentle`; 값 미변경 |
| Secret 참조 | `YUKEMURI_ACCESS_JSON`; 이름·값 미변경, 값 미열람 |
| 권한 | `contents: read`, checkout `persist-credentials: false` |
| 동시 실행 | `yukemuri-catalog-updates`, `cancel-in-progress: false` |
| 작업·수집 상한 | 작업 6분, 다운로드를 포함한 총 수집 240초 |
| gentle·요청 간격 | 16페이지, 호스트별 순차 8초 + 0~4초 흔들림 |
| 수동 backlog 페이지 | refresh 40, Jalan 상세 120, Trip 상세 60, 목록 20 |
| 수동 refresh 페이지 | refresh 80 |

robots·403/429·Retry-After·명확한 봇 확인·임대·재전송과 기존 출처 제한을 유지한다. 시간 종료 시 임대를 임의 해제하지 않는다. 일반 주소 이동·형식·연결 오류에 출처 전체의 긴 대기를 만들지 않는다. 새 유료 API·Google 연결·새 계정 권한을 만들지 않았다.

## 검사와 실제 실행

- 실행기 검사 9개와 배포 자료 경계 검사 8개가 로컬·GitHub CI에서 통과했다. 다운로드 실패의 사본 대체 금지, 한 배포 자료의 재사용, 다운로드를 포함한 총 예산, 실패 후 중단, 기존 수동 페이지 상한, 경로·해시·중복 JSON·이동 시 키 전달 금지·비밀 격리·임시 파일 정리를 검사했다.
- 전체 CI #19·#20·[병합 후 #21](https://github.com/jihune/yukemuri-script-runner/actions/runs/37798605098)이 성공했다. 기존 파일 목록·수집 안전·자료 해석·재시도·타입·보관한 site/의 Worker 빌드·회귀 검사를 유지했다. 기존 보안 검사도 성공했다.
- [GitHub 접근 검사 #12](https://github.com/jihune/yukemuri-script-runner/actions/runs/37798762691)는 기존 Secret으로 보호된 자료를 내려받고 건강 보고를 읽었다. 전체 실행 20초, 성공이다.
- [GitHub gentle #13](https://github.com/jihune/yukemuri-script-runner/actions/runs/37799070634)은 16페이지를 처리했다. 저장 후 `jalan-302674`의 같은 ID 조회를 확인했다. 전체 실행 2분 57초, 수집 단계 2분 41초, 새 출처 전체 대기 0초다.
- 두 실행의 collectorRelease는 `85f1605e213bb0cee3fe6ecba612c5bad9e2caf49a1ada76dccee4faa17fe44d`다. 이는 현재 승인한 Sites 수집기 배포 자료와 같다.
- 이번 Sites 변경은 문서와 Worker 밖에서 실행하는 Python 시작 도구의 공통 처리다. 수집기 배포 자료·Worker·정적 화면의 빌드 입력은 변하지 않았다. 입력이 같은 v43 산출물과 이전 Worker 검사를 재사용한다. 공통 처리 8개 검사는 다시 통과했다.

## 최종 운영 조회와 미해결

2026-10-08T15:20:15.454Z / 2026-10-09 00:20:15 KST 건강 보고를 읽었다.
기록 12,107개, 상세 1,317개, 좌표 1,268개, 온천 조건 확인 753개, 한국어 이름 617개, 현재 원문 대응 번역 528개다. 활성 임대는 0개다. 기록은 출처별이며 같은 숙소가 중복될 수 있다. 전체 수집 완료는 아니다.

Jalan 형식 오류는 상세 8개·목록 3개다. 연결 오류 1개와 Trip 목록 404 1개도 남아 있다. G00의 `yad301794`와 이번 `yad302674`는 저장·조회에 성공했다. 과거 ValueError의 정확한 원인은 확정하지 않았다. 대기·시도 횟수를 임의 초기화하거나 빈 결과를 성공으로 처리하지 않았다.

전환 전 자동 catalog #11은 2026-10-08 19:57 KST에 시작했고 성공했다. 앞선 문서의 마지막 페이지 시각만으로 현재 예약 공백을 주장하지 않는다. 과거 공백 원인은 확정하지 않았다.
새 방식의 수동 #12·#13과 다음 실제 cron 실행을 구분한다. 다음 예정은 2026-10-08 15:53 UTC / 2026-10-09 00:53 KST다. 그 실제 실행은 아직 관찰하지 않았다. 정확한 시작 시각은 보장하지 않는다. 확인이 필요하면 허가받은 GitHub 이력에서 trigger·commit·collectorRelease·상한·저장 결과를 확인한다.

GitHub 플러그인의 저장소 조회는 404였지만 허가받은 브라우저에서는 소유한 비공개 저장소를 정상 읽고 수정했다. 플러그인 접근 범위의 원인은 확정하지 않았다. 일반 개발 시작에는 이 연결이 필요하지 않다.
ChatGPT 프로젝트 지침·Sources 설정 화면은 변경하지 않았다. 갱신한 새 세션 안내에는 대체할 프로젝트 지침과 복구 요청 문안이 있다. 소스 시작 문서는 그 안내와 별개로 Sites ID로 복구할 수 있다.

## 다음 세션

1. 같은 ChatGPT 프로젝트의 새 Work 채팅에서 Sites ID `appgprj_6abf95be6ea0819181cc3e93535413ac`의 현재 소스를 복구한다. START_HERE·AGENTS·roadmap·이 문서를 읽고 실제 배포·운영 상태를 다시 확인한다.
2. C01의 남은 Jalan 형식 오류 11개를 원문과 보호된 진단으로 조사한다. 기존 요청 간격·대기·임대를 보존한다. 유효한 자료가 없으면 성공으로 기록하지 않는다.
3. 이후 U01 모바일·키보드 → D01 지역·동일 숙소 → D02 주요 온천 자료 → U02 검색·지도 안내 → O01 백업·복원 순서로 진행한다.

일반 화면·API·수집기 수정은 Sites에서 검사·게시한다. 시작 도구 자체·GitHub 예약·Secret·실행 이력이 필요한 작업에만 GitHub 접근 허가를 받는다. 이미 받은 같은 작업의 허가는 다시 요청하지 않는다. 한 세션은 확인 가능한 결과 하나를 끝내고 인수인계를 남긴다.
