"""Pair each collect-spare.yml schedule run with the collect.yml run it made (created within 60 s),
its collect job minutes and any other collect run in flight then; public GitHub API only.
Usage: python3 spare-pairs.py > spare-pairs.out (11-17T00:00Z..11-20T01:00Z)"""

import json
import urllib.request
from datetime import datetime, timedelta


def get(u):
    with urllib.request.urlopen(u) as r:
        return json.loads(r.read().decode("utf-8"))


ts = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
B = "https://api.github.com/repos/jihune/yukemuri/actions/workflows/"
spare = [
    r
    for r in get(B + "collect-spare.yml/runs?per_page=100")["workflow_runs"]
    if r["event"] == "schedule"
]
coll = get(
    B
    + "collect.yml/runs?per_page=100&created=2026-11-17T00:00:00Z..2026-11-20T01:00:00Z"
)["workflow_runs"]
for s in sorted(spare, key=lambda r: r["created_at"]):
    t = ts(s["created_at"])
    made = [
        c
        for c in coll
        if timedelta(0) <= ts(c["created_at"]) - t <= timedelta(seconds=60)
    ]
    for c in made:
        ct = ts(c["created_at"])
        inflight = [
            o["id"]
            for o in coll
            if o["id"] != c["id"]
            and ts(o["created_at"]) < ct
            and ts(o["updated_at"]) > ct
        ]
        jobs = get(
            f"https://api.github.com/repos/jihune/yukemuri/actions/runs/{c['id']}/jobs"
        )["jobs"]
        cj = next(j for j in jobs if j["name"] == "collect")
        d = (ts(cj["completed_at"]) - ts(cj["started_at"])).total_seconds() / 60
        print(
            s["id"],
            s["created_at"],
            "->",
            c["id"],
            c["created_at"],
            c["conclusion"],
            "collect_job_min",
            round(d, 1),
            "job_start",
            cj["started_at"],
            "other_in_flight",
            inflight,
        )
    if not made:
        print(s["id"], s["created_at"], "-> no collect run within 60s")
