# Each control breaks D08 PR 6 in a scratch copy and expects the check that names it to fail:
# the snapshot builder against scripts/check-search-snapshot-worker.mjs, the page against
# scripts/check-d08-merged-browser.mjs (which needs a build of the broken page).
# Usage: python3 -I controls.py <copy of the repository without .git, with node_modules linked and
# .sites-runtime (the isolated Playwright install) copied or linked>
import subprocess
import sys
from pathlib import Path

C = Path(sys.argv[1])
SNAPSHOT = ['node', 'scripts/check-search-snapshot-worker.mjs']
BROWSER = ['node', 'scripts/check-d08-merged-browser.mjs']
BUILD = 'lib/search-snapshot-build.ts'
PAGE = 'components/hotel-explorer.tsx'
RETURN = ' return{core,text,cards,geo,geocodeInputs,'
# (name, [(path, old, new)], rebuild, check)
cases = [
    ('merged records kept', [(BUILD, 'const kept=rows.filter(r=>!mergedInto.has(r.id)),', 'const kept=rows,')], False, SNAPSHOT),
    ('absorbed names dropped', [(BUILD, 'peer=absorbed.get(r.id)?.names??[];', 'peer:string[]=[];')], False, SNAPSHOT),
    ('absorbed names dropped, from the reference too', [
        (BUILD, 'peer=absorbed.get(r.id)?.names??[];', 'peer:string[]=[];'),
        ('scripts/check-search-snapshot-worker.mjs', 'const absorbed=base=>peers(base).flatMap(id=>hotelNames(withWikidataNames(payloads.get(id))));', 'const absorbed=base=>[];'),
    ], False, SNAPSHOT),
    ('mergedInto not in the manifest', [('scripts/build-search-snapshot.mjs', 'mergedInto:data.mergedInto,', '')], False, SNAPSHOT),
    ('mergedInto in core.json, which a page from before cannot open', [(BUILD, RETURN, ' Object.assign(core,{mergedInto:Object.fromEntries(mergedInto)});' + chr(10) + RETURN)], False, SNAPSHOT),
    ('page ignores mergedInto', [(PAGE, 'const mergedInto=snap.snapshot?.manifest.mergedInto,', 'const mergedInto=undefined as Record<string,string>|undefined,')], True, BROWSER),
    # Codex P2 on PR #209: an id another tab stores later is mapped too.
    ('comparison mapped only once', [(PAGE, '},[mergedInto,comparisonIds]);', '},[mergedInto]);')], True, BROWSER),
    ('unsaving leaves the absorbed id', [(PAGE, 'ids=next?[id]:[id,...savedIds.filter(k=>k!==id&&mergedInto?.[k]===id)];', 'ids=[id];')], True, BROWSER),
]


def build():
    b = subprocess.run(['node', 'scripts/run-framework.mjs', 'build'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
    assert b.returncode == 0, 'build failed: ' + b.stderr[-300:]


# Both checks read dist/ at load: build the unbroken copy first.
build()
fails = 0
for name, edits, rebuild, check in cases:
    kept = {}
    for path, old, new in edits:
        f = C / path
        text = f.read_text(encoding='utf-8')
        kept.setdefault(path, text)
        assert text.count(old) == 1, name + ': ' + old
        f.write_text(text.replace(old, new), encoding='utf-8')
    if rebuild:
        build()
    r = subprocess.run(check, check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
    for path, text in kept.items():
        (C / path).write_text(text, encoding='utf-8')
    if rebuild:
        build()
    caught = r.returncode != 0
    fails += not caught
    out = (r.stdout + r.stderr).splitlines()
    line = next((x for x in out if x.startswith(('AssertionError', 'FAIL', 'Error'))), out[-1] if out else '')
    print(f"{name}: {'caught' if caught else 'NOT CAUGHT'} (rc {r.returncode}) {line[:160]}", flush=True)
unbroken = [subprocess.run(c, check=False, cwd=C, capture_output=True).returncode for c in (SNAPSHOT, BROWSER)]
print(f'unbroken copy: snapshot check rc {unbroken[0]}, browser check rc {unbroken[1]}')
ok = fails == 0 and unbroken == [0, 0]
print(f"controls: {len(cases) - fails}/{len(cases)} caught, unbroken passes: {unbroken == [0, 0]} -> {'PASS' if ok else 'FAIL'}")
