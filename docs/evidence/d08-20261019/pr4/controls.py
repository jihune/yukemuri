# Each control breaks one thing in a scratch copy and expects check-snapshot-geo.mjs to fail.
# Usage: python3 -I controls.py <copy of scripts, lib, components, data, public with node_modules linked>
import subprocess
import sys
from pathlib import Path

C = Path(sys.argv[1])
cases = [
    ('scripts/snapshot-geo.mjs', "if(meters(geo.lat[i],geo.lng[i],point[0],point[1])>OVERTURE_MOVE[geo.grade[i]]){tooFar++;return}", '', 'no range check'),
    ('scripts/snapshot-geo.mjs', 'unplaced[i]&&OVERTURE_MOVE', 'OVERTURE_MOVE', 'payload points may move'),
    ('scripts/snapshot-geo.mjs', 'OVERTURE_MOVE={[GRADE.oaza]:5000,', 'OVERTURE_MOVE={[GRADE.block]:5000,[GRADE.oaza]:5000,', 'grade 2 may move'),
    ('lib/geo-attribution.ts', ",Microsoft:'Data from Microsoft. Available under CDLA Permissive 2.0.'", '', 'Microsoft not credited'),
    ('components/stay-map.tsx', 'map.attributionControl.addAttribution(OVERTURE_MAP_CREDIT);', '', 'map credit dropped'),
    ('scripts/geo/update-overture.py', "elif not set(o['licenses']) <= LICENSES:", "elif False:", 'Foursquare kept'),
    ('scripts/geo/update-overture.py', "return [(n, found[0]) for n, found in enumerate(hits) if len(found) == 1 and per_place[found[0]] == 1]",
     "return [(n, found[0]) for n, found in enumerate(hits) if len(found) == 1]", 'not one-to-one'),
]
fails = 0
for path, old, new, name in cases:
    f = C / path
    keep = f.read_text(encoding='utf-8')
    assert keep.count(old) == 1, name
    f.write_text(keep.replace(old, new), encoding='utf-8')
    r = subprocess.run(['node', 'scripts/check-snapshot-geo.mjs'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
    f.write_text(keep, encoding='utf-8')
    caught = r.returncode != 0
    fails += not caught
    msg = (r.stderr.strip().splitlines() or [''])
    line = next((l for l in msg if l.startswith('AssertionError')), msg[0])
    print(f"{name}: {'caught' if caught else 'NOT CAUGHT'} (rc {r.returncode}) {line[:140]}")
r = subprocess.run(['node', 'scripts/check-snapshot-geo.mjs'], check=False, cwd=C, capture_output=True, text=True, encoding='utf-8')
print(f'unbroken copy: rc {r.returncode}')
print(f"controls: {len(cases) - fails}/{len(cases)} caught, unbroken passes: {r.returncode == 0} -> {'PASS' if fails == 0 and r.returncode == 0 else 'FAIL'}")
