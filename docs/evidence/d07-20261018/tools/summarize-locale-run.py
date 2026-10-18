# D07 PR 2 after deploy (D07-20261019.md 'results (PR 2)' 22): what one collection run's job log shows
# about the names work: the run size, the preparation step's locale list queueing, and each locale list
# page (diagnostic and PUT result; 'accepted' on such a page is the name rows written).
# Usage: python3 summarize-locale-run.py job-log.txt > out.json
import json
import re
import sys
from collections import Counter
from pathlib import Path

rows, size = [], {}
for line in Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace').splitlines():
    m = re.search(r'Z (pages|reason)=(.*)$', line)
    if m and m[1] not in size:
        size[m[1]] = m[2]
    m = re.search(r'(\{".*\})\s*$', line)
    if m:
        try:
            rows.append(json.loads(m[1]))
        except ValueError:
            pass
pages = [d for d in rows if 'url' in d and 'status' in d and not d.get('sourceDiagnostic')]
diag = {d['url']: d for d in rows if d.get('sourceDiagnostic') and 'uiw1402' in d.get('url', '')}
locale = []
for d in pages:
    if 'uiw1402' not in d['url']:
        continue
    q = re.search(r'langCd=(\w+)&kenCd=(\d+).*pageNum=(\d+)', d['url'])
    g = diag.get(d['url'], {})
    locale.append({'lang': q[1], 'kenCd': q[2], 'page': int(q[3]), 'status': d['status'], 'accepted': d.get('accepted'),
                   **{k: g.get(k) for k in ('blocks', 'names', 'refused', 'links', 'listed', 'reviewReason')}})
print(json.dumps({'log': Path(sys.argv[1]).name, 'size': size, 'preparation': [d for d in rows if 'preparationBatch' in d],
                  'pages': len(pages), 'statuses': dict(Counter(d['status'] for d in pages)),
                  'localePages': len(locale), 'localeTotals': {k: sum(p[k] or 0 for p in locale) for k in ('blocks', 'names', 'refused', 'accepted')},
                  'locale': locale}, ensure_ascii=False, indent=1))
