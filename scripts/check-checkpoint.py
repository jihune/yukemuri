#!/usr/bin/env python3
"""Checkpoint regression: allowlist, full payload, recovery and refusal paths."""
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sqlite3
import tempfile
from unittest import mock
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('checkpoint', ROOT/'scripts/catalog-checkpoint.py')
checkpoint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checkpoint)
allowed = (ROOT/'lib/catalog-export.ts').read_text().split('EXPORT_TABLES={',1)[1].split('} as const',1)[0]
assert set(re.findall(r'\b([a-z_]+):\[', allowed)) == checkpoint.TABLES, 'API/checkpoint table mismatch'
# V02-09: every table of db/schema.ts is exported or excluded with a reason,
# so a new table cannot silently miss the backup (the manifest schema value is
# written by hand and did not change with migrations 0013-0015).
export_source = (ROOT/'lib/catalog-export.ts').read_text()
excluded = export_source.split('EXCLUDED_TABLES={',1)[1].split('} as const',1)[0]
excluded = '\n'.join(line for line in excluded.splitlines() if not line.strip().startswith('//'))
reasons = dict(re.findall(r"\b([a-z0-9_]+):'([^']*)'", excluded))
assert 'excluded:Object.keys(EXCLUDED_TABLES)' in export_source, 'the manifest excluded list comes from EXCLUDED_TABLES'
# Tables the migrations create, and tables db/schema.ts declares in any quoting
# or line layout; either source alone could miss one.
migrated = sqlite3.connect(':memory:')
for path in sorted((ROOT/'drizzle').glob('*.sql')):
    migrated.executescript(path.read_text().replace('--> statement-breakpoint',''))
declared = {r[0] for r in migrated.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
migrated.close()
declared |= set(re.findall(r"sqliteTable\(\s*['\"`]([A-Za-z0-9_]+)['\"`]", (ROOT/'db/schema.ts').read_text()))
assert declared, 'no table found in db/schema.ts or drizzle/'
assert not set(reasons) & checkpoint.TABLES, 'a table is both exported and excluded'
assert all(len(r.strip()) >= 10 for r in reasons.values()), 'every excluded table needs its reason'
missing = declared - checkpoint.TABLES - set(reasons)
assert not missing, 'tables neither exported nor excluded: '+', '.join(sorted(missing))
assert not (checkpoint.TABLES | set(reasons)) - declared, 'export or exclusion names a table neither db/schema.ts nor drizzle/ has'

with tempfile.TemporaryDirectory(prefix='yukemuri-checkpoint-test-') as temp:
    temp = Path(temp)
    db = sqlite3.connect(':memory:')
    for path in sorted((ROOT/'drizzle').glob('*.sql')):
        db.executescript(path.read_text().replace('--> statement-breakpoint',''))
    payload = json.dumps({'large': '온천 근거\n'*3000}, ensure_ascii=False)
    db.execute('INSERT INTO hotel_source_observations VALUES (?,?,?)', ('test-observation', payload, '2026-10-09T00:00:00Z'))
    db.execute('INSERT INTO favorites(hotel_id) VALUES (?)', ('test-hotel',))
    db.execute("INSERT INTO crawl_jobs(url,provider,kind,status,attempts,next_at,lease_token,lease_until,last_token) VALUES (?,?,?,?,?,?,?,?,?)",
               ('https://example.test/item','jalan','detail','running',1,0,'old-lease',9999999999,'old-token'))
    tables = []
    records = []
    counts = {}
    db.row_factory = sqlite3.Row
    for name in sorted(checkpoint.TABLES):
        columns = [r[1] for r in db.execute('PRAGMA table_info('+name+')')]
        rows = [dict(r) for r in db.execute('SELECT * FROM '+name)]
        counts[name] = len(rows)
        tables.append({'name':name,'columns':columns,'count':len(rows)})
        records += [{'type':'row','table':name,'row':row} for row in rows]
    manifest = {'type':'manifest','source':'test.chatgpt.site','migrationsSha256':checkpoint.migration_digest(),
                'manifest':{'format':'yukemuri-checkpoint','version':1,'tables':tables}}
    lines = [checkpoint.encoded(x) for x in [manifest,*records]]
    footer = {'type':'complete','sha256':hashlib.sha256(b''.join(lines)).hexdigest(),'counts':counts,'consistency':'non_atomic'}
    archive = temp/'valid.gz'
    with gzip.open(archive,'wb') as f:
        f.write(b''.join(lines)+checkpoint.encoded(footer))
    restored = temp/'restored.sqlite'
    with contextlib.redirect_stdout(io.StringIO()):
        checkpoint.restore(archive,restored)
    recovered = sqlite3.connect(restored)
    assert recovered.execute('SELECT payload FROM hotel_source_observations').fetchone()[0] == payload
    assert recovered.execute('SELECT status,lease_token,lease_until,last_token FROM crawl_jobs').fetchone() == ('retry',None,0,None)
    assert recovered.execute('SELECT hotel_id FROM favorites').fetchone()[0] == 'test-hotel'
    recovered.close()
    before = restored.read_bytes()
    try:
        checkpoint.restore(archive,restored)
        raise AssertionError('Existing destination accepted')
    except FileExistsError:
        assert restored.read_bytes() == before
    for kind, data in [('missing-footer',b''.join(lines)),
                       ('bad-hash',b''.join(lines)+checkpoint.encoded({**footer,'sha256':'0'*64})),
                       ('bad-count',b''.join(lines)+checkpoint.encoded({**footer,'counts':{}})),
                       ('trailing-data',b''.join(lines)+checkpoint.encoded(footer)+b'{}\n')]:
        damaged = temp/(kind+'.gz')
        with gzip.open(damaged,'wb') as f: f.write(data)
        target = temp/(kind+'.sqlite')
        try:
            checkpoint.restore(damaged,target)
            raise AssertionError('Damaged checkpoint accepted: '+kind)
        except ValueError:
            assert not target.exists(), 'Failed recovery left a partial DB'
    db.close()
# V01-14: the export asks for the Worker address recorded in cloudflare-deploy.json (it used to take only a
# Sites address, so the export docs/catalog-operations.md asks for stopped before any request) and names itself
# in the User-Agent (Cloudflare answers the urllib default with error 1010). Nothing here reaches the network:
# the opener is replaced and every request is kept.
class FakeOpener:
    def __init__(self):
        self.requests = []

    def open(self, request, timeout=None):
        self.requests.append(request)
        if 'table' in urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query):
            body = {'rows': [], 'next': None}
        else:
            body = {'format': 'yukemuri-checkpoint', 'version': 1,
                    'tables': [{'name': name, 'columns': [], 'count': 0} for name in sorted(checkpoint.TABLES)]}
        return io.BytesIO(json.dumps(body).encode())


def run_export(url, destination, opener):
    access = json.dumps({'url': url, 'token': 'placeholder-not-a-key-000000'}) + '\n'
    with mock.patch.object(checkpoint.urllib.request, 'build_opener', lambda *handlers: opener), \
         mock.patch.object(checkpoint.sys, 'stdin', io.StringIO(access)), \
         contextlib.redirect_stdout(io.StringIO()):
        checkpoint.export(destination)


origin = json.loads((ROOT/'cloudflare-deploy.json').read_text(encoding='utf-8'))['publicOrigin']
host = urllib.parse.urlsplit(origin).hostname
with tempfile.TemporaryDirectory(prefix='yukemuri-export-address-') as temp:
    temp = Path(temp)
    try:
        opener = FakeOpener()
        run_export(origin, temp/'worker.jsonl.gz', opener)
        requests = opener.requests
    except ValueError as error:
        raise AssertionError('V01-14 export refused the Worker address in cloudflare-deploy.json: ' + str(error))
    assert (temp/'worker.jsonl.gz').exists(), 'V01-14 export wrote no archive for the Worker address'
    assert requests and all(r.full_url.startswith(origin + '/api/catalog-export') for r in requests), 'V01-14 export requests go to the Worker address'
    assert all(r.get_header('User-agent') == checkpoint.USER_AGENT for r in requests), 'V01-14 every export request names the tool in its User-Agent'
    assert 'urllib' not in checkpoint.USER_AGENT.lower(), 'V01-14 the User-Agent is not the urllib default'
    assert all(r.get_header('X-yukemuri-crawl-key') == 'placeholder-not-a-key-000000' for r in requests), 'V01-14 export sends the crawl key'
    # A Sites address is accepted as it was; the way back to Sites is closed in the Sites cleanup.
    run_export('https://yukemuri.jihun7891.chatgpt.site', temp/'sites.jsonl.gz', FakeOpener())
    assert (temp/'sites.jsonl.gz').exists(), 'V01-14 export still accepts a Sites address'
    # Anything else stops before a request and leaves no file, so the key goes nowhere else.
    refused = ['http://' + host, 'https://yukemuri.other-account.workers.dev', 'https://other.' + host.split('.', 1)[1],
               'https://' + host + '.example.test', 'https://evil-' + host, 'https://user:secret@' + host, 'https://example.test', 'https://notchatgpt.site']
    for bad in refused:
        opener = FakeOpener()
        target = temp/'refused.jsonl.gz'
        try:
            run_export(bad, target, opener)
            raise AssertionError('V01-14 export accepted ' + bad)
        except ValueError:
            assert not opener.requests and not target.exists(), 'V01-14 a refused address sent a request or left a file: ' + bad
assert checkpoint.accepted_host(host, origin) and checkpoint.accepted_host('a.chatgpt.site', None), 'V01-14 accepted hosts'
assert not checkpoint.accepted_host(host, None) and not checkpoint.accepted_host(None, origin) and not checkpoint.accepted_host('', origin), 'V01-14 no committed address, no host'

print(f'Checkpoint checks passed: API table parity, {len(declared)} schema tables exported or excluded with a reason, complete observation payload, favorites, queue claim reset, overwrite and corruption refusal, '
      f'export address (the Worker address in cloudflare-deploy.json, Sites as before, {len(refused)} others refused before any request) and User-Agent.')
