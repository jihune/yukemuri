# 검사 감사 하위 에이전트의 원자료(V01, 2026-11-10)

검사 감사 하위 에이전트의 보고는 글로만 돌아왔다(`docs/V01-20261110.md` 「교훈」 1). 여기에는 그 에이전트의 도구가 만든 원자료를 그대로 옮겼다. 대상 커밋은 `d5caa7c`, 실행 시각은 2026-11-10T01:28Z~03:09Z(하위 에이전트 보고의 것)다.

- `final.tsv`: 심은 결함 52개의 최종 판정(결함 id, CAUGHT 또는 SURVIVED, 잡은 검사와 줄, 무엇을 깨뜨렸는지, 돌린 검사 수). `cut -f2 final.tsv | sort | uniq -c`로 세면 CAUGHT 35, SURVIVED 17이다.
- `muts/<id>.json`: 결함마다 바꾼 파일과 문자열. `build: true`는 사본에서 다시 빌드한 뒤 검사를 돌렸다는 뜻이다.
- `experiments.tsv`: 실행 기록(시각, 결함 id, 사본, 명령, exit code, 걸린 시간, 마지막 출력). `summary.tsv`: 실행별 요약.
- `inventory.tsv`, `inventory.py`: 검사 파일 87개가 어디서 불리는지.
- `driver.py`: 치환, 빌드, 검사, 기록, 되돌리기를 하는 실행기. `crawler-tokens.mjs`: `lib/edge-guard.ts`의 `CRAWLER` 정규식에서 대안을 하나씩 뺀 평가.

살아남은 17개 가운데 `docs/V01-20261110.md`의 표에 올린 것과 V01 세션이 직접 다시 돌린 것은 그 문서 V01-17, V01-20, V01-22, V01-23의 ‘재현’ 칸에 있다. `check-map-groups.mjs`의 시간 단언 때문에 결함과 상관없이 실패한 실행이 섞여 있다(V01-21). 첫 판정이 CAUGHT였다가 다시 돌려 SURVIVED가 된 P9, D1, D2, W20이 그 경우다.
