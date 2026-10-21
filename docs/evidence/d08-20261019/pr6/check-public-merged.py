# After D08 PR 6 is deployed: in the public snapshot (public GET only, no maintenance key), the 47
# reviewed pairs show once. mergedInto maps each pair's Trip.com id to its Jalan id, the Trip.com
# ids have no row and the Jalan ids keep theirs. The count: the snapshot's places are the stored
# records (the last day of the status trend, kept by the collector's end-of-run read) less the
# merged ones, when no collection ran between that read and the build.
# Usage: python3 -I check-public-merged.py <repository root> <scratch dir>
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
core, status = get(m['files']['core'], 'core.json'), get(m['files']['status'], 'status.json')
pairs = json.loads((ROOT / 'data/source-groups-reviewed.json').read_text(encoding='utf-8'))['patches']
ids = set(core['ids'])
merged = m.get('mergedInto') or {}
want = {p['tripHotelId']: p['hotelId'] for p in pairs}
trend = (status.get('fill') or {}).get('trend') or []
last = trend[-1] if trend else None
scopes = status['fill']['scopes']
print(f"snapshot {m['id']} generated {m['generatedAt']}, {m['hotels']} places (core {len(core['ids'])}, coverage {m['coverage']['records']})")
print(f"mergedInto {len(merged)}; equals the 47 reviewed pairs: {merged == want}")
print(f"Trip.com ids listed {sum(t in ids for t in want)}; Jalan ids listed {sum(j in ids for j in want.values())}")
print(f"stored records on the last trend day {last['date'] if last else None}: {last['records'] if last else None}; places + merged = {m['hotels'] + len(merged)}")
print(f"data status scopes: all {scopes['all']['records']}, jalan {scopes['jalan']['records']}, trip {scopes['trip']['records']}")
ok = merged == want and not any(t in ids for t in want) and all(j in ids for j in want.values()) and m['hotels'] == len(core['ids']) == m['coverage']['records'] == scopes['all']['records']
print('PASS' if ok else 'FAIL')
