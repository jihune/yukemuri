#!/usr/bin/env python3
"""Count who references each tracked file under scripts/ (read-only).

Usage: python3 -I refs.py <repo> <out.tsv>
Unit: one (target file, referencing file) pair; a referencing file counts once
however many times it names the target.
"""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(sys.argv[1])
OUT = Path(sys.argv[2])

tracked = subprocess.run(
    ['git', '-C', str(REPO), 'ls-files', '-z'], capture_output=True, check=True
).stdout.decode('utf-8').split('\0')
tracked = [p for p in tracked if p]
targets = sorted(p for p in tracked if p.startswith('scripts/'))

CURRENT_DOCS = {
    'AGENTS.md', 'START_HERE.md', 'README.md', 'CLAUDE.md',
    'docs/README.md', 'docs/cloud-development.md', 'docs/catalog-operations.md',
    'docs/db-backups.md', 'docs/sites-handoff.md', 'docs/collector-runner-migration.md',
    'docs/cloudflare-deploy.md', 'docs/roadmap.md', 'docs/work-handoff-latest.md',
    'docs/writing-guide.md', 'docs/legacy-history.md', 'docs/conversation-handoff.md',
    'docs/deployments.md',
}


def category(path):
    if path == 'package.json':
        return 'pkg'
    if path.startswith('.github/workflows/'):
        return 'wf'
    if path == 'scripts/cloud-check.py':
        return 'cc'
    if path == 'scripts/cloud-setup.sh':
        return 'cs'
    if path.startswith('scripts/'):
        return 'scr'
    if path in CURRENT_DOCS or path.startswith(('skills/', '.claude/', '.agents/')):
        return 'doc'
    if path.startswith('docs/'):
        return 'olddoc'
    if path.startswith('source-assets/') or path == 'data/collector-release.generated.json':
        return 'manifest'
    return 'code'


def readable(path):
    if path.startswith('source-assets/') and path != 'source-assets/manifest.json':
        return False
    if path.endswith(('.jpg', '.png', '.woff2', '.bundle', '.b64', '.gz')):
        return False
    return True


sources = {}
for path in tracked:
    if not readable(path):
        continue
    file = REPO / path
    if not file.is_file():
        continue
    try:
        sources[path] = file.read_text(encoding='utf-8', errors='replace')
    except OSError:
        continue

CATS = ['pkg', 'wf', 'cc', 'cs', 'scr', 'code', 'doc', 'olddoc', 'manifest']
rows = []
for target in targets:
    base = target.rsplit('/', 1)[-1]
    stem = base.rsplit('.', 1)[0]
    # The base name with a left boundary, so check.py does not match cloud-check.py.
    pattern = r'(?<![A-Za-z0-9_\-])' + re.escape(base) + r'(?![A-Za-z0-9_])'
    patterns = [pattern]
    if base.endswith('.py') and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', stem):
        # A Python module import: import stem / from stem import ...
        patterns.append(r'^\s*(?:from|import)\s+' + re.escape(stem) + r'\b')
    regex = re.compile('|'.join('(?:' + p + ')' for p in patterns), re.MULTILINE)
    hits = {c: [] for c in CATS}
    for path, text in sources.items():
        if path == target:
            continue
        if regex.search(text):
            hits[category(path)].append(path)
    rows.append((target, hits))

with OUT.open('w', encoding='utf-8') as out:
    out.write('file\t' + '\t'.join(CATS) + '\texec_refs\tdoc_refs\tclass\n')
    for target, hits in rows:
        exec_refs = sum(len(hits[c]) for c in ('pkg', 'wf', 'cc', 'cs', 'scr', 'code'))
        doc_refs = len(hits['doc'])
        old = len(hits['olddoc'])
        if exec_refs:
            klass = 'code'
        elif doc_refs:
            klass = 'current-doc-only'
        elif old:
            klass = 'dated-doc-only'
        elif hits['manifest']:
            klass = 'manifest-only'
        else:
            klass = 'none'
        out.write(target + '\t' + '\t'.join(str(len(hits[c])) for c in CATS)
                  + f'\t{exec_refs}\t{doc_refs}\t{klass}\n')

detail = OUT.with_suffix('.detail.txt')
with detail.open('w', encoding='utf-8') as out:
    for target, hits in rows:
        out.write(target + '\n')
        for c in CATS:
            for path in sorted(hits[c]):
                out.write(f'  {c}\t{path}\n')
print(f'targets={len(targets)} sources={len(sources)} out={OUT} detail={detail}')
