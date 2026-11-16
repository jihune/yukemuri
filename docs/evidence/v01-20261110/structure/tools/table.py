#!/usr/bin/env python3
"""Turn scripts-refs.tsv and the reachability list into the summary lists used in the findings.

Usage: python3 -I table.py <scripts-refs.tsv> <scripts-unreachable.txt> <out.txt>
"""
import csv
import sys
from collections import defaultdict
from pathlib import Path

rows = list(csv.DictReader(open(sys.argv[1], encoding='utf-8'), delimiter='\t'))
unreachable = [line.split('\t')[0] for line in Path(sys.argv[2]).read_text(encoding='utf-8').splitlines()
               if line.startswith('scripts/')]
by_file = {row['file']: row for row in rows}
groups = defaultdict(list)
for file in unreachable:
    row = by_file[file]
    if int(row['doc']):
        groups['current-doc'].append(file)
    elif int(row['scr']) or int(row['code']):
        groups['other-script-or-comment-only'].append(file)
    elif int(row['olddoc']):
        groups['dated-doc-only'].append(file)
    else:
        groups['nothing'].append(file)
out = [f'files under scripts/: {len(rows)}',
       f'named by package.json: {sum(1 for r in rows if int(r["pkg"]))}',
       f'named by a workflow: {sum(1 for r in rows if int(r["wf"]))}',
       f'named by cloud-check.py: {sum(1 for r in rows if int(r["cc"]))}',
       f'named by cloud-setup.sh: {sum(1 for r in rows if int(r["cs"]))}',
       f'reachable from package.json/workflows/cloud-check.py/cloud-setup.sh through other scripts: {len(rows) - len(unreachable)}',
       f'not reachable from them: {len(unreachable)}']
for name in ('nothing', 'other-script-or-comment-only', 'current-doc', 'dated-doc-only'):
    out.append(f'  {name}: {len(groups[name])}')
    for file in groups[name]:
        out.append(f'    {file}')
Path(sys.argv[3]).write_text('\n'.join(out) + '\n', encoding='utf-8')
print('\n'.join(out))
