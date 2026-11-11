"""Reviewer's own seeded-defect runner (independent of the PR's controls.py).

usage: python3 run_mutations.py <copy> <log dir> <id> [<id> ...]

For each id in mutations.json: replace the rule text once in <copy>, rebuild, run the
check, write the whole build and check output to <log dir>/<id>.{build,check}.log, put the
file back, and print one line: id, build exit, check exit, the first AssertionError line.
The verdict is read by the reviewer from the whole check log, not from this line.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
copy, logs, wanted = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3:]
logs.mkdir(parents=True, exist_ok=True)
mutations = {m['id']: m for m in json.loads((HERE / 'mutations.json').read_text(encoding='utf-8'))}


def run(command, log):
    with log.open('w', encoding='utf-8') as out:
        return subprocess.run(command, cwd=copy, stdout=out, stderr=subprocess.STDOUT, check=False).returncode


for key in wanted:
    m = mutations[key]
    target = copy / m['file']
    original = target.read_text(encoding='utf-8')
    count = original.count(m['old'])
    if count != 1:
        print(f'{key}\tSKIPPED: rule text found {count} times', flush=True)
        continue
    started = time.time()
    try:
        target.write_text(original.replace(m['old'], m['new']), encoding='utf-8')
        build = run(['node', 'scripts/run-framework.mjs', 'build'], logs / (key + '.build.log'))
        check = run(m['check'], logs / (key + '.check.log')) if build == 0 else None
    finally:
        target.write_text(original, encoding='utf-8')
    text = (logs / (key + '.check.log')).read_text(encoding='utf-8', errors='replace') if check is not None else ''
    first = next((line for line in text.splitlines() if 'AssertionError' in line), '(no AssertionError line)')
    stamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    print(f'{stamp}\t{key}\tbuild_exit={build}\tcheck_exit={check}\t{time.time() - started:.0f}s\t{first[:200]}', flush=True)
