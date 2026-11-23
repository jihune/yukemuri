# ruff: noqa: SIM115, UP031, C401  (a subagent's one-off recount; the code is kept as it ran)
"""Independent recount of per-page D1 reads from GitHub Actions logs.

Usage: python3 -I recount.py <LOGS dir> <output json path>
Reads only. Rule file: recount/rule-only.md
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from fractions import Fraction

LOGS = sys.argv[1]
OUT = sys.argv[2]

DAYS = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19',
        '2026-11-20', '2026-11-21', '2026-11-22']
TICK = 10_000_000  # 100 ns ticks per second
MIN30 = 30 * 60 * TICK

LINE_RE = re.compile(r'^﻿?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d+)Z (.*)$')
SIZE_RE = re.compile(r'^reason=today (\d+) rows written, (\d+) read;')
SNAP_RE = re.compile(
    r'Search snapshot ([0-9a-f]+): (\d+) hotels, (.*?)(\d+) queries, (\d+) rows read, (\d+)ms')
AGAIN_RE = re.compile(r'published again from .*\(same inputs\)')
USAGE_ROW_RE = re.compile(r'^\|\s*(\d{4}-\d{2}-\d{2})\s*\|(.*)\|\s*$')


def to_ticks(sec_str, frac_str=''):
    dt = datetime.strptime(sec_str, '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc)
    frac = int((frac_str + '0000000')[:7]) if frac_str else 0
    return int(dt.timestamp()) * TICK + frac


def manifest_ticks(s):
    return to_ticks(s[:19])


def fmt(t):
    sec, frac = divmod(t, TICK)
    dt = datetime.fromtimestamp(sec, tz=timezone.utc)
    return dt.strftime('%Y-%m-%dT%H:%M:%S') + '.%07dZ' % frac


def day_of(t):
    return fmt(t)[:10]


def day_start(day):
    return to_ticks(day + 'T00:00:00')


def read_lines(path):
    out = []
    with open(path, encoding='utf-8') as f:
        for raw in f:
            raw = raw.rstrip('\r\n')
            m = LINE_RE.match(raw)
            if m:
                out.append((to_ticks(m.group(1), m.group(2)), m.group(3)))
    return out


def job_path(j):
    return os.path.join(LOGS, j['log_file'])


manifest = json.load(open(os.path.join(LOGS, 'manifest.json'), encoding='utf-8'))
runs = manifest['runs']

# ---------------- parse collect runs ----------------
collect_runs = []
for r in runs:
    if r['workflow'] != 'collect.yml':
        continue
    cj = [j for j in r['jobs'] if j['name'] == 'collect']
    assert len(cj) == 1, r['run_id']
    cj = cj[0]
    size = None
    counts = {'done': 0, 'retry': 0, 'failed': 0}
    n_size = 0
    for ts, body in read_lines(job_path(cj)):
        ms = SIZE_RE.match(body)
        if ms:
            n_size += 1
            size = {'ts': ts, 'W': int(ms.group(1)), 'R': int(ms.group(2))}
        if body.startswith('{'):
            try:
                o = json.loads(body)
            except ValueError:
                continue
            if 'sourceDiagnostic' in o:
                continue
            if 'url' in o and o.get('status') in counts:
                counts[o['status']] += 1
    assert n_size <= 1, r['run_id']
    snap_jobs = [j for j in r['jobs'] if j['name'].startswith('snapshot') and j['log_file']]
    chain_jobs = [j for j in r['jobs'] if j['name'] == 'chain' and j['log_file']]
    assert len(snap_jobs) <= 1 and len(chain_jobs) <= 1
    collect_end = manifest_ticks(cj['completed_at'])
    snap_end = manifest_ticks(snap_jobs[0]['completed_at']) if snap_jobs else None
    chain_end = manifest_ticks(chain_jobs[0]['completed_at']) if chain_jobs else None
    p = sum(counts.values())
    collect_runs.append({
        'run_id': r['run_id'],
        'created': manifest_ticks(r['created_at']),
        'day': r['created_at'][:10],
        'collect_start': manifest_ticks(cj['started_at']),
        'collect_end': collect_end,
        'snap_end': snap_end,
        'chain_end': chain_end,
        'size': size,
        'counts': counts,
        'p': p,
    })
collect_runs.sort(key=lambda x: x['created'])

# ---------------- parse snapshot lines (collect, deploy, lifecycle runs) ----------------
snaps = []
other_workflow_snap = 0
seen = set()
for r in runs:
    for j in r['jobs']:
        if not j['log_file']:
            continue
        for idx, (ts, body) in enumerate(read_lines(job_path(j))):
            m = SNAP_RE.search(body)
            if not m:
                continue
            if r['workflow'] not in ('collect.yml', 'deploy.yml', 'lifecycle.yml'):
                other_workflow_snap += 1
                continue
            key = (r['run_id'], j['job_id'], idx)
            assert key not in seen
            seen.add(key)
            again = bool(AGAIN_RE.search(body))
            assert again == ('published again' in body)
            T_ms = int(m.group(6))
            snaps.append({
                'id': m.group(1),
                'workflow': r['workflow'],
                'run_id': r['run_id'],
                'run_day': r['created_at'][:10],
                'job': j['name'],
                'line_ts': ts,
                'start': ts - T_ms * (TICK // 1000),
                'hotels': int(m.group(2)),
                'queries': int(m.group(4)),
                'N': int(m.group(5)),
                'T_ms': T_ms,
                'again': again,
            })
snaps.sort(key=lambda x: x['start'])
for s in snaps:
    s['start_day'] = day_of(s['start'])

# ---------------- usage table ----------------
usage_reads = {}
usage_src = {}
for r in runs:
    if r['workflow'] != 'usage.yml':
        continue
    for j in r['jobs']:
        if not j['log_file']:
            continue
        for ts, body in read_lines(job_path(j)):
            m = USAGE_ROW_RE.match(body)
            if not m:
                continue
            cells = [c.strip() for c in body.strip().strip('|').split('|')]
            # column 9 (index 8) is account D1 rowsRead (limit ratio)
            val = int(cells[8].split('(')[0].strip().replace(',', ''))
            assert cells[0] not in usage_reads
            usage_reads[cells[0]] = val
            usage_src[cells[0]] = r['run_id']

# ---------------- size lines ----------------
size_lines = []
for cr in collect_runs:
    if cr['size']:
        size_lines.append((cr['size']['ts'], cr['run_id']))
size_lines.sort()
run_by_id = {cr['run_id']: cr for cr in collect_runs}


# ---------------- intervals ----------------
def build_intervals(other_start='size_line', end_ref='snapshot_job'):
    out = []
    for cr in collect_runs:
        if not cr['size'] or cr['p'] < 1:
            continue
        S = cr['size']['ts']
        if end_ref == 'snapshot_job':
            end = cr['snap_end'] if cr['snap_end'] is not None else cr['collect_end']
        elif end_ref == 'chain_job':
            end = cr['chain_end'] if cr['chain_end'] is not None else cr['collect_end']
        else:
            end = cr['collect_end']
        nxt = None
        for ts, rid in size_lines:
            if ts > end:
                nxt = (ts, rid)
                break
        reasons = []
        iv = {
            'day': day_of(S), 'run_id': cr['run_id'], 'S_i': S, 'end_ref_time': end,
            'pages': cr['p'], 'page_counts': dict(cr['counts']), 'R_i': cr['size']['R'],
        }
        if nxt is None:
            reasons.append('S_next 없음')
        else:
            Sn, nrid = nxt
            iv['S_next'] = Sn
            iv['next_run_id'] = nrid
            iv['gap_min'] = round((Sn - end) / TICK / 60, 3)
            if day_of(Sn) != day_of(S):
                reasons.append('S_next가 다른 UTC 날')
            if Sn - end > MIN30:
                reasons.append('S_next가 끝난 시각보다 30분 초과')
            R_next = run_by_id[nrid]['size']['R']
            iv['R_next'] = R_next
            iv['dR'] = R_next - cr['size']['R']
            others = []
            for o in collect_runs:
                if o['run_id'] in (cr['run_id'], nrid) or o['p'] < 1:
                    continue
                if other_start == 'size_line':
                    st = o['size']['ts'] if o['size'] else o['collect_start']
                elif other_start == 'collect_start':
                    st = o['collect_start']
                else:
                    st = o['created']
                if S < st < Sn:
                    others.append(o['run_id'])
            if others:
                reasons.append('사이에 쪽을 받은 다른 실행 시작: %s' % others)
            iv['other_paged_runs_inside'] = others
            ss = [s for s in snaps if S <= s['start'] < Sn]
            iv['snap_ids'] = [(s['id'], s['workflow'], s['run_id'], s['N'], s['again']) for s in ss]
            iv['sum_snap'] = sum(s['N'] for s in ss)
            a = Fraction(iv['dR'] - iv['sum_snap'], cr['p'])
            iv['a_frac'] = a
            # backup window: UTC day 00:13:00Z - 00:14:00Z
            b0 = day_start(day_of(S)) + (13 * 60) * TICK
            b1 = day_start(day_of(S)) + (14 * 60) * TICK
            iv['backup_overlap'] = (S < b1 and Sn > b0)
        if cr['p'] < 20:
            reasons.append('p < 20')
        iv['reasons'] = reasons
        iv['used'] = not reasons
        out.append(iv)
    return out


def ceil_frac(x):
    return -((-x.numerator) // x.denominator)


def round1(x):
    # round half up to one decimal, exact
    v = x * 10
    r = (v.numerator * 2 + v.denominator) // (2 * v.denominator)
    return r / 10


def frac_median(vals):
    s = sorted(vals)
    n = len(s)
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2


def v1(used_ivs):
    widths = [(3, DAYS[-3:]), (5, DAYS[-5:]), (7, DAYS)]
    counts = {w: len([i for i in used_ivs if i['day'] in d]) for w, d in widths}
    for w, d in widths:
        q = [i for i in used_ivs if i['day'] in d]
        if len(q) >= 10:
            break
    else:
        return {'verdict': 'ERROR', 'reason': '값으로 쓰인 구간이 이레 합쳐 10개 미만',
                'counts_by_width': counts, 'Q3_count': counts[7]}
    avals = [i['a_frac'] for i in q]
    A = max(avals)
    med = frac_median(avals)
    res = {'width_days': w, 'days': d, 'widened': w != 3, 'counts_by_width': counts,
           'Q3_count': len(q), 'A': round1(A), 'A_exact': str(A), 'A_dec4': '%.4f' % float(A),
           'median_Q3': round1(med), 'median_exact': str(med), 'median_dec4': '%.4f' % float(med),
           'two_x_median': round1(2 * med)}
    if A <= 4600:
        res['verdict'] = 'KEEP'
        res['value'] = 'readsPerPage 변경 없음'
    elif A <= 2 * med:
        res['verdict'] = 'RAISE'
        res['value'] = ceil_frac(A / 100) * 100
    else:
        res['verdict'] = 'OUTLIER'
        res['value'] = None
        res['outlier_intervals'] = [
            {'day': i['day'], 'run_id': i['run_id'], 'a': round1(i['a_frac'])}
            for i in q if i['a_frac'] > 2 * med]
    res['argmax'] = [{'day': i['day'], 'run_id': i['run_id'], 'S_i': fmt(i['S_i'])}
                     for i in q if i['a_frac'] == A]
    return res


def v2(days_list):
    new = [s for s in snaps if not s['again'] and s['run_day'] in days_list]
    nmax = max(s['N'] for s in new)
    arg = [{'id': s['id'], 'run_id': s['run_id'], 'workflow': s['workflow'], 'N': s['N']}
           for s in new if s['N'] == nmax]
    need = Fraction(nmax) * Fraction(21, 20)
    res = {'days': days_list, 'Nmax': nmax, 'argmax': arg,
           'Nmax_x1.05': float(need), 'new_lines_considered': len(new)}
    if need <= 168000:
        res['verdict'] = 'KEEP'
        res['value'] = 'snapshotReads 변경 없음'
    else:
        res['verdict'] = 'RAISE'
        res['value'] = ceil_frac(need / 1000) * 1000
    again_big = [s for s in snaps if s['again'] and s['N'] > 1000]
    res['FLAG_again_N_over_1000'] = [{'id': s['id'], 'N': s['N'], 'run_id': s['run_id']}
                                      for s in again_big]
    return res


def v4(used_ivs, new_value):
    if new_value is None:
        return None
    ok = [i for i in used_ivs if i['a_frac'] <= new_value]
    per_day = {}
    for d in DAYS:
        a = [i['a_frac'] for i in used_ivs if i['day'] == d]
        per_day[d] = ({'n': len(a), 'median_a': round1(frac_median(a)), 'max_a': round1(max(a))}
                      if a else {'n': 0, 'median_a': None, 'max_a': None})
    return {'new_readsPerPage_used': new_value, 'covered': len(ok), 'total_used': len(used_ivs),
            'ratio': len(ok) / len(used_ivs) if used_ivs else None, 'per_day': per_day}


def v5():
    out = {}
    for d in DAYS:
        last = [cr for cr in collect_runs if cr['day'] == d and cr['p'] >= 1 and cr['size']]
        if not last:
            out[d] = None
            continue
        lr = max(last, key=lambda c: c['size']['ts'])
        S = lr['size']['ts']
        end_day = day_start(d) + 86400 * TICK
        ss = [s for s in snaps if S <= s['start'] < end_day]
        sum_snap = sum(s['N'] for s in ss)
        T = usage_reads.get(d)
        rec = {'last_run_id': lr['run_id'], 'S_last': fmt(S), 'R_last': lr['size']['R'],
               'T_account_reads': T, 'sum_snap_to_day_end': sum_snap, 'snap_lines': len(ss),
               'p_last': lr['p']}
        if T is None:
            rec['value'] = None
        else:
            f = Fraction(T - lr['size']['R'] - sum_snap, lr['p'])
            rec['value'] = round1(f)
            rec['numerator'] = T - lr['size']['R'] - sum_snap
        out[d] = rec
    return out


def iv_json(i):
    rec = {
        'day': i['day'], 'run_id': i['run_id'],
        'S_i': fmt(i['S_i']), 'pages': i['pages'], 'page_counts': i['page_counts'],
        'R_i': i['R_i'],
        'S_next': fmt(i['S_next']) if 'S_next' in i else None,
        'next_run_id': i.get('next_run_id'),
        'end_ref_time': fmt(i['end_ref_time']),
        'gap_min': i.get('gap_min'),
        'R_next': i.get('R_next'), 'dR': i.get('dR'), 'sum_snap': i.get('sum_snap'),
        'snapshots_in_interval': i.get('snap_ids'),
        'a': round1(i['a_frac']) if 'a_frac' in i else None,
        'a_exact': str(i['a_frac']) if 'a_frac' in i else None,
        'a_dec4': ('%.4f' % float(i['a_frac'])) if 'a_frac' in i else None,
        'backup_overlap': i.get('backup_overlap'),
        'used_stage1': i['used'],
        'used_stage2': bool(i['used'] and not i.get('backup_overlap')),
        'reasons': i['reasons'],
    }
    if i['used'] and i.get('backup_overlap'):
        rec['reasons_stage2'] = ['제외(백업)']
    return rec


# ---------------- main outputs ----------------
ivs = build_intervals('size_line', 'snapshot_job')
used1 = [i for i in ivs if i['used']]
used2 = [i for i in used1 if not i['backup_overlap']]

daily = {}
for d in DAYS:
    cr_d = [cr for cr in collect_runs if cr['day'] == d]
    size_runs = [cr for cr in cr_d if cr['size']]
    paged = [cr for cr in size_runs if cr['p'] >= 1]
    sn_d = [s for s in snaps if s['run_day'] == d]
    new_d = [s for s in sn_d if not s['again']]
    again_d = [s for s in sn_d if s['again']]
    daily[d] = {
        'collect_runs_in_manifest': len(cr_d),
        'size_line_runs': len(size_runs),
        'paged_runs_p_ge_1': len(paged),
        'pages_total': sum(cr['p'] for cr in size_runs),
        'pages_done': sum(cr['counts']['done'] for cr in size_runs),
        'pages_retry': sum(cr['counts']['retry'] for cr in size_runs),
        'pages_failed': sum(cr['counts']['failed'] for cr in size_runs),
        'new_snapshot_lines': len(new_d),
        'new_snapshot_rows_read_sum': sum(s['N'] for s in new_d),
        'republished_snapshot_lines': len(again_d),
        'republished_snapshot_rows_read_sum': sum(s['N'] for s in again_d),
        'next_day_usage_account_d1_reads': usage_reads.get(d),
        'next_day_usage_run_id': usage_src.get(d),
        'paged_run_ids': [cr['run_id'] for cr in paged],
    }

r1 = v1(used1)
r2 = v1(used2)
v2res = v2(r1['days']) if 'days' in r1 else None
v2_all_days = {d: max([s['N'] for s in snaps if not s['again'] and s['run_day'] == d] or [None])
               for d in DAYS}

# sensitivity
sens = []
for os_ in ('size_line', 'collect_start', 'created_at'):
    for er in ('snapshot_job', 'chain_job', 'collect_job'):
        vi = build_intervals(os_, er)
        u = [i for i in vi if i['used']]
        u2 = [i for i in u if not i['backup_overlap']]
        sens.append({
            'other_start': os_, 'end_ref': er,
            'used_set': sorted(i['run_id'] for i in u),
            'same_used_set_as_primary': sorted(i['run_id'] for i in u) == sorted(i['run_id'] for i in used1),
            'a_values_equal_primary': ({i['run_id']: i['a_frac'] for i in u} ==
                                       {i['run_id']: i['a_frac'] for i in used1}),
            'v1_stage1': {k: v for k, v in v1(u).items() if k in ('verdict', 'Q3_count', 'A', 'median_Q3', 'value')},
            'v1_stage2': {k: v for k, v in v1(u2).items() if k in ('verdict', 'Q3_count', 'A', 'median_Q3', 'value')},
        })

# margins for the 30-minute test
gap_margin = sorted([(i['gap_min'], i['run_id'], i['day']) for i in ivs if 'gap_min' in i])

# sanity checks
sanity = {
    'total_runs': len(runs),
    'collect_runs': len(collect_runs),
    'collect_runs_with_size_line': len([c for c in collect_runs if c['size']]),
    'collect_runs_p_ge_1': len([c for c in collect_runs if c['p'] >= 1]),
    'collect_runs_p_ge_1_without_size_line': len([c for c in collect_runs if c['p'] >= 1 and not c['size']]),
    'size_run_day_equals_size_line_day': all(day_of(c['size']['ts']) == c['day'] for c in collect_runs if c['size']),
    'snapshot_lines_total': len(snaps),
    'snapshot_lines_new': len([s for s in snaps if not s['again']]),
    'snapshot_lines_again': len([s for s in snaps if s['again']]),
    'snapshot_start_day_equals_run_day': all(s['start_day'] == s['run_day'] for s in snaps),
    'snapshot_lines_in_other_workflows': other_workflow_snap,
    'snapshot_workflows': sorted(set(s['workflow'] for s in snaps)),
    'usage_rows': usage_reads,
    'intervals_total': len(ivs),
    'used_stage1': len(used1),
    'used_stage2': len(used2),
    'excluded_stage1': len(ivs) - len(used1),
    'backup_overlap_among_used': [i['run_id'] for i in used1 if i['backup_overlap']],
    'min_gap_margin_to_30min_minutes_sorted_tail': gap_margin[-4:],
}

result = {
    'rule_ambiguities': [
        {
            'sentence': '(S_i, S_next) 사이에 시작한 다른 실행 가운데 쪽을 받은 것이 없다',
            'reading': ("'시작'을 그 실행의 Size 줄 시각(Size 줄이 없으면 collect job 시작)으로 읽고, "
                        "S_i를 낸 실행과 S_next를 낸 실행은 '다른 실행'에서 뺐다. "
                        "collect job 시작 시각이나 run created_at으로 읽어도(S_next를 낸 실행은 같게 뺌) 값으로 쓰이는 구간 집합과 결과가 같은지 sensitivity에 적었다."),
        },
        {
            'sentence': 'S_next는 그 실행의 snapshot job이 끝난 시각(없으면 collect job이 끝난 시각)보다 뒤에 처음 나오는 Size 줄이다',
            'reading': ("p>=1 실행의 snapshot job을 이름이 'snapshot / deploy'인 job으로 읽었다(chain job은 제외). "
                        "'끝난 시각'은 manifest의 completed_at(초 단위)이고, '뒤에'는 엄밀히 큰 것, '30분 이내'는 간격 <= 1800초(30분 포함)로 읽었다. "
                        "chain job 끝이나 collect job 끝을 기준으로 해도 같은지 sensitivity에 적었다."),
        },
        {
            'sentence': '날마다 Size 줄이 있는 gentle 수집 실행 수 등 일별 값',
            'reading': ("날은 실행의 created_at UTC 날로 셌다(Size 줄 날, 스냅숏 시작 날과 모두 같음을 sanity에서 확인했다). "
                        "Size 줄이 없는 overlap 실행(reason=overlap)은 Size 줄 있는 실행 수에서 뺐다. lifecycle.yml 실행은 로그 폴더에 없다."),
        },
        {
            'sentence': '2단계: 구간이 00:13:00Z–00:14:00Z와 겹치면',
            'reading': "구간 [S_i, S_next)와 [00:13:00, 00:14:00]가 겹치는 것(S_i < 00:14:00 이고 S_next > 00:13:00)으로 읽었다. 1단계에서 이미 제외된 구간은 다시 세지 않았다.",
        },
        {
            'sentence': 'V1 Q3이 10개 미만이면 마지막 닷새, 그래도 미만이면 이레로 넓힌다 / V2 같은 Q3 날들',
            'reading': ("넓힌 뒤의 집합도 Q3이라 부르고 보고했다. V2의 날은 1단계 V1이 정한 날(넓혔다면 넓힌 날)을 쓴다."),
        },
        {
            'sentence': 'a(소수 한 자리까지)',
            'reading': ("판정(A, median)은 약분한 분수로 정확히 계산하고, 파일의 a는 소수 둘째 자리에서 반올림(5는 올림)한 값이다. "
                        "정확한 값이 x.x5인 구간이 있어(a_dec4 참고) 짝수 반올림으로 읽으면 한 자리가 0.1 달라질 수 있으나 판정과 두 단계 V1 값에는 영향이 없다."),
        },
        {
            'sentence': 'V4 새 readsPerPage',
            'reading': "판정이 KEEP이면 바꾸지 않은 값 4,600을 새 값으로 읽었다. OUTLIER·ERROR이면 V4는 null.",
        },
        {
            'sentence': 'V5 그 사이 스냅숏 읽기',
            'reading': "마지막으로 쪽을 받은 실행의 Size 줄 시각 S_last부터 그 UTC 날 끝(다음 날 00:00:00Z) 전까지 시작한 스냅숏 줄의 N 합으로 읽었다.",
        },
    ],
    'daily': daily,
    'intervals': [iv_json(i) for i in ivs],
    'V1_stage1': r1,
    'V1_stage2_excluding_backup': r2,
    'V2': v2res,
    'V2_Nmax_new_by_day': v2_all_days,
    'V3': 'unchanged (rule says do not change)',
    'V4_stage1': v4(used1, 4600 if r1['verdict'] == 'KEEP' else (r1.get('value') if r1['verdict'] == 'RAISE' else None)),
    'V4_stage2': v4(used2, 4600 if r2['verdict'] == 'KEEP' else (r2.get('value') if r2['verdict'] == 'RAISE' else None)),
    'V5': v5(),
    'snapshots': [{
        'id': s['id'], 'workflow': s['workflow'], 'run_id': s['run_id'], 'job': s['job'],
        'line_ts': fmt(s['line_ts']), 'start': fmt(s['start']), 'N': s['N'], 'again': s['again']}
        for s in snaps],
    'sensitivity': sens,
    'sanity': sanity,
}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=1, default=str)
print('wrote', OUT)
