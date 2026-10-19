# The join: threshold for rule b, the cascade b -> c, its controls, house-number agreement and
# confidence buckets. Writes out/pairs.json for sample.py, location.py and websites.py.
import sys, os, json, random, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

ours, manifest = load_ours()
ov = load_overture()
st = assign_prefectures(ours, ov)
print(f"Overture prefecture: own (region or freeform) {st['own']}, nearest-hotel only {st['nn_only']}; "
      f"nearest-hotel agrees with own on {st['nn_agrees']}/{st['own']} ({st['nn_agrees'] / st['own']:.1%})")

# 1. Threshold for rule b: our source points (grade 1) and the nearest Overture place of the same name.
index = collections.defaultdict(list)
for j, o in enumerate(ov):
    index[o['key']].append(j)
BINS = [50, 100, 150, 300, 1000, 5000, 50000, float('inf')]
def nearest_same_name(rows_ov):
    hist = collections.Counter()
    for r in ours:
        if r['grade'] != 1:
            continue
        cand = {j for k in r['keys'] for j in index.get(k, ())}
        if not cand:
            hist['no same name'] += 1
            continue
        d = min(meters(r['lat'], r['lng'], rows_ov[j]['lat'], rows_ov[j]['lng']) for j in cand)
        hist[next(b for b in BINS if d < b)] += 1
    return hist
real_h, shuf_h = nearest_same_name(ov), nearest_same_name(shuffled(ov, ('lat', 'lng'), SEED))
print('grade-1 hotels by distance to the nearest same-name Overture place (bin upper edge m: real / Overture points shuffled):')
for b in BINS + ['no same name']:
    print(f'  < {b}: {real_h[b]} / {shuf_h[b]}')
for t in (50, 100, 150, 300, 500, 1000):
    s, _ = summarize(ours, ov, join(ours, ov, t, ('b',)), ('b',))
    print(f"  rule b alone at {t} m: one match {s['b']['one_match']}, several {s['b']['several_matches']}, one-to-one {s['b']['one_to_one']}")

# 2. The cascade at THRESHOLD_M.
res = join(ours, ov)
summary, pairs = summarize(ours, ov, res)
print(f'cascade (threshold {THRESHOLD_M} m) over {len(ours)} hotels:')
print('  rule a (phone): not run, our data has no phone (inputs.py)')
for rule in ('b', 'c'):
    print(f'  rule {rule}: ' + ', '.join(f'{k} {v}' for k, v in summary[rule].items()))
print(f"  same name somewhere but neither rule: {summary['name_only_not_joined']}; no same name at all: {summary['no_name_match']}")
print(f"  joined one-to-one in total: {summary['joined_total']} of {len(ours)} ({summary['joined_total'] / len(ours):.1%})")
by_grade = collections.Counter((rule, ours[n]['grade']) for rule, n, j in pairs)
print('  joined by rule and our grade:', dict(sorted(by_grade.items())))
print('  joined by our provider:', dict(collections.Counter(ours[n]['id'].split('-')[0] if ours[n]['id'].split('-')[0] in ('jalan', 'trip') else 'curated' for _, n, _ in pairs)))
hit_by = collections.defaultdict(set)
for n, x in enumerate(res):
    for j in x['hits']:
        hit_by[j].add(n)
kind = lambda n: ours[n]['id'].split('-')[0] if ours[n]['id'].split('-')[0] in ('jalan', 'trip') else 'curated'
multi = {j: ns for j, ns in hit_by.items() if len(ns) > 1}
print(f'  Overture places that are a candidate of 2+ of our hotels (any rule): {len(multi)}; our provider mix:',
      dict(collections.Counter('+'.join(sorted(kind(n) for n in ns)) for ns in multi.values())),
      '| same name on all of them:', sum(1 for ns in multi.values() if len({frozenset(ours[n]['keys']) for n in ns}) == 1 or
                                        set.intersection(*[set(ours[n]['keys']) for n in ns])))
amb = [(n, x) for n, x in enumerate(res) if x['rule'] and len(x['hits']) > 1]
dup = sum(1 for n, x in amb if max(meters(ov[a]['lat'], ov[a]['lng'], ov[b]['lat'], ov[b]['lng']) for a in x['hits'] for b in x['hits']) < THRESHOLD_M)
print(f'  of {len(amb)} hotels with several matches, {dup} have all candidates within {THRESHOLD_M} m of each other (likely Overture duplicates)')

# 3. Controls: each rule's count must collapse when the evidence it rests on is shuffled.
def one(rows_ours, rows_ov, rules):
    s, _ = summarize(rows_ours, rows_ov, join(rows_ours, rows_ov, THRESHOLD_M, rules), rules)
    return {r: s[r]['one_match'] for r in rules}
real_b, real_c = one(ours, ov, ('b',))['b'], one(ours, ov, ('c',))['c']
ctl = {
    'rule b, Overture points shuffled': (one(ours, shuffled(ov, ('lat', 'lng'), SEED), ('b',))['b'], real_b),
    'rule c, Overture prefecture+municipality shuffled': (one(ours, shuffled(ov, ('pref', 'locality'), SEED), ('c',))['c'], real_c),
    'rule b, our names shuffled': (one(shuffled(ours, ('keys',), SEED), ov, ('b',))['b'], real_b),
    'rule c, our names shuffled': (one(shuffled(ours, ('keys',), SEED), ov, ('c',))['c'], real_c),
}
ok = True
for k, (c, r) in ctl.items():
    good = c <= 0.05 * r
    ok &= good
    print(f'  control {k}: one match {c} vs real {r} -> {"collapses" if good else "DOES NOT collapse"}')

# 4. House-number agreement: an independent sign (neither rule reads digits). Control: the same
# hotels paired with another Overture place of the same prefecture and municipality.
by_muni = collections.defaultdict(list)
for j, o in enumerate(ov):
    if o['locality'] and o['freeform']:
        by_muni[(o['pref'], o['locality'])].append(j)
rng = random.Random(SEED)
agree = {}
out = []
for rule, n, j in pairs:
    r, o = ours[n], ov[j]
    a = address_agreement(r['rest'], o['freeform'], o['locality'])
    others = [k for k in by_muni.get((o['pref'], o['locality']), ()) if k != j and ov[k]['key'] != o['key']]
    c = address_agreement(r['rest'], ov[rng.choice(others)]['freeform'], o['locality']) if others else 'unknown'
    agree.setdefault(rule, collections.Counter())[a] += 1
    agree.setdefault(rule + '-control', collections.Counter())[c] += 1
    out.append({'rule': rule, 'our_id': r['id'], 'our_name': r['name'], 'our_addr': r['addr'], 'grade': r['grade'],
                'our_lat': r['lat'], 'our_lng': r['lng'], 'ov_id': o['id'], 'ov_name': o['name'], 'ov_freeform': o['freeform'],
                'ov_locality': o['locality'], 'ov_postcode': o['postcode'], 'ov_lat': o['lat'], 'ov_lng': o['lng'],
                'conf': o['conf'], 'cat': o['cat'], 'dataset': o['dataset'], 'websites': o['websites'],
                'dist_m': round(meters(r['lat'], r['lng'], o['lat'], o['lng'])), 'house': a})
rate = lambda c: c['agree'] / (c['agree'] + c['disagree']) if c['agree'] + c['disagree'] else 0
for k in ('b', 'b-control', 'c', 'c-control'):
    c = agree.get(k, collections.Counter())
    print(f"  house numbers {k}: agree {c['agree']}, disagree {c['disagree']}, unknown {c['unknown']} -> agree rate {rate(c):.1%}")
house_ok = all(rate(agree[f'{r}-control']) <= 0.5 * rate(agree[r]) for r in ('b', 'c'))

# 5. Overture confidence and source.
print('by Overture confidence bucket: places, joined, join rate, house agree/disagree among joined')
jb = collections.Counter(bucket(p['conf']) for p in out)
hb = collections.defaultdict(collections.Counter)
for p in out:
    hb[bucket(p['conf'])][p['house']] += 1
allb = collections.Counter(bucket(o['conf']) for o in ov)
for name, _, _ in BUCKETS:
    print(f"  {name}: {allb[name]}, {jb[name]}, {jb[name] / allb[name]:.1%}, {hb[name]['agree']}/{hb[name]['disagree']} ({rate(hb[name]):.1%})")
print('by Overture first source: places, joined, join rate')
ds_all, ds_j = collections.Counter(o['dataset'] for o in ov), collections.Counter(p['dataset'] for p in out)
for k in ds_all:
    print(f'  {k}: {ds_all[k]}, {ds_j[k]}, {ds_j[k] / ds_all[k]:.1%}')
print('joined by Overture basic category:', dict(collections.Counter(p['cat'] for p in out).most_common()))

os.makedirs(OUT + '/out', exist_ok=True)
json.dump({'snapshot': manifest['id'], 'threshold_m': THRESHOLD_M, 'summary': summary, 'pairs': out},
          open(OUT + '/out/pairs.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f"join controls: {sum(1 for c, r in ctl.values() if c <= 0.05 * r)}/{len(ctl)} collapse to 5% or less; "
      f"house-number control under half the real rate: {house_ok} -> {'PASS' if ok and house_ok else 'FAIL'}")
