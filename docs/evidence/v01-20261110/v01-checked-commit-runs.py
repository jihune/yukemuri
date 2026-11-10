"""V01-12: in the snapshot deploy a gentle collection calls, did scripts/checked-commit.mjs let the
run skip the full checks? Public GitHub API only (no token): the last successful gentle runs of
collect.yml, the step times of their 'snapshot / deploy' job, and the push runs on main HEAD.
Run from anywhere: python3 docs/evidence/v01-20261110/v01-checked-commit-runs.py [how many runs]"""
import datetime, json, sys, urllib.request
API = 'https://api.github.com/repos/jihune/yukemuri'
get = lambda path: json.load(urllib.request.urlopen(API + path, timeout=30))
at = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
wanted = int(sys.argv[1]) if len(sys.argv) > 1 else 5
runs = [r for r in get('/actions/workflows/collect.yml/runs?status=success&per_page=30')['workflow_runs'] if r['display_title'] == 'Yukemuri collection (gentle)']
seen = full = 0
for run in runs:
    for job in get(f"/actions/runs/{run['id']}/jobs?per_page=30")['jobs']:
        if job['name'] != 'snapshot / deploy':
            continue
        steps = {s['name']: s for s in job['steps']}
        check = next((s for n, s in steps.items() if 'cloud-check.py --full' in n), None)
        seconds = lambda s: int((at(s['completed_at']) - at(s['started_at'])).total_seconds()) if s and s.get('started_at') and s.get('completed_at') else 0
        ran = bool(check) and check['conclusion'] == 'success'
        seen += 1; full += ran
        print(f"run {run['id']} {run['created_at']} commit {run['head_sha'][:7]}: deploy job {seconds(job)} s, full checks {'ran ' + str(seconds(check)) + ' s' if ran else 'skipped'}")
    if seen >= wanted:
        break
print(f'snapshot deploys looked at: {seen}, with the full checks run again: {full}')
head = get('/commits/main')['sha']
pushes = get(f'/actions/runs?head_sha={head}&event=push&per_page=20')['workflow_runs']
print(f"main HEAD {head[:7]}: push runs {[(r['path'], r['conclusion']) for r in pushes]}")
