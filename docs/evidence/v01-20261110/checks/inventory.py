import re, subprocess, sys
from pathlib import Path
ROOT = Path(sys.argv[1])
checks = sorted(
    [p for p in (ROOT/'scripts').glob('check-*')] +
    [p for p in (ROOT/'scripts/crawler').glob('check*.py')] +
    [p for p in (ROOT/'scripts/runner').glob('check_*.py')] +
    [p for p in (ROOT/'scripts/geo').glob('check_*.py')] +
    [ROOT/'scripts/measure-d1-reads.mjs', ROOT/'scripts/measure-d1-writes.mjs', ROOT/'scripts/run-actionlint.py', ROOT/'scripts/run-runtime-check.py']
)
cc = (ROOT/'scripts/cloud-check.py').read_text(encoding='utf-8')
full_idx = cc.index('if args.full:')
wf = {p.name: p.read_text(encoding='utf-8') for p in (ROOT/'.github/workflows').glob('*.yml')}
pkg = (ROOT/'package.json').read_text(encoding='utf-8')
# other references: scripts (non-self), docs, skills, root md
def refs(rel, name):
    out = subprocess.run(['git','-C',str(ROOT),'grep','-l','-F',name,'--',':!docs/history',':!docs/evidence',':!source-assets',':!archives'],capture_output=True,text=True,encoding='utf-8').stdout.split()
    return [o for o in out if o != rel]
print('count', len(checks))
for p in checks:
    rel = str(p.relative_to(ROOT))
    name = p.name
    where = []
    i = cc.find("'"+rel+"'")
    if i >= 0:
        where.append('cloud-check' + (' --full' if i > full_idx else ''))
    for w, t in wf.items():
        if name in t: where.append('wf:'+w)
    if name in pkg: where.append('package.json')
    others = refs(rel, name)
    scripts = [o for o in others if o.startswith('scripts/') and o != 'scripts/cloud-check.py']
    docs = [o for o in others if not o.startswith('scripts/') and not o.startswith('.github/')]
    print(f"{rel}\t{'; '.join(where) or '-'}\tscripts:{','.join(scripts) or '-'}\tdocs:{','.join(docs) or '-'}")
