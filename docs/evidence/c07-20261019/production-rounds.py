"""C07: split the page lines of a production collect job log into gentle rounds.

Usage: python3 production-rounds.py <job log (text, or the GitHub tool's JSON with logs_content)>
Pages come in group order within a round, and Jalan detail gives a page in every
round, so a page that cannot follow the last group of its round starts the next one.
A Jalan detail URL can come from the detail, baths or refresh group, a Trip.com detail
URL from the detail, refresh or names group: such a page takes the earliest group
still open in the round, so the split between those groups is a lower bound for the
earlier group. The round count does not depend on it.
"""
import collections
import json
import re
import sys

GROUPS = ['jalan/detail', 'jalan/baths', 'trip/detail', 'jalan/refresh', 'trip/refresh', 'jalan/list', 'trip/list', 'trip/names', 'jalan/localnames']


def candidates(url):
    if 'uiw1402.do' in url:
        return [8]
    if re.search(r'jalan\.net/yad\d+/', url):
        return [0, 1, 3]
    if 'jalan.net' in url:
        return [3, 5]
    if '-hotel-detail-' in url:
        return [2, 4, 7]
    return [4, 6]


with open(sys.argv[1], encoding='utf-8') as file:
    text = file.read()
if text.startswith('{'):
    text = json.loads(text)['logs_content']
rounds, position = [], len(GROUPS)
for line in text.split('\n'):
    page = re.search(r'\{"url": "([^"]+)", "status": "(\w+)"', line)
    if not page:
        continue
    open_groups = [i for i in candidates(page[1]) if i > position]
    if not open_groups:
        rounds.append([])
        open_groups = candidates(page[1])
    position = open_groups[0]
    rounds[-1].append(position)
pages = collections.Counter(GROUPS[i] for r in rounds for i in r)
print('pages', sum(pages.values()), 'rounds', len(rounds))
for i, group in enumerate(GROUPS):
    last = max([k + 1 for k, r in enumerate(rounds) if i in r], default=0)
    print(f'  {group:17} pages {pages[group]:3} last round with a page {last}')
print(' '.join(''.join(str(i) for i in r) for r in rounds))
