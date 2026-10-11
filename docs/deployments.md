# 코드와 운영 배포 대조

| 확인 날짜 | 앱 개발 커밋 | Sites 소스 커밋 | 버전 | 상태 |
|---|---|---|---|---|
| 2026-10-09 | 이관 준비 전 | `608a38042df8d101d28ae480debfdddc5f3de7dc` | 49 | 소스 복구 확인. 이관 변경 미게시 |
| 2026-10-10 | `dd6561071d18d244ad0f9992dbc5d0ed68d757bd` (`claude/pensive-bell-odhgp8`) | 없음 | 없음 | U01 CSS 수정 검사 완료. main 병합(`dc46087`)·Sites 미게시 |
| 2026-10-10 | `87372d64cf79eb452d9d8326791ff62c600aeeb9` (`claude/u02-search-gaps`) | 없음 | 없음 | U02 1차 검사 완료. main 병합(`f1c6982`)·Sites 미게시 |
| 2026-10-11 | `d46fd8ba0fc9e2e2ab8e0b9a0f8f2783edf3404f` (`claude/u02-followups`) | 없음 | 없음 | U02 1차 후속 검사·검토 완료. main 병합(`1360856`)·Sites 미게시 |
| 2026-10-11 | `6d2f133d4bfab761f1fdaf3bde7887e0a40cae00` (`claude/u02-map-bounds`) | 없음 | 없음 | U02 2차 지도 범위 검색 1단계 검사·검토 완료. Worker API 추가. main 병합(`30a73bf`)·Sites 미게시 |
| 2026-10-11 | `ff4d6f202f39ec315d9848a9a94a01c12e8c4381` (`claude/u02-map-keyboard`) | 없음 | 없음 | U02 지도 지점 키보드 접근성 검사·Codex 검토 완료. main 병합(`807dad9`)·Sites 미게시 |
| 2026-10-11 | `eef4fc705841a7dcb39929abb917c495e0fe990c` (`claude/d01-trip-address`) | 없음 | 없음 | D01 Trip 주소 중복 수집기 수정 검사·Codex 검토 완료. 수집기 release `08ca3bfe81af5c33bb8273a59fefa5aa0d7cf9d245c2729d3d474cf71b541bda`. main 병합(`d0ecabe`)·Sites 미게시 |
| 2026-10-11 | `b6775744386820dd967813247f4f720b79910515` (`claude/u03-desktop-overlap`) | 없음 | 없음 | U03 PR A 데스크톱 필터 패널·지도 출처 가림 수정 검사·Codex 검토 완료. 앱 화면만 변경. main 병합(`53ee98b`)·Sites 미게시 |
| 2026-10-11 | `4ab16029bf94b422a19b087542f1d492e80447b4` (`claude/u03-comparison-diff`) | 없음 | 없음 | U03 PR B 비교 차이 강조 검사·Codex 3회·Claude 1회 검토 완료. 앱 화면만 변경. main 병합(`1ff8f48`)·Sites 미게시 |
| 2026-10-11 | `fa99371` (`claude/p01-d1-reads`) | 없음 | 없음 | P01 PR A 수집 저장 경로 D1 읽기 감소 검사 완료(Codex 1회째 P2 수정 포함). Worker API·카탈로그 저장소 변경(스키마·수집기 변경 없음). Codex 2회째 검토(`ea324a9`) 큰 문제 없음. main 병합(`264f3bb`)·Sites 미게시 |
| 2026-10-11 | `1ea607308bb6bf9b1b2fbc5bc52081428843c5e5` (`claude/p01-search-scans`) | 없음 | 없음 | P01 PR B 검색 전체 스캔·첫 요청·seed 지연 로드 검사·Codex 2회 검토 완료(P2 1건 수정, 2회째 `1ea6073` 큰 문제 없음). 검색 응답 193개 main과 같음. 스키마·수집기 변경 없음. main 병합(`4b98c26`)·Sites 미게시 |
| 2026-10-11 | `4ce95cf` (`claude/u04-booking-dates`, 코드 `7992d78`·Codex 지적 수정 `4ce95cf`) | 없음 | 없음 | U04 예약 링크 날짜·인원·설명 번역 문구 검사 완료(cloud-check 23개, 브라우저 U04 57개·U01~U03 통과). Codex 1회째 P2 2건 수정, 2회째(`bb1b7d9`) 큰 문제 없음. 앱 화면·검사 변경. 수집기 release 그대로. main 병합(`16cb2ec`)·Sites 미게시 |

| 2026-10-11 | `6be425d` (`claude/p02-d1-reads`) | 없음 | 없음 | P02 PR A 수집 작업 선점 식 색인 2개(마이그레이션 0013)·선택 질의 재작성 검사·Codex 검토 완료. Worker 수집 선점 변경. 화면·수집기 release 변경 없음. main 병합(`734c26b`)·Sites 미게시 |
| 2026-10-11 | `720a2f2` (`claude/p02-search-snapshot`) | 없음 | 없음 | P02 PR B 검색 스냅숏(마이그레이션 0014: 표·뷰·trigger 9개)으로 목록·이름 검색·지도 계산. 응답 422개 main과 같음. 상위 세션 요청 보강(선점 비교·gentle 합계·실행기 백업 재현·CPU 측정) 포함. 화면·응답 형식·수집기 release 변경 없음. 보류(PR #38 draft) |
| 2026-10-11 | `dfa1a69` (`claude/p02-search-snapshot`) | 없음 | 없음 | P02 PR B CPU 보강(상위 세션 결정 (A)): 마이그레이션 0015 세대별 검색·지도 결과 저장, 정렬 typed 키·id 순위 재사용, 점수 짧은 표기, 출처 묶음 한 번. 응답 422개 main과 같음(새 빌드는 계산·재사용 두 번). 화면·응답 형식·수집기 release 변경 없음. 정적 스냅숏 방식 결정으로 보류(2026-10-11T15:40Z), PR #38 draft·미병합·Sites 미게시 |
과거 근거는 `docs/evidence/`와 과거 인수인계에 있다.
GitHub merge·소스 push·실제 운영 게시를 각각 확인한 뒤 기록한다.

## Cloudflare(H01)

기록: 2026-10-11. 절차는 `cloudflare-deploy.md`다. main 병합은 `cloudflare-deploy.json`의 `databaseId`와 `autoDeploy`가 모두 설정된 뒤에만 자동 배포가 된다. 그 전에는 `deploy.yml`이 배포를 건너뛴다. 배포 결과는 Actions 실행 요약(Worker 버전 ID·D1 bookmark·점검 결과)으로 확인하고 아래에 옮긴다.

| 확인 날짜 | 앱 커밋 | Worker 버전 ID | D1 bookmark | 상태 |
|---|---|---|---|---|
| 2026-10-11 | H01 2단계 PR | 없음 | 없음 | 배포 설정·workflow 준비. D1 미생성·자동 배포 꺼짐. 실제 Cloudflare 계정 미접속 |
| 2026-10-11 | `da47a7a`(PR #33 병합, 12:12:47Z) | 없음 | 없음 | main push의 `deploy.yml`은 배포를 건너뜀(D1 ID 없음). 3단계 run 38138420167(12:13–12:17Z): 서브도메인 `jihune` 등록, D1 `yukemuri`(`128a3c5b-8e5f-470a-a901-d899d396cae1`) 생성, 마이그레이션 13개 적용. Worker 미배포 |
