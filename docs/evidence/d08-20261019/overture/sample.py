# Hand-check samples: 20 random joined pairs per rule (fixed seed), and 20 of the pairs whose house
# numbers disagree (group 'disagree', both rules) and 20 with Overture confidence under 0.77 (group
# 'lowconf', both rules), written to out/sample_<group>.tsv
# with an empty verdict column. The verdicts a person gave are in handcheck.tsv; with that file
# present, this script also tallies them by rule and confidence bucket. Control: the tally refuses
# to count unless every sampled pair has a verdict and the sample is the one this seed draws.
import sys, os, json, random, collections, csv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

d = json.load(open(OUT + '/out/pairs.json', encoding='utf-8'))
cols = ['rule', 'our_id', 'our_name', 'our_addr', 'grade', 'ov_id', 'ov_name', 'ov_locality', 'ov_freeform', 'ov_postcode',
        'dist_m', 'conf', 'cat', 'dataset', 'house']
drawn = {}
GROUPS = ('b', 'c', 'disagree', 'lowconf')
PICK = {'disagree': lambda p: p['house'] == 'disagree', 'lowconf': lambda p: p['conf'] < 0.77}
for rule in GROUPS:
    pool = [p for p in d['pairs'] if PICK.get(rule, lambda p: p['rule'] == rule)(p)]
    pick = random.Random(SEED).sample(pool, 20)
    drawn[rule] = [p['our_id'] for p in pick]
    with open(f'{OUT}/out/sample_{rule}.tsv', 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(cols + ['verdict', 'reason'])
        for p in pick:
            w.writerow([p[c] if c != 'conf' else round(p[c], 3) for c in cols] + ['', ''])
    print(f'group {rule}: {len(pool)} joined pairs, 20 drawn -> out/sample_{rule}.tsv')
    for p in pick:
        print('  ' + ' | '.join(str(p[c] if c != 'conf' else round(p[c], 3)) for c in cols))

path = sys.argv[1] if len(sys.argv) > 1 else OUT + '/handcheck.tsv'
if not os.path.exists(path):
    print('handcheck.tsv not written yet -> FAIL (no verdicts to tally)')
    sys.exit(1)
rows = list(csv.DictReader(open(path, encoding='utf-8'), delimiter='\t'))
ok = True
for rule in GROUPS:
    got = [r['our_id'] for r in rows if r['group'] == rule]
    if got != drawn[rule]:
        ok = False
        print(f'group {rule}: handcheck.tsv rows are not the drawn sample')
    tally = collections.Counter(r['verdict'] for r in rows if r['group'] == rule)
    print(f'group {rule} verdicts: {dict(tally)}')
    by = collections.defaultdict(collections.Counter)
    for r in rows:
        if r['group'] == rule:
            by[bucket(float(r['conf']))][r['verdict']] += 1
    print(f'  by confidence bucket: { {k: dict(v) for k, v in sorted(by.items())} }')
missing = [r['our_id'] for r in rows if r['verdict'] not in ('same', 'different', 'unsure')]
ok &= not missing
print(f"hand-check tally: {len(rows)} rows, {len(missing)} without a verdict, sample matches seed: {ok and not missing} -> {'PASS' if ok else 'FAIL'}")
if not ok:
    sys.exit(1)
