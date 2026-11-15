"""Seeded-defect controls for the V01-1 status-reason assertion of scripts/check-collection-status-worker.mjs.

The unchanged copy must pass first. Then each control takes one part of the classification out of the copy's
lib/read-collection-status.ts (one exact text replacement; the old text must be there exactly once), rebuilds the
Worker and runs the check. A control holds when the check exits non-zero and its "expect" text, the message of
the assertion that should notice, is in the assertion failure the check printed. The file is put back afterwards.

usage: python3 controls_worker.py <copy of the repository with node_modules> <results file> [id ...]
"""
import subprocess
import sys
import time
from pathlib import Path

copy, results = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
TARGET = copy / 'lib/read-collection-status.ts'
EXPECT = 'collector-side failure names are source data to check, not other request errors'
NAMES = "   WHEN error IN ('AttributeError','TypeError','LookupError','KeyError','IndexError','IncompleteRead','queue_url_unsupported') OR error GLOB 'site_contract_[0-9]*' THEN 'source_format'\n"
CONTROLS = [
    ('W1', 'the whole classification of the collector-side names', NAMES, ''),
    ('W2', 'the site_contract_ names', " OR error GLOB 'site_contract_[0-9]*' THEN 'source_format'", " THEN 'source_format'"),
    ('W3', 'the queue_url_unsupported name', ",'IncompleteRead','queue_url_unsupported')", ",'IncompleteRead')"),
    ('W4', 'the parser exception names', "'AttributeError','TypeError','LookupError','KeyError','IndexError',", ''),
]
wanted = sys.argv[3:] or [c[0] for c in CONTROLS]


def run(command):
    r = subprocess.run(command, cwd=copy, capture_output=True, text=True, encoding='utf-8', errors='replace', check=False)
    return r.returncode, r.stdout + r.stderr


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def log(line):
    with results.open('a', encoding='utf-8') as out:
        out.write(line + '\n')
    print(line, flush=True)


def build_and_check():
    code, output = run(['node', 'scripts/run-framework.mjs', 'build'])
    if code:
        return code, 'build failed: ' + output[-300:]
    return run(['node', 'scripts/check-collection-status-worker.mjs'])


original = TARGET.read_text(encoding='utf-8')
code, output = build_and_check()
log('\t'.join([now(), 'unchanged copy', 'PASS' if code == 0 else 'FAIL', 'check rc=' + str(code)]))
held = 0
for cid, rule, old, new in [c for c in CONTROLS if c[0] in wanted]:
    assert original.count(old) == 1, cid + ': the text is not there exactly once'
    try:
        TARGET.write_text(original.replace(old, new), encoding='utf-8')
        code, output = build_and_check()
    finally:
        TARGET.write_text(original, encoding='utf-8')
    failure = output[output.index('AssertionError'):] if 'AssertionError' in output else ''
    ok = code != 0 and EXPECT in failure
    held += ok
    log('\t'.join([now(), cid, 'HOLDS' if ok else 'DOES NOT HOLD', 'check rc=' + str(code), '"' + EXPECT + '"', rule]))
assert TARGET.read_text(encoding='utf-8') == original
first = results.read_text(encoding='utf-8').splitlines()[0]
log(f'SUMMARY controls_held={held} of {len(wanted)}; unchanged copy rc={0 if "PASS" in first else 1}')
