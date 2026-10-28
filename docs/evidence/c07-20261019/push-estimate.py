# C07 plan 3: how many main push deploys since a date changed no snapshot input,
# so their snapshot build could have published the site's snapshot again.
# A push deploys when it changes a path outside deploy.yml's paths-ignore and
# not data/lifecycle-official.json (lifecycle.yml deploys that one). Inputs are
# this checkout's snapshotInputs() (snapshot-inputs.mjs), counted two ways:
# "lower" also counts every lib/ file as an input (a file the builder did not
# import then may have been imported later), "today" counts only the listed ones.
# Usage: python3 docs/evidence/c07-20261019/push-estimate.py 2026-10-12 > push-estimate.json
import fnmatch
import json
import subprocess
import sys

SINCE = sys.argv[1]
IGNORE = ['*.md', 'docs/*', 'archives/*', 'data/lifecycle-official.json']


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, encoding='utf-8', check=True).stdout


inputs = set(json.loads(run('node', 'docs/evidence/c07-20261019/snapshot-inputs.mjs'))['files'])
rows = []
for line in run('git', 'log', '--first-parent', '--format=%H %cI %s', '--since=' + SINCE, 'origin/main').splitlines():
    sha, when, subject = line.split(' ', 2)
    paths = [p for p in run('git', 'diff', '--name-only', sha + '^1', sha).splitlines() if p]
    if 'data/lifecycle-official.json' in paths or all(any(fnmatch.fnmatch(p, g) for g in IGNORE) for p in paths):
        continue
    today = sorted(p for p in paths if p in inputs)
    lower = sorted(set(today) | {p for p in paths if p.startswith('lib/')})
    rows.append({'sha': sha[:7], 'committed': when, 'subject': subject[:80], 'inputsToday': today, 'inputsLower': lower})
print(json.dumps({
    'since': SINCE,
    'pushDeploys': len(rows),
    'reuseLower': sum(not r['inputsLower'] for r in rows),
    'reuseToday': sum(not r['inputsToday'] for r in rows),
    'rows': rows,
}, ensure_ascii=False, indent=1))
