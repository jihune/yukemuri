# Each control breaks the reviewed import in a scratch copy, rebuilds, and expects
# scripts/check-reviewed-groups-worker.mjs to fail.
# Usage: python3 -I controls.py <copy of the repository without node_modules, with node_modules linked>
import subprocess
import sys
from pathlib import Path

C = Path(sys.argv[1])
cases = [
    ('data/source-groups-reviewed.json', '판매 범위는 객실 단위로 맞춰 보지 못해', '판매 범위는 확인함', False, 'evidence without the scope sentence'),
    ('lib/hotel-source-groups.ts', " if(await db.prepare('SELECT value FROM catalog_meta WHERE key=?').bind(key).first())return;\n const counts", ' const counts', True, 'imported every time'),
    ('lib/hotel-source-groups.ts', "p.success?await saveSourceGroup(p.data):'invalid'", "p.success?'saved':'invalid'", True, 'counted without saving'),
    ('lib/hotel-repository.ts', '.then(()=>importReviewedSourceGroups())', '', True, 'not chained into crawl-prepare'),
]
# The Worker check reads dist/ at load: build the unbroken copy first.
assert subprocess.run(['node', 'scripts/run-framework.mjs', 'build'], check=False, cwd=C, capture_output=True).returncode == 0
fails = 0
for path, old, new, build, name in cases:
    f = C / path
    keep = f.read_text(encoding='utf-8')
    assert keep.count(old) >= 1, name
    f.write_text(keep.replace(old, new, 1), encoding='utf-8')
    if build:
        b = subprocess.run(['node', 'scripts/run-framework.mjs', 'build'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
        assert b.returncode == 0, name + ' build failed: ' + b.stderr[-300:]
    r = subprocess.run(['node', 'scripts/check-reviewed-groups-worker.mjs'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
    f.write_text(keep, encoding='utf-8')
    caught = r.returncode != 0
    fails += not caught
    msg = r.stderr.strip().splitlines() or ['']
    line = next((l for l in msg if l.startswith('AssertionError')), msg[0])
    print(f"{name}: {'caught' if caught else 'NOT CAUGHT'} (rc {r.returncode}) {line[:160]}", flush=True)
b = subprocess.run(['node', 'scripts/run-framework.mjs', 'build'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
r = subprocess.run(['node', 'scripts/check-reviewed-groups-worker.mjs'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
print(f'unbroken copy: build rc {b.returncode}, check rc {r.returncode}')
print(f"controls: {len(cases) - fails}/{len(cases)} caught, unbroken passes: {r.returncode == 0} -> {'PASS' if fails == 0 and r.returncode == 0 else 'FAIL'}")
