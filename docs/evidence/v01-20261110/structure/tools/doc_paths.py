#!/usr/bin/env python3
"""List repository paths that a document names and whether each exists.

Usage: python3 -I doc_paths.py <repo> <doc> [<doc> ...]
A "path" is a markdown link target without a scheme, or a backticked token that
looks like a repository path (contains a slash or a known file suffix).
Paths are tried relative to the document's folder and to the repository root.
"""
import re
import sys
from pathlib import Path

REPO = Path(sys.argv[1])
SUFFIX = r'\.(?:md|py|mjs|cjs|sh|ts|tsx|json|yml|yaml|sql|txt|css|jpg|html)'
missing_total = 0
checked_total = 0
for doc in sys.argv[2:]:
    text = (REPO / doc).read_text(encoding='utf-8')
    found = set()
    for target in re.findall(r'\]\(([^)\s]+)\)', text):
        if not re.match(r'[a-z]+:', target) and not target.startswith('#'):
            found.add(target.split('#')[0])
    for token in re.findall(r'`([^`\n]+)`', text):
        token = token.strip()
        first = token.split()[0] if token.split() else ''
        for candidate in {token, first} | set(re.findall(r'[\w./\[\]-]+' + SUFFIX + r'\b', token)):
            if re.fullmatch(r'[\w.\[\]/-]+', candidate) and ('/' in candidate or re.search(SUFFIX + '$', candidate)):
                if not candidate.startswith(('http', '/', '~')) and not re.fullmatch(r'[\d./-]+', candidate):
                    found.add(candidate)
    rows = []
    for path in sorted(found):
        if '<' in path or '*' in path or path.endswith('/'):
            exists = (REPO / path.rstrip('/')).exists() if path.endswith('/') else None
        else:
            exists = (REPO / Path(doc).parent / path).exists() or (REPO / path).exists()
        if exists is None:
            continue
        rows.append((path, exists))
    checked_total += len(rows)
    missing = [path for path, exists in rows if not exists]
    missing_total += len(missing)
    print(f'{doc}: paths={len(rows)} missing={len(missing)}')
    for path in missing:
        print(f'    MISSING {path}')
print(f'TOTAL checked={checked_total} missing={missing_total}')
