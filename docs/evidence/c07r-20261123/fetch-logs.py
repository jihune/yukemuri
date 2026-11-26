# C07R: download the public Actions run lists and job logs that docs/C07R-20261123.md
# ("판정 규칙") reads. Public GET only (api.github.com), nothing from the production D1.
# Usage: python3 -I docs/evidence/c07r-20261123/fetch-logs.py <out dir> <first day> <last day>
# Writes <out dir>/manifest.json and <out dir>/logs/<run id>/<job id>.log.
import json
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

REPO = 'jihune/yukemuri'
OUT = Path(sys.argv[1])
FIRST, LAST = date.fromisoformat(sys.argv[2]), date.fromisoformat(sys.argv[3])
# collect.yml (gentle runs and their snapshot job), deploy.yml (push deploys), lifecycle.yml and the
# daily check of the next day (usage.yml, FIRST+1 .. LAST+1).
WORKFLOWS = ['collect.yml', 'deploy.yml', 'lifecycle.yml']


def get(path, dest=None):
    # -f: an HTTP error (rate limit, 404) fails here instead of leaving the error body as a log.
    cmd = ['curl', '-sf', '-m', '120', '-L', 'https://api.github.com' + path]
    if dest:
        cmd += ['-o', str(dest)]
    out = subprocess.run(cmd, capture_output=True, check=True)
    return out.stdout if not dest else None


def runs(workflow, day):
    page, found = 1, []
    while True:
        q = f'/repos/{REPO}/actions/workflows/{workflow}/runs?created={day}T00:00:00Z..{day}T23:59:59Z&per_page=100&page={page}'
        d = json.loads(get(q))
        found += d.get('workflow_runs', [])
        if len(found) >= d.get('total_count', 0) or not d.get('workflow_runs'):
            return found
        page += 1


def jobs(run_id):
    d = json.loads(get(f'/repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100'))
    return d.get('jobs', [])


manifest = {'runs': []}
day = FIRST
while day <= LAST + timedelta(days=1):
    names = WORKFLOWS if day <= LAST else []
    if day > FIRST:
        names = names + ['usage.yml']
    for wf in names:
        for r in runs(wf, day.isoformat()):
            rec = {'workflow': wf, 'run_id': r['id'], 'created_at': r['created_at'], 'event': r['event'],
                   'conclusion': r['conclusion'], 'title': r['display_title'], 'jobs': []}
            for j in jobs(r['id']):
                (OUT / 'logs' / str(r['id'])).mkdir(parents=True, exist_ok=True)
                log = OUT / 'logs' / str(r['id']) / f"{j['id']}.log"
                if j['status'] == 'completed' and j['conclusion'] != 'skipped':
                    get(f"/repos/{REPO}/actions/jobs/{j['id']}/logs", log)
                    # A job log starts with a timestamped line; anything else is not a log.
                    head = log.read_text(encoding='utf-8', errors='replace').lstrip('\ufeff')[:12]
                    if not re.match(r'\d{4}-\d\d-\d\dT', head):
                        raise SystemExit(f'not a job log: {log}')
                rec['jobs'].append({'job_id': j['id'], 'name': j['name'], 'conclusion': j['conclusion'],
                                    'started_at': j['started_at'], 'completed_at': j['completed_at'],
                                    'log_file': str(log.relative_to(OUT)) if log.exists() else None})
            manifest['runs'].append(rec)
    day += timedelta(days=1)
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(manifest['runs']), 'runs')
