# 유케무리 클라우드 작업 시작

기록: 2026-10-10. 사용자 PC로 개발 환경을 이전하지 않는다.
아래 절차는 구현하는 세션 기준이다. 검토만 하는 세션은 2번의 새 브랜치와 6번의 인수인계 기록을 하지 않고, 결과를 PR 리뷰나 코멘트로 남긴다(`AGENTS.md`).

1. 이 파일과 `AGENTS.md`, `docs/work-handoff-latest.md`, `docs/roadmap.md`를 읽는다.
2. Git 상태·브랜치·기준 커밋을 확인하고 작업 하나를 새 브랜치에서 진행한다.
3. `bash scripts/cloud-setup.sh`로 고정된 의존성을 설치한다. 실패하면 잠금 파일을 바꾸지 말고 제한을 기록한다.
4. 구현 후 `python3 scripts/cloud-check.py --full`과 변경에 필요한 추가 검사를 실행한다.
5. 실제 화면 검증은 별도로 한다. U01의 360/390px Chromium 터치·키보드 검사는 2026-10-10에 통과했다. 실제 기기·스크린리더는 미확인이다.
6. 검사·제한·다음 작업을 인수인계에 쓴다. 배포 여부를 따로 기록한다.

| 대상 | 역할·상태 |
|---|---|
| 전체 앱 개발 레포 | https://github.com/jihune/yukemuri — public(2026-10-11 전환), 전체 앱 개발 기준 |
| 시작 소스 | Sites v49, `608a38042df8d101d28ae480debfdddc5f3de7dc` |
| Sites ID | `appgprj_6abf95be6ea0819181cc3e93535413ac` |
| 운영 주소 | https://yukemuri.jihun7891.chatgpt.site |
| 운영 DB | 기존 Sites D1. 개발 클론은 임시 DB를 사용 |
| 예약 실행기 | 기존 private `jihune/yukemuri-script-runner` 유지 |
| 대화 원본 | 프로젝트 6개 대화·첨부·native Sites/DB 자료를 비공개 보존. 요약은 `docs/conversation-handoff.md` |

현재 Site 공유 범위는 public이다. 개인 용도라는 설명만으로 바꾸지 않았다.
GitHub 준비가 호스팅·DB·수집 예약을 자동으로 이전하지 않는다.

## 양쪽에 사용할 요청

> START_HERE.md, AGENTS.md, docs/work-handoff-latest.md, docs/roadmap.md를 읽어.
> 기준 커밋을 확인하고 다음 미완료 작업 하나를 브랜치에서 구현·검사해.
> 검사 결과·미확인 사항·다음 작업을 기록해. 운영 DB·수집 예약·호스팅은 유지해.
> Sites 도구가 없으면 검사한 커밋과 배포 인수인계를 준비해.

환경 설정: `docs/cloud-development.md`. Sites 전달: `docs/sites-handoff.md`.
대화 결정: `docs/conversation-handoff.md`. 원래 Git 이력: `docs/legacy-history.md`. 과거 이관 준비: `docs/migration-20261009.md`.
