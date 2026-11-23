# C07R: what one page of a gentle collection read from the account's D1, from the
# GitHub Actions logs of 2026-11-16 .. 2026-11-22. The rules are in docs/C07R-20261123.md
# ("판정 규칙"), committed (1a45b05) before this script ran on the logs.
# Usage: python3 -I docs/evidence/c07r-20261123/measure-reads.py <logs dir> [<first day> <last day> [<readsPerPage now>]] > measure-reads.json
# The days default to 2026-11-16 .. 2026-11-22 and the value now to 4600 (this PR's measure). A later measure on
# other days passes them (and fetch-logs.py the same days); with fewer than 10 intervals V1 is ERROR but A is printed.
# <logs dir> is what fetch-logs.py wrote (manifest.json and logs/<run>/<job>.log).
# The last line printed to stderr is "VERDICT V1=<..> V2=<..> ..." .
import json
import math
import re
import statistics
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

OLD_READS_PER_PAGE = int(sys.argv[4]) if len(sys.argv) > 4 else 4600
OLD_SNAPSHOT_READS = 168000
FIRST_DAY, LAST_DAY = (sys.argv[2], sys.argv[3]) if len(sys.argv) > 3 else ('2026-11-16', '2026-11-22')
ALL_DAYS = [(date.fromisoformat(FIRST_DAY) + timedelta(days=n)).isoformat() for n in range((date.fromisoformat(LAST_DAY) - date.fromisoformat(FIRST_DAY)).days + 1)]
LAST_DAYS = ALL_DAYS[-3:]
MIN_PAGES = 20
MAX_GAP = timedelta(minutes=30)
STAMP = re.compile(r'^﻿?(\d{4}-\d\d-\d\dT[\d:.]+)Z (.*)$')
SIZE = re.compile(r'^reason=today (\d+) rows written, (\d+) read')
SNAPSHOT = re.compile(r'^Search snapshot ([0-9a-f]{16}): (\d+) hotels, (published again from \S+ \(same inputs\), )?(\d+) queries, (\d+|unreported) rows read, (\d+)ms')
PAGE_STATUSES = ('done', 'retry', 'failed')


def when(text):
    return datetime.fromisoformat(text.rstrip('Z')[:26])


def parse_collect_log(lines):
    """Size line (time, written, read) and the page statuses of one collect job log."""
    size, counts = None, {}
    for raw in lines:
        m = STAMP.match(raw)
        if not m:
            continue
        stamp, text = m[1], m[2]
        if size is None and (s := SIZE.match(text)):
            size = {'at': stamp, 'written': int(s[1]), 'read': int(s[2])}
        elif text.startswith('{'):
            try:
                o = json.loads(text)
            except ValueError:
                continue
            if isinstance(o, dict) and isinstance(o.get('url'), str) and isinstance(o.get('status'), str) and not o.get('sourceDiagnostic'):
                counts[o['status']] = counts.get(o['status'], 0) + 1
    return size, counts


def parse_snapshots(lines):
    out = []
    for raw in lines:
        m = STAMP.match(raw)
        if not m:
            continue
        s = SNAPSHOT.match(m[2])
        if s:
            ended = when(m[1])
            out.append({'ended': m[1], 'started': (ended - timedelta(milliseconds=int(s[6]))).isoformat(), 'id': s[1],
                        'rewrite': bool(s[3]), 'rows': None if s[5] == 'unreported' else int(s[5])})
    return out


def usage_reads(lines):
    """{UTC day: account rowsRead} from the daily check table (the 9th cell of a dated row)."""
    out = {}
    for raw in lines:
        m = STAMP.match(raw)
        if not m:
            continue
        cells = [c.strip() for c in m[2].split('|')]
        if m[2].startswith('| 20') and len(cells) > 9 and re.match(r'^\d{4}-\d\d-\d\d$', cells[1]):
            out[cells[1]] = int(cells[9].split(' ')[0].replace(',', ''))
    return out


def decide_v1(values, baseline=OLD_READS_PER_PAGE):
    """V1 on the per-page reads of the intervals of the last days (docs/C07R-20261123.md)."""
    if not values:
        return 'ERROR', None
    a, med = max(values), statistics.median(values)
    if a <= baseline:
        return 'KEEP', baseline
    if a > 2 * med:
        return 'OUTLIER', None
    return 'RAISE', math.ceil(a / 100) * 100


def decide_v2(nmax, old=OLD_SNAPSHOT_READS):
    if nmax is None:
        return 'ERROR', None
    if nmax * 1.05 <= old:
        return 'KEEP', old
    return 'RAISE', math.ceil(nmax * 1.05 / 1000) * 1000


def self_test():
    assert decide_v1([4601, 3000, 3500, 4000], 4600) == ('RAISE', 4700), decide_v1([4601, 3000, 3500, 4000], 4600)
    assert decide_v1([4600, 3000, 3500, 4000], 4600) == ('KEEP', 4600)
    assert decide_v1([3000, 3100, 3200, 9000], 4600) == ('OUTLIER', None)
    assert decide_v1([], 4600) == ('ERROR', None)
    assert decide_v2(160000) == ('KEEP', 168000) and decide_v2(160001) == ('RAISE', 169000)
    size, counts = parse_collect_log(['2026-11-16T00:47:40.1Z reason=today 5 rows written, 224105 read; writes allow 1 pages',
                                      '2026-11-16T00:48:00.0Z {"url": "a", "status": "done"}',
                                      '2026-11-16T00:48:01.0Z {"url": "b", "status": "retry"}',
                                      '2026-11-16T00:48:02.0Z {"url": "c", "status": "done", "sourceDiagnostic": 1}',
                                      '2026-11-16T00:48:03.0Z {"processed": 3}'])
    assert size == {'at': '2026-11-16T00:47:40.1', 'written': 5, 'read': 224105} and counts == {'done': 1, 'retry': 1}, (size, counts)
    snaps = parse_snapshots(['2026-11-16T05:15:10.2Z Search snapshot 58a3e451590b0991: 26583 hotels, 207 queries, 155453 rows read, 187873ms',
                             '2026-11-16T00:25:47.8Z Search snapshot 55314e8cee8f0199: 26560 hotels, published again from https://x.example (same inputs), 1 queries, 10 rows read, 69968ms'])
    assert [(s['rewrite'], s['rows']) for s in snaps] == [(False, 155453), (True, 10)], snaps


def read_lines(root, rel):
    return (root / rel).read_text(encoding='utf-8', errors='replace').splitlines() if rel else []


def main(root):
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    runs, snapshots, reads_by_day = [], [], {}
    for r in manifest['runs']:
        jobs = {j['name']: j for j in r['jobs']}
        if r['workflow'] == 'usage.yml':
            for j in r['jobs']:
                reads_by_day.update(usage_reads(read_lines(root, j['log_file'])))
            continue
        for j in r['jobs']:
            for s in parse_snapshots(read_lines(root, j['log_file'])):
                snapshots.append({**s, 'workflow': r['workflow'], 'run_id': r['run_id']})
        if r['workflow'] != 'collect.yml' or 'collect' not in jobs:
            continue
        size, counts = parse_collect_log(read_lines(root, jobs['collect']['log_file']))
        if not size:
            continue
        snap = jobs.get('snapshot / deploy')
        end = snap['completed_at'] if snap and snap['conclusion'] == 'success' else jobs['collect']['completed_at']
        runs.append({'run_id': r['run_id'], 'size_at': size['at'], 'read': size['read'], 'written': size['written'],
                     'pages': sum(counts.get(k, 0) for k in PAGE_STATUSES), 'statuses': counts, 'end': end})
    runs.sort(key=lambda x: x['size_at'])
    for s in snapshots:
        s['day'] = s['started'][:10]

    intervals, excluded = [], []
    for i, run in enumerate(runs):
        if run['pages'] < 1:
            continue
        day, start = run['size_at'][:10], when(run['size_at'])
        if day not in ALL_DAYS:
            continue
        end = when(run['end'])
        nxt = next((x for x in runs if when(x['size_at']) > end), None)
        base = {'run_id': run['run_id'], 'day': day, 'size_at': run['size_at'], 'pages': run['pages']}
        reason = None
        if not nxt or nxt['size_at'][:10] != day:
            reason = 'no next Size line on the same UTC day'
        elif when(nxt['size_at']) - end > MAX_GAP:
            reason = 'next Size line more than 30 minutes after the run ended'
        elif run['pages'] < MIN_PAGES:
            reason = f'fewer than {MIN_PAGES} pages'
        elif any(x['pages'] > 0 and start < when(x['size_at']) < when(nxt['size_at']) for x in runs if x is not run):
            reason = 'another run collected pages inside the interval'
        if reason:
            excluded.append({**base, 'reason': reason})
            continue
        stop = when(nxt['size_at'])
        inside = [s for s in snapshots if start <= when(s['started']) < stop]
        if any(s['rows'] is None for s in inside):
            excluded.append({**base, 'reason': 'a snapshot line without a row count'})
            continue
        snap_rows = sum(s['rows'] for s in inside)
        delta = nxt['read'] - run['read']
        intervals.append({**base, 'next_size_at': nxt['size_at'], 'delta_read': delta, 'snapshots': [{'id': s['id'], 'rows': s['rows'], 'rewrite': s['rewrite'], 'workflow': s['workflow']} for s in inside],
                          'snapshot_rows': snap_rows, 'reads_per_page': (delta - snap_rows) / run['pages'],
                          'old_estimate': run['pages'] * OLD_READS_PER_PAGE + OLD_SNAPSHOT_READS + 100,
                          'actual_over_old_estimate': (delta) / (run['pages'] * OLD_READS_PER_PAGE + OLD_SNAPSHOT_READS + 100)})

    # V1 and V2 on the last days, widened to 5 and 7 days when fewer than 10 intervals.
    def v1_for(pool):
        days = LAST_DAYS
        for n in (3, 5, len(ALL_DAYS)):
            days = ALL_DAYS[-n:]
            used = [x for x in pool if x['day'] in days]
            if len(used) >= 10:
                break
        values = [x['reads_per_page'] for x in used]
        verdict, value = ('ERROR', None) if len(pool) < 10 else decide_v1(values)
        return {'verdict': verdict, 'readsPerPage': value, 'A': max(values) if values else None, 'median': statistics.median(values) if values else None,
                'n': len(values), 'days': [days[0], days[-1]], 'qualifying_all_days': len(pool)}, days

    def has_backup(x):
        # Stage 2 (docs/C07R-20261123.md): the daily backup starts at 00:13Z.
        a, b = when(x['size_at']), when(x['next_size_at'])
        return a < when(x['day'] + 'T00:14:00') and b > when(x['day'] + 'T00:13:00')

    backup_excluded = [x for x in intervals if has_backup(x)]
    stage2_pool = [x for x in intervals if not has_backup(x)]
    v1_stage1, widened = v1_for(intervals)
    v1_stage2, widened2 = v1_for(stage2_pool)
    v1, new_rpp = v1_stage2['verdict'], v1_stage2['readsPerPage']
    widened = widened2
    values = [x['reads_per_page'] for x in stage2_pool if x['day'] in widened]
    builds = [s for s in snapshots if not s['rewrite'] and s['day'] in widened]
    rewrites = [s for s in snapshots if s['rewrite'] and s['day'] in ALL_DAYS]
    nmax = max((s['rows'] for s in builds if s['rows'] is not None), default=None)
    v2, new_snap = decide_v2(nmax)
    flag = [s for s in rewrites if s['rows'] is None or s['rows'] > 1000]

    per_day = {}
    for d in ALL_DAYS:
        xs = [x for x in intervals if x['day'] == d]
        v = [x['reads_per_page'] for x in xs]
        day_runs = [x for x in runs if x['size_at'][:10] == d]
        per_day[d] = {'size_lines': len(day_runs), 'runs_with_pages': sum(1 for x in day_runs if x['pages'] > 0), 'pages': sum(x['pages'] for x in day_runs),
                      'intervals': len(xs), 'median_a': statistics.median(v) if v else None, 'max_a': max(v) if v else None,
                      'builds': sum(1 for s in snapshots if s['day'] == d and not s['rewrite']),
                      'build_rows': sum(s['rows'] or 0 for s in snapshots if s['day'] == d and not s['rewrite']),
                      'rewrites': sum(1 for s in snapshots if s['day'] == d and s['rewrite']),
                      'account_reads_from_next_day_check': reads_by_day.get(d)}
    # V4: how much of the seven days the new value covers (description only).
    new_for_cover = new_rpp or OLD_READS_PER_PAGE
    cover = sum(1 for x in stage2_pool if x['reads_per_page'] <= new_for_cover) / len(stage2_pool) if stage2_pool else None
    # V5: the last collecting run of each day to the end of the day (description only).
    v5 = {}
    for d in ALL_DAYS:
        mine = [x for x in runs if x['size_at'][:10] == d and x['pages'] > 0]
        if not mine:
            continue
        last, t = mine[-1], reads_by_day.get(d)
        after = sum(s['rows'] or 0 for s in snapshots if when(s['started']) >= when(last['size_at']) and s['day'] == d)
        v5[d] = {'run_id': last['run_id'], 'size_at': last['size_at'], 'R_last': last['read'], 'pages': last['pages'], 'snapshot_rows_after': after,
                 'account_reads': t, 'per_page': None if t is None else (t - last['read'] - after) / last['pages']}
    out = {'rule': 'docs/C07R-20261123.md', 'days_used': widened, 'intervals': intervals, 'excluded': excluded, 'per_day': per_day,
           'V1_stage1': v1_stage1, 'V1': v1_stage2, 'stage2_excluded_backup': [{k: x[k] for k in ('run_id', 'day', 'size_at', 'next_size_at', 'pages', 'delta_read', 'snapshot_rows', 'reads_per_page')} for x in backup_excluded],
           'V2': {'verdict': v2, 'snapshotReads': new_snap, 'Nmax': nmax, 'builds_in_days': len(builds), 'rewrites_flagged': flag},
           'V4': {'coverage_of_all_intervals_at_value': cover, 'value': new_for_cover},
           'V5': v5, 'rewrites': [{'run_id': s['run_id'], 'workflow': s['workflow'], 'rows': s['rows'], 'started': s['started']} for s in rewrites],
           'builds': [{'run_id': s['run_id'], 'workflow': s['workflow'], 'rows': s['rows'], 'started': s['started']} for s in snapshots if not s['rewrite']]}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()
    s1 = out['V1_stage1']
    print(f"VERDICT stage1 V1={s1['verdict']}:{s1['readsPerPage']} (A={s1['A']}, median={s1['median']}, n={s1['n']}) stage2 V1={v1}:{new_rpp} (A={out['V1']['A']}, median={out['V1']['median']}, n={len(values)}, days={widened[0]}..{widened[-1]}) V2={v2}:{new_snap} (Nmax={nmax}) FLAG={len(flag)}", file=sys.stderr)


if __name__ == '__main__':
    self_test()
    main(Path(sys.argv[1]))
