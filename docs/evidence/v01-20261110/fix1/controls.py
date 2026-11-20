"""Seeded-defect controls for the assertions the check-hardening change added.

Each control in controls.json takes one rule out of a copy of the repository (one
exact text replacement), rebuilds the Worker when the rule is Worker code, and runs
the check that should notice. The control holds only when the check exits non-zero
and the statement that failed is the added assertion: its text ("expect") stands
in the assertion failure the check printed (from the first "AssertionError" on), as
the message or on a line of the check that the stack names. Any other failure (a
build error, an exception that is not an assertion, an older assertion failing
first) is reported as a control that does not hold. The file is put back afterwards.

usage: python3 controls.py <copy of the repository> <results file> [id ...]
       (no id: every control). The copy needs node_modules; the script never edits
       the tree it is stored in. The start of each assertion failure is appended to
       <results file>.failures.txt.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
copy, results = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
assert HERE not in copy.parents and copy != HERE.parents[2], 'Run against a copy, not the working tree'
controls = json.loads((HERE / 'controls.json').read_text(encoding='utf-8'))
wanted = sys.argv[3:] or [c['id'] for c in controls]


def run(command):
    r = subprocess.run(command, cwd=copy, capture_output=True, text=True, encoding='utf-8', errors='replace', check=False)
    return r.returncode, r.stdout + r.stderr


def failed_statement(control, output):
    """The expected text in the assertion failure, or on a check line its stack names."""
    if control['expect'] in output:
        return 'in the assertion message'
    name = Path(control['check'][-1]).name
    lines = (copy / control['check'][-1]).read_text(encoding='utf-8').splitlines()
    for number in re.findall(re.escape(name) + r'(?::|", line )(\d+)', output):
        if control['expect'] in lines[int(number) - 1]:
            return 'on line ' + number + ' of ' + name + ', named in the stack'
    return None


for control in [c for c in controls if c['id'] in wanted]:
    target = copy / control['file']
    original = target.read_text(encoding='utf-8')
    assert original.count(control['old']) == 1, control['id'] + ': the rule text is not there exactly once'
    started, verdict, detail = time.time(), 'DOES NOT HOLD', ''
    try:
        target.write_text(original.replace(control['old'], control['new']), encoding='utf-8')
        code, output = run(['node', 'scripts/run-framework.mjs', 'build']) if control['build'] else (0, '')
        if code:
            detail = 'build exit ' + str(code)
        else:
            code, output = run(control['check'])
            # Only the assertion failure counts: text before it (a test's name, an echoed source line) does not.
            failure = output[output.index('AssertionError'):] if 'AssertionError' in output else ''
            where = failed_statement(control, failure)
            with Path(str(results) + '.failures.txt').open('a', encoding='utf-8') as out:
                out.write('== ' + control['id'] + ': ' + control['rule'] + '\n' + '\n'.join(line[:300] for line in failure.replace(str(copy), '<copy>').splitlines()[:14]) + '\n\n')
            if code and where:
                verdict, detail = 'HOLDS', 'check exit ' + str(code) + ', "' + control['expect'] + '" ' + where
            else:
                first = next((line.strip() for line in output.splitlines() if 'Error' in line or 'FAIL' in line), output.strip().splitlines()[-1] if output.strip() else '')
                detail = 'check exit ' + str(code) + ', expected text not in an assertion failure: ' + first[:300]
    finally:
        target.write_text(original, encoding='utf-8')
    line = '\t'.join([time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), control['id'], verdict, ' '.join(control['check']), detail, f'{time.time() - started:.0f}s', control['rule']])
    with results.open('a', encoding='utf-8') as out:
        out.write(line + '\n')
    print(line, flush=True)
