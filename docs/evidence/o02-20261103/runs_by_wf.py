"""Approximate runner minutes per workflow over a created-date range, from run start to
last update rounded up to a whole minute (no per-job calls; an upper bound for one-job runs).
Usage: python3 runs_by_wf.py 2026-10-01..2026-10-12"""
import json
import math
import subprocess
import sys
from collections import defaultdict
from datetime import datetime

REPO = "jihune/yukemuri-script-runner"
rng = sys.argv[1]


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


mins = defaultdict(int)
count = defaultdict(int)
page = 1
total = None
while True:
    out = subprocess.run(["gh", "api", f"repos/{REPO}/actions/runs?created={rng}&per_page=100&page={page}"],
                         capture_output=True, encoding="utf-8", check=True)
    d = json.loads(out.stdout)
    total = d["total_count"]
    for r in d["workflow_runs"]:
        name = r["path"].split("/")[-1]
        count[name] += 1
        if r.get("run_started_at") and r.get("updated_at") and r.get("conclusion") not in (None, "skipped"):
            secs = (ts(r["updated_at"]) - ts(r["run_started_at"])).total_seconds()
            mins[name] += max(1, math.ceil(secs / 60))
    if len(d["workflow_runs"]) < 100:
        break
    page += 1
seen = sum(count.values())
print(f"range={rng} total_count={total} seen={seen} {'COMPLETE' if seen == total else 'INCOMPLETE'}")
for n in sorted(mins, key=lambda k: -mins[k]):
    print(f"{n}: runs={count[n]} approx_min={mins[n]}")
print(f"SUM approx_min={sum(mins.values())}")
