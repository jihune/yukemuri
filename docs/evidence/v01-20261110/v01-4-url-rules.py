"""V01-4: the collector's URL rule (scripts/crawler/collect.py canonical) against the Worker's
(lib/crawl-contract.ts publicUrl, crawlJobUrl) on the same addresses. Run from the repository root:
  python3 docs/evidence/v01-20261110/v01-4-url-rules.py
It calls v01-4-url-rules.mjs for the Worker's answer (tsc compiles lib/crawl-contract.ts to a
temporary folder, as scripts/build-search-snapshot.mjs does). No network.
update-site.py stops the run with 'Queue contained an unsupported URL' when canonical(u,u)!=u for a
queued address, and a link the Worker refuses makes the page's PUT a 400 (V01-1)."""
import json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'scripts/crawler')
import collect

jobs = json.loads(Path('data/crawl-jobs.json').read_text(encoding='utf-8'))
seeds = json.loads(Path('data/priority-source-seeds.json').read_text(encoding='utf-8'))
real = sorted({j['url'] for j in jobs} | {s['url'] for s in seeds})
made = [
    'https://www.jalan.net/yad123456/', 'https://www.jalan.net/yad123456', 'https://www.jalan.net//yad123456/',
    'https://WWW.JALAN.NET/yad123456/', 'https://www.jalan.net:443/yad123456/', 'https://www.jalan.net/yad1/\n', 'https://www.jalan.net/yad1/ ',
    'https://www.jalan.net/yad１２３/', 'https://www.jalan.net/010000/LRG_010200/page２.html',
    'https://www.trip.com/hotels/tokyo-hotel-detail-１２３/x/', 'https://www.trip.com/hotels/tokyo-hotel-detail-123/' + 'a' * 600 + '/',
    'https://www.trip.com/hotels/tokyo-hotel-detail-123/some-hotel/', 'https://kr.trip.com/hotels/tokyo-hotel-detail-123/some-hotel/',
]
with tempfile.TemporaryDirectory() as folder:
    asked = Path(folder) / 'urls.json'; answered = Path(folder) / 'worker.json'
    asked.write_text(json.dumps(real + made, ensure_ascii=False), encoding='utf-8')
    subprocess.run(['node', str(Path(__file__).with_suffix('.mjs')), str(asked), str(answered), folder], check=True)
    worker = json.loads(answered.read_text(encoding='utf-8'))

def stable(u):
    try:
        return collect.canonical(u, u) == u
    except Exception:
        return False

both = sum(1 for u in real if stable(u) and worker[u]['crawlJobUrl'])
print(f'seed queue and priority seeds: {len(real)} addresses, {both} taken unchanged by both rules')
only_worker = [u for u in made if worker[u]['publicUrl'] and not stable(u)]
only_collector = [u for u in made if stable(u) and not worker[u]['publicUrl']]
print(f'made-up addresses: {len(made)}')
print(f'the Worker takes it, the collector would stop the run on it: {len(only_worker)}')
for u in only_worker: print('  ', ascii(u))
print(f'the collector would send it, the Worker refuses it: {len(only_collector)}')
for u in only_collector: print('  ', ascii(u)[:90])
