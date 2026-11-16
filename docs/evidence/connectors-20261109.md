# Tripadvisor·Booking.com Claude 커넥터 판정 근거

읽은 날: 2026-11-09. 사용자 지시(11-07T13:0xZ, `work-handoff-latest.md` 「상위 세션 인계」 2): 두 커넥터의 활용 가능 여부 검토.
방법: 열아홉 번째 상위 세션이 표본을 불렀고, 하위 에이전트(researcher)가 약관 원문을 curl로 받아 읽었다. 판정을 정하는 문장은 상위 세션이 내려받은 원문에서 다시 찾았다(아래 ‘원문 확인’). 원문 파일은 세션 임시 폴더에만 두었다(제3자 문서라 저장소에 싣지 않음).

## 커넥터가 돌려준 것(표본)

- Tripadvisor(`search_hotels`, 구로카와 숙소 5곳): hotelId, 영어 이름, 좌표, 평점(5점)·리뷰 수, 사진 주소(`media-cdn.tripadvisor.com`), 리뷰 쪽 주소.
- Booking.com(`accommodations_search`): 구로카와는 결과 없음. 유후인 10곳: 숙소 id, 이름, 제휴 표지 `aid=8132308`이 붙은 예약 주소, 실시간 가격(KRW), 평점(10점)·리뷰 수·등급, 시설(‘Hot spring bath’, ‘Open-air bath’ 등), 주소, 좌표.
- 두 커넥터 모두 Claude 세션 안에서만 불린다. GitHub Actions의 수집기는 부를 수 없다.

## 약관

커넥터 전용 최종 사용자 약관은 찾지 못했다. claude.com 디렉터리의 문서 링크는 Tripadvisor 홈과 Booking.com 커넥터 안내 한 쪽뿐이다. Anthropic Software Directory Terms(2026-03-16판)는 제공자와 Anthropic 사이의 약관이다. 그래서 아래는 이 쓰임에 가장 가까운 각 회사의 API·콘텐츠 약관이다.

Tripadvisor(Terra API Master Terms, https://docs.terra.tripadvisor.com/docs/api-master-terms.md, updatedAt 2026-06-16; Caching Policy, https://docs.terra.tripadvisor.com/docs/caching-policy.md):
- Caching Policy: “caching, copying, downloading, storing or indexing content is not permitted for any content, except that the Location ID attribute can be cached solely to improve the speed of your application.”
- 3.4.2(i): “not display the Licensed Content near, or in conjunction with, any booking or inventory function (including any content that links to a booking function on another platform) supplied by a party other than Tripadvisor or its Affiliates”
- 3.4.3(c): “make all displays of TA Materials on the Customer Application non-indexable by search engines, and inaccessible to third parties via any robot, spider, scraper or other automated means.”
- 3.4.2(f): Tripadvisor 평점·리뷰를 다른 평점·리뷰와 합치지 않음. 3.1.2: AI·기계학습과 함께 쓰는 것은 따로 서명한 계약이 필요함.

Booking.com(General Partner Terms v5 PDF, 서버 Last-Modified 2026-10-21, 문서에 날짜 없음; Demand API 개발 가이드):
- 9.5: “Partner will not directly or indirectly integrate, combine or otherwise make the Booking.com Materials (or any part thereof) available with its own content and/or the content of any Booking.com Competitor.”
- 부록 1 §1.1: “(d) use only live searches and requests and never cache results”, “(g) not cache dynamic data (including but not limited to availability and pricing data)”
- 고객 약관 A15.2(Updated 15 September 2025): 로봇·스크레이퍼·AI 비서를 포함한 자동 수단으로 플랫폼을 복사·수집하려면 서면 허락이 필요함.

원문 확인(상위 세션, 11-09): Tripadvisor Caching Policy 문장, 3.4.2(i), 3.4.3(c), Booking.com 9.5, 부록 1 §1.1(d)·(g)를 내려받은 원문에서 `grep`으로 찾았다(모두 1회 이상).

## 판정

- 사이트에 쓰기(저장, 공개 스냅숏, Leaflet 지도와 Jalan·Trip.com·Rakuten 예약 링크 옆에 보이기, 매일 수집): 두 곳 모두 허용 근거가 없고, 위 조항에 걸린다. 수집기가 커넥터를 부를 수도 없고, 예약 수집에 LLM 호출을 섞지 않는다는 이 프로젝트의 규칙(`roadmap.md` 이후 아이디어 표 아래, `AGENTS.md` ‘정기 LLM 작업을 만들지 않는다’)에도 걸린다.
- 쓸 수 있는 것: 사용자가 Claude 대화에서 자기 여행을 찾고 견줄 때(커넥터가 만들어진 쓰임). 개발 중 한두 숙소를 확인하는 데 잠깐 부르는 것은 결과를 저장하지 않으면 사이트 자료가 되지 않는다.
- 확인하지 못한 것: 커넥터 전용 약관의 존재, Tripadvisor hotelId와 Terra Location ID가 같은 값인지, Booking.com v5가 지금 어느 파트너에게 적용되는지, Booking.com 평점·시설이 ‘static data’인지.
