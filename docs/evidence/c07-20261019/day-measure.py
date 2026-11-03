# C07 plans 2 and 5: what a UTC day of gentle collection read after plan 2 (#246,
# merged 2026-10-28T00:1xZ), from the GitHub Actions logs of that day.
# Usage: python3 -I docs/evidence/c07-20261019/day-measure.py <logs dir> > day-measure.json
# <logs dir> holds manifest.json and the job logs it names (collect.yml collect
# and snapshot jobs, usage.yml daily checks, deploy.yml and lifecycle.yml jobs).
#
# Verdict rules, written and committed before the first run on the logs
# (counting-discipline, harness 067575b). The numbers are not changed after.
# The last line printed to stderr is "VERDICT <C1> <C2> <C4> <C4-trip> <C4-lag> <C5> <P5>".
#
# C1 no count at the end of a run: every collect log since plan 2 that prints the
#    collector's {"processed": N, ...} line prints it without "coverage".
#    PASS when at least one such line exists and none has "coverage"; FAIL when one
#    has it; NONE when no line exists. Self-test first: a synthetic line with
#    "coverage" must count as one, a line without must not (else ERROR).
# C2 the deploy stores the run's count: every collect run whose snapshot job ran
#    record-coverage.mjs has exactly one {"recordedCoverage": {"day": D, ...}} line
#    and D is the UTC date its collect job completed. PASS / FAIL (list the runs).
# C3 the day (descriptive, no threshold): pages (done + retry + failed page lines),
#    the sum of pages= lines, snapshot builds ("Search snapshot <id>: ... rows
#    read") by count and rows, the day's account reads from the next day's daily
#    check, the snapshots' share of those reads and of the 5,000,000 free limit,
#    and reads per page. Compared with 2026-10-27 (1,035 pages, 9 snapshots
#    1,421,397 rows, 4,449,868 reads, 89.0%).
# C4 a run's own reads per page after plan 2 against plan 1 (B and C intervals,
#    2,276 and 2,215 rows per page, mean 2,245.5):
#    - span: from the first Size line of the day to the first Size line after the
#      last run that collected pages, when that Size line is before 19:00Z (the
#      runner's backup, 19:23Z, may follow); otherwise to the last run's own Size
#      line, without its pages. Reads in the span are the difference of the two
#      Size lines less every snapshot build that started in the span (collect,
#      push and lifecycle deploys). Pages are those of the runs whose Size line
#      starts the span or falls inside it, except the one that ends it.
#      A lag of the analytics only moves reads between neighbouring intervals, so
#      the span's sum is not changed by it except at its two ends.
#    - LOWER when every measured day's span gives fewer than 2,245.5 rows per page,
#      NOT_LOWER when every day gives 2,245.5 or more, MIXED otherwise.
#    - intervals: the same subtraction for each run that collected pages, from
#      its Size line to the first Size line after its snapshot job completed (a
#      0-page run that starts while it collects does not split it), each listed
#      with its Trip.com pages. C4-trip: TRIP_NOT_CAUSE when the median of
#      intervals with no Trip.com page is 2,245.5 or more rows per page,
#      TRIP_POSSIBLE when it is below and the median of intervals with Trip.com
#      pages is 2,245.5 or more, UNDECIDED otherwise (fewer than 3 intervals in
#      a group counts as UNDECIDED).
#      C4-lag: LAG_NOT_CAUSE when C4 is NOT_LOWER (the span is lag-robust),
#      LAG_POSSIBLE when C4 is LOWER and some single interval is 2,245.5 or more,
#      UNDECIDED otherwise.
# C5 the 90% line (cloudflare-free-tier section 5): per day, reads inside the
#    collection budget (up to its last Size line that allowed pages) and outside
#    it (everything after: the backup and any deploy). Outside is the day's reads
#    less the last Size line that allowed pages, less that run's own share
#    (its interval if measured, else the day's median interval) and its snapshot.
#    BELOW when 0.85 x 5,000,000 plus the largest day's outside reads is under
#    4,500,000 rows (90%), OVER otherwise.
# P5 plan 5 (defer the snapshot of runs the chain follows), assumption grid
#    before recommending (counting-discipline, harness 1d8809f):
#    - gained pages a day = (snapshots a day - snapshots under the option) x rows
#      per snapshot / rows per page. Options: every third run (ceil(n/3) builds,
#      the chain's last run included) and only the chain's last run (1 build for
#      the day's chain, plus 1 for a runner run before the chain opens).
#    - grid: rows per snapshot {146,500, 160,000, 180,000}; rows per page {the
#      lowest and highest day span of C4, 2,245.5}; snapshots a day {the lowest
#      and highest measured day}.
#    - WORTH_ASKING when every-third-run gains at least 10% of the lowest measured
#      day's pages in every grid cell, CONDITIONAL when only in some cells (the
#      cells are listed), NOT_WORTH when in none.
#    - backlog: the pending count of the first and last recordedCoverage line of
#      each day; when it falls by more than a seventh of itself a day, the gain is
#      short-lived and P5 is reported as NOT_WORTH whatever the grid says.
import json
import math
import re
import statistics
import sys
from datetime import datetime, timedelta
from pathlib import Path

LOGS = Path(sys.argv[1])
LIMIT = 5_000_000
PLAN1 = (2276 + 2215) / 2
JSON_LINE = re.compile(r'^(\d{4}-\d\d-\d\dT[\d:.]+)Z (\{.*\})\s*$')
STAMP = re.compile(r'^(\d{4}-\d\d-\d\dT[\d:.]+)Z ')
SIZE = re.compile(r'Z reason=today (\d+) rows written, (\d+) read')
PAGES = re.compile(r'Z pages=(\d+)\s*$')
SNAPSHOT = re.compile(r'^(\d{4}-\d\d-\d\dT[\d:.]+)Z Search snapshot ([0-9a-f]{16}): (\d+) hotels, (\d+) queries, (\d+) rows read(?:, (\d+)ms)?')


def build(m, **extra):
    # The build's line is printed when it ends; it started that many ms before.
    at = when(m[1])
    begun = at - timedelta(milliseconds=int(m[6] or 0))
    return {'at': m[1], 'startedAt': begun.isoformat(), 'id': m[2], 'rows': int(m[5]), **extra}


def when(text):
    return datetime.fromisoformat(text.rstrip('Z')[:26])


def has_coverage(line):
    d = json.loads(line)
    return 'processed' in d and 'coverage' in d


def read(rel):
    return (LOGS / rel).read_text(encoding='utf-8', errors='replace').splitlines() if rel else []


def collect_run(run):
    jobs = {j['name']: j for j in run['jobs']}
    out = {'id': run['run_id'], 'created': run['created_at'], 'pages': 0, 'trip': 0, 'status': {}, 'budget': None,
           'size': None, 'processed': None, 'coverage': False, 'rounds': None, 'state': None, 'snapshots': [], 'recorded': [],
           'collectEnd': jobs.get('collect', {}).get('completed_at'), 'snapshotEnd': None, 'recordStep': None}
    for line in read(jobs.get('collect', {}).get('log_file')):
        if m := SIZE.search(line):
            out['size'] = {'at': STAMP.match(line).group(1), 'written': int(m[1]), 'read': int(m[2])}
            out['reason'] = line.split('Z ', 1)[1]
        elif m := PAGES.search(line):
            out['budget'] = int(m[1])
        elif m := JSON_LINE.match(line):
            try:
                d = json.loads(m[2])
            except ValueError:
                continue
            if 'url' in d and 'status' in d and not d.get('sourceDiagnostic'):
                out['status'][d['status']] = out['status'].get(d['status'], 0) + 1
                out['pages'] += 1
                out['trip'] += 'trip.com' in d['url']
            elif 'processed' in d:
                out['processed'] = d['processed']
                out['coverage'] = has_coverage(m[2])
            elif 'rounds' in d:
                out['rounds'] = d
            elif 'state' in d and d['state'] != 'started':
                out['state'] = d['state']
    snap = jobs.get('snapshot / deploy')
    if snap:
        out['snapshotEnd'] = snap.get('completed_at')
        step = next((s for s in snap.get('steps', []) if 'record-coverage' in s['name']), None)
        out['recordStep'] = step and step['conclusion']
        for line in read(snap.get('log_file')):
            if m := SNAPSHOT.match(line):
                out['snapshots'].append(build(m, workflow='collect.yml', run=run['run_id']))
            elif '{"recordedCoverage"' in line:
                out['recorded'].append(json.loads(line.split('Z ', 1)[1])['recordedCoverage'])
    return out


def other_snapshots(runs):
    out = []
    for run in runs:
        for job in run['jobs']:
            for line in read(job.get('log_file')):
                if m := SNAPSHOT.match(line):
                    out.append(build(m, workflow=run['workflow'], run=run['run_id']))
    return out


def daily_checks(runs):
    # usage.yml check=true: '# 매일 점검(O03) — <date>(UTC)', then the usage table whose
    # header names '계정 D1 rowsRead'. A control run ('> 대조 입력') is not a measurement.
    out = {}
    for run in sorted(runs, key=lambda r: r['created_at']):
        lines = [line.split('Z ', 1)[1] if STAMP.match(line) else line for job in run['jobs'] for line in read(job.get('log_file'))]
        title = next((x for x in lines if x.startswith('# 매일 점검(O03) — ')), None)
        if not title or any(x.startswith('> 대조 입력') for x in lines):
            continue
        day = title.split('— ', 1)[1][:10]
        head = next(x for x in lines if '계정 D1 rowsRead' in x)
        cells = [c.strip() for c in head.strip('|').split('|')]
        row = next(x for x in lines if x.startswith('| ' + day + ' |'))
        values = dict(zip(cells, (c.strip() for c in row.strip('|').split('|')), strict=False))
        read_col = next(c for c in cells if c.startswith('계정 D1 rowsRead'))
        written_col = next(c for c in cells if c.startswith('계정 D1 rowsWritten'))
        verdict = next(x for x in lines if x.startswith(('**통과', '**실패')))
        out.setdefault(day, {'run': run['run_id'], 'read': int(values[read_col].split(' ')[0].replace(',', '')),
                             'written': int(values[written_col].split(' ')[0].replace(',', '')),
                             'verdict': verdict.strip('*').split('**')[0]})
    return out


def started(snapshot):
    return snapshot['startedAt']


def per_page(reads, pages):
    return round(reads / pages, 1) if pages else None


def measure(collects, others, checks):
    builds =sorted([s for r in collects for s in r['snapshots']] + others, key=started)
    days = sorted({r['size']['at'][:10] for r in collects if r['size']})
    out = {'days': {}, 'intervals': []}
    for day in days:
        runs = sorted((r for r in collects if r['size'] and r['size']['at'][:10] == day), key=lambda r: r['size']['at'])
        points = [(r['size']['at'], r['size']['read'], r['id']) for r in runs]
        paged = [r for r in runs if r['pages']]
        on_day = [s for s in builds if started(s)[:10] == day]

        def snap_rows(a, b):
            return sum(s['rows'] for s in builds if a <= started(s) < b)

        intervals = []
        for r in paged:
            after = r['snapshotEnd'] or r['collectEnd']
            nxt = next((p for p in points if p[0] > after.rstrip('Z')), None)
            if not nxt:
                continue
            reads = nxt[1] - r['size']['read'] - snap_rows(r['size']['at'], nxt[0])
            intervals.append({'day': day, 'run': r['id'], 'from': r['size']['at'], 'to': nxt[0], 'pages': r['pages'],
                              'trip': r['trip'], 'reads': reads, 'perPage': per_page(reads, r['pages']),
                              'mayHoldBackup': nxt[0][11:13] >= '19'})
        out['intervals'] += intervals
        span = None
        if paged and points:
            last = paged[-1]
            after = last['snapshotEnd'] or last['collectEnd']
            nxt = next((p for p in points if p[0] > after.rstrip('Z')), None)
            start = points[0]
            if nxt and nxt[0][11:13] < '19':
                end, inside = nxt, [r for r in paged if start[0] <= r['size']['at'] < nxt[0]]
            else:
                end = (last['size']['at'], last['size']['read'], last['id'])
                inside = [r for r in paged if start[0] <= r['size']['at'] < end[0]]
            pages = sum(r['pages'] for r in inside)
            reads = end[1] - start[1] - snap_rows(start[0], end[0])
            span = {'from': start[0], 'to': end[0], 'runs': len(inside), 'pages': pages, 'reads': reads,
                    'perPage': per_page(reads, pages)}
        total = checks.get(day)
        snaps = [s for s in on_day]
        collect_snaps = [s for s in snaps if s['workflow'] == 'collect.yml']
        pending = [rec['pending'] for r in runs for rec in r['recorded']]
        outside = None
        if total and paged:
            last = paged[-1]
            own = next((i['reads'] for i in intervals if i['run'] == last['id'] and not i['mayHoldBackup']), None)
            if own is None:
                own = statistics.median(i['reads'] for i in intervals) if intervals else 0
            outside = total['read'] - last['size']['read'] - own - sum(s['rows'] for s in last['snapshots'])
        out['days'][day] = {
            'runs': len(runs), 'pagedRuns': len(paged),
            'pages': sum(r['pages'] for r in runs), 'pagesBudgeted': sum(r['budget'] or 0 for r in runs),
            'pageStatus': {k: sum(r['status'].get(k, 0) for r in runs) for k in ('done', 'retry', 'failed')},
            'tripPages': sum(r['trip'] for r in runs),
            'snapshots': len(snaps), 'snapshotRows': sum(s['rows'] for s in snaps),
            'collectSnapshots': len(collect_snaps), 'collectSnapshotRows': sum(s['rows'] for s in collect_snaps),
            'otherSnapshots': [s for s in snaps if s['workflow'] != 'collect.yml'],
            'accountRead': total and total['read'], 'accountWritten': total and total['written'],
            'checkVerdict': total and total['verdict'],
            'snapshotShareOfReads': total and round(sum(s['rows'] for s in snaps) / total['read'], 4),
            'snapshotShareOfLimit': round(sum(s['rows'] for s in snaps) / LIMIT, 4),
            'readsPerPage': total and per_page(total['read'], sum(r['pages'] for r in runs)),
            'lastBudgetRead': paged and paged[-1]['size']['read'],
            'outside': outside, 'span': span,
            'pendingFirstLast': pending and [pending[0], pending[-1]],
            'firstPagedRunActor': paged and paged[0]['actor'],
        }
    return out


def verdicts(collects, m):
    v = {}
    lines = [r for r in collects if r['processed'] is not None]
    v['C1'] = 'NONE' if not lines else 'FAIL' if any(r['coverage'] for r in lines) else 'PASS'
    bad = []
    for r in collects:
        if r['recordStep'] == 'success':
            day = (r['collectEnd'] or '')[:10]
            if len(r['recorded']) != 1 or r['recorded'][0]['day'] != day:
                bad.append(r['id'])
    v['C2'] = 'FAIL' if bad else 'PASS'
    v['C2bad'] = bad
    spans = [d['span']['perPage'] for d in m['days'].values() if d['span'] and d['span']['perPage'] is not None]
    v['C4'] = ('NONE' if not spans else 'LOWER' if all(x < PLAN1 for x in spans)
               else 'NOT_LOWER' if all(x >= PLAN1 for x in spans) else 'MIXED')
    clean = [i for i in m['intervals'] if not i['mayHoldBackup'] and i['perPage'] is not None]
    no_trip = [i['perPage'] for i in clean if i['trip'] == 0]
    trip = [i['perPage'] for i in clean if i['trip'] > 0]
    v['C4medians'] = {'noTrip': no_trip and statistics.median(no_trip), 'nNoTrip': len(no_trip),
                      'trip': trip and statistics.median(trip), 'nTrip': len(trip)}
    if len(no_trip) < 3:
        v['C4trip'] = 'UNDECIDED'
    elif statistics.median(no_trip) >= PLAN1:
        v['C4trip'] = 'TRIP_NOT_CAUSE'
    elif len(trip) >= 3 and statistics.median(trip) >= PLAN1:
        v['C4trip'] = 'TRIP_POSSIBLE'
    else:
        v['C4trip'] = 'UNDECIDED'
    v['C4lag'] = ('LAG_NOT_CAUSE' if v['C4'] == 'NOT_LOWER'
                  else 'LAG_POSSIBLE' if v['C4'] == 'LOWER' and any(i['perPage'] >= PLAN1 for i in clean) else 'UNDECIDED')
    outs = [d['outside'] for d in m['days'].values() if d['outside'] is not None]
    v['C5'] = 'NONE' if not outs else 'BELOW' if 0.85 * LIMIT + max(outs) < 0.9 * LIMIT else 'OVER'
    v['C5maxOutside'] = outs and max(outs)
    # P5 grid.
    days = [d for d in m['days'].values() if d['pagedRuns']]
    counts = sorted({d['collectSnapshots'] for d in days})
    lowest = min(d['pages'] for d in days) if days else 0
    grid = []
    for rows in (146_500, 160_000, 180_000):
        for page in sorted({min(spans), max(spans), PLAN1} if spans else {PLAN1}):
            for n in {counts[0], counts[-1]} if counts else set():
                every3 = (n - math.ceil(n / 3)) * rows / page
                for d in days:
                    if d['collectSnapshots'] == n:
                        chain_builds = 1 + (d['firstPagedRunActor'] != 'github-actions[bot]')
                        break
                last_only = max(n - chain_builds, 0) * rows / page
                grid.append({'rowsPerSnapshot': rows, 'rowsPerPage': page, 'snapshotsADay': n,
                             'every3Pages': round(every3), 'chainEndPages': round(last_only),
                             'every3Share': round(every3 / lowest, 3) if lowest else None})
    passing = [g for g in grid if lowest and g['every3Pages'] >= 0.1 * lowest]
    v['P5'] = 'NONE' if not grid else 'WORTH_ASKING' if len(passing) == len(grid) else 'CONDITIONAL' if passing else 'NOT_WORTH'
    drains = []
    for d in days:
        if d['pendingFirstLast']:
            first, last = d['pendingFirstLast']
            drains.append(first - last > first / 7)
    if any(drains):
        v['P5'] = 'NOT_WORTH'
    v['P5grid'] = grid
    v['P5lowestDayPages'] = lowest
    return v


def main():
    if not has_coverage('{"processed": 1, "coverage": {}}') or has_coverage('{"processed": 1, "readbackId": "x"}'):
        print('VERDICT ERROR self-test', file=sys.stderr)
        sys.exit(2)
    manifest = json.loads((LOGS / 'manifest.json').read_text(encoding='utf-8'))
    collects = []
    for run in (r for r in manifest if r['workflow'] == 'collect.yml'):
        c = collect_run(run)
        c['actor'] = run.get('triggering_actor') or run.get('actor')
        collects.append(c)
    collects.sort(key=lambda r: r['created'])
    others = other_snapshots([r for r in manifest if r['workflow'] in ('deploy.yml', 'lifecycle.yml')])
    checks =daily_checks([r for r in manifest if r['workflow'] == 'usage.yml'])
    m = measure(collects, others, checks)
    v = verdicts(collects, m)
    json.dump({'runs': collects, **m, 'verdicts': v}, sys.stdout, ensure_ascii=False, indent=1)
    print(f"VERDICT {v['C1']} {v['C2']} {v['C4']} {v['C4trip']} {v['C4lag']} {v['C5']} {v['P5']}", file=sys.stderr)


if __name__ == '__main__':
    main()
