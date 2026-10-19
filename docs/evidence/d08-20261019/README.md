# D08 근거(2026-10-19)

`docs/D08-20261019.md` 조사의 근거다. 조사는 상위 세션이 맡긴 하위 에이전트가 10-19T11:46Z–12:11Z에 했고, 여덟 번째 상위 세션이 12:2xZ에 옮겼다.

- `urls.log`: 직접 연 원문 주소와 읽은 시각.
- `tools/`: 조사에 쓴 스크립트. `ov_jp.py`는 Overture Places 2026-09-23.1에서 일본 범위 숙박 계열을 뽑고, `ov_an.py`·`ov_an2.py`는 그 추출본을 센다(나라 칸 `JP`로 거름). `wd_q*.rq`는 Wikidata SPARQL, `egov.py`는 e-Gov CKAN 검색, `h2t.py`는 HTML을 글자로 바꾸는 도구, `check_report.py`는 보고서 문장 검사다. 스크립트 안의 `/tmp/claude-0/...` 경로는 그 세션의 임시 폴더라 지금은 없다.
- `overture/`: D08 11절 Overture 측정(10-19T12:29Z–12:55Z)의 스크립트(`inputs.py`부터 `intervals.py`, 공통 `common.py`), 손 확인 판정(`handcheck.tsv`, `handcheck_websites.tsv`), 출력(`out_*.txt`). 스크립트의 경로 상수(`common.py`의 `OUT`, `OV_PARQUET`)는 그 세션의 임시 폴더를 가리키므로 다시 돌릴 때 고친다. 받은 스냅숏 사본과 이은 쌍 `pairs.json`은 다시 만들 수 있어 넣지 않았다.
- 넣지 않은 것: 받은 약관·라이선스 원문 페이지와 PDF(남의 저작물이라 공개 저장소에 옮기지 않음, 주소는 `urls.log`), Overture 추출본 parquet(11 MB, `ov_jp.py`로 다시 만듦), 지자체 여관업 목록 CSV(개인 운영자 이름이 들어 있음).
- 상위 세션의 확인(10-19T12:2xZ): Overture attribution 페이지에서 Places가 CDLA Permissive 2.0임을, 관광청 사이트 정책(2025-12-04 갱신)에서 PDL1.0 적용을 원문으로 다시 읽었다. 추출본을 나라 칸으로 다시 세어 81,671곳 가운데 일본 64,616곳(한국 16,222곳 등은 범위 상자에 걸려 들어왔다가 걸러짐), 그 가운데 웹사이트 41,059곳과 전화 52,939곳임을 확인했다.
