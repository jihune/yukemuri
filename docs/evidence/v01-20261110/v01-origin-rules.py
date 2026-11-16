"""V01-15: the rule for 'the Yukemuri Worker origin' as each place that takes the crawl key writes it.
Python rules are imported; the JavaScript ones are the regular expressions copied from the files
named beside them (checked below to still stand in those files). Run from the repository root."""
import importlib.util, re, sys
from pathlib import Path
sys.path.insert(0, 'scripts/crawler')
import source_safety
spec = importlib.util.spec_from_file_location('collection', 'scripts/runner/run-collection.py'); collection = importlib.util.module_from_spec(spec); spec.loader.exec_module(collection)

GATE = r'^https:\/\/yukemuri\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$'
LOOSE = r'^https:\/\/yukemuri\.[a-z0-9-]+\.workers\.dev$'
for file, text in [('scripts/cloudflare-deploy-gate.mjs', GATE), ('scripts/cloudflare-smoke.mjs', LOOSE), ('scripts/cloudflare-prepare.mjs', LOOSE), ('scripts/record-coverage.mjs', LOOSE)]:
    assert '/' + text + '/' in Path(file).read_text(encoding='utf-8'), file + ' no longer holds this expression'

def runner(u):
    try: collection.target_origin({'publicOrigin': u, 'autoDeploy': True, 'databaseId': 'x'}); return 'takes'
    except ValueError: return 'refuses'
def collector(u):
    try: source_safety.site_api(u, 'k'); return 'takes'
    except ValueError: return 'refuses'
js = lambda pattern: (lambda u: 'takes' if re.search(pattern.replace(r'\/', '/'), u) and '\n' not in u else 'refuses')
rules = [('run-collection.py target_origin', runner), ('cloudflare-deploy-gate.mjs', js(GATE)), ('source_safety.py site_api', collector), ('smoke, prepare, record-coverage', js(LOOSE))]
cases = ['https://yukemuri.jihune.workers.dev', 'http://yukemuri.jihune.workers.dev', 'https://yukemuri.a-.workers.dev', 'https://yukemuri.jihune.workers.dev:8443',
         'https://yukemuri.jihune.workers.dev/x?y=1', 'https://YUKEMURI.jihune.workers.dev', 'https://yukemuri.jihun7891.chatgpt.site']
split = 0
for u in cases:
    answers = [(name, rule(u)) for name, rule in rules]
    same = len({a for _, a in answers}) == 1; split += not same
    print(('same   ' if same else 'SPLIT  ') + u + ' -> ' + ', '.join(f'{name}: {a}' for name, a in answers))
print(f'addresses the rules answer differently: {split} of {len(cases)}')
