# Each control breaks the reviewed import in a scratch copy, rebuilds, and expects
# scripts/check-reviewed-groups-worker.mjs to fail.
# Usage: python3 -I controls.py <copy of the repository without node_modules, with node_modules linked>
import subprocess
import sys
from pathlib import Path

C = Path(sys.argv[1])
NL = chr(10)
REPO = 'lib/hotel-repository.ts'
GROUPS = 'lib/hotel-source-groups.ts'
CALL = ' await importReviewedSourceGroups();' + NL
# (name, [(path, old, new)], rebuild)
cases = [
    ('evidence without the scope sentence', [('data/source-groups-reviewed.json', '판매 범위는 객실 단위로 맞춰 보지 못해', '판매 범위는 확인함')], False),
    ('imported every time', [(GROUPS, " if(await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first())return;" + NL + ' const counts', ' const counts')], True),
    ('counted without saving', [(GROUPS, "p.success?await saveSourceGroup(p.data):'invalid'", "p.success?'saved':'invalid'")], True),
    ('not run by crawl-prepare', [(REPO, CALL, '')], True),
    ('marked done with unknown pairs', [(GROUPS, " if(!counts.unknown)await db.prepare('INSERT INTO catalog_meta", " await db.prepare('INSERT INTO catalog_meta")], True),
    # Codex P2 on PR #204 (89123f9): run inside ensureCatalog's promise, an isolate never tries again.
    ('only in the isolate promise', [(REPO, CALL, ''), (REPO, '.then(importVerifiedSourceGroups).catch(', '.then(importVerifiedSourceGroups).then(()=>importReviewedSourceGroups()).catch(')], True),
]


def build():
    b = subprocess.run(['node', 'scripts/run-framework.mjs', 'build'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
    return b.returncode


# The Worker check reads dist/ at load: build the unbroken copy first.
assert build() == 0
fails = 0
for name, edits, rebuild in cases:
    kept = {}
    for path, old, new in edits:
        f = C / path
        text = f.read_text(encoding='utf-8')
        kept.setdefault(path, text)
        assert text.count(old) >= 1, name + ': ' + old
        f.write_text(text.replace(old, new, 1), encoding='utf-8')
    if rebuild:
        assert build() == 0, name + ' build failed'
    r = subprocess.run(['node', 'scripts/check-reviewed-groups-worker.mjs'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
    for path, text in kept.items():
        (C / path).write_text(text, encoding='utf-8')
    caught = r.returncode != 0
    fails += not caught
    msg = r.stderr.strip().splitlines() or ['']
    line = next((x for x in msg if x.startswith('AssertionError')), msg[0])
    print(f"{name}: {'caught' if caught else 'NOT CAUGHT'} (rc {r.returncode}) {line[:160]}", flush=True)
b = build()
r = subprocess.run(['node', 'scripts/check-reviewed-groups-worker.mjs'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
print(f'unbroken copy: build rc {b}, check rc {r.returncode}')
print(f"controls: {len(cases) - fails}/{len(cases)} caught, unbroken passes: {r.returncode == 0} -> {'PASS' if fails == 0 and r.returncode == 0 else 'FAIL'}")
