#!/usr/bin/env python3
"""V01G (2) controls. Usage: controls.py SRC_TREE OUT_DIR

Copies SRC_TREE (the tree with the fixes) once per control, undoes ONE fix in the copy,
runs the check that is meant to see it, and judges the control by the assertion message:
the run must fail (rc != 0) and the expected text must stand in the error line itself (the first
line that starts with 'AssertionError'), not in a traceback of some other error.
An unchanged copy is run first for every check; it must pass (rc 0 and 'passed' in stdout).
"""
import json, os, shutil, subprocess, sys
from pathlib import Path

SRC, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
CHECKS = {
    'deploy': ['node', 'scripts/check-deploy-config.mjs'],
    'rollback': ['node', 'scripts/check-rollback-workflow.mjs'],
    'collect': ['node', 'scripts/check-collect-workflow.mjs'],
    'checkpoint': ['python3', '-I', 'scripts/check-checkpoint.py'],
}
GUARD = "    if: github.ref == 'refs/heads/main'\n    steps:\n"
NOGUARD = "    steps:\n"
SNAP = "if: github.ref == 'refs/heads/main' && inputs.mode == 'gentle' && needs.collect.outputs.pages != '0'"
HOST = "public_origin is not None and host==urllib.parse.urlsplit(public_origin).hostname"
# (id, check, file, old, new, expected text)
CONTROLS = [
    ('V01-5 deploy.yml: no guard', 'deploy', '.github/workflows/deploy.yml', GUARD, NOGUARD, 'V01-5 main-only guard: deploy.yml: deploy: no job-level if'),
    ('V01-5 deploy.yml: guard for another branch', 'deploy', '.github/workflows/deploy.yml', "github.ref == 'refs/heads/main'\n    steps:", "github.ref == 'refs/heads/dev'\n    steps:", 'V01-5 main-only guard: deploy.yml: deploy: the if is not'),
    ('V01-5 deploy.yml: guard OR-ed with true', 'deploy', '.github/workflows/deploy.yml', "github.ref == 'refs/heads/main'\n    steps:", "github.ref == 'refs/heads/main' || true\n    steps:", 'V01-5 main-only guard: deploy.yml: deploy: the if is not'),
    ('V01-5 d1-setup.yml: no guard', 'deploy', '.github/workflows/d1-setup.yml', GUARD, NOGUARD, 'V01-5 main-only guard: d1-setup.yml: d1: no job-level if'),
    ('V01-5 rollback.yml: no guard', 'rollback', '.github/workflows/rollback.yml', GUARD, NOGUARD, 'V01-5 main-only guard: rollback.yml: rollback: no job-level if'),
    ('V01-5 collect.yml: no guard on the collect job', 'collect', '.github/workflows/collect.yml', GUARD, NOGUARD, 'V01-5 main-only guard: collect.yml: collect: no job-level if'),
    ('V01-5 collect.yml: no guard on the snapshot job', 'collect', '.github/workflows/collect.yml', SNAP, SNAP.replace("github.ref == 'refs/heads/main' && ", ''), 'V01-5 main-only guard: collect.yml: snapshot: the if is not'),
    ('V01-14 catalog-checkpoint.py: publicOrigin not accepted', 'checkpoint', 'scripts/catalog-checkpoint.py', HOST, 'False', 'V01-14 export refused the Worker address in cloudflare-deploy.json'),
    ('V01-14 catalog-checkpoint.py: no User-Agent', 'checkpoint', 'scripts/catalog-checkpoint.py', ",'User-Agent':USER_AGENT", '', 'V01-14 every export request names the tool in its User-Agent'),
    ('V01-14 catalog-checkpoint.py: any workers.dev accepted', 'checkpoint', 'scripts/catalog-checkpoint.py', HOST, "host.endswith('.workers.dev')", 'V01-14 export accepted https://yukemuri.other-account.workers.dev'),
    ('V01-14 catalog-checkpoint.py: suffix match instead of equality', 'checkpoint', 'scripts/catalog-checkpoint.py', "host==urllib.parse.urlsplit(public_origin).hostname", "host.endswith(urllib.parse.urlsplit(public_origin).hostname)", 'V01-14 export accepted https://evil-yukemuri.jihune.workers.dev'),
]


def copy_tree(dst):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(SRC, dst, symlinks=True, ignore=shutil.ignore_patterns('.git', 'node_modules', 'source-assets', 'dist'))
    for name in ('node_modules', 'dist'):
        if (SRC / name).exists():
            os.symlink(SRC / name, dst / name)


def run(cwd, cmd):
    done = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', timeout=900)
    return done.returncode, done.stdout + done.stderr


rows, held, fails = [], 0, []
work = OUT / 'copy'
copy_tree(work)
for name, cmd in CHECKS.items():
    rc, out = run(work, cmd)
    ok = rc == 0 and 'passed' in out
    rows.append(f'unchanged\t{name}\trc={rc}\t{"PASS" if ok else "FAIL"}\t{out.strip().splitlines()[-1][:90] if out.strip() else ""}')
    if not ok:
        fails.append(name)
        (OUT / f'unchanged-{name}.out').write_text(out, encoding='utf-8')
unchanged_ok = not fails
excerpts = []
for label, check, rel, old, new, expected in CONTROLS:
    copy_tree(work)
    path = work / rel
    text = path.read_text(encoding='utf-8')
    assert text.count(old) == 1, (label, text.count(old))
    path.write_text(text.replace(old, new), encoding='utf-8')
    rc, out = run(work, CHECKS[check])
    # The error line itself ('AssertionError ...: message' at the start of a line), not a source line of a traceback.
    first = next((l for l in out.splitlines() if l.startswith('AssertionError')), '(no AssertionError line)')
    ok = rc != 0 and expected in first
    held += ok
    rows.append(f'{label}\t{check}\trc={rc}\t{"HOLDS" if ok else "NOT HELD"}\t{first[:150]}')
    excerpts.append(f'### {label}\nexpected: {expected}\n' + '\n'.join(out.splitlines()[:9]) + '\n')
(OUT / 'controls-output.tsv').write_text('\n'.join(rows) + '\n', encoding='utf-8')
(OUT / 'controls-failures.txt').write_text('\n'.join(excerpts), encoding='utf-8')
print('\n'.join(rows))
print(f'SUMMARY controls_held={held} of {len(CONTROLS)}; unchanged copy: {"PASS" if unchanged_ok else "FAIL " + ",".join(fails)}')
sys.exit(0 if held == len(CONTROLS) and unchanged_ok else 1)
