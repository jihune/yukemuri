import json
import sys
from datetime import datetime, timedelta, timezone
from itertools import pairwise

# usage: slot_gaps.py <collect runs json> <now iso>
with open(sys.argv[1], encoding='utf-8') as f:
    runs = json.load(f)['workflow_runs']
now = datetime.fromisoformat(sys.argv[2].replace('Z', '+00:00'))
start = datetime(2026, 10, 13, 9, 0, tzinfo=timezone.utc)  # first full day after the H01 switch


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


times = sorted(ts(r['created_at']) for r in runs if ts(r['created_at']) >= start)
# cron '53 */3 * * *': hours 0,3,...,21 at minute 53
slots = []
t = start.replace(minute=53)
while t.hour % 3:
    t += timedelta(hours=1)
while t <= now:
    slots.append(t)
    t += timedelta(hours=3)

# each run belongs to the latest slot at or before it
owner = {}
for r in times:
    s = max(x for x in slots if x <= r)
    owner.setdefault(s, []).append(r)
ran = [s for s in slots if s in owner]
missed = [s for s in slots if s not in owner]
delays = sorted((owner[s][0] - s).total_seconds() / 60 for s in ran)
print('window', start.isoformat(), '->', now.isoformat())
print('slots', len(slots), 'with_run', len(ran), 'without_run', len(missed),
      'share_run', round(len(ran) / len(slots), 3))
print('delay_min min/median/max', round(delays[0]), round(delays[len(delays) // 2]), round(delays[-1]))
print('runs_sharing_a_slot', sum(1 for s in ran if len(owner[s]) > 1))
gaps = [((b - a).total_seconds() / 3600, a, b) for a, b in pairwise(times)]
gaps.append(((now - times[-1]).total_seconds() / 3600, times[-1], now))
for h, a, b in sorted(gaps, reverse=True)[:6]:
    print('gap_h', round(h, 2), a.strftime('%m-%dT%H:%M'), '->', b.strftime('%m-%dT%H:%M'))
by_hour = {}
for s in slots:
    by_hour.setdefault(s.hour, [0, 0])
    by_hour[s.hour][0] += 1
    by_hour[s.hour][1] += s in owner
print('per_slot_hour run/total', {h: f'{v[1]}/{v[0]}' for h, v in sorted(by_hour.items())})
