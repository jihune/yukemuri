# Per pair: same original name, house numbers of the Jalan address in the Trip address,
# same prefecture, distance between the two points, annex or brand-variant words.
import importlib.util
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('u', ROOT / 'scripts/geo/update-overture.py')
u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)
S = Path(sys.argv[1])
d = json.loads((S / 'pr5/pairs.json').read_text(encoding='utf-8'))
ANNEX = re.compile('別館|本館|新館|離れ|annex|アネックス|EAST|WEST|east|west|東館|西館|南館|北館')
def nums(s):
    s = unicodedata.normalize('NFKC', s or '')
    s = re.sub(r'\d{3}[- ]?\d{4}', ' ', s)  # postcodes
    return re.findall(r'\d+', s)
rows = []
for k, x in enumerate(d['pairs'], 1):
    j, t = x['ours']
    o = x['overture']
    same_ja = u.norm_name(j['names']['ja']) == u.norm_name(t['names']['ja'])
    same_any = bool({u.norm_name(n) for n in (j['names']['ja'], j['names']['en'])} & {u.norm_name(n) for n in (t['names']['ja'], t['names']['en'])})
    jr = j['rest'] or ''
    jl = o['locality'] or ''
    jrest = jr[len(jl):] if jl and jr.startswith(jl) else jr
    jn = nums(jrest)
    # Trip's address: the context text up to the Korean country word.
    tctx = unicodedata.normalize('NFKC', t['context'] or '')
    taddr = tctx.split('일본')[0] if '일본' in tctx else tctx[:200]
    tn = nums(taddr)
    k2 = min(2, len(jn))
    house = 'agree' if jn and all(n in tn for n in jn[:k2]) else ('unknown' if not jn else 'disagree')
    dist = round(u.meters(j['lat'], j['lng'], t['lat'], t['lng'])) if j['lat'] is not None and t['lat'] is not None else None
    annex = bool(ANNEX.search(j['names']['ja'] + ' ' + t['names']['ja'] + ' ' + t['names']['en']))
    rows.append({'n': k, 'jalan': j['id'], 'trip': t['id'], 'jalanName': j['names']['ja'], 'tripName': t['names']['ja'], 'tripEn': t['names']['en'], 'jalanEn': j['names']['en'],
                 'sameJa': same_ja, 'sameName': same_any, 'pref': j['pref'], 'jalanAddress': (j['pref'] or '') + jr, 'tripAddress': taddr.strip()[:160],
                 'jalanNumbers': jn[:k2], 'house': house, 'jalanGrade': j['grade'], 'distM': dist, 'annexWord': annex, 'jalanState': j['state'], 'tripState': t['state'],
                 'overture': o['id']})
(Path(__file__).resolve().parent / 'verify.json').write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
ok = [r for r in rows if r['sameName'] and r['house'] == 'agree' and not r['annexWord'] and (r['distM'] is None or r['distM'] <= 300 or r['jalanGrade'] >= 3)]
print('pairs', len(rows), '| same ja name', sum(r['sameJa'] for r in rows), '| same name ja/en', sum(r['sameName'] for r in rows),
      '| house agree', sum(r['house'] == 'agree' for r in rows), '| annex word', sum(r['annexWord'] for r in rows),
      '| dist<=300 m', sum(1 for r in rows if r['distM'] is not None and r['distM'] <= 300), '| all conditions', len(ok))
for r in rows:
    if r not in ok or not r['sameJa']:
        print(' check:', r['n'], r['jalan'], r['trip'], r['jalanName'], '|', r['tripName'], '|', r['jalanEn'], '| house', r['house'], r['jalanNumbers'], '| dist', r['distM'], 'g', r['jalanGrade'], '|', r['tripAddress'][:90])
