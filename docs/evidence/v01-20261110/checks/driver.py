#!/usr/bin/env python3
"""Apply one seeded defect to a repo copy, optionally build, run checks, record, revert.
usage: driver.py <copy> <mut_id> [--mode worker|source|all|targets]
muts/<mut_id>.json: {"edits":[{"file":..,"old":..,"new":..}], "build":bool, "targets":[["node","scripts/x.mjs"],..], "note":".."}
"""
import ast, json, os, subprocess, sys, time
from pathlib import Path
S = Path(__file__).resolve().parent
copy = S / sys.argv[1]
mut_id = sys.argv[2]
mode = sys.argv[sys.argv.index('--mode') + 1] if '--mode' in sys.argv else None
spec = json.loads((S / 'muts' / (mut_id + '.json')).read_text(encoding='utf-8'), strict=False)
env = dict(os.environ, TMPDIR=str(S / 'tmp'))
ledger = S / 'experiments.tsv'
logdir = S / 'logs' / mut_id
logdir.mkdir(parents=True, exist_ok=True)

def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

def git(*a):
    return subprocess.run(['git', '-C', str(copy), *a], capture_output=True, text=True, encoding='utf-8')

def commands():
    tree = ast.parse((copy / 'scripts/cloud-check.py').read_text(encoding='utf-8'))
    class Fix(ast.NodeTransformer):
        def visit_Attribute(self, node):
            if isinstance(node.value, ast.Name) and node.value.id == 'sys' and node.attr == 'executable':
                return ast.copy_location(ast.Constant('python3'), node)
            return node
    base = full = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', '') == 'commands':
            base = ast.literal_eval(Fix().visit(node.value))
        if isinstance(node, ast.AugAssign) and getattr(node.target, 'id', '') == 'commands':
            full = ast.literal_eval(Fix().visit(node.value))
    return base, full

def record(cmd, code, last, secs):
    with ledger.open('a', encoding='utf-8') as f:
        f.write('\t'.join([now(), mut_id, sys.argv[1], ' '.join(cmd), str(code), f'{secs:.0f}s', last.replace('\t', ' ')[:300]]) + '\n')

def run(cmd, label):
    t = time.time()
    log = logdir / (label + '.log')
    with log.open('w', encoding='utf-8') as out:
        r = subprocess.run(cmd, cwd=copy, env=env, stdout=out, stderr=subprocess.STDOUT)
    lines = [l for l in log.read_text(encoding='utf-8', errors='replace').splitlines() if l.strip()]
    last = lines[-1] if lines else ''
    if r.returncode:
        # first line that names the failure
        for l in lines:
            if 'AssertionError' in l or 'Error:' in l or 'FAIL' in l or 'assert' in l:
                last = l.strip() + ' || ' + last
                break
    record(cmd, r.returncode, last, time.time() - t)
    return r.returncode

assert git('status', '--porcelain').stdout == '', 'copy not clean: ' + git('status', '--porcelain').stdout
files = []
try:
    for e in spec['edits']:
        p = copy / e['file']
        s = p.read_text(encoding='utf-8')
        n = s.count(e['old'])
        assert n == e.get('count', 1), f"{e['file']}: old text found {n} times"
        p.write_text(s.replace(e['old'], e['new']), encoding='utf-8')
        files.append(e['file'])
    (logdir / 'mutation.diff').write_text(git('diff').stdout, encoding='utf-8')
    base, full = commands()
    build = [c for c in full if c[1] == 'scripts/run-framework.mjs'][0]
    worker = [c for c in full if c != build]
    failed = []
    if spec.get('build'):
        code = run(build, 'build')
        if code:
            failed.append('BUILD')
    which = mode or ('worker' if spec.get('build') else 'source')
    todo = []
    if spec.get('targets') and which == 'targets':
        todo = spec['targets']
    elif which == 'worker':
        todo = worker
    elif which == 'source':
        todo = base
    elif which == 'all':
        todo = base + worker
    if 'BUILD' not in failed:
        for i, c in enumerate(todo):
            if run(c, f'{i:02d}-' + Path(c[1]).name.replace('.', '_') + ('-' + c[2].strip('-') if len(c) > 2 else '')):
                failed.append(' '.join(c[1:]))
                if '--keep-going' not in sys.argv:
                    break
        if which == 'worker' and not failed:
            for i, c in enumerate(base):
                if run(c, f's{i:02d}-' + Path(c[1]).name.replace('.', '_')):
                    failed.append(' '.join(c[1:]))
                    break
    verdict = 'CAUGHT by ' + '; '.join(failed) if failed else 'SURVIVED (no check failed)'
    record(['VERDICT'], len(failed), verdict, 0)
    print(mut_id, verdict)
    for i, c in enumerate(spec.get('extra', [])):
        code = run(c, f'x{i:02d}-' + Path(c[1]).name.replace('.', '_'))
        print(mut_id, 'EXTRA (not in cloud-check)', ' '.join(c), 'exit', code)
finally:
    git('checkout', '--', '.')
    st = git('status', '--porcelain').stdout
    print(mut_id, 'reverted; status clean' if st == '' else 'NOT CLEAN: ' + st)
