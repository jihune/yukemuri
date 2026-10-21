"""C07 measurement only: run one update-site.py --gentle against a local Miniflare Worker.

Usage: python3 drive-collector.py <crawler dir> <worker origin> <pages> <start ms> <out.json>
The source sites are replaced by the checked-in fixtures (scripts/crawler/fixtures) with
the property number swapped in, and the Worker's clock is fixed per request
(X-Compare-Now): a claim at start + 10 s x pages saved + 5 s, a save at start + 10 s x
(pages saved + 1). Claim tokens are derived from the same count, so two collectors that
take the same pages store the same rows. Never sends a request outside 127.0.0.1.
"""
import contextlib
import io
import json
import re
import runpy
import sys
import urllib.request
import uuid
from datetime import datetime, timezone
from email.message import Message
from pathlib import Path
from unittest.mock import patch

crawler, origin, pages, start, out = sys.argv[1], sys.argv[2].rstrip('/'), sys.argv[3], int(sys.argv[4]), sys.argv[5]
assert re.fullmatch(r'http://127\.0\.0\.1:\d+', origin), origin
sys.path.insert(0, crawler)
FIXTURES = Path(__file__).resolve().parents[3] / 'scripts/crawler/fixtures'
SITE = 'https://yukemuri.example-account.workers.dev'
NAMESPACE = uuid.UUID('6f1c0d6e-7c1b-4c57-9a43-3c0700000000')
state = {'saved': 0}
log = {'claims': [], 'saves': []}
local = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def clock(offset):
    return start + state['saved'] * 10000 + offset


class Forward:
    def open(self, request, timeout):
        path = request.full_url.split('.workers.dev', 1)[1]
        method, data = request.get_method(), request.data
        if method == 'POST' and path == '/api/crawl':
            claim = json.loads(data)
            claim['token'] = str(uuid.uuid5(NAMESPACE, f"{state['saved']}:{claim['provider']}:{claim['phase']}"))
            data = json.dumps(claim).encode()
        at = clock(10000) if method == 'PUT' else clock(5000)
        forwarded = urllib.request.Request(origin + path, data=data, method=method, headers={**dict(request.header_items()), 'X-Compare-Now': str(at)})
        with local.open(forwarded, timeout=timeout) as response:
            body = response.read()
        value = json.loads(body)
        if method == 'POST' and path == '/api/crawl':
            log['claims'].append({'provider': claim['provider'], 'phase': claim['phase'], 'lane': claim['lane'], 'url': value['jobs'][0]['url'] if value['jobs'] else None})
        if method == 'PUT':
            state['saved'] += 1
            log['saves'].append({'url': json.loads(data)['url'], 'response': value})
        return Reply(body)


class Reply:
    status = 200

    def __init__(self, body):
        self.body = body
        self.headers = Message()
        self.headers['Content-Type'] = 'text/html; charset=utf-8'

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, *args):
        return self.body


def page(url):
    if m := re.search(r'/yad(\d+)/', url):
        return (FIXTURES / 'jalan-detail.html').read_text(encoding='utf-8').replace('307416', m[1])
    if m := re.search(r'-hotel-detail-(\d+)/', url):
        return (FIXTURES / 'trip-detail-rooms.html').read_text(encoding='utf-8').replace('704264', m[1])
    if 'uiw1402.do' in url:
        return (FIXTURES / ('jalan-locale-kr.html' if 'ko_KR' in url else 'jalan-locale-en.html')).read_text(encoding='utf-8')
    raise AssertionError('no fixture for ' + url)


class Guard:
    def __init__(self, *args):
        self.redirects = []

    def open(self, url, follow_redirects=True):
        return Reply(page(url).encode())


output = io.StringIO()
access = json.dumps({'url': SITE, 'token': 'c07-measure-only-key'}) + '\n'
argv = ['update-site.py', '--gentle', '--max-pages', pages, '--interval', '8', '--jitter', '4']
with patch('sys.argv', argv), patch('sys.stdin', io.StringIO(access)), patch('urllib.request.build_opener', return_value=Forward()), \
        patch('source_safety.SourceGuard', Guard), patch('time.sleep'), \
        patch('collect.now', lambda: datetime.fromtimestamp(clock(10000) / 1000, timezone.utc).isoformat(timespec='seconds')), \
        contextlib.redirect_stdout(output):
    runpy.run_path(str(Path(crawler) / 'update-site.py'), run_name='__main__')
log['lines'] = [json.loads(line) for line in output.getvalue().splitlines()]
Path(out).write_text(json.dumps(log, ensure_ascii=False), encoding='utf-8')
