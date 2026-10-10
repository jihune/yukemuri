---
name: yukemuri-maintenance
description: 유케무리의 코드·수집기·화면을 클라우드에서 수정·검토하거나, 세션을 이어받고 기존 Sites 배포 결과를 전달할 때 사용한다.
---

# 유케무리 유지보수

레포 루트의 `AGENTS.md`, `START_HERE.md`, `docs/work-handoff-latest.md`를 읽는다.
`docs/roadmap.md`에서 다음 작업을 확인하고 Git 상태·기준 커밋을 기록한다.

1. `docs/cloud-development.md`에 따라 고정된 의존성을 준비한다.
2. 한 작업 브랜치에서 구현하거나 지정된 PR/커밋을 검토한다.
3. `python3 scripts/cloud-check.py --full`과 해당 변경의 검사를 실행한다.
4. 화면 변경은 실제 모바일·키보드 검사를 확인한다. DOM 결과만으로 완료를 선언하지 않는다.
5. 변경·검사·제한·다음 작업을 UTC/KST와 함께 인수인계에 기록한다.
6. 배포가 요청됐으면 `docs/sites-handoff.md`를 읽는다. 실제 Sites 도구가 있을 때 설치된 공식 Sites 절차를 적용한다. 도구가 없으면 검사한 커밋과 전달 문서를 준비한다.

이 스킬은 레포의 유지보수 절차다. Sites 연결·D1 권한·배포 토큰을 제공하지 않는다.
운영 DB·대화 원본·비밀을 Git에 넣지 않는다. 기존 Python 예약과 요청 상한을 유지한다.
