# 웹의 Claude Code·Codex 버튼: 클라우드 코딩 에이전트 정리

Oct 9, 2026 · @Jihun Son

웹의 Claude Code·Codex 버튼은 코딩 에이전트를 내 PC가 아니라 업체 클라우드의 가상머신에서 돌리는 방식입니다. 터미널에서 쓰는 Claude Code나 Codex CLI와 같은 에이전트이고, 실행 위치만 다릅니다.

용량 제한은 GitHub와 두 클라우드 모두에 있지만 일반적인 코드 프로젝트라면 걸릴 일이 거의 없습니다. Google Drive는 코드 저장소 역할로는 연동할 수 없습니다.

## 동작 방식

작업은 저장소 선택부터 PR 검토까지 네 단계로 진행됩니다.

1. 웹에서 저장소를 고르고 작업을 지시합니다. 예: "이 버그 고쳐줘"
2. 업체 쪽 VM에 저장소가 복제됩니다. Claude는 Anthropic이 관리하는 VM에 저장소를 클론하고, 설정해 둔 셋업 스크립트가 있으면 실행합니다 ([Claude Code 공식 문서](https://code.claude.com/docs/en/web-quickstart)). Codex도 내 컴퓨터가 아닌 OpenAI의 가상머신에서 작업을 돌립니다 ([Flavio Copes](https://flaviocopes.com/codex-cloud/)).
3. 에이전트가 그 안에서 코드를 수정하고 테스트를 돌립니다.
4. 결과는 브랜치나 PR로 돌아오고, 변경 내용을 검토해서 머지하면 됩니다.

## 깃허브 연결을 요구하는 이유

클라우드 VM은 내 PC의 파일을 볼 수 없어서, 코드를 가져오고 결과를 돌려줄 통로가 필요합니다. 클라우드 세션은 코드를 클론하고 브랜치를 푸시하기 위해 깃허브 저장소 접근 권한을 씁니다 ([Claude Code 문서: 클라우드 세션](https://code.claude.com/docs/en/claude-code-on-the-web)).

- **Claude Code**: 깃허브가 기본입니다. 깃허브에 없는 저장소는 로컬 저장소를 묶어서(최대 100MB) 클라우드 세션으로 직접 올릴 수도 있습니다 ([fast.io](https://fast.io/resources/claude-code-web-interface-guide/)).
- **Codex**: GitLab이나 자체 호스팅 GitHub Enterprise Server 저장소는 아직 지원하지 않습니다 ([SiliconANGLE](https://siliconangle.com/2026/09/29/openais-codex-gets-reusable-cloud-environments-that-follow-developers-across-devices/)).

## Google Drive 연동

Google Drive는 코드 소스로 쓸 수 없습니다. Claude 클라우드는 저장소 클론과 PR 생성에 GitHub가 필요하고 ([Claude Code 문서: 클라우드 세션](https://code.claude.com/docs/en/claude-code-on-the-web)), Codex 클라우드도 지금은 GitHub.com만 지원합니다 ([Capital & Compute](https://capitalandcompute.net/blog/how-codex-cloud-environments-work/)). Drive는 브랜치나 PR 같은 git 기능이 없어서 대체가 안 됩니다.

- **깃허브 없이 쓰기**: 위의 로컬 저장소 업로드가 유일한 방법이고 Claude 쪽에만 있습니다. git 원격이 없는 저장소에서 `claude --cloud`를 실행하면 됩니다 ([Claude Code 문서: 클라우드 세션](https://code.claude.com/docs/en/claude-code-on-the-web)).
- **Drive를 참고 자료로 쓰기**: 세션에 켠 MCP 커넥터는 클라우드 세션에서도 동작한다고 문서에 나옵니다 ([Claude Code 문서: 클라우드 환경](https://code.claude.com/docs/en/cloud-environments)). Drive 커넥터가 실제로 되는지는 문서에 명시돼 있지 않아 직접 확인이 필요합니다.

## 로컬 방식과의 차이

클라우드는 병렬 작업과 자리 비움에 강하고, 로컬 자원에는 접근하지 못합니다.

- **장점**: 여러 저장소의 작업을 한 화면에서 병렬로 돌릴 수 있고 PR도 자동으로 만들어집니다 ([Anthropic 발표](https://claude.com/resources/articles/claude-code-on-the-web)). PC를 꺼도 작업이 계속되고, 폰에서도 지시할 수 있습니다.
- **단점**: 로컬 파일, 로컬 DB, 사내망 자원에는 접근하지 못합니다. 깃허브에 올라간 코드만 대상이 됩니다.
- **요금**: 별도 과금이 아니라 구독에 포함됩니다. Claude는 클라우드 세션이 다른 Claude Code 사용량과 한도를 공유합니다 ([Anthropic 발표](https://claude.com/resources/articles/claude-code-on-the-web)). Codex 클라우드는 Plus 이상 유료 플랜에서만 되고, Free와 Go 플랜은 제외입니다 ([Flavio Copes](https://flaviocopes.com/codex-cloud/)).

## GitHub 한도

한도는 Free, Pro, Team 공통이라 무료 계정이라고 더 작지 않습니다 ([GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)).

| 항목 | 한도 |
| --- | --- |
| 저장소 크기 | 10GB 이내 권장 |
| 파일 1개 | 100MB에서 차단 |
| 1회 푸시 | 2GB에서 차단 |

비공개 저장소도 무료로 쓸 수 있습니다. 100MB가 넘는 파일(모델 가중치, 데이터셋 등)은 Git LFS로 따로 올려야 합니다.

## 클라우드 VM 사양

세션마다 VM 하나가 배정되고, Codex는 플랜에 따라 크기가 다릅니다.

| 환경 | vCPU | 메모리 | 디스크 |
| --- | --- | --- | --- |
| Claude 클라우드 | 4 | 16GB | 30GB |
| Codex 클라우드 (Plus) | 2 | 8GiB | 8GiB |
| Codex 클라우드 (Pro, Business, Enterprise) | 4 | 16GiB | 32GiB |

- **Claude 클라우드**: 위 수치는 바뀔 수 있는 대략치입니다. 메모리를 훨씬 많이 쓰는 대형 빌드나 테스트는 VM이 중단시킬 수 있습니다 ([Claude Code 문서: 클라우드 환경](https://code.claude.com/docs/en/cloud-environments)).
- **Codex 클라우드**: Plus의 디스크 8GiB가 가장 빡빡합니다. 큰 `node_modules`나 머신러닝 의존성이 있으면 부족할 수 있습니다. 수치는 OpenAI 문서를 인용한 외부 글 기준입니다 ([Capital & Compute](https://capitalandcompute.net/blog/how-codex-cloud-environments-work/)).

VM 디스크는 보관 공간이 아니라 작업 공간입니다. Claude는 몇 분간 활동이 없으면 VM이 일시정지되고 이후 회수될 수 있습니다. Codex는 저장된 VM 상태를 마지막 사용 후 최대 7일까지만 복구할 수 있습니다. 남길 결과물은 깃허브에 푸시해야 합니다.

## 연결 전에 알아둘 점

깃허브를 연결하면 저장소 접근 권한을 주게 되고 코드가 업체 서버로 복제됩니다.

- **권한 범위는 연결 방식에 따라 다릅니다.** GitHub App으로 연결하면 공개 저장소와 App을 설치한 비공개 저장소까지만 닿습니다. 터미널의 `/web-setup`으로 연결하면 `gh` 토큰이 접근할 수 있는 모든 저장소에 닿습니다 ([Claude Code 문서](https://code.claude.com/docs/en/claude-code-on-the-web)).
- **코드가 업체 서버로 복제됩니다.** 각 작업은 네트워크와 파일시스템이 제한된 격리 샌드박스에서 실행되지만 ([Anthropic 발표](https://claude.com/resources/articles/claude-code-on-the-web)), 코드가 외부로 나간다는 점은 같습니다. 개인 프로젝트는 괜찮지만 회사 코드는 보안 정책상 금지인 경우가 많습니다.

개인 깃허브 저장소로 장시간 작업을 맡기거나 여러 개를 동시에 돌릴 때는 클라우드가 편합니다. 로컬 파일이나 내부망이 얽힌 작업은 기존처럼 CLI로 하는 게 맞습니다.

## 출처

- [Get started with Claude Code on the web (공식 문서)](https://code.claude.com/docs/en/web-quickstart)
- [Claude Code on the web (Anthropic 발표)](https://claude.com/resources/articles/claude-code-on-the-web)
- [Use Claude Code in the cloud (공식 문서, 저장소 접근 범위)](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Configure cloud environments (공식 문서, VM 사양)](https://code.claude.com/docs/en/cloud-environments)
- [How to Use Claude Code on the Web (fast.io)](https://fast.io/resources/claude-code-web-interface-guide/)
- [How to use Codex Cloud (Flavio Copes)](https://flaviocopes.com/codex-cloud/)
- [How Codex Cloud Environments Work (Capital & Compute)](https://capitalandcompute.net/blog/how-codex-cloud-environments-work/)
- [OpenAI's Codex gets reusable cloud environments (SiliconANGLE)](https://siliconangle.com/2026/09/29/openais-codex-gets-reusable-cloud-environments-that-follow-developers-across-devices/)
- [Repository limits (GitHub Docs)](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
