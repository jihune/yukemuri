#!/usr/bin/env python3
"""Which scripts/ files are reachable from the automation entry points.

Usage: python3 -I reach.py <scripts-refs.detail.txt> <out.txt>
An edge is "file A names file B" (over-approximation: a comment counts), so the
unreachable set is a lower bound on "nothing automated runs it".
Roots: package.json scripts, workflows, cloud-check.py, cloud-setup.sh, and
non-script code (vite.config.ts, app/, lib/, components/, build/, db/).
"""
import sys
from collections import defaultdict
from pathlib import Path

detail = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
named_by = defaultdict(list)  # target -> [(cat, source)]
targets = []
current = None
for line in detail:
    if not line.startswith('  '):
        current = line
        targets.append(current)
    else:
        cat, source = line.strip().split('\t')
        named_by[current].append((cat, source))

names = defaultdict(set)  # source -> targets it names
for target, refs in named_by.items():
    for cat, source in refs:
        names[source].add(target)

def closure(root_cats, extra_roots=()):
    seen = set(extra_roots)
    for target in targets:
        if any(cat in root_cats for cat, _ in named_by[target]):
            seen.add(target)
    queue = list(seen)
    while queue:
        node = queue.pop()
        for nxt in names.get(node, ()):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen

auto = closure({'pkg', 'wf', 'cc', 'cs'}, {'scripts/cloud-check.py', 'scripts/cloud-setup.sh'})
with_code = closure({'pkg', 'wf', 'cc', 'cs', 'code'}, {'scripts/cloud-check.py', 'scripts/cloud-setup.sh'})

lines = []
lines.append(f'targets={len(targets)} reachable_from_automation={len(auto)} plus_code_mentions={len(with_code)}')
lines.append('')
lines.append('## not reachable from package.json / workflows / cloud-check.py / cloud-setup.sh (any mention counts as an edge)')
for target in targets:
    if target in auto:
        continue
    refs = named_by[target]
    cats = defaultdict(list)
    for cat, source in refs:
        cats[cat].append(source)
    summary = ', '.join(f'{c}={len(v)}' for c, v in sorted(cats.items())) or 'no reference at all'
    only_code = 'reached only through a code mention' if target in with_code else ''
    lines.append(f'{target}\t{summary}\t{only_code}')
    for cat in ('scr', 'code', 'doc'):
        for source in sorted(cats.get(cat, [])):
            lines.append(f'    {cat}\t{source}')
Path(sys.argv[2]).write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(lines[0])
