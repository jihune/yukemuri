"""C07: main's and this branch's update-site.py take the same pages, in the same lanes and order.

Usage: python3 equivalence.py <scripts/crawler dir> <seed> > result.json
Runs 200 gentle runs against the fake Site of scripts/crawler/check_gentle_claims.py
(random page counts per group, groups that are empty stay empty) and prints the pages,
lanes and claims of each. Compare the output for two collectors with the same seed.
"""
import json
import random
import sys

sys.path.insert(0, sys.argv[1])
import check_gentle_claims as checks

test = checks.GentleClaimChecks()
random.seed(int(sys.argv[2]))
runs = []
for _ in range(200):
    queue = {group: checks.pages(group[0], random.choice([0, 0, 1, 3, 40]), 100000 * (i + 1)) for i, group in enumerate(checks.GENTLE)}
    pages = random.choice([1, 5, 16, 60, 120])
    claims, saved, _lines, _queue = test.run_collector(queue, ['--gentle', '--max-pages', str(pages)])
    runs.append({'saved': saved, 'lanes': [c[2] for c in claims if c[3]], 'claims': len(claims)})
print(json.dumps(runs))
