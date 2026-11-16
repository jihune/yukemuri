"""V01 scratch: end to end, a page whose JSON-LD the parser cannot take ends the whole
gentle run with a traceback, before the page's result is saved (no PUT), so the queue row
keeps status and attempts and the next run meets the same page first.
Harness copied in approach from scripts/crawler/check_gentle_claims.py (Site and Guard stubs, no network)."""
import contextlib, io, json, runpy, sys, http.client
from email.message import Message
from pathlib import Path
from unittest.mock import patch
CRAWLER = Path('scripts/crawler').resolve()  # run from the repository root
sys.path.insert(0, str(CRAWLER))

class Response:
    status = 200
    def __init__(self, value, charset='utf-8', fail=None):
        self.body = (value if isinstance(value, str) else json.dumps(value)).encode(); self.headers = Message()
        self.headers['Content-Type'] = 'text/html; charset=' + charset; self.fail = fail
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, *args):
        if self.fail: raise self.fail
        return self.body

def html(doc):
    return '<html><head><title>t</title><script type="application/ld+json">' + json.dumps(doc, ensure_ascii=False) + '</script></head><body></body></html>'

def good(url):
    return html({'@type': 'Hotel', 'name': '試験の宿', 'url': url, 'address': {'addressRegion': '東京都', 'addressCountry': 'JP'}})

def run(queue, sources, runs=1):
    """queue: list of Jalan detail URLs in claim order; a URL leaves the queue only when its result is saved (PUT),
    as the Worker keeps status and attempts until the PUT. sources: url -> Response. Returns per-run outcome."""
    outcomes = []
    for _ in range(runs):
        claims, saved = [], []
        class Site:
            def open(self, request, timeout):
                path = request.full_url.split('.workers.dev', 1)[1]
                if path == '/api/crawl-prepare': return Response({'done': True})
                if path == '/api/crawl' and request.method == 'POST':
                    claim = json.loads(request.data)
                    url = queue[0] if (claim['provider'], claim['phase']) == ('jalan', 'detail') and queue else None
                    claims.append(url)
                    answer = {'jobs': [{'url': url, 'kind': 'detail', 'prefecture': 'pref-tokyo', 'attempts': 0, 'lease_token': claim['token']}] if url else [], 'leaseSeconds': 180}
                    if not url: answer['exhausted'] = True
                    return Response(answer)
                if path == '/api/crawl' and request.method == 'PUT':
                    body = json.loads(request.data); saved.append((body['url'], body['status'], body.get('error'))); queue.remove(body['url'])
                    return Response({'accepted': 1, 'coverage': {'records': 1}})
                return Response({'id': 'jalan-1', 'coverage': {'records': 1}})
        class Guard:
            def __init__(self, *args): self.redirects = []
            def open(self, url, *args, **kwargs): return sources[str(url)]
        output = io.StringIO(); error = None
        with patch('sys.argv', ['update-site.py', '--gentle', '--max-pages', '10']), patch('sys.stdin', io.StringIO(json.dumps({'url': 'https://yukemuri.example-account.workers.dev', 'token': 'scratch-secret-value-000'}) + '\n')), \
             patch('urllib.request.build_opener', return_value=Site()), patch('source_safety.SourceGuard', Guard), patch('time.sleep'), contextlib.redirect_stdout(output):
            try:
                runpy.run_path(str(CRAWLER / 'update-site.py'), run_name='__main__')
            except AssertionError:
                pass  # the stub's readback id; not what this probe looks at
            except Exception as caught:
                error = type(caught).__name__
        outcomes.append(dict(crashed=error, claimed=[c for c in claims if c], saved=saved))
    return outcomes

P = 'https://www.jalan.net/yad399999/'; A = 'https://www.jalan.net/yad400001/'; B = 'https://www.jalan.net/yad400002/'
print('control (three good pages):', run([P, A, B], {P: Response(good(P)), A: Response(good(A)), B: Response(good(B))}))
poison = html({'@type': 'Hotel', 'name': '試験の宿', 'url': P, 'address': [{'addressRegion': '東京都', 'addressCountry': 'JP'}]})
for label, first in [('address list (AttributeError)', Response(poison)), ('truncated chunked body (IncompleteRead)', Response('x', fail=http.client.IncompleteRead(b'partial'))), ('unknown charset (LookupError)', Response(good(P), charset='x-not-a-charset'))]:
    queue = [P, A, B]
    outcomes = run(queue, {P: first, A: Response(good(A)), B: Response(good(B))}, runs=3)
    print(label + ':')
    for i, o in enumerate(outcomes, 1): print('  run', i, o)
    print('  queue after three runs:', queue)
