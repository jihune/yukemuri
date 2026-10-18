# D07 PR 1, one manual check (not part of any check script): for each name the public audit
# judges, the prefecture its Wikidata item is located in (P131 up to an item with an ISO 3166-2
# JP- code, matched to data/prefectures.json by its Japanese label, as that file is not in JIS
# order) against our record's prefecture. Two SPARQL GETs.
# Usage: python3 prefecture-check.py audit.json saved-snapshot-dir out.json
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = 'YukemuriCatalogUpdater/1.0 (+https://github.com/jihune/yukemuri)'
CODES = 'SELECT ?iso ?ja WHERE { ?p wdt:P300 ?iso ; rdfs:label ?ja . FILTER(STRSTARTS(?iso,"JP-") && LANG(?ja)="ja") }'
ITEMS = 'SELECT ?item ?iso WHERE { VALUES ?item { %s } ?item wdt:P131+ ?p . ?p wdt:P300 ?iso . FILTER(STRSTARTS(?iso,"JP-")) }'


def sparql(query):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query})
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)['results']['bindings']


audit_path, snap, out = sys.argv[1:4]
audit = json.loads(Path(audit_path).read_text(encoding='utf-8'))
core = json.loads(Path(snap, 'core.json').read_text(encoding='utf-8'))
ours = {p['ja']: p['id'] for p in json.loads(Path('data/prefectures.json').read_text(encoding='utf-8'))}
by_code = {b['iso']['value']: ours.get(b['ja']['value']) for b in sparql(CODES)}
items = sorted({a['item'] for a in audit['added']})
located = {}
for b in sparql(ITEMS % ' '.join('wd:' + q for q in items)):
    located.setdefault(b['item']['value'].rsplit('/', 1)[1], set()).add(by_code.get(b['iso']['value']))
idx = {h: i for i, h in enumerate(core['ids'])}
rows = []
for a in audit['added']:
    mine, theirs = core['prefecture'][idx[a['id']]], sorted(p for p in located.get(a['item'], set()) if p)
    rows.append({'id': a['id'], 'item': a['item'], 'ours': mine, 'item_prefectures': theirs, 'verdict': 'same' if mine in theirs else 'other' if theirs else 'none'})
result = {'checkedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'snapshot': audit['snapshot'], 'queries': [CODES, ITEMS % '…'], 'codes': len(by_code),
          'counts': {v: sum(r['verdict'] == v for r in rows) for v in ('same', 'other', 'none')}, 'rows': rows}
Path(out).write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(result['checkedAt'], result['counts'])
