# D07 PR 2, 4th review P3-1 (D07-20261019.md 'results (PR 2)' 20): a lower bound on the gentle rounds of
# one collection run, from its GitHub Actions job log. Each page line ({"url": ..., "status": ...}) is
# matched to the earliest group of update-site.py's gentle order that could have claimed it; the
# localnames claim runs once a round, so its reads per page are 525 x rounds / pages at 520 done pages.
# Usage: python3 count-gentle-rounds.py job-log.txt [...] > out.json
import json
import re
import sys
from pathlib import Path

# update-site.py gentle groups and the page kinds each can claim (refresh takes list and detail pages).
GROUPS = [('jalan', {'detail'}), ('jalan', {'detail'}), ('trip', {'detail'}), ('jalan', {'detail', 'list'}), ('trip', {'detail', 'list'}),
          ('jalan', {'list'}), ('trip', {'list'}), ('trip', {'detail'}), ('jalan', {'names'})]
rows = []
for path in sys.argv[1:]:
    pages = []
    for line in Path(path).read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.search(r'(\{"url": .*\})\s*$', line)
        if not m or '"status":' not in m[1]:
            continue
        url = json.loads(m[1])['url']
        provider = 'jalan' if 'jalan.net' in url else 'trip'
        kind = 'names' if '/uiw1402' in url else 'detail' if re.search(r'/yad\d+/$|hotel-detail-', url) else 'list'
        pages.append((provider, kind))
    rounds, at = 1, -1
    for provider, kind in pages:
        nxt = next((i for i in range(at + 1, len(GROUPS)) if GROUPS[i][0] == provider and kind in GROUPS[i][1]), None)
        if nxt is None:
            rounds += 1
            nxt = next(i for i in range(len(GROUPS)) if GROUPS[i][0] == provider and kind in GROUPS[i][1])
        at = nxt
    rows.append({'log': Path(path).name, 'pages': len(pages), 'roundsAtLeast': rounds,
                 'claimReadsPerPage': round(525 * rounds / len(pages), 1) if pages else None,
                 'kinds': {f'{p} {k}': sum(x == (p, k) for x in pages) for p, k in sorted(set(pages))}})
print(json.dumps(rows, ensure_ascii=False, indent=1))
