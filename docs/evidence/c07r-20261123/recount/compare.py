# ruff: noqa: I001, SIM115  (a subagent's one-off recount; the code is kept as it ran)
import json, sys
a = json.load(open(sys.argv[1], encoding='utf-8'))
b = json.load(open(sys.argv[2], encoding='utf-8'))
man_a = json.load(open(sys.argv[3], encoding='utf-8'))
man_b = json.load(open(sys.argv[4], encoding='utf-8'))
# manifest diff
diffs = []
for ra, rb in zip(man_a['runs'], man_b['runs']):
    for ja, jb in zip(ra['jobs'], rb['jobs']):
        if ja != jb:
            diffs.append((ra['run_id'], ja['job_id'], ja['log_file'], jb['log_file']))
    assert ra['run_id'] == rb['run_id'] and len(ra['jobs']) == len(rb['jobs'])
print('manifest diffs:', diffs, 'runs equal count:', len(man_a['runs']) == len(man_b['runs']))
moved, same = [], 0
for ia, ib in zip(a['intervals'], b['intervals']):
    assert ia['run_id'] == ib['run_id']
    ch = {k: (ia[k], ib[k]) for k in ia if ia[k] != ib[k]}
    if ch:
        moved.append((ia['run_id'], ia['day'], ch))
    else:
        same += 1
print('intervals unchanged:', same, 'changed:', len(moved))
for x in moved:
    print(x)
dch = {}
for d in a['daily']:
    ch = {k: (a['daily'][d][k], b['daily'][d][k]) for k in a['daily'][d] if a['daily'][d][k] != b['daily'][d][k]}
    if ch: dch[d] = ch
print('daily changes:', dch)
for k in ('V1_stage1', 'V1_stage2_excluding_backup', 'V2', 'V5', 'V4_stage1', 'V4_stage2'):
    if a[k] != b[k]:
        keys = [kk for kk in (a[k] if isinstance(a[k], dict) else {}) if a[k][kk] != b[k].get(kk)]
        print('changed', k, {kk: (a[k][kk], b[k][kk]) for kk in keys if kk in ('A','A_dec4','A_exact','value','verdict','median_Q3','Q3_count','argmax','covered','ratio','per_day')})
    else:
        print('same', k)
