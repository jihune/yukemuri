# 운영 DB와 자동 백업

2026-10-09. 운영 DB는 기존 Sites D1이다. 실행기는 `jihune/yukemuri-script-runner`의 `maintenance/catalog-backup/`에 있다. 읽기 전용 백업 실행기와 v49/0012 복원 스키마를 별도로 관리한다. `site/` 과거 사본이나 전체 앱의 개발 기준이 아니다.

- 매일 19:23 UTC / 다음 날 04:23 KST에 기존 `YUKEMURI_ACCESS_JSON` Secret으로 `/api/catalog-export`를 읽는다. 새 LLM 작업이나 유료 API를 쓰지 않는다. GitHub 예약은 지연될 수 있다.
- 전체 영속 테이블 13개를 내보낸 뒤 새 임시 SQLite에 복원하여 스키마·해시·행 수·무결성을 확인한다. 운영 DB에 쓰지 않는다. 검사가 성공한 파일만 private Actions artifact에 보관한다.
- 일일 보관 14일, 매주 월요일 UTC 백업은 추가로 90일 보관한다. 수동 실행도 가능하다. 저장 한도와 자동 삭제는 GitHub 정책·계정 한도에 따른다. 추가 요금 한도는 변경하지 않는다.
- 백업은 `checkpoint.jsonl.gz`, SQL, 복원 스크립트, 해시 목록, 검사 보고서를 포함한다. 복원 SQLite 파일은 업로드하지 않는다. 개인 즐겨찾기를 포함하므로 Git에 커밋하지 않는다.
- 비원자적 체크포인트다. 시작·끝 행 수 일치는 단일 시점 스냅샷을 보장하지 않는다. 일시적 `price_quotes`와 `hotel_result_sessions`는 제외한다. GitHub repo 접근자도 artifact를 읽을 수 있으므로 접근 범위를 유지한다.
- workflow는 private repo의 main에서만 인증 백업을 실행한다. PR 검사는 가짜 데이터만 쓰고 Secret이 없다. contents 권한은 read다. 수집기 예약과 환경 Secret은 변경하지 않는다.
- D1 스키마 변경 시 최신 Sites SQL·schema.json·백업 스크립트를 함께 갱신하고 복원 검사를 한다. 스키마 버전 변경은 백업을 실패시켜 잘못된 복원본 보관을 막는다.
- 운영 복원은 별도 검토가 필요하다. 여기의 restore 명령은 새 SQLite 파일에만 복원하며 운영 반영을 하지 않는다. 직접 D1 복원 권한/Time Travel 사용 가능 여부는 확인되지 않았다.

## 장애와 장기 보관

Actions의 실패 알림을 켜고 매주 최근 성공과 artifact 존재를 확인한다. 만료 전 백업이 여러 날짜에 존재하는지 확인한다. 최신 성공이 48시간을 넘으면 Secret 만료·Sites 인증·스키마 변경·GitHub 사용 한도를 조사한다. 마지막 성공본을 먼저 보존한다. Secret 회전은 기존 수집기와 백업 모두에 영향을 준다.

장기적으로는 계정과 코드 레포에서 분리된 비공개 R2/S3 저장소에 암호화·버전 관리·보존 정책을 적용하는 편이 복구에 유리하다. 아직 그 저장소나 암호화 키는 구성하지 않았다. 새 저장소를 연결할 때 자동 이중 보관을 추가하며 지금의 일일 검사를 유지한다. 암호화 키를 잃으면 복원할 수 있으므로 별도 안전한 보관이 필요하다.

## 다운로드한 백업의 복구 검사

클라우드 임시 환경에서 압축을 풀고 `sha256sum -c SHA256SUMS`를 확인한다. 백업 폴더에서 아래 명령을 실행한다. 기존 파일은 덮어쓰지 않는다.

```bash
python3 scripts/catalog-checkpoint.py restore --archive checkpoint.jsonl.gz --out /tmp/yukemuri-recovery.sqlite
```

실제 운영 복구 전에 검사한 소스·스키마·백업 시각·개인 데이터 포함 범위·수집 작업 중단과 재개 절차를 정한다. GitHub merge는 운영 DB 복원이 아니다.
