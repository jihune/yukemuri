# D07 PR 2, 4th review P3-2 (D07-20261019.md 'results (PR 2)' 20): controls for the fix in commit 65af84b
# (ASCII digits, no U+FEFF, the 9-digit, 400-unit and 600-character limits). Run it on a tree that holds
# 65af84b's scripts/crawler/collect.py and check.py: each variant of collect.py must make check.py fail,
# and the fixed one must pass. 'a211968' is the parser before the fix (the one merged in PR #154).
# Usage: python3 locale-limit-controls.py <tree> <scratch dir>
import shutil
import subprocess
import sys
from pathlib import Path

tree, scratch = Path(sys.argv[1]), Path(sys.argv[2])
fixed = (tree / 'scripts/crawler/collect.py').read_text(encoding='utf-8')
old = subprocess.run(['git', '-C', str(tree), 'show', 'a211968:scripts/crawler/collect.py'], capture_output=True, encoding='utf-8', check=True).stdout
variants = {
    'C14 a211968 parser (full-width digits, U+FEFF)': old,
    'C14b fixed digits, U+FEFF kept': fixed.replace(".replace('" + chr(92) + "ufeff', '')", ''),
    'C15 no 9-digit limit': fixed.replace("or len(next(iter(numbers))) > 9 ", ''),
    'C16 no 400-unit name limit': fixed.replace("or len(name.encode('utf-16-le')) > 800 ", ''),
    'C17 no 600-character URL limit': fixed.replace("or len(stay) > 600 ", ''),
    'C18 fixed parser (must pass)': fixed,
}
results = []
for label, source in variants.items():
    root = scratch / 'ctl'
    shutil.rmtree(root, ignore_errors=True)
    shutil.copytree(tree / 'scripts/crawler', root / 'scripts/crawler')
    (root / 'lib').mkdir(parents=True)
    shutil.copy(tree / 'lib/crawl-contract.ts', root / 'lib/crawl-contract.ts')
    shutil.copytree(tree / 'data', root / 'data')
    changed = source != fixed or label.startswith('C18')
    (root / 'scripts/crawler/collect.py').write_text(source, encoding='utf-8')
    run = subprocess.run([sys.executable, 'scripts/crawler/check.py'], cwd=root, capture_output=True, encoding='utf-8', check=False)
    where = [line for line in run.stderr.splitlines() if 'check.py' in line or 'AssertionError' in line][-2:] or ['']
    where = [' | '.join(x.strip() for x in where)]
    expect_pass = label.startswith('C18')
    ok = changed and ((run.returncode == 0) == expect_pass)
    results.append(ok)
    print(f'{label}: rc={run.returncode} {where[0].strip()} -> {"OK" if ok else "UNEXPECTED"}')
print(f'controls {sum(results)}/{len(results)} as expected: {"PASS" if all(results) else "FAIL"}')
