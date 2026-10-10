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

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('checkpoint', ROOT/'scripts/catalog-checkpoint.py')
checkpoint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checkpoint)
allowed = (ROOT/'lib/catalog-export.ts').read_text().split('EXPORT_TABLES={',1)[1].split('} as const',1)[0]
assert set(re.findall(r'\b([a-z_]+):\[', allowed)) == checkpoint.TABLES, 'API/checkpoint table mismatch'

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
print('Checkpoint checks passed: API table parity, complete observation payload, favorites, queue claim reset, overwrite and corruption refusal.')
