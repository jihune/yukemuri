# Approximate collectionPriority (lib/collection-priorities.ts) of Jalan places from a
# public snapshot, and of the Jalan detail pages a collect run saved. Names and the
# location label only (the address is not public), so addressTerms are not checked and a
# town match can be missed. bath_known > 0 stands in for "detail page fetched" (the public
# snapshot has no fetch state). Used 2026-11-03 with snapshot 6db3bdb56bd6e84a
# (/snapshot/cards.json and core.json, public GET) and run 41555326658's collect log.
# Usage: python3 -I approx-priorities.py <repo> <cards.json> <core.json> [<collect log>...]
import collections
import json
import re
import sys
from pathlib import Path

repo, cards_path, core_path, *logs = sys.argv[1:]
plan = json.loads(Path(repo, 'data/collection-priorities.json').read_text(encoding='utf-8'))
cards = json.loads(Path(cards_path).read_text(encoding='utf-8'))
core = json.loads(Path(core_path).read_text(encoding='utf-8'))
pref = dict(zip(core['ids'], core['prefecture'], strict=True))
known = dict(zip(core['ids'], core['known'], strict=True))


def priority(card):
    text = (' '.join(v for v in card['names'].values() if v) + ' ' + card['location']['label']).lower()
    p = pref.get(card['id'])
    for town in plan['towns']:
        if p == town['prefecture'] and any(t.lower() in text for t in town['terms']):
            return town['priority']
    return 20 if p in plan['primaryPrefectures'] else 40 if p in plan['secondaryPrefectures'] else 60 if p in plan['tertiaryPrefectures'] else 90


by_id = {c['id']: c for c in cards}
split = collections.Counter((priority(c), (known[c['id']] or 0) > 0) for c in cards if c['id'].startswith('jalan-'))
for p in sorted({k[0] for k in split}):
    print('priority', p, 'with bath data', split[(p, True)], 'without', split[(p, False)])
print('total with bath data', sum(v for k, v in split.items() if k[1]), 'without', sum(v for k, v in split.items() if not k[1]))
for log in logs:
    ids = ['jalan-' + m for m in re.findall(r'"url": "https://www\.jalan\.net/yad(\d+)/", "status"', Path(log).read_text(encoding='utf-8', errors='replace'))]
    seen = [priority(by_id[i]) for i in ids if i in by_id]
    print(Path(log).name, 'pages', len(ids), 'found', len(seen), 'priorities', sorted(collections.Counter(seen).items()))
