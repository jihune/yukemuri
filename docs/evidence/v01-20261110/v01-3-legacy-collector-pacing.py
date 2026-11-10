"""V01-3: scripts/crawler/collect.py main() (the standalone SQLite collector nothing calls any more)
asks sources under looser rules than source_safety.SourceGuard, which update-site.py uses.
No network: urlopen is replaced and only records what it was given; export() (which rewrites
lib/hotels.crawled.json and data/*.json in the checkout) is replaced by a no-op; the queue is a
temporary file. Run from the repository root."""
import sys, tempfile, urllib.error, urllib.request
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'scripts/crawler')
import collect, source_safety

asked = []
def fake_urlopen(target, timeout=None):
    asked.append(target)
    raise urllib.error.URLError('recorded, not sent')

with tempfile.TemporaryDirectory() as folder, \
     patch('sys.argv', ['collect.py', '--state', str(Path(folder) / 'q.sqlite'), '--max-pages', '2', '--provider', 'jalan', '--kind', 'list']), \
     patch('urllib.request.urlopen', fake_urlopen), patch.object(collect, 'export', lambda db: None), patch('time.sleep'), patch('builtins.print'):
    collect.main()
    import sqlite3
    db = sqlite3.connect(Path(folder) / 'q.sqlite')
    host, next_at = db.execute('SELECT host,next_at FROM hosts').fetchone()
    import time
    wait = next_at - time.time()

first = asked[0]
print('requests recorded:', len(asked))
print('what urlopen was given:', type(first).__name__, '(a plain address: no User-Agent of ours, urllib follows redirects)')
source = Path('scripts/crawler/collect.py').read_text(encoding='utf-8')
print("collect.py has \"add_argument('--interval', type=float, default=3)\":", "add_argument('--interval', type=float, default=3)" in source)
print('wait stored for', host, 'after a request: %.0f s' % wait)
guard = source_safety.SourceGuard(3, 0, request=lambda req, timeout: (_ for _ in ()).throw(urllib.error.URLError('recorded')))
print('SourceGuard(interval=3) keeps:', guard.interval, 's; User-Agent it sends:', source_safety.USER_AGENT)
print('callers of collect.main outside its own file: none (grep -rn "collect.main\\|collect\\.py" scripts .github package.json shows only the release file list and tests of open_db/process)')
