# C07 baths claim fix: the Jalan baths claim stops taking pending detail jobs (the
# Jalan detail claim takes them in the same order), so a run asks it once when no
# done page needs bath data v3 again, instead of every round. This compares one
# gentle run of 120 pages per queue shape before and after the fix, from the reports
# of measure-claim-groups.mjs run on two Worker builds (--server).
# Usage: python3 -I docs/evidence/c07-20261019/compare-baths-fix.py <before.json> <after.json> [<control.json>]
# <control.json>: a build whose baths claim takes no done page at all (the check can
# fail: it must leave the done candidates of shape B2 untouched).
#
# Verdict rules, written and committed before the first run (counting-discipline,
# harness 067575b). The last line printed is "VERDICT <V1> <V2> <V3> <V4> <V5>".
# V1 reads: rows all claims read per page saved, after over before, in shape C
#    (11-02, done Jalan pages 7,802). 0.5 or less CUT, otherwise NOT_CUT.
# V2 order: in every shape, the pending Jalan detail pages the fix saves, in save
#    order, are the first ones of those saved before (the same choices in the same
#    order; within 120 pages the fix may save fewer of them, since the baths claim no
#    longer adds one each round and other groups fill the cap). SAME_ORDER, otherwise
#    DIFFERENT (the shapes and the first difference are listed). The count of each
#    page kind before and after is reported, without a threshold.
# V3 writes: rows all requests wrote per page saved, after over before, in every
#    shape. 1.1 or less OK, otherwise UP.
# V4 backfill: in shape B2 (25 done Jalan hotels whose bath data is not v3), the done
#    candidates left after the run, after against before. No more left: KEEPS,
#    otherwise LOSES.
# V5 control: with <control.json>, its shape B2 leaves more done candidates than the
#    fix does: CONTROL_FAILS (V4 can fail); otherwise CONTROL_PASSES (V4 proves
#    nothing). Without it: NO_CONTROL.
#
# Attempt 1 (baths takes done jobs only) failed V1 and V2 (baths-fix1-compare.txt).
# Attempt 2, rules added 2026-11-03 before it was built or run: the claim picks the
# same job; only the done branch of the baths and names phases reads less. Each phase
# takes the first job of every branch and then the first of those; a done row whose
# first order key (priority on the priority lane, fetched time on the national lane)
# is after the first of the other branches cannot be that job, so the done branch
# reads only the rows up to it (all of them when no other branch has a job).
# The rules V1-V5 above apply unchanged, and:
# V6 exactness (run separately, not printed here): scripts/check-claim-order-worker.mjs,
#    left as it is, passes against the fix (1,441 claims over 60 random queue states
#    pick what the former single selection query picked). Fails: NOT_EXACT.
#
# Attempt 2 passed V1-V4 and V6 with V5 CONTROL_PASSES (baths-fix2-compare.txt), but
# its shapes spread done Jalan pages evenly over the priorities. In production the
# collector takes pending pages in priority order, so most done pages likely share
# the first pending page's priority (10), where attempt 2 still reads them all.
# Attempt 3, rules added 2026-11-03 before it was built or run: on the priority lane a
# done row of the same priority as the first job of the other branches can only come
# first when that job is from a regular branch and the row's fetched time is not
# after it, so the done branch also reads only those (still every row when no other
# branch has a job). Two more shapes, run with every attempt:
#   C10  C's counts; every done Jalan page at priority 10, pending ones spread over
#        10-90 as before (pending priority-10 pages remain)
#   C20  as C10, but no pending Jalan page at priority 10 (they are all done)
# V7 on C10, the rule of V1 (rows all claims read per page, after over before, 0.5 or
#    less): CUT10, otherwise NOT_CUT10.
# V8 on C20, reported without a pass mark: an exact fix must still read the done
#    priority-10 rows there, since one of them could come before every pending page.
# V1-V6 apply unchanged to attempt 3; V2 and V3 cover C10 and C20 as well.
import json
import sys
from pathlib import Path


def runs(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))['runs']


before, after = runs(sys.argv[1]), runs(sys.argv[2])
control = runs(sys.argv[3]) if len(sys.argv) > 3 else None
SHAPES = [s for s in ['A', 'B', 'C', 'B2', 'C10', 'C20'] if s in before and s in after]
rows = {}
for s in SHAPES:
    b, a = before[s], after[s]
    rows[s] = {
        'claimReadPerPage': [b['claimReadPerPage'], a['claimReadPerPage']],
        'bathsClaims': [b['groups'].get('jalan/baths', {}).get('claims', 0), a['groups'].get('jalan/baths', {}).get('claims', 0)],
        'bathsRead': [b['groups'].get('jalan/baths', {}).get('read', 0), a['groups'].get('jalan/baths', {}).get('read', 0)],
        'jalanPendingSaved': [len(b['savedJalanPending']), len(a['savedJalanPending'])],
        'writtenPerPage': [b['writtenPerPage'], a['writtenPerPage']],
        'candidatesAfter': [b['candidatesAfter'], a['candidatesAfter']],
        'pages': [b['pages'], a['pages']],
    }
    print(s, json.dumps(rows[s]))
ratio = after['C']['claimReadPerPage'] / before['C']['claimReadPerPage']
v1 = 'CUT' if ratio <= 0.5 else 'NOT_CUT'
differences = []
for s in SHAPES:
    b, a = before[s]['savedJalanPending'], after[s]['savedJalanPending']
    n = min(len(b), len(a))
    if b[:n] != a[:n]:
        i = next(k for k in range(n) if b[k] != a[k])
        differences.append(f'{s}: #{i} {b[i]} / {a[i]}')
v2 = 'DIFFERENT' if differences else 'SAME_ORDER'
writes = {s: after[s]['writtenPerPage'] / before[s]['writtenPerPage'] for s in SHAPES}
v3 = 'OK' if all(w <= 1.1 for w in writes.values()) else 'UP'
v4 = 'KEEPS' if after['B2']['candidatesAfter'] <= before['B2']['candidatesAfter'] else 'LOSES'
if control is None:
    v5 = 'NO_CONTROL'
else:
    v5 = 'CONTROL_FAILS' if control['B2']['candidatesAfter'] > after['B2']['candidatesAfter'] else 'CONTROL_PASSES'
    print('control B2 candidatesAfter', control['B2']['candidatesAfter'])
print('C claim reads per page after/before', round(ratio, 3))
print('writes per page after/before', {s: round(w, 3) for s, w in writes.items()})
for d in differences:
    print('order difference', d)
v7 = v8 = 'NONE'
if 'C10' in SHAPES:
    r10 = after['C10']['claimReadPerPage'] / before['C10']['claimReadPerPage']
    v7 = 'CUT10' if r10 <= 0.5 else 'NOT_CUT10'
    print('C10 claim reads per page after/before', round(r10, 3))
if 'C20' in SHAPES:
    v8 = f"C20={after['C20']['claimReadPerPage'] / before['C20']['claimReadPerPage']:.3f}"
print(f'VERDICT {v1} {v2} {v3} {v4} {v5} {v7} {v8}')
