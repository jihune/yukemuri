# ruff: noqa: SIM115, UP031  (a subagent's one-off recount; the code is kept as it ran)
"""Build a control LOGS: copy one collect job log, break one page line's status key, point a manifest copy at it."""
import json
import os
import sys

SRC_LOGS = sys.argv[1]       # original LOGS (read only)
CTL = sys.argv[2]            # control dir
RUN_ID = int(sys.argv[3])

m = json.load(open(os.path.join(SRC_LOGS, 'manifest.json'), encoding='utf-8'))
target = None
for r in m['runs']:
    if r['run_id'] == RUN_ID:
        for j in r['jobs']:
            if j['name'] == 'collect':
                target = j
assert target is not None
src = os.path.join(SRC_LOGS, target['log_file'])
os.makedirs(os.path.join(CTL, 'LOGS_ctl', 'copies'), exist_ok=True)
link = os.path.join(CTL, 'LOGS_ctl', 'logs')
if not os.path.islink(link):
    os.symlink(os.path.join(SRC_LOGS, 'logs'), link)
rel_copy = 'copies/%d_%d.log' % (RUN_ID, target['job_id'])
dst = os.path.join(CTL, 'LOGS_ctl', rel_copy)

with open(src, encoding='utf-8', newline='') as f:
    lines = f.readlines()
broken = None
for k, line in enumerate(lines):
    body = line.split('Z ', 1)[-1]
    if body.startswith('{"url"') and 'sourceDiagnostic' not in body and '"status": "done"' in body:
        lines[k] = line.replace('"status":', '"statuz":', 1)
        broken = k + 1
        break
assert broken is not None
with open(dst, 'w', encoding='utf-8', newline='') as f:
    f.writelines(lines)

target['log_file'] = rel_copy   # m holds the only change: this job's log_file
with open(os.path.join(CTL, 'LOGS_ctl', 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(m, f, ensure_ascii=False)
print('broken line number', broken, 'copy', dst)
