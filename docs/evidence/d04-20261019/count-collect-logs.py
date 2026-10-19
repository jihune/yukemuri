# D04 follow-up (docs/D04-20261015.md 8): counts Trip.com detail pages, year diagnostics and the page mix of
# every app collect.yml run since the D04 collector release, from the public job logs (no token).
# Usage: python3 docs/evidence/d04-20261019/count-collect-logs.py <cache dir> [out.json]
import json
import re
import sys
import urllib.request
from pathlib import Path

CACHE, OUT = Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else None
API = 'https://api.github.com/repos/jihune/yukemuri/actions'
CACHE.mkdir(parents=True, exist_ok=True)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json'})) as r: return r.read()
def kind(u):
    return ('trip detail' if '-hotel-detail-' in u else 'trip list' if 'trip.com' in u else
            'jalan names' if 'langCd=' in u or '/kr/' in u or '/en/' in u else
            'jalan detail' if re.search(r'jalan\.net/yad\d+/$', u) else 'jalan list')
runs = json.loads(get(API + '/workflows/collect.yml/runs?per_page=100&created=%3E%3D2026-10-15T02:14:00Z'))['workflow_runs']
rows = []
for run in sorted(runs, key=lambda r: r['created_at']):
    job = next(j for j in json.loads(get(f"{API}/runs/{run['id']}/jobs"))['jobs'] if j['name'] == 'collect')
    path = CACHE / f"{job['id']}.log"
    if not path.exists(): path.write_bytes(get(f"{API}/jobs/{job['id']}/logs"))
    diag = 0; mismatches = []; mix = {}; size = None; prev = None; coverage = None
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.search(r'today (\d+) rows written, (\d+) read', line)
        if m and size is None: size = {'written': int(m[1]), 'read': int(m[2])}
        i = line.find('{')
        if i < 0: continue
        try: d = json.loads(line[i:])
        except ValueError: continue
        if not isinstance(d, dict): continue
        url = str(d.get('url', ''))
        if d.get('processed') is not None and 'coverage' in d: coverage = d['coverage'].get('providers')
        if d.get('sourceDiagnostic') and '-hotel-detail-' in url:
            diag += 1
            if 'facilityYearMismatch' in d: mismatches.append({'url': url, 'mismatch': d['facilityYearMismatch']})
        elif 'accepted' in d and 'records' in d:
            e = mix.setdefault(kind(url), {'pages': 0, 'accepted': 0, 'recordsAdded': 0, 'status': {}})
            e['pages'] += 1; e['accepted'] += d['accepted'] or 0; e['status'][d['status']] = e['status'].get(d['status'], 0) + 1
            if prev is not None: e['recordsAdded'] += d['records'] - prev
            prev = d['records']
    rows.append({'run': run['id'], 'job': job['id'], 'created': run['created_at'], 'sha': run['head_sha'], 'sizeAtStart': size,
                 'tripDetailDiagnostics': diag, 'facilityYearMismatch': mismatches, 'pages': mix, 'coverageAtEnd': coverage})
summary = {'runs': len(rows), 'first': rows[0]['created'], 'last': rows[-1]['created'],
           'tripDetailDiagnostics': sum(r['tripDetailDiagnostics'] for r in rows),
           'tripDetailPages': sum(r['pages'].get('trip detail', {}).get('pages', 0) for r in rows),
           'facilityYearMismatch': sum(len(r['facilityYearMismatch']) for r in rows)}
print(json.dumps(summary))
if OUT: Path(OUT).write_text(json.dumps({'summary': summary, 'runs': rows}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
