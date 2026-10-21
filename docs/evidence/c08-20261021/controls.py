"""C08 controls: each seeded defect must make its check fail; the clean copy must pass.

Copies HEAD (git archive) into a temporary folder, links node_modules, then for each
variant swaps one or two files, runs one check and restores the files. The pre-fix files
come from the base commit 9074870 (main before C08). Prints one line per variant and
a verdict line. Usage: python3 docs/evidence/c08-20261021/controls.py
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = '9074870'
SAFETY = 'scripts/crawler/source_safety.py'
OITA = 'scripts/update-oita-permits.py'
JTA = 'scripts/update-jta-registered.py'
PY_CHECK = [sys.executable, 'scripts/check-source-safety.py']
MJS_CHECK = ['node', 'scripts/check-oita-permits.mjs']

# (name, files, change: 'before' or (old, new), check). No files: the clean copy, which must pass.
VARIANTS = [
    ('clean copy (must pass)', (), None, PY_CHECK),
    ('clean copy, list updaters (must pass)', (), None, MJS_CHECK),
    ('pre-fix collector (robots.txt read)', (SAFETY,), 'before', PY_CHECK),
    ('interval floor removed', (SAFETY,), ('self.interval=max(8,interval)', 'self.interval=interval'), PY_CHECK),
    ('interval floor 3', (SAFETY,), ('self.interval=max(8,interval)', 'self.interval=max(3,interval)'), PY_CHECK),
    ('interval dropped from next request time', (SAFETY,), ('self.next_at[host]=self.clock()+self.interval+random.uniform(0,self.jitter)', 'self.next_at[host]=self.clock()+random.uniform(0,self.jitter)'), PY_CHECK),
    ('jitter dropped', (SAFETY,), ('self.next_at[host]=self.clock()+self.interval+random.uniform(0,self.jitter)', 'self.next_at[host]=self.clock()+self.interval'), PY_CHECK),
    ('redirect hop not paced', (SAFETY,), ('   self.sleep(max(0,self.next_at.get(host,0)-self.clock()))', '   if hop==0:self.sleep(max(0,self.next_at.get(host,0)-self.clock()))'), PY_CHECK),
    ('one host pacing shared by all hosts', (SAFETY,), ('   host=source_url(url).hostname', '   source_url(url);host="any"'), PY_CHECK),
    ('pre-fix Oita updater and collector module (robots.txt read)', (OITA, SAFETY), 'before', MJS_CHECK),
    ('pre-fix JTA updater and collector module (robots.txt read)', (JTA, SAFETY), 'before', MJS_CHECK),
    ('Oita pause before the CSV removed', (OITA,), ('    time.sleep(PAUSE)\n', ''), MJS_CHECK),
    ('Oita pause 1 second', (OITA,), ('PAUSE = 3 ', 'PAUSE = 1 '), MJS_CHECK),
    ('JTA pause before each PDF removed', (JTA,), ('            time.sleep(PAUSE)\n', ''), MJS_CHECK),
    ('Oita follows a same-host HTTPS redirect', (OITA,), ("        raise SystemExit(f'Redirect refused: {req.full_url} -> {newurl}')", "        if urllib.parse.urlsplit(newurl).netloc!=urllib.parse.urlsplit(req.full_url).netloc:raise SystemExit('refused')\n        return super().redirect_request(req, fp, code, msg, headers, newurl)"), MJS_CHECK),
    ('JTA follows every redirect', (JTA,), ("    with urllib.request.build_opener(NoRedirect()).open(request, timeout=120) as response:", "    with urllib.request.build_opener().open(request, timeout=120) as response:"), MJS_CHECK),
    ('Oita CSV host check removed', (OITA,), ("    if target.scheme != 'https' or target.netloc != urllib.parse.urlsplit(PACKAGE).netloc:", "    if False:"), MJS_CHECK),
]


def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, check=True).stdout


with tempfile.TemporaryDirectory(prefix='c08-controls-') as temp:
    repo = Path(temp)
    subprocess.run(['tar', '-x', '-C', str(repo)], input=git('archive', '--format=tar', 'HEAD'), check=True)
    os.symlink(ROOT / 'node_modules', repo / 'node_modules')
    results = []
    for name, paths, change, check in VARIANTS:
        originals = {p: (repo / p).read_bytes() for p in paths}
        seeded = True
        for p in paths:
            if change == 'before':
                (repo / p).write_bytes(git('show', f'{BASE}:{p}'))
            else:
                old, new = change
                text = originals[p].decode('utf-8')
                if text.count(old) != 1:
                    seeded = False
                    break
                (repo / p).write_text(text.replace(old, new), encoding='utf-8')
        try:
            run = subprocess.run(check, cwd=repo, capture_output=True, encoding='utf-8', check=False) if seeded else None
        finally:
            for p, data in originals.items():
                (repo / p).write_bytes(data)
        if run is None:
            results.append((name, 'SEED NOT APPLIED', '-', ''))
            continue
        ok = (run.returncode == 0) == (not paths)
        out = run.stderr or run.stdout
        # The first assertion or error line says why it failed.
        why = next((line.strip() for line in out.splitlines() if 'Error' in line or 'FAIL' in line), out.strip().splitlines()[-1] if out.strip() else '')
        results.append((name, 'as expected' if ok else 'UNEXPECTED', run.returncode, why[:200]))

bad = [r for r in results if r[1] != 'as expected']
for r in results:
    print(' | '.join(str(x) for x in r))
print(f'CONTROLS {"PASS" if not bad else "FAIL"}: {len(results) - len(bad)} of {len(results)} as expected')
sys.exit(1 if bad else 0)
