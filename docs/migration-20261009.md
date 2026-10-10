# 유케무리 이관 기록

기록: 2026-10-09 UTC/KST. 로컬 개발 이전과 호스팅 이전은 하지 않는다.

## 보존한 자료

- Sites v49 현재 파일과 확인된 Git 이력 51커밋. 원본 bundle은 별도 보존본에 있다.
- 기존 private 실행기 main `b2bcbba732a70ca68369c19856396317613e86ba`의 파일 324개. 각 파일의 Git blob SHA-1을 확인했다.
- 현재 작업 문서·과거 인수인계·검증 근거·스키마·수집 데이터 파일·사진·소스코드.
- 프로젝트 Sources 첨부 4개와 이전 웹 에이전트 안내 첨부 1개를 별도 원문 폴더에 보존했다.
- 양쪽 웹용 시작 지침·공통 검사·스킬·Sites 전달 절차.

실행기의 확인된 전체 Git 이력 204커밋·tree 559개·blob 442개를 읽기 전용 Git Data API에서 확보했다.
원래 commit/tree/blob 해시와 서명을 보존했고 `git fsck --full --strict`와 bundle 검사를 통과했다.
당시 반환된 ref 4개(main·작업 브랜치·보존 브랜치·PR head)를 보존했다. API가 반환하지 않는 서버 내부 ref를 추정하지 않는다.
PR/issue 1개와 댓글 목록을 보존했다. GitHub 서버 설정·Secret 값·전체 Actions 실행 로그는 Git bundle에 포함되지 않는다.
읽기 전용 Actions 보존 작업도 별도 브랜치에서 성공했다. 산출물 전송 경로 403으로 읽기 API 복구를 사용했다.
보존 workflow의 쓰기 권한 확대는 자동 승인 검토가 거절하여 적용하지 않았다. 기존 main·cron·Secret은 유지했다.
기존 `site/` 사본은 현재 앱보다 오래됐다. 최신 앱 폴더에 덮어쓰지 않는다.

## DB

관리 API는 영속 테이블 13개를 내보낸다. 스크립트의 `hotel_source_observations` 누락을 이관본에서 수정했다.
마이그레이션·행 수·파일 해시·SQLite 무결성과 임대 초기화를 검사하는 회귀 검사를 추가했다.
실제 백업·복원 결과는 최근 인수인계와 비공개 DB 보존본의 완료 레코드에서 확인한다.
요금 캐시 `price_quotes`와 일시적 검색 목록 `hotel_result_sessions`는 기존 API 설계에 따라 제외된다.
이 두 테이블은 일반 조회 도구에서도 값이 잘려 반환되므로 별도 완전한 원본으로 보존했다고 주장하지 않는다.
운영 DB 전체 덤프나 동일 시점 스냅샷이 아니다. 여러 요청 사이에 수집이 계속될 수 있다.
복원 연습은 이 Work 클라우드 컨테이너의 새 SQLite 파일에만 수행한다. 사용자 PC 이관이나 운영 DB 변경이 아니다.
개인 즐겨찾기를 포함하므로 DB 보존본은 Git에 넣지 않는다.

## 대화 내보내기 도착 후

계정 내보내기는 요청 중이다. 현재 원본 수령과 전체 프로젝트 대화 보존은 미완료다.
검색된 기억이나 인수인계 문서는 대화 원본을 대신하지 않는다.

1. ZIP 원본을 비공개로 보관하고 SHA-256을 기록한다. 계정 전체 ZIP을 Git에 올리지 않는다.
2. 클라우드 컨테이너에서 목록을 만든다:

```bash
python3 scripts/import-chat-export.py --zip /absolute/export.zip --out /absolute/private/chat-inventory
```

3. `inventory.json`의 제목·기간·후보 표시를 프로젝트의 채팅/Work 세션 목록과 대조한다. 제목만으로 자동 확정하지 않는다.
4. 해당 프로젝트의 대화 ID를 JSON 배열로 `selected-ids.json`에 적고 선별한다:

```bash
python3 scripts/import-chat-export.py --zip /absolute/export.zip --ids /absolute/private/selected-ids.json --out /absolute/private/project-conversations
```

5. 원본 JSON은 모든 mapping 노드·분기·도구 메시지·메타데이터를 보존한다. Markdown은 읽기 보조본이다.
6. 식별 가능한 첨부 파일만 ZIP에서 함께 복사한다. 미해결 파일 참조와 기타 이미지/첨부 참조를 대조한다.
7. 누락 Work 세션·프로젝트 지침·Sources 파일·캔버스/생성 파일이 있으면 별도로 확보하고 목록에 표시한다.
8. 결정·작업·미완료 목록을 검토하여 레포 문서에 반영한다. 대화 원본·계정의 다른 대화·개인 자료는 비공개 보존한다.

## 다음 순서

1. 준비본 검사와 자료 보존을 완료한다.
2. 빈 private `jihune/yukemuri` 레포를 만들고 현재 Work GitHub 연결에 접근을 허용한다.
3. 준비본을 업로드하고 Codex/Claude 각각에 필요한 레포 연결을 설정한다.
4. 실제 첫 클라우드 세션에서 설치·검사·지침/스킬 발견을 확인한다.
5. 대화 ZIP이 도착하면 위 선별 절차로 원본을 추가하고 누락을 대조한다.
6. 다음 제품 작업은 U01 실제 모바일·키보드 검사다. 이후 D01로 진행한다.
7. 호스팅 이전·운영 DB 이전은 후속 결정으로 남긴다.
