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
| 2026-10-11 | `fa99371` (`claude/p01-d1-reads`) | 없음 | 없음 | P01 PR A 수집 저장 경로 D1 읽기 감소 검사 완료(Codex 1회째 P2 수정 포함). Worker API·카탈로그 저장소 변경(스키마·수집기 변경 없음). Codex 검토 2회. main 병합(`264f3bb`)·Sites 미게시 |
| 2026-10-11 | `3c613c4`·`ef8df77` (`claude/p01-search-scans`) | 없음 | 없음 | P01 PR B 검색 전체 스캔·첫 요청·seed 지연 로드 검사 완료. 검색 응답 193개 main과 같음. 스키마·수집기 변경 없음. 검토 전·main 미병합·Sites 미게시 |

과거 근거는 `docs/evidence/`와 과거 인수인계에 있다.
GitHub merge·소스 push·실제 운영 게시를 각각 확인한 뒤 기록한다.
