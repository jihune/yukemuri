# 유케무리 클라우드 작업 시작

기록: 2026-10-10. 사용자 PC로 개발 환경을 이전하지 않는다.
아래 절차는 구현하는 세션 기준이다. 검토만 하는 세션은 2번의 새 브랜치와 6번의 인수인계 기록을 하지 않고, 결과를 PR 리뷰나 코멘트로 남긴다(`AGENTS.md`).

1. 이 파일과 `AGENTS.md`, `docs/work-handoff-latest.md`, `docs/roadmap.md`를 읽는다.
2. Git 상태·브랜치·기준 커밋을 확인하고 작업 하나를 새 브랜치에서 진행한다.
   H01 6단계 전환 뒤에는 앱 레포 Actions의 ‘Yukemuri collection’에서 마지막 성공 gentle 실행 시각도 본다. 12시간을 넘었으면 실행기 `YUKEMURI_ENABLED`와 부르기 실행부터 확인한다(`docs/cloudflare-deploy.md`의 ‘수집 workflow’).
   같은 Actions의 ‘Yukemuri collection spare’(`collect-spare.yml`, 매시간 예비)도 마지막 실행 시각과 workflow가 켜져 있는지 함께 본다. 공개 레포의 예약은 레포 활동이 60일 없으면 GitHub가 끄므로, 꺼져 있으면 Actions에서 다시 켠다(`docs/cloudflare-deploy.md`의 `collect-spare.yml` 줄).
3. `bash scripts/cloud-setup.sh`로 고정된 의존성을 설치한다. 실패하면 잠금 파일을 바꾸지 말고 제한을 기록한다.
4. 구현 후 `python3 scripts/cloud-check.py --full`과 변경에 필요한 추가 검사를 실행한다.
5. 실제 화면 검증은 별도로 한다. U01의 360/390px Chromium 터치·키보드 검사는 2026-10-10에 통과했다. 실제 기기·스크린리더는 미확인이다.
6. 검사·제한·다음 작업을 인수인계에 쓴다. 배포 여부를 따로 기록한다.

| 대상 | 역할·상태 |
|---|---|
| 전체 앱 개발 레포 | https://github.com/jihune/yukemuri — public(2026-10-11 전환), 전체 앱 개발 기준 |
| 시작 소스 | Sites v49, `608a38042df8d101d28ae480debfdddc5f3de7dc` |
| 옛 Sites ID(H01 전) | `appgprj_6abf95be6ea0819181cc3e93535413ac` |
| 운영 주소 | https://yukemuri.jihune.workers.dev (Cloudflare Worker, 2026-10-13 H01 전환. `cloudflare-deploy.json`의 `publicOrigin`) |
| 운영 DB | Cloudflare D1 `yukemuri`(`cloudflare-deploy.json`). 개발 클론은 임시 DB를 사용 |
| 예약 실행기 | 기존 private `jihune/yukemuri-script-runner` 유지 |
| 대화 원본 | 프로젝트 6개 대화·첨부·native Sites/DB 자료를 비공개 보존. 요약은 `docs/conversation-handoff.md` |

현재 사이트(workers.dev) 공유 범위는 public이다. 개인 용도라는 설명만으로 바꾸지 않았다.
호스팅·DB·수집은 2026-10-13 H01 전환으로 Cloudflare에 있다. main에 병합하면 코드·설정을 바꾼 push는 `deploy.yml`이 곧 D1 마이그레이션 적용과 Worker 배포까지 한다(Markdown·`docs/` 등만 바꾼 push는 배포하지 않는다). 병합과 배포 결과를 따로 기록한다(`docs/cloudflare-deploy.md`).

## 양쪽에 사용할 요청

> START_HERE.md, AGENTS.md, docs/work-handoff-latest.md, docs/roadmap.md를 읽어.
> 기준 커밋을 확인하고 다음 미완료 작업 하나를 브랜치에서 구현·검사해.
> 검사 결과·미확인 사항·다음 작업을 기록해. 운영 DB·수집 예약·호스팅은 유지해.
> 배포 결과를 볼 수 없으면 검사한 커밋과 배포 인수인계를 준비해.

환경 설정: `docs/cloud-development.md`. 배포: `docs/cloudflare-deploy.md`. 옛 Sites 전달(H01 전, 되돌릴 때만): `docs/sites-handoff.md`.
대화 결정: `docs/conversation-handoff.md`. 원래 Git 이력: `docs/legacy-history.md`. 과거 이관 준비: `docs/migration-20261009.md`.
