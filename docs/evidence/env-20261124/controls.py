"""E01 controls: scripts/check-secret-environment.mjs run on copies of .github/workflows.

Usage (from the repository root): python3 controls.py OUT_DIR
Prints one TSV line per run and a last SUMMARY line; exit 1 when a verdict is not as expected.
A copy that should fail counts as HOLDS only when the check exits non-zero AND the AssertionError
line names the file and job that was changed (a failure for another reason does not count).
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()
OUT = Path(sys.argv[1])
BLOCK = '    environment:\n      name: production\n      deployment: false\n'
WORKFLOWS = ROOT / '.github/workflows'
CHECK = ['node', str(ROOT / 'scripts/check-secret-environment.mjs')]


def run(folder):
    result = subprocess.run([*CHECK, str(folder)], capture_output=True, encoding='utf-8', check=False)
    line = next((x for x in result.stderr.splitlines() if x.startswith('AssertionError')), '')
    return result.returncode, (result.stdout.strip() or line)[:900]


def fresh(name):
    folder = OUT / name
    if folder.exists():
        shutil.rmtree(folder)
    shutil.copytree(WORKFLOWS, folder)
    return folder


rows = []
code, text = run(fresh('unchanged'))
rows.append(('unchanged copy', code, 'HOLDS' if code == 0 and 'passed' in text else 'BROKEN', text))

# The same files as the base commit (no environment anywhere) must fail on all seven jobs.
base = fresh('base-commit')
for path in base.glob('*.yml'):
    path.write_text(path.read_text(encoding='utf-8').replace(BLOCK, ''), encoding='utf-8')
code, text = run(base)
named = all(k in text for k in ('collect-chain.yml: wait', 'collect.yml: collect', 'd1-setup.yml: d1', 'deploy.yml: deploy',
                                'lifecycle.yml: apply', 'rollback.yml: rollback', 'usage.yml: usage'))
rows.append(('all blocks cut out', code, 'HOLDS' if code != 0 and named else 'BROKEN', text))

for path in sorted(WORKFLOWS.glob('*.yml')):
    original = path.read_text(encoding='utf-8')
    if BLOCK not in original:
        continue
    job = None
    head = original[:original.index(BLOCK)]
    for line in head.splitlines():
        if line.startswith('  ') and not line.startswith('   ') and line.rstrip().endswith(':'):
            job = line.strip().rstrip(':')
    for label, changed in (
        ('block cut out', original.replace(BLOCK, '')),
        ('other environment', original.replace(BLOCK, BLOCK.replace('production', 'staging'))),
        ('deployment record kept', original.replace(BLOCK, BLOCK.replace('      deployment: false\n', ''))),
    ):
        folder = fresh(f'{path.stem}-{label.replace(" ", "-")}')
        (folder / path.name).write_text(changed, encoding='utf-8')
        code, text = run(folder)
        want = f'{path.name}: {job}:'
        rows.append((f'{path.name} {job}: {label}', code, 'HOLDS' if code != 0 and want in text else 'BROKEN', text))

# An environment on a job that reads no production secret.
folder = fresh('chain-job')
collect = (folder / 'collect.yml').read_text(encoding='utf-8')
cut = collect.index('\n  chain:\n')
changed = collect[:cut] + collect[cut:].replace('    steps:\n', BLOCK + '    steps:\n', 1)
(folder / 'collect.yml').write_text(changed, encoding='utf-8')
code, text = run(folder)
rows.append(('collect.yml chain: environment added', code, 'HOLDS' if code != 0 and 'collect.yml: chain:' in text else 'BROKEN', text))

# The call to deploy.yml passes the three secrets by name; deploy.yml declares them required.
NAMES = ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'YUKEMURI_CRAWL_ACCESS_KEY')
PASS = '    secrets:\n' + ''.join(f'      {n}: ${{{{ secrets.{n} }}}}\n' for n in NAMES)
for label, name, job, old, new, want in (
    ('secrets: inherit', 'collect.yml', 'snapshot', PASS, '    secrets: inherit\n', 'collect.yml: snapshot:'),
    ('crawl key left out', 'lifecycle.yml', 'snapshot', PASS, PASS.replace(
        '      YUKEMURI_CRAWL_ACCESS_KEY: ${{ secrets.YUKEMURI_CRAWL_ACCESS_KEY }}\n', ''), 'lifecycle.yml: snapshot:'),
    ('token not required', 'deploy.yml', 'workflow_call',
     '      CLOUDFLARE_API_TOKEN:\n        required: true\n', '      CLOUDFLARE_API_TOKEN:\n        required: false\n', 'deploy.yml: reads'),
    ('crawl key not declared', 'deploy.yml', 'workflow_call',
     '      YUKEMURI_CRAWL_ACCESS_KEY:\n        required: true\n', '', 'deploy.yml: reads'),
):
    folder = fresh(f'{name}-{label.replace(" ", "-").replace(":", "")}')
    original = (folder / name).read_text(encoding='utf-8')
    assert old in original
    (folder / name).write_text(original.replace(old, new, 1), encoding='utf-8')
    code, text = run(folder)
    rows.append((f'{name} {job}: {label}', code, 'HOLDS' if code != 0 and want in text else 'BROKEN', text))

# A new workflow that reads the token without the environment.
folder = fresh('new-workflow')
(folder / 'extra.yml').write_text(
    'name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n'
    '        env:\n          V: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
    encoding='utf-8',
)
code, text = run(folder)
rows.append(('extra.yml go: new job reads the token', code, 'HOLDS' if code != 0 and 'extra.yml' in text else 'BROKEN', text))

# A new workflow named .yaml (GitHub runs both suffixes) that reads the token without the block.
folder = fresh('new-workflow-yaml')
(folder / 'extra.yaml').write_text(
    'name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n'
    '        env:\n          V: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
    encoding='utf-8',
)
code, text = run(folder)
rows.append(('extra.yaml go: new .yaml job reads the token', code, 'HOLDS' if code != 0 and 'extra.yaml' in text else 'BROKEN', text))

# The token read at workflow level (env: above jobs:) and with a quoted job key, each in a new .yml.
READ = '${{ secrets.CLOUDFLARE_API_TOKEN }}'
HEAD = 'name: x\non:\n  workflow_dispatch:\n'
JOB = '    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n        env:\n          V: ' + READ + '\n'
workflow_env = HEAD + 'env:\n  V: ' + READ + '\njobs:\n  go:\n' + JOB
quoted_key = HEAD + "jobs:\n  'go':\n" + JOB
for label, body, word in (
    ('workflow-level env reads the token', workflow_env, 'outside a job'),
    ('quoted job key reads the token', quoted_key, 'does not read'),
):
    folder = fresh(f'new-workflow-{label.split()[0]}')
    (folder / 'extra.yml').write_text(body, encoding='utf-8')
    code, text = run(folder)
    rows.append((f'extra.yml {label}', code, 'HOLDS' if code != 0 and word in text else 'BROKEN', text))

# A new workflow that reads the token and carries the block, but is not in the list of jobs the check expects.
folder = fresh('new-workflow-with-block')
(folder / 'extra.yml').write_text(
    'name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    runs-on: ubuntu-latest\n' + BLOCK + '    steps:\n      - run: echo\n'
    '        env:\n          V: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
    encoding='utf-8',
)
code, text = run(folder)
rows.append(('extra.yml go: new job with the block is not listed', code, 'HOLDS' if code != 0 and 'extra.yml:go' in text else 'BROKEN', text))

(OUT / 'controls-output.tsv').write_text(
    ''.join(f'{label}\trc={code}\t{verdict}\t{text}\n' for label, code, verdict, text in rows),
    encoding='utf-8',
)
held = sum(1 for row in rows if row[2] == 'HOLDS')
print(f'SUMMARY controls_held={held} of {len(rows)}')
sys.exit(0 if held == len(rows) else 1)
