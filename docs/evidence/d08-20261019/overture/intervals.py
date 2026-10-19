# 95% Wilson intervals for the hand-check shares (handcheck.tsv, handcheck_websites.tsv).
# Control: the interval function must reproduce a known value (Wilson 95% for 0/10 has upper bound 27.8%).
import sys, os, csv, math, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT


def wilson(k, n, z=1.96):
    p, d = k / n, 1 + z * z / n
    c, h = p + z * z / (2 * n), z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return round((c - h) / d * 100, 1), round((c + h) / d * 100, 1)


rows = list(csv.DictReader(open(OUT + '/handcheck.tsv', encoding='utf-8'), delimiter='\t'))
for g in ('b', 'c', 'disagree', 'lowconf'):
    v = collections.Counter(r['verdict'] for r in rows if r['group'] == g)
    n = sum(v.values())
    print(f"pairs {g}: same {v['same']}/{n}, 95% interval {wilson(v['same'], n)}%")
bc = [r for r in rows if r['group'] in ('b', 'c')]
print(f"pairs b+c: same {sum(r['verdict'] == 'same' for r in bc)}/{len(bc)}, 95% interval {wilson(sum(r['verdict'] == 'same' for r in bc), len(bc))}%")
web = collections.Counter(r['verdict'] for r in csv.DictReader(open(OUT + '/handcheck_websites.tsv', encoding='utf-8'), delimiter='\t'))
n, live, bad = sum(web.values()), web['official_live'], web['dead'] + web['hijacked']
checked = n - web['unverified']
print(f'websites: official and live {live}/{n} {wilson(live, n)}%, dead or hijacked {bad}/{n} {wilson(bad, n)}%; '
      f'of the {checked} that could be read: live {wilson(live, checked)}%, dead or hijacked {wilson(bad, checked)}%')
# An estimate, not a measurement: wrong links among joined pairs = pairs whose house numbers disagree
# times the share of the disagree sample judged different or unsure (the other groups had none or 1 of 20).
import json
pairs = json.load(open(OUT + '/out/pairs.json', encoding='utf-8'))['pairs']
dis = sum(p['house'] == 'disagree' for p in pairs)
v = collections.Counter(r['verdict'] for r in rows if r['group'] == 'disagree')
k = v['different'] + v['unsure']
lo, hi = wilson(k, 20)
print(f'estimate of doubtful links: {dis} disagree pairs x {k}/20 = {dis * k / 20:.0f} ({dis * k / 20 / len(pairs):.1%} of {len(pairs)}); '
      f'with the interval {lo}-{hi}%: {dis * lo / 100:.0f}-{dis * hi / 100:.0f} ({dis * lo / 100 / len(pairs):.1%}-{dis * hi / 100 / len(pairs):.1%})')
# An estimate: joined hotels with a likely-official website (websites.py) times the live-official share.
sys.argv = [sys.argv[0]]
from websites import classify, first  # prints websites.py's own report first; only the two names are used
official = sum(1 for p in pairs if first(p) and classify(first(p)) == 'likely_official')
lo, hi = wilson(live, n)
hotels = json.load(open(OUT + '/snapshot/manifest.json', encoding='utf-8'))['hotels']
print(f'estimate of live official links: {official} likely-official x {live}/{n} = {official * live / n:.0f} '
      f'({official * live / n / len(pairs):.1%} of joined, {official * live / n / hotels:.1%} of all {hotels} hotels); interval {official * lo / 100:.0f}-{official * hi / 100:.0f}')
ok = wilson(0, 10)[1] == 27.8
print(f"interval control: Wilson 0/10 upper bound {wilson(0, 10)[1]}% (expected 27.8) -> {'PASS' if ok else 'FAIL'}")
if not ok:
    sys.exit(1)
