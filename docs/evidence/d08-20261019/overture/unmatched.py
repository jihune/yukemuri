# Why most hotels do not join: of the hotels with no Overture place of the same normalized name,
# how many have some Overture place nearby (our source or block-level point) whose house numbers in
# the same municipality agree, i.e. Overture likely holds the hotel under another name. A diagnostic,
# not a join rule. Control: with Overture points shuffled, the agreeing count must collapse (the
# nearby count cannot: shuffling keeps the same set of points, so it is shown only as context).
import sys, os, random, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

ours, manifest = load_ours()
ov = load_overture()
assign_prefectures(ours, ov)
res = join(ours, ov)
none = [r for r, x in zip(ours, res) if x['rule'] is None and not x['name_only'] and r['grade'] in (1, 2)]
print(f'hotels with no same-name Overture place: {sum(1 for x in res if x["rule"] is None and not x["name_only"])}; '
      f'of those with a source or block-level point (grade 1-2): {len(none)}')

def nearby(rows_ov, radius=100):
    grid = collections.defaultdict(list)
    for j, o in enumerate(rows_ov):
        grid[(int(o['lat'] * 100), int(o['lng'] * 100))].append(j)
    found, agree, examples = 0, 0, []
    for r in none:
        cy, cx = int(r['lat'] * 100), int(r['lng'] * 100)
        cand = [j for dy in (-1, 0, 1) for dx in (-1, 0, 1) for j in grid.get((cy + dy, cx + dx), ())
                if meters(r['lat'], r['lng'], rows_ov[j]['lat'], rows_ov[j]['lng']) < radius]
        if not cand:
            continue
        found += 1
        hit = [j for j in cand if rows_ov[j]['pref'] == r['pref'] and muni_match(r['rest'], rows_ov[j]['locality'])
               and address_agreement(r['rest'], rows_ov[j]['freeform'], rows_ov[j]['locality']) == 'agree']
        if hit:
            agree += 1
            if len(examples) < 400:
                examples.append((r['name'], rows_ov[hit[0]]['name'], r['addr'], rows_ov[hit[0]]['freeform']))
    return found, agree, examples

found, agree, examples = nearby(ov)
s_found, s_agree, _ = nearby(shuffled(ov, ('lat', 'lng'), SEED))
print(f'  an Overture lodging place within 100 m: {found} ({found / len(none):.1%}); same municipality and house numbers agree with one of them: {agree} ({agree / len(none):.1%} of {len(none)})')
print(f'  control, Overture points shuffled: within 100 m {s_found}, with agreeing house numbers {s_agree}')
print('  15 random examples (our name | Overture name | our address | Overture address):')
for e in random.Random(SEED).sample(examples, 15):
    print('   ', ' | '.join(str(x) for x in e))
ok = s_agree <= 0.1 * agree
print(f"unmatched diagnostic control: shuffled agreeing {s_agree} vs real {agree} -> {'PASS' if ok else 'FAIL'}")
if not ok:
    sys.exit(1)
