"""Refreshes data/overture-geo.json (D08 PR 4): Overture Maps Places points for
hotels whose map position in the public snapshot is approximate (geo.json
grades 3-6). Run by hand when Overture publishes a release (about monthly),
then commit. The snapshot build reads only the committed file
(scripts/snapshot-geo.mjs); nothing here reads or writes D1.

  python3 -m venv /tmp/ov && /tmp/ov/bin/pip install duckdb==1.5.6
  /tmp/ov/bin/python -I scripts/geo/update-overture.py --release 2026-09-23.1

--parquet FILE reads a saved extract instead of the public S3 bucket (--save
FILE keeps the extract); --snapshot DIR reads a saved public snapshot
(manifest.json and its files) instead of the public site.

Join (docs/D08-20261019.md section 11.3): the same normalised name, then rule b
(our source point within 150 m) or rule c (same prefecture and municipality),
one-to-one only. Kept: our point at grade 3-6, house numbers agree, Overture
confidence 0.5 or more, the move within 5 km (grade 3) or 20 km (grades 4-6),
and only records under CDLA Permissive 2.0 or CC0 (Foursquare's Apache 2.0
records are left out). The build checks the grade and the move again.
"""
import argparse
import collections
import json
import math
import os
import random
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/overture-geo.json'
ORIGIN = 'https://yukemuri.jihune.workers.dev'
AGENT = 'YukemuriCatalogUpdater/1.0 (+https://github.com/jihune/yukemuri)'
BUCKET = 's3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*'
LICENSES = {'CDLA-Permissive-2.0', 'CC0-1.0'}
NEAR_M = 150
MOVE_M = {3: 5000, 4: 20000, 5: 20000, 6: 20000}
MIN_CONFIDENCE = 0.5
HANGUL = re.compile('[가-힣]')
# The extract of D08 section 4.2: lodging in the Japan box, country JP kept later.
EXTRACT = """SELECT id, names.primary AS name, (bbox.ymin+bbox.ymax)/2 AS lat, (bbox.xmin+bbox.xmax)/2 AS lng,
  confidence, addresses[1].freeform AS freeform, addresses[1].locality AS locality, addresses[1].region AS region,
  addresses[1].country AS country, list_transform(sources, s -> s.dataset) AS datasets, list_transform(sources, s -> s.license) AS licenses
FROM {src}
WHERE bbox.xmin BETWEEN 122 AND 154 AND bbox.ymin BETWEEN 24 AND 46
  AND (list_contains(taxonomy.hierarchy, 'lodging')
       OR basic_category IN ('hotel','motel','hostel','resort','inn','guest_house','ryokan','bed_and_breakfast','campground','lodging'))"""


def norm_name(s):
    """NFKC, case folded, small ke/ka unified, every space, punctuation and symbol dropped."""
    if not s:
        return ''
    s = unicodedata.normalize('NFKC', s).casefold().replace('ヶ', 'ケ').replace('ヵ', 'カ')
    return ''.join(ch for ch in s if unicodedata.category(ch)[0] in 'LNM')


def strip_county(s):
    """'知多郡南知多町...' -> '南知多町...'; '小郡市...' and '郡山市...' stay as they are."""
    m = re.match(r'^([^郡\d]{1,6}?郡)(.+)$', s)
    if m and not re.match('^[市区]', m.group(2)) and re.match(r'^\D*?[町村]', m.group(2)):
        return m.group(2)
    return s


def muni_match(rest, locality):
    """rest: our address after the prefecture; locality: Overture's municipality."""
    if not rest or not locality or not re.search('[市区町村]$', locality):
        return False
    return rest.startswith(locality) or strip_county(rest).startswith(strip_county(locality))


def house_numbers(s):
    if not s:
        return []
    s = re.sub(r'〒?\d{3}-\d{4}', ' ', unicodedata.normalize('NFKC', s))  # a postcode is not a house number
    return re.findall(r'\d+', s)


def address_agreement(our_rest, ov_freeform, ov_locality):
    """The first two digit groups after the municipality: agree, disagree or unknown."""
    a = our_rest or ''
    if ov_locality and a.startswith(ov_locality):
        a = a[len(ov_locality):]
    x, y = house_numbers(a), house_numbers(ov_freeform)
    if not x or not y:
        return 'unknown'
    k = min(2, len(x), len(y))
    return 'agree' if x[:k] == y[:k] else 'disagree'


def meters(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    h = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lng2 - lng1) * r / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def our_hotels(snapshot, prefectures):
    """One row per snapshot hotel: name keys (ja/en without Hangul), Japanese address, grade and point."""
    core, cards, text, geo = (snapshot[k] for k in ('core', 'cards', 'text', 'geo'))
    rows = []
    for i, hid in enumerate(core['ids']):
        if cards[i]['id'] != hid:
            raise SystemExit('cards and core are not in the same order at ' + hid)
        names = [n for n in (cards[i]['names']['ja'], cards[i]['names']['en']) if n and not HANGUL.search(n)]
        pref = prefectures.get(core['prefecture'][i])
        context = unicodedata.normalize('NFKC', text['context'][i] or '')
        m = re.search(re.escape(pref) + r'(\S+)', context) if pref else None
        rows.append({'id': hid, 'keys': {norm_name(n) for n in names} - {''}, 'pref': pref, 'rest': m.group(1) if m else None,
                     'grade': geo['grade'][i], 'lat': geo['lat'][i], 'lng': geo['lng'][i]})
    return rows


def assign_prefectures(ours, places, names):
    """Overture's prefecture: its region or the head of its address; otherwise the prefecture of
    our nearest hotel with a source or block-level point (grades 1-2)."""
    grid = collections.defaultdict(list)
    for r in ours:
        if r['grade'] in (1, 2) and r['pref'] and r['lat'] is not None:
            grid[(int(r['lat'] * 10), int(r['lng'] * 10))].append((r['lat'], r['lng'], r['pref']))

    def cells(cy, cx, k):
        return [p for dy in range(-k, k + 1) for dx in range(-k, k + 1) for p in grid.get((cy + dy, cx + dx), ())]

    def nearest(lat, lng):
        cy, cx = int(lat * 10), int(lng * 10)
        for k in (1, 3, 6, 12, 25, 50, 100):
            if cells(cy, cx, k):
                found = cells(cy, cx, int(k * 1.5) + 1)
                return min(found, key=lambda p: (p[0] - lat) ** 2 + ((p[1] - lng) * math.cos(lat * math.pi / 180)) ** 2)[2]
        return None

    for o in places:
        own = o['region'] if o['region'] in names else next((n for n in names if (o['freeform'] or '').startswith(n)), None)
        o['pref'] = own or nearest(o['lat'], o['lng'])


def join(ours, places):
    """Rule b, then rule c; a hotel stops at the first rule with any candidate. Returns
    (hotel index, place index) pairs that are one-to-one across both rules."""
    index = collections.defaultdict(list)
    for j, o in enumerate(places):
        if o['key']:
            index[o['key']].append(j)
    hits = []
    for r in ours:
        cand = sorted({j for k in r['keys'] for j in index.get(k, ())})
        found = []
        if r['grade'] == 1 and cand:
            found = [j for j in cand if meters(r['lat'], r['lng'], places[j]['lat'], places[j]['lng']) < NEAR_M]
        if not found and r['rest'] and cand:
            found = [j for j in cand if places[j]['pref'] == r['pref'] and muni_match(r['rest'], places[j]['locality'])]
        hits.append(found)
    per_place = collections.Counter(j for found in hits for j in found)
    return [(n, found[0]) for n, found in enumerate(hits) if len(found) == 1 and per_place[found[0]] == 1]


def keep(ours, places, pairs):
    """The pairs the snapshot may use, and why the others were left out."""
    kept, why = [], collections.Counter()
    for n, j in pairs:
        r, o = ours[n], places[j]
        if r['grade'] not in MOVE_M:
            why['our point is a source, block-level or no point'] += 1
        elif address_agreement(r['rest'], o['freeform'], o['locality']) != 'agree':
            why['house numbers do not agree'] += 1
        elif o['confidence'] is None or o['confidence'] < MIN_CONFIDENCE:
            why['confidence under 0.5'] += 1
        elif meters(r['lat'], r['lng'], o['lat'], o['lng']) > MOVE_M[r['grade']]:
            why['move beyond the grade range'] += 1
        elif not set(o['licenses']) <= LICENSES:
            why['license not CDLA Permissive 2.0 or CC0 (Foursquare)'] += 1
        else:
            kept.append((n, j))
    return kept, why


def fetch_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode('utf-8'))


def load_snapshot(folder):
    if folder:
        base = Path(folder)
        manifest = json.loads((base / 'manifest.json').read_text(encoding='utf-8'))
        return manifest, {k: json.loads((base / f'{k}.json').read_text(encoding='utf-8')) for k in ('core', 'cards', 'text', 'geo')}
    manifest = fetch_json(ORIGIN + '/snapshot/manifest.json')
    return manifest, {k: fetch_json(ORIGIN + manifest['files'][k]) for k in ('core', 'cards', 'text', 'geo')}


def load_places(release, parquet, save):
    import duckdb
    con = duckdb.connect()
    if parquet:
        src = f"read_parquet('{parquet}')"
    else:
        con.execute('INSTALL httpfs; LOAD httpfs;')
        proxy = os.environ.get('HTTPS_PROXY', '')
        if proxy:
            con.execute(f"SET http_proxy='{proxy.split('://')[-1].rstrip('/')}'")
        if os.path.exists('/root/.ccr/ca-bundle.crt'):
            con.execute("SET ca_cert_file='/root/.ccr/ca-bundle.crt'")
        con.execute("CREATE SECRET anon (TYPE s3, KEY_ID '', SECRET '', REGION 'us-west-2')")
        src = f"read_parquet('{BUCKET.format(release=release)}', hive_partitioning=1)"
    started = time.time()
    con.execute(f'CREATE TABLE jp AS {EXTRACT.format(src=src)}')
    if save:
        con.execute(f"COPY jp TO '{save}' (FORMAT parquet)")
    cols = ['id', 'name', 'lat', 'lng', 'confidence', 'freeform', 'locality', 'region', 'datasets', 'licenses']
    rows = [dict(zip(cols, r)) for r in con.execute(f"SELECT {', '.join(cols)} FROM jp WHERE country = 'JP' ORDER BY id").fetchall()]
    for o in rows:
        o['key'] = norm_name(o['name'])
        o['locality'] = unicodedata.normalize('NFKC', o['locality']) if o['locality'] else None
    return rows, round(time.time() - started, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--release', required=True, help='Overture release, e.g. 2026-09-23.1')
    parser.add_argument('--parquet', help='a saved extract instead of S3')
    parser.add_argument('--save', help='keep the extract here')
    parser.add_argument('--snapshot', help='a saved public snapshot folder instead of the public site')
    parser.add_argument('--out', default=str(OUT))
    args = parser.parse_args()
    prefectures = {p['id']: p['ja'] for p in json.loads((ROOT / 'data/prefectures.json').read_text(encoding='utf-8'))}
    manifest, snapshot = load_snapshot(args.snapshot)
    ours = our_hotels(snapshot, prefectures)
    places, seconds = load_places(args.release, args.parquet, args.save)
    assign_prefectures(ours, places, set(prefectures.values()))
    pairs = join(ours, places)
    kept, why = keep(ours, places, pairs)
    # Control: with Overture names shuffled among its places the kept pairs must collapse.
    names = [o['key'] for o in places]
    random.Random(20261019).shuffle(names)
    control_kept, _ = keep(ours, places, join(ours, [{**o, 'key': k} for o, k in zip(places, names)]))
    ok = bool(kept) and len(control_kept) <= 0.05 * len(kept)
    grades = collections.Counter(ours[n]['grade'] for n, _ in kept)
    print(f"Overture {args.release}: {len(places)} places in Japan read in {seconds}s; snapshot {manifest['id']} ({len(ours)} hotels)")
    print(f'  one-to-one pairs {len(pairs)}; kept {len(kept)} (by our grade {dict(sorted(grades.items()))}); left out: {dict(why)}')
    print(f"  control, Overture names shuffled: {len(control_kept)} kept vs {len(kept)} -> {'PASS' if ok else 'FAIL'}")
    if not ok:
        sys.exit(1)
    rows = sorted([ours[n]['id'], places[j]['id'], round(places[j]['lat'], 6), round(places[j]['lng'], 6),
                   round(places[j]['confidence'], 3), places[j]['datasets'][0]] for n, j in kept)
    data = {'source': BUCKET.format(release=args.release).removesuffix('/*'), 'release': args.release, 'snapshot': manifest['id'],
            'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'license': 'CDLA-Permissive-2.0',
            'licenseText': 'public/licenses/CDLA-Permissive-2.0.txt',
            'note': 'Overture Maps Places point (bbox centre) for hotels at map grades 3-6. Columns: hotelId, Overture id, lat, lng, '
                    'confidence, first source. Records under CDLA Permissive 2.0 (Meta, Microsoft) or CC0 (AllThePlaces) only. '
                    'docs/D08-20261019.md',
            'hotels': rows}
    body = '{\n' + ',\n'.join(' ' + json.dumps(k) + ':' + ('[\n' + ',\n'.join('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in v) + '\n ]'
                                                           if k == 'hotels' else json.dumps(v, ensure_ascii=False)) for k, v in data.items()) + '\n}\n'
    Path(args.out).write_text(body, encoding='utf-8')
    print(f'  wrote {len(rows)} hotels, {len(body.encode())} bytes to {args.out}')


if __name__ == '__main__':
    main()
