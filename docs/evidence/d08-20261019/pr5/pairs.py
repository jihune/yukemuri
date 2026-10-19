# The Overture places that two of our hotels match (D08 11.3): list each pair with what the
# public snapshot holds for both records. Uses the updater's join rules.
# Usage: python -I pairs.py <work dir with snap/ (the public snapshot) and ov/ov_jp_lodging.parquet>
# (DuckDB venv as in scripts/geo/update-overture.py); writes <work dir>/pr5/pairs.json.
import collections
import importlib.util
import json
import sys
from pathlib import Path

S = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('u', ROOT / 'scripts/geo/update-overture.py')
u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)
prefs = {p['id']: p['ja'] for p in json.loads((ROOT / 'data/prefectures.json').read_text(encoding='utf-8'))}
manifest, snap = u.load_snapshot(S / 'snap')
ours = u.our_hotels(snap, prefs)
places, _ = u.load_places('2026-09-23.1', str(S / 'ov/ov_jp_lodging.parquet'), None)
u.assign_prefectures(ours, places, set(prefs.values()))
index = collections.defaultdict(list)
for j, o in enumerate(places):
    if o['key']:
        index[o['key']].append(j)
hits = []
for r in ours:
    cand = sorted({j for k in r['keys'] for j in index.get(k, ())})
    found = []
    if r['grade'] == 1 and cand:
        found = [j for j in cand if u.meters(r['lat'], r['lng'], places[j]['lat'], places[j]['lng']) < u.NEAR_M]
    if not found and r['rest'] and cand:
        found = [j for j in cand if places[j]['pref'] == r['pref'] and u.muni_match(r['rest'], places[j]['locality'])]
    hits.append(found)
by_place = collections.defaultdict(list)
for n, found in enumerate(hits):
    for j in found:
        by_place[j].append(n)
multi = {j: ns for j, ns in by_place.items() if len(ns) > 1}
cards, text, core = snap['cards'], snap['text'], snap['core']
out = []
for j, ns in sorted(multi.items(), key=lambda kv: places[kv[0]]['id']):
    o = places[j]
    rows = []
    for n in ns:
        i = n
        rows.append({'id': ours[n]['id'], 'names': cards[i]['names'], 'kind': cards[i]['kind'], 'pref': ours[n]['pref'], 'rest': ours[n]['rest'],
                     'context': text['context'][i], 'grade': ours[n]['grade'], 'lat': ours[n]['lat'], 'lng': ours[n]['lng'],
                     'ratings': cards[i].get('ratings'), 'lifecycle': cards[i].get('lifecycle'), 'state': core['state'][i],
                     'hits': len(hits[n])})
    out.append({'overture': {k: o[k] for k in ('id', 'name', 'lat', 'lng', 'confidence', 'freeform', 'locality', 'pref', 'datasets')}, 'ours': rows})
print('places hit by 2+ hotels:', len(multi), '| provider mix:', dict(collections.Counter('+'.join(sorted(r['id'].split('-')[0] for r in x['ours'])) for x in out)))
print('pairs where each hotel has only this one candidate:', sum(all(r['hits'] == 1 for r in x['ours']) for x in out))
(S / 'pr5/pairs.json').write_text(json.dumps({'snapshot': manifest['id'], 'pairs': out}, ensure_ascii=False, indent=1), encoding='utf-8')
