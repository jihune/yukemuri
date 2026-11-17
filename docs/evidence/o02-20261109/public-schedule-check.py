import collections
import datetime as dt
import json
import urllib.request

API="https://api.github.com/repos/jihune/yukemuri/actions"
def get(url):
    with urllib.request.urlopen(url) as r: return json.load(r)
def ts(s): return dt.datetime.fromisoformat(s.replace('Z','+00:00'))
# (a) collect-watch.yml schedule runs since 11-03 vs cron 41 */6
runs=[]
for page in (1,2,3):
    d=get(f"{API}/workflows/collect-watch.yml/runs?per_page=100&page={page}&event=schedule")
    runs+=d['workflow_runs']
    if len(d['workflow_runs'])<100: break
since=dt.datetime(2026,11,3,tzinfo=dt.timezone.utc); now=dt.datetime(2026,11,17,0,15,tzinfo=dt.timezone.utc)
slots=[]; t=since.replace(hour=0,minute=41)
while t<now:
    slots.append(t); t+=dt.timedelta(hours=6)
created=sorted(ts(r['created_at']) for r in runs if ts(r['created_at'])>=since)
matched=[]; used=set()
for s in slots:
    c=[x for x in created if s<=x<s+dt.timedelta(hours=6) and x not in used]
    if c: used.add(c[0]); matched.append((s,(c[0]-s).total_seconds()/60))
delays=sorted(m[1] for m in matched)
med=delays[len(delays)//2] if delays else None
print(f"(a) collect-watch schedule slots={len(slots)} arrived={len(matched)} ratio={len(matched)/len(slots):.2f} delay_min median={med:.1f} max={max(delays):.1f} min={min(delays):.1f}")
# (b) usage.yml check job duration for recent runs, and gentle collect runs per UTC day
u=get(f"{API}/workflows/usage.yml/runs?per_page=10")['workflow_runs']
for r in u[:5]:
    jobs=get(f"{API}/runs/{r['id']}/jobs")['jobs']
    for j in jobs:
        if j['started_at'] and j['completed_at']:
            print(f"(b) usage {r['id']} {r['created_at']} job={j['name']} {(ts(j['completed_at'])-ts(j['started_at'])).total_seconds()/60:.1f}min {j['conclusion']}")
c=[]
for page in (1,2,3):
    d=get(f"{API}/workflows/collect.yml/runs?per_page=100&page={page}")
    c+=d['workflow_runs']
    if len(d['workflow_runs'])<100: break
per=collections.Counter(); last=collections.defaultdict(str)
for r in c:
    day=r['created_at'][:10]; per[day]+=1
    last[day] = max(last[day], r['created_at'])
for day in sorted(per)[-7:]: print(f"(b,c) collect.yml {day} runs={per[day]} last_created={last[day]}")
ch=get(f"{API}/workflows/collect-chain.yml/runs?per_page=30")['workflow_runs']
chl=collections.defaultdict(str)
for r in ch:
    d=r['created_at'][:10]
    chl[d] = max(chl[d], r['updated_at'])
for day in sorted(chl)[-7:]: print(f"(c) collect-chain {day} last_updated={chl[day]}")
