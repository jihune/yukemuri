# data/source-groups-reviewed.json (D08 PR 5): one sourceGroupPatch per verified pair of verify.json.
# Usage: python3 -I patches.py <work dir with pr5/pairs.json>
import json
import sys
import time
from pathlib import Path

S = Path(sys.argv[1])
HERE = Path(__file__).resolve().parent
rows = json.loads((HERE / 'verify.json').read_text(encoding='utf-8'))
snapshot = json.loads((S / 'pr5/pairs.json').read_text(encoding='utf-8'))['snapshot']
checked = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
SCOPE = '판매 범위는 객실 단위로 맞춰 보지 못해, 양쪽 이름에 별관·건물 구분이 없고 주소와 Overture 장소가 하나인 것으로 갈음함(docs/D08-20261019.md 13절).'
patches = []
for r in rows:
    name = (f"Jalan 원어명 {r['jalanName']}과 Trip.com 원어명 {r['tripName']}이 정규화 뒤 같음." if r['sameJa'] else
            f"Jalan 영어 이름 {r['jalanEn']}이 Trip.com 이름 {r['tripName']}과 같고 Jalan 원어명 {r['jalanName']}은 그 일본어 표기.")
    if r['house'] == 'agree':
        house = f"Jalan 주소 {r['jalanAddress']}의 번지 {'-'.join(r['jalanNumbers'])}가 Trip.com 주소({r['tripAddress'][:120]})에 있음."
    else:
        house = f"Trip.com 주소({r['tripAddress'][:120]})에 번지가 없으나 Jalan 주소 {r['jalanAddress']}와 동네 이름이 같음."
    dist = f"두 공급자 점 사이 {r['distM']:,} m" + (' (Jalan 점은 대략 위치).' if r['jalanGrade'] >= 3 else '.')
    evidence = f"{name} {house} {dist} 둘 다 Overture 장소 {r['overture']}(릴리스 2026-09-23.1)에 이어짐. {SCOPE} 공개 스냅숏 {snapshot} 기준."
    jid = r['jalan']
    patches.append({'hotelId': jid, 'tripHotelId': r['trip'], 'jalanHotelId': jid, 'matchedName': r['jalanName'],
                    'sourceUrl': f"https://www.jalan.net/yad{jid.split('-')[1]}/", 'sourceLabel': 'Jalan·Trip.com 같은 숙소 확인(D08 PR 5)',
                    'identityEvidence': evidence, 'sameInventory': True, 'checkedAt': checked})
assert all(20 <= len(p['identityEvidence']) <= 2000 for p in patches)
note = ('Jalan and Trip.com records of one property, reviewed by name, address, both points and one Overture place '
        '(docs/D08-20261019.md 13). Imported once per content by lib/hotel-source-groups.ts importReviewedSourceGroups.')
body = '{\n "note":' + json.dumps(note, ensure_ascii=False) + ',\n "patches":[\n' + ',\n'.join('  ' + json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in patches) + '\n ]\n}\n'
(HERE.parents[3] / 'data/source-groups-reviewed.json').write_text(body, encoding='utf-8')
print(len(patches), max(len(p['identityEvidence']) for p in patches))
print(patches[32]['identityEvidence'])
