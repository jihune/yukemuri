#!/usr/bin/env python3
"""Feed the same origins to every Worker-address rule in the repository copy.

Usage: python3 origin_rules.py <repo>
Python rules are imported from the files; JS rules are run with node from the
files' own regex literals (the scripts themselves would send requests).
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(REPO / 'scripts/crawler'))
import source_safety  # noqa: E402

spec = importlib.util.spec_from_file_location('collection', REPO / 'scripts/runner/run-collection.py')
collection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collection)

INPUTS = [
    'https://yukemuri.jihune.workers.dev',
    'http://yukemuri.jihune.workers.dev',
    'https://yukemuri.a-.workers.dev',
    'https://yukemuri.-.workers.dev',
    'https://yukemuri.' + 'a' * 64 + '.workers.dev',
    'https://yukemuri.jihune.workers.dev:8443',
    'https://yukemuri.jihune.workers.dev/x?y=1',
    'https://YUKEMURI.jihune.workers.dev',
    'https://yukemuri.jihune.workers.dev\n',
    'https://yukemuri.jihun7891.chatgpt.site',
]


def run_collection(origin):
    try:
        collection.target_origin({'publicOrigin': origin, 'autoDeploy': True, 'databaseId': 'x'})
        return 'accept'
    except ValueError:
        return 'reject'


def safety(origin):
    try:
        return 'accept ' + source_safety.site_api(origin, 'k' * 24)[0]
    except ValueError:
        return 'reject'


NODE = r'''
import {readFileSync} from 'node:fs';
import {deployGate} from './scripts/cloudflare-deploy-gate.mjs';
const inputs=JSON.parse(process.argv.at(-1));
const literal=(file,pattern)=>{const m=readFileSync(file,'utf8').match(pattern);if(!m)throw new Error('no regex in '+file);return new Function('return '+m[1])()};
const rules={
 'cloudflare-deploy-gate.mjs deployGate':o=>{try{deployGate({workerName:'yukemuri',databaseName:'yukemuri',databaseId:'128a3c5b-8e5f-470a-a901-d899d396cae1',publicOrigin:o,autoDeploy:true});return 'accept'}catch{return 'reject'}},
};
for(const file of ['scripts/cloudflare-smoke.mjs','scripts/cloudflare-prepare.mjs','scripts/record-coverage.mjs']){
 const regex=literal(file,/assert\.match\(origin\?\?'',(\/.+?\/),'Expected the public workers\.dev origin'\)/);
 rules[file.slice(8)+' assert.match']=o=>regex.test(o)?'accept':'reject';
}
const release=literal('scripts/build-collector-release.mjs',/if\(!(\/.+?\/)\.test\(siteOrigin\)\)/);
rules['build-collector-release.mjs siteOrigin']=o=>release.test(o)?'accept':'reject';
const out={};for(const [name,rule] of Object.entries(rules))out[name]=inputs.map(rule);
console.log(JSON.stringify(out));
'''
node = subprocess.run(['node', '--input-type=module', '-e', NODE, '--', json.dumps(INPUTS)],
                      cwd=REPO, capture_output=True, encoding='utf-8', check=True)
table = {'run-collection.py target_origin': [run_collection(o) for o in INPUTS],
         'source_safety.py site_api': [safety(o) for o in INPUTS]}
table.update(json.loads(node.stdout))
for index, origin in enumerate(INPUTS):
    shown = origin if len(origin) < 70 else origin[:24] + '...(' + str(len(origin)) + ' chars)'
    print(json.dumps(shown, ensure_ascii=False))
    for name, answers in table.items():
        print(f'    {name:45s} {answers[index]}')
