"""Sum billable-ish minutes (each job rounded up to a whole minute) per workflow per UTC day
for jihune/yukemuri-script-runner, using gh api. Usage: python3 minutes.py 2026-10-31 2026-11-02"""
import json
import math
import subprocess
import sys
from collections import defaultdict
from datetime import datetime

REPO = "jihune/yukemuri-script-runner"


def gh(path):
    out = subprocess.run(["gh", "api", path], capture_output=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


days = sys.argv[1:]
total = defaultdict(lambda: defaultdict(int))
runs_n = defaultdict(lambda: defaultdict(int))
for day in days:
    page = 1
    while True:
        d = gh(f"repos/{REPO}/actions/runs?created={day}&per_page=100&page={page}")
        runs = d["workflow_runs"]
        for r in runs:
            name = r["path"].split("/")[-1]
            runs_n[day][name] += 1
            jobs = gh(f"repos/{REPO}/actions/runs/{r['id']}/jobs?per_page=100")["jobs"]
            for j in jobs:
                if j.get("started_at") and j.get("completed_at") and j.get("conclusion") != "skipped":
                    secs = (ts(j["completed_at"]) - ts(j["started_at"])).total_seconds()
                    total[day][name] += max(1, math.ceil(secs / 60))
        if len(runs) < 100:
            break
        page += 1

names = sorted({n for d in total.values() for n in d} | {n for d in runs_n.values() for n in d})
print("day," + ",".join(names) + ",SUM")
for day in days:
    row = [f"{runs_n[day][n]}r/{total[day][n]}m" for n in names]
    print(day + "," + ",".join(row) + f",{sum(total[day].values())}m")
