import csv
import sys
from datetime import datetime, timedelta
from itertools import pairwise
from statistics import median

# usage: slot_gaps_hourly.py <catalog runs tsv> <start iso> <end iso>
# The TSV has run_id, event, created_at, conclusion, job_seconds (one row per run).
# cron '37 * * * *' (runner PR #14). GitHub does not say which slot a late run
# came from, so a run is counted on its UTC day and gaps are measured between runs.


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


with open(sys.argv[1], encoding='utf-8') as f:
    rows = [r for r in csv.DictReader(f, delimiter='\t')]
start, end = ts(sys.argv[2]), ts(sys.argv[3])
rows = [r for r in rows if start <= ts(r['created_at']) < end]
sched = sorted(ts(r['created_at']) for r in rows if r['event'] == 'schedule')
manual = sorted(ts(r['created_at']) for r in rows if r['event'] != 'schedule')
print('window', start.isoformat(), '->', end.isoformat())
print('runs', len(rows), 'schedule', len(sched), 'other', len(manual),
      'not success', sum(r['conclusion'] != 'success' for r in rows))

day = start
while day < end:
    nxt = min(day + timedelta(days=1), end)
    slots = 0
    t = day.replace(minute=37, second=0)
    while t < nxt:
        slots += t >= day
        t += timedelta(hours=1)
    s = [x for x in sched if day <= x < nxt]
    m = [x for x in manual if day <= x < nxt]
    print(day.strftime('%m-%dT%H:%M'), '->', nxt.strftime('%m-%dT%H:%M'),
          'slots', slots, 'schedule', len(s), 'other', len(m),
          'schedule at', ' '.join(x.strftime('%H:%M:%S') for x in s),
          '| other at', ' '.join(x.strftime('%H:%M:%S') for x in m))
    day = nxt

gaps = [((b - a).total_seconds() / 3600, a, b) for a, b in pairwise([start] + sched + [end])]
hours = [g[0] for g in gaps[1:-1]]
print('schedule gaps h min/median/max', round(min(hours), 2), round(median(hours), 2), round(max(hours), 2))
for h, a, b in sorted(gaps, reverse=True)[:8]:
    print('gap_h', round(h, 2), a.strftime('%m-%dT%H:%M:%S'), '->', b.strftime('%m-%dT%H:%M:%S'))
secs = [int(r['job_seconds']) for r in rows if r['job_seconds']]
print('job seconds min/max', min(secs), max(secs), 'jobs', len(secs),
      'minutes rounded up per job', sum(-(-s // 60) for s in secs))
