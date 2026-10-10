# 원래 개발 이력 보존

새 GitHub 레포는 웹 에이전트가 작업할 개발 기준이다. 원래 Sites Git 그래프와 실행기 Git 그래프는 별도 저장소였고 원래 object 해시를 그대로 보존한 bundle을 이 레포에 포함했다. 계정 대화·운영 DB·Secret 값은 포함하지 않는다.

| 파일 | 보존 범위 |
|---|---|
| `archives/git/app-pre-migration-20261009.bundle` | 기존 Sites 원본 51커밋과 이전 이관 준비 3커밋, 총 54커밋. 준비본 main `700b43fe26dc2bfbf87f826c2876bd9fb894a83f` |
| `archives/git/runner-history-20261009.bundle` | 실행기 전체 206커밋·확인된 ref 6개. 자동 DB 백업 병합 main `868229c193b82b3c053c1bc522e3494f57ecfa8c` |

GitHub 기본 그래프는 이 레포 초기화·가져오기 이후 변경을 기록한다. 위 원래 그래프는 재작성하지 않았다. 당시 PR/issue·검사 근거와 프로젝트 첨부 문서는 `docs/history/imported/`에 있다. GitHub 서버 설정·Secret 값·전체 Actions 로그는 Git 이력과 별개다.

클라우드에서 원래 커밋의 로그·차이를 볼 때 임시 디렉터리에 복원한다. 앱 코드에 덮어쓰지 않는다.

```bash
git clone archives/git/app-pre-migration-20261009.bundle /tmp/yukemuri-original-history
git -C /tmp/yukemuri-original-history log --oneline --all
git clone archives/git/runner-history-20261009.bundle /tmp/yukemuri-runner-history
```

실제 최신 실행기 코드는 별도의 `jihune/yukemuri-script-runner`를 확인한다. 앱 레포의 bundle은 이관 시점 보존본이며 예약마다 갱신하지 않는다.

대용량 공개 seed·이미지·검사 fixture·원래 Git bundle은 `source-assets/`에 해시와 gzip/base64 조각으로 보존한다. `bash scripts/cloud-setup.sh`가 원래 경로와 바이트를 복원한다. 이것은 전송 중단 후 재개를 위한 소스 저장 형식이며 개인 대화·DB 백업이 아니다. 복원된 자료를 수정하면 `python3 scripts/materialize-source-assets.py --pack` 후 `source-assets/` 변경도 같은 PR에 포함한다. 원래 Git 이력만 필요하면 의존성 설치 없이 `python3 scripts/materialize-source-assets.py`를 실행한다.
