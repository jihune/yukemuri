# D04 follow-up (docs/D04-20261015.md 8): the refresh interval of each Trip.com record and when the sampled
# pre-release observations come due. collectionPriority (lib/collection-priorities.ts) is re-derived from
# the public snapshot (names, label, prefecture) without addresses, so the tier is an estimate.
# Usage: python3 docs/evidence/d04-20261019/refresh-due.py <snapshot dir with core.json and cards.json>
import collections
import datetime as dt
import json
import sys
from pathlib import Path

SNAP = Path(sys.argv[1])
def load(path): return json.loads(Path(path).read_text(encoding='utf-8'))
plan = load('data/collection-priorities.json')
core = load(SNAP / 'core.json')
cards = {c['id']: c for c in load(SNAP / 'cards.json')}
pref = dict(zip(core['ids'], core['prefecture']))
def priority(i):
    c, p = cards[i], pref[i]
    text = (' '.join(v for v in c['names'].values() if v) + ' ' + c['location']['label']).lower()
    for t in plan['towns']:
        if p == t['prefecture'] and any(x.lower() in text for x in t['terms']): return t['priority']
    return 20 if p in plan['primaryPrefectures'] else 40 if p in plan['secondaryPrefectures'] else 60 if p in plan['tertiaryPrefectures'] else 90
R = plan['refreshDays']
def days(q): return R['onsen'] if q <= 10 else R['primary'] if q <= 20 else R['secondary'] if q <= 40 else R['tertiary'] if q <= 60 else R['national']
trip = [i for i in core['ids'] if i.startswith('trip-')]
print('Trip.com records by refresh days:', dict(sorted(collections.Counter(days(priority(i)) for i in trip).items())))
s = load('docs/evidence/d04-20261019/trip-years-sample.json')
now = dt.datetime.fromisoformat(s['measuredAt'].replace('Z', '+00:00'))
due = collections.Counter()
for r in s['rows']:
    if r.get('detail') and not r['afterRelease']:
        at = dt.datetime.fromisoformat(r['retrievedAt']) + dt.timedelta(days=days(priority(r['id'])))
        due['overdue' if at <= now else at.date().isoformat()] += 1
print('Sampled pre-release observations by due date:', dict(sorted(due.items())))
