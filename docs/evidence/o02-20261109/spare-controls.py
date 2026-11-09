# O02 control for scripts/check-collect-workflow.mjs: copies of the repository's workflow files and
# scripts in a temporary folder, each with one deliberate defect in collect-spare.yml (or a cron in
# another workflow). The check must pass on the untouched copy and fail on every broken one, with the
# reason the case names. Run from anywhere: python3 -I docs/evidence/o02-20261109/spare-controls.py
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CRON = "    - cron: '37 * * * *'\n"

# (label, workflow file, text to break, replacement, text the failure must contain)
CASES = [
    ('cron missing', 'collect-spare.yml', CRON, '', 'hourly cron'),
    ('actions: write missing', 'collect-spare.yml', '      actions: write\n', '', 'actions: write'),
    ('calls collect-chain.yml', 'collect-spare.yml', 'gh workflow run collect.yml', 'gh workflow run collect-chain.yml', 'one dispatch'),
    ('calls deploy.yml', 'collect-spare.yml', 'gh workflow run collect.yml', 'gh workflow run deploy.yml', 'one dispatch'),
    ('mode check-access', 'collect-spare.yml', 'mode=gentle', 'mode=check-access', 'one dispatch'),
    ('another ref', 'collect-spare.yml', '--ref main', '--ref feature', 'one dispatch'),
    ('a checkout added', 'collect-spare.yml', '    steps:\n', '    steps:\n      - uses: actions/checkout@v7\n', 'checkout'),
    ('a schedule in collect.yml', 'collect.yml', '\non:\n', '\non:\n  schedule:\n' + CRON, 'no schedule'),
    ('a cron in deploy.yml', 'deploy.yml', '\non:\n', '\non:\n  schedule:\n' + CRON, 'only the watch and the spare have a schedule'),
]


def run_check(folder):
    done = subprocess.run(['node', 'scripts/check-collect-workflow.mjs'], cwd=folder, capture_output=True, encoding='utf-8', check=False)
    return done.returncode, done.stdout + done.stderr


def first_error(out):
    return next((line for line in out.splitlines() if 'Error' in line), out[:110])[:150]


results = []
with tempfile.TemporaryDirectory(prefix='o02-spare-controls-') as scratch:
    base = Path(scratch)

    def fresh_copy():
        folder = base / 'copy'
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir()
        shutil.copytree(REPO / '.github', folder / '.github')
        shutil.copytree(REPO / 'scripts', folder / 'scripts')
        shutil.copy(REPO / 'cloudflare-deploy.json', folder / 'cloudflare-deploy.json')
        return folder

    folder = fresh_copy()
    rc, out = run_check(folder)
    results.append(('untouched copy', rc == 0 and 'Collection workflows passed' in out, rc, out[:110]))
    for label, name, old, new, reason in CASES:
        folder = fresh_copy()
        path = folder / '.github' / 'workflows' / name
        text = path.read_text(encoding='utf-8')
        assert old in text, label + ': the text to break is missing'
        path.write_text(text.replace(old, new, 1), encoding='utf-8')
        rc, out = run_check(folder)
        results.append((label, rc != 0 and reason in out, rc, first_error(out)))
bad = 0
for label, ok, rc, line in results:
    print(('PASS ' if ok else 'FAIL ') + label.ljust(28), 'rc=' + str(rc), line)
    bad += 0 if ok else 1
print('VERDICT', 'PASS' if bad == 0 else 'FAIL', f'{len(results) - bad} of {len(results)} as expected (the untouched copy passes, {len(CASES)} broken copies fail for the named reason)')
sys.exit(1 if bad else 0)
