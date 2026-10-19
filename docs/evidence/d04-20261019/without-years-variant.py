# D04 follow-up control (docs/D04-20261015.md 8.4): writes a copy of scripts/measure-d1-writes.mjs whose
# pages carry no facilityYears, so the two runs differ only in that field. Run from the repository root:
#   python3 docs/evidence/d04-20261019/without-years-variant.py /tmp/x/measure-without-years.mjs
#   node /tmp/x/measure-without-years.mjs --out docs/evidence/d04-20261019/writes-without-years.json
import sys
from pathlib import Path

src = Path('scripts/measure-d1-writes.mjs').read_text(encoding='utf-8')
old_import = "from './collection-budget.mjs'"
old_body = "    return dict(url=url,status='done'"
assert src.count(old_import) == 1 and src.count(old_body) == 1
out = src.replace(old_import, f"from '{Path('scripts/collection-budget.mjs').resolve().as_posix()}'")
out = out.replace(old_body, "    [o.pop('facilityYears',None) for o in observations]\n" + old_body)
Path(sys.argv[1]).write_text(out, encoding='utf-8')
