# After D08 PR 5's import: count, in the public snapshot (public GET only, no maintenance key),
# the reviewed pairs whose Jalan card composes its Trip.com record. A Jalan card carries a photo
# candidate from a record only when that record is grouped with it, so the photo is the sign that
# holds even for a pair with no rating on either side. Controls: Jalan cards with any Trip.com
# photo outside the reviewed pairs (only curated groups expected), and each Jalan card against
# the next pair's Trip.com id (0 expected).
# Usage: python3 -I check-public-groups.py <repository root> <scratch dir>
import json
import subprocess
import sys
from pathlib import Path

ROOT, OUT = Path(sys.argv[1]), Path(sys.argv[2])
SITE = 'https://yukemuri.jihune.workers.dev'


def get(path, name):
    f = OUT / name
    r = subprocess.run(['curl', '-sS', '-o', str(f), '-w', '%{http_code}', SITE + path], check=False, capture_output=True, text=True)
    assert r.stdout == '200', path + ' ' + r.stdout
    return json.loads(f.read_text(encoding='utf-8'))


m = get('/snapshot/manifest.json', 'manifest.json')
core, cards = get(m['files']['core'], 'core.json'), get(m['files']['cards'], 'cards.json')
pairs = json.loads((ROOT / 'data/source-groups-reviewed.json').read_text(encoding='utf-8'))['patches']
pos = {i: n for n, i in enumerate(core['ids'])}


def photos(i):
    return {c.get('sourceId') for c in cards[pos[i]].get('photoCandidates') or []}


def rated(i):
    return {r['provider'] for r in cards[pos[i]]['ratings']}


listed = [p for p in pairs if p['hotelId'] in pos]
grouped = [p for p in listed if p['tripHotelId'] in photos(p['hotelId'])]
both = [p for p in listed if 'trip' in rated(p['hotelId'])]
other = sorted({c['id'] for c in cards if c['id'].startswith('jalan-') and any((x.get('sourceId') or '').startswith('trip-') for x in c.get('photoCandidates') or [])} - {p['hotelId'] for p in pairs})
shifted = sum(1 for p, q in zip(listed, listed[1:] + listed[:1]) if q['tripHotelId'] in photos(p['hotelId']))
trips = sum(1 for p in pairs if p['tripHotelId'] in pos)
print(f"snapshot {m['id']} generated {m['generatedAt']}, {m['hotels']} places, mergedInto {len(m.get('mergedInto') or {})}")
print(f'Jalan cards listed {len(listed)}/{len(pairs)}; with a photo of their Trip.com record {len(grouped)}; with a Trip.com rating {len(both)}; Trip.com records still listed {trips}')
print(f'controls: Jalan cards with a Trip.com photo outside the pairs {other}; shifted pairing {shifted}')
print('PASS' if len(grouped) == len(pairs) and shifted == 0 else 'FAIL')
