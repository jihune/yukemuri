# Location: how far Overture's point lies from ours, by our precision grade.
# Grade 1 is measured on rule c alone (name + municipality, no distance), so the distance is not
# limited by rule b's threshold. Control: the same hotels paired with a random Overture place of the
# same prefecture must lie much farther apart.
import sys, os, json, random, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

ours, manifest = load_ours()
ov = load_overture()
assign_prefectures(ours, ov)

def stats(ds):
    q = quantiles(ds)
    if not ds:
        return q
    n = len(ds)
    q.update({f'<{t}m': f'{sum(1 for d in ds if d < t) / n:.1%}' for t in (50, 150, 500)})
    q['>1km'] = f'{sum(1 for d in ds if d >= 1000) / n:.1%}'
    return q

# 1. Grade 1 by rule c alone.
res = join(ours, ov, THRESHOLD_M, ('c',))
_, pairs_c = summarize(ours, ov, res, ('c',))
g1 = [(n, j) for _, n, j in pairs_c if ours[n]['grade'] == 1]
d1 = [meters(ours[n]['lat'], ours[n]['lng'], ov[j]['lat'], ov[j]['lng']) for n, j in g1]
d1_agree = [meters(ours[n]['lat'], ours[n]['lng'], ov[j]['lat'], ov[j]['lng']) for n, j in g1
            if address_agreement(ours[n]['rest'], ov[j]['freeform'], ov[j]['locality']) == 'agree']
print('grade 1, joined by rule c alone (no distance condition):', stats(d1))
print('  of those, house numbers agree:', stats(d1_agree))
by_pref = collections.defaultdict(list)
for j, o in enumerate(ov):
    by_pref[o['pref']].append(j)
rng = random.Random(SEED)
ctl = [meters(ours[n]['lat'], ours[n]['lng'], ov[k]['lat'], ov[k]['lng']) for n, j in g1 for k in [rng.choice(by_pref[ov[j]['pref']])]]
print('  control, random Overture place of the same prefecture:', stats(ctl))
print('grade 1, by Overture confidence bucket (rule c alone):')
for name, _, _ in BUCKETS:
    ds = [meters(ours[n]['lat'], ours[n]['lng'], ov[j]['lat'], ov[j]['lng']) for n, j in g1 if bucket(ov[j]['conf']) == name]
    print(f'  {name}:', stats(ds))

print('grade 1, by Overture first source (rule c alone):')
for name in sorted({o['dataset'] for o in ov}):
    print(f'  {name}:', stats([meters(ours[n]['lat'], ours[n]['lng'], ov[j]['lat'], ov[j]['lng']) for n, j in g1 if ov[j]['dataset'] == name]))
far1 = sorted(((meters(ours[n]['lat'], ours[n]['lng'], ov[j]['lat'], ov[j]['lng']), n, j) for n, j in g1), reverse=True)[:5]
for dist, n, j in far1:
    print(f"  far: {round(dist)} m {ours[n]['id']} {ours[n]['name']} | Overture {ov[j]['name']} {ov[j]['dataset']} conf {ov[j]['conf']:.2f} "
          f"point {ov[j]['lat']:.5f},{ov[j]['lng']:.5f} house {address_agreement(ours[n]['rest'], ov[j]['freeform'], ov[j]['locality'])}")

# 2. The cascade's joined pairs (join.py) by our grade.
d = json.load(open(OUT + '/out/pairs.json', encoding='utf-8'))
pairs = d['pairs']
grades = collections.Counter(r['grade'] for r in ours)
print('cascade joined pairs, distance between our point and Overture by our grade:')
for g in sorted(grades):
    ds = [p['dist_m'] for p in pairs if p['grade'] == g]
    print(f'  grade {g}: {len(ds)} joined of {grades[g]} hotels ({len(ds) / grades[g]:.1%}):', stats(ds))
approx = [p for p in pairs if p['grade'] >= 3]
n_approx = sum(v for g, v in grades.items() if g >= 3)
print(f'grades 3-6 (approximate): {len(approx)} of {n_approx} hotels ({len(approx) / n_approx:.1%}) would get an Overture point; '
      f'move:', stats([p['dist_m'] for p in approx]))
print('  of those, house numbers agree / disagree / unknown:', dict(collections.Counter(p['house'] for p in approx)))
print('  by Overture confidence bucket:', {b: sum(1 for p in approx if bucket(p['conf']) == b) for b, _, _ in BUCKETS})
# A gate a correction could use (a proposal, not a measured truth): house numbers agree and the move
# stays inside what the grade allows (oaza point 5 km, city or wider 20 km).
gate = [p for p in approx if p['house'] == 'agree' and p['dist_m'] <= (5000 if p['grade'] == 3 else 20000)]
print(f'  pass the proposed gate (house agree, move <= 5 km for grade 3, <= 20 km for 4-6): {len(gate)}; by grade', dict(collections.Counter(p['grade'] for p in gate)))
print(f"  of the gate, Overture confidence 0.5 or more: {sum(1 for p in gate if p['conf'] >= 0.5)}; share of all approximate hotels: {len(gate) / n_approx:.1%}")
far2 = sorted((p for p in pairs if p['grade'] == 2 and p['dist_m'] > 5000), key=lambda p: -p['dist_m'])
print(f'grade 2 pairs over 5 km apart: {len(far2)}; house numbers agree on {sum(p["house"] == "agree" for p in far2)}')
for p in far2[:6]:
    print(f"  {p['dist_m']} m {p['our_id']} {p['our_name']} our {p['our_lat']},{p['our_lng']} | Overture {p['dataset']} conf {p['conf']:.2f} {p['ov_lat']:.4f},{p['ov_lng']:.4f} house {p['house']}")
ok = bool(d1) and quantiles(d1)['median'] <= 0.1 * quantiles(ctl)['median']
print(f"location control: grade-1 median {quantiles(d1)['median']} m vs random same-prefecture median {quantiles(ctl)['median']} m "
      f"-> {'PASS' if ok else 'FAIL'}")
if not ok:
    sys.exit(1)
