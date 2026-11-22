"""Count how many hourly slots of the app's collect-spare.yml (cron 37 * * * *) got a schedule run,
from its merge (#291, 11-17T00:16Z) for 24 slots, using the public GitHub API only.
Usage: python3 spare-schedule-check.py [slots] > spare-schedule-check.out (24 slots by default;
72 for spare-schedule-check-3d.out)"""
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "https://api.github.com/repos/jihune/yukemuri/actions/workflows/collect-spare.yml/runs?per_page=100"
START = datetime(2026, 11, 17, 0, 37, tzinfo=timezone.utc)  # first slot after the merge
SLOTS = [START + timedelta(hours=i) for i in range(int(sys.argv[1]) if len(sys.argv) > 1 else 24)]
END = SLOTS[-1] + timedelta(hours=1)


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


with urllib.request.urlopen(URL) as resp:
    runs = json.loads(resp.read().decode("utf-8"))["workflow_runs"]

hit = set()
for r in sorted(runs, key=lambda r: r["created_at"]):
    t = ts(r["created_at"])
    if r["event"] != "schedule" or not START <= t < END:
        continue
    slot = max(s for s in SLOTS if s <= t)
    hit.add(slot)
    late = (t - slot).total_seconds() / 60
    print(f"run {r['id']} {r['created_at']} {r['conclusion']} slot {slot:%H:%M} late {late:.1f} min")
print(f"window {START:%m-%dT%H:%MZ}..{END:%m-%dT%H:%MZ} slots {len(SLOTS)} arrived {len(hit)} ratio {len(hit) / len(SLOTS):.3f}")
