# Shared loading and join rules for the Overture measurement (D08 section 11).
# Run the scripts beside this file with the DuckDB venv's python and -I, e.g.
#   VENV/bin/python -I join.py
# -I drops the script directory from sys.path, so each script adds it back itself.
import json, math, random, re, unicodedata, collections

OUT = '/tmp/claude-0/-home-user-yukemuri/0c78c19d-a421-5334-ba23-0ecb47664dcc/scratchpad/overture-measure'
SNAP = OUT + '/snapshot'
OV_PARQUET = '/tmp/claude-0/-home-user/0c78c19d-a421-5334-ba23-0ecb47664dcc/scratchpad/d08raw/ov_jp_lodging.parquet'
PREFS = '/home/user/yukemuri/data/prefectures.json'
THRESHOLD_M = 150
SEED = 20261019
HANGUL = re.compile('[가-힣]')
BUCKETS = [('<0.5', 0, 0.5), ('0.5-0.77', 0.5, 0.77), ('0.77-0.9', 0.77, 0.9), ('>=0.9', 0.9, 1.01)]


def bucket(c):
    for name, lo, hi in BUCKETS:
        if c is not None and lo <= c < hi:
            return name
    return 'none'


def norm_name(s):
    # NFKC, case folded, small ke/ka unified, every space, punctuation and symbol dropped.
    if not s:
        return ''
    s = unicodedata.normalize('NFKC', s).casefold().replace('ヶ', 'ケ').replace('ヵ', 'カ')
    return ''.join(ch for ch in s if unicodedata.category(ch)[0] in 'LNM')


def strip_county(s):
    # '知多郡南知多町...' -> '南知多町...'; '小郡市...' and '郡山市...' stay as they are.
    m = re.match(r'^([^郡\d]{1,6}?郡)(.+)$', s)
    if m and not re.match('^[市区]', m.group(2)) and re.match(r'^\D*?[町村]', m.group(2)):
        return m.group(2)
    return s


def muni_match(rest, locality):
    # rest: our address after the prefecture; locality: Overture's municipality.
    if not rest or not locality or not re.search('[市区町村]$', locality):
        return False
    return rest.startswith(locality) or strip_county(rest).startswith(strip_county(locality))


def house_numbers(s):
    if not s:
        return []
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'〒?\d{3}-\d{4}', ' ', s)  # a postcode is not a house number
    return re.findall(r'\d+', s)


def address_agreement(our_rest, ov_freeform, ov_locality):
    # Compares the first two digit groups after the municipality: agree, disagree or unknown.
    a = our_rest or ''
    if ov_locality and a.startswith(ov_locality):
        a = a[len(ov_locality):]
    b = ov_freeform or ''
    x, y = house_numbers(a), house_numbers(b)
    if not x or not y:
        return 'unknown'
    k = min(2, len(x), len(y))
    return 'agree' if x[:k] == y[:k] else 'disagree'


def meters(lat1, lng1, lat2, lng2):
    r = math.pi / 180
    h = math.sin((lat2 - lat1) * r / 2) ** 2 + math.cos(lat1 * r) * math.cos(lat2 * r) * math.sin((lng2 - lng1) * r / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def quantiles(values):
    v = sorted(values)
    if not v:
        return {'n': 0}
    q = lambda p: v[min(len(v) - 1, int(round(p * (len(v) - 1))))]
    return {'n': len(v), 'median': round(q(0.5)), 'p90': round(q(0.9)), 'max': round(v[-1])}


def load_ours():
    core = json.load(open(SNAP + '/core.json', encoding='utf-8'))
    cards = json.load(open(SNAP + '/cards.json', encoding='utf-8'))
    text = json.load(open(SNAP + '/text.json', encoding='utf-8'))
    geo = json.load(open(SNAP + '/geo.json', encoding='utf-8'))
    manifest = json.load(open(SNAP + '/manifest.json', encoding='utf-8'))
    prefs = {p['id']: p['ja'] for p in json.load(open(PREFS, encoding='utf-8'))}
    rows = []
    for i, hid in enumerate(core['ids']):
        assert cards[i]['id'] == hid
        names = [n for n in (cards[i]['names']['ja'], cards[i]['names']['en']) if n and not HANGUL.search(n)]
        pref = prefs.get(core['prefecture'][i])
        ctx = unicodedata.normalize('NFKC', text['context'][i] or '')
        m = re.search(re.escape(pref) + r'(\S+)', ctx) if pref else None
        rows.append({'i': i, 'id': hid, 'name': cards[i]['names']['ja'], 'keys': {norm_name(n) for n in names} - {''},
                     'pref': pref, 'addr': m.group(0) if m else None, 'rest': m.group(1) if m else None,
                     'grade': geo['grade'][i], 'lat': geo['lat'][i], 'lng': geo['lng'][i]})
    return rows, manifest


def load_overture():
    import duckdb
    con = duckdb.connect()
    sql = f"""SELECT id, names.primary, (bbox.ymin+bbox.ymax)/2, (bbox.xmin+bbox.xmax)/2, confidence, basic_category,
      addresses[1].freeform, addresses[1].locality, addresses[1].postcode, addresses[1].region, phones, websites, sources[1].dataset
      FROM read_parquet('{OV_PARQUET}') WHERE addresses[1].country = 'JP' ORDER BY id"""
    cols = ['id', 'name', 'lat', 'lng', 'conf', 'cat', 'freeform', 'locality', 'postcode', 'region', 'phones', 'websites', 'dataset']
    rows = [dict(zip(cols, r)) for r in con.execute(sql).fetchall()]
    for o in rows:
        o['key'] = norm_name(o['name'])
        o['locality'] = unicodedata.normalize('NFKC', o['locality']) if o['locality'] else None
    return rows


def assign_prefectures(ours, ov):
    # Overture's prefecture: its region or a prefecture at the head of its freeform address;
    # otherwise the prefecture of our nearest hotel with a source or block-level point.
    names = set(p['ja'] for p in json.load(open(PREFS, encoding='utf-8')))
    grid = collections.defaultdict(list)
    for r in ours:
        if r['grade'] in (1, 2) and r['pref'] and r['lat'] is not None:
            grid[(int(r['lat'] * 10), int(r['lng'] * 10))].append((r['lat'], r['lng'], r['pref']))

    def nearest(lat, lng):
        cy, cx = int(lat * 10), int(lng * 10)
        for k in (1, 3, 6, 12, 25, 50, 100):
            pts = [p for dy in range(-k, k + 1) for dx in range(-k, k + 1) for p in grid.get((cy + dy, cx + dx), ())]
            if pts:
                k2 = int(k * 1.5) + 1
                pts = [p for dy in range(-k2, k2 + 1) for dx in range(-k2, k2 + 1) for p in grid.get((cy + dy, cx + dx), ())]
                return min(pts, key=lambda p: (p[0] - lat) ** 2 + ((p[1] - lng) * math.cos(lat * math.pi / 180)) ** 2)[2]
        return None

    stats = collections.Counter()
    for o in ov:
        own = o['region'] if o['region'] in names else next((n for n in names if (o['freeform'] or '').startswith(n)), None)
        o['pref_nn'] = nearest(o['lat'], o['lng'])
        o['pref'] = own or o['pref_nn']
        if own:
            stats['own'] += 1
            stats['nn_agrees'] += own == o['pref_nn']
        else:
            stats['nn_only'] += 1
    return stats


def join(ours, ov, threshold=THRESHOLD_M, rules=('b', 'c')):
    """Cascade: rule b (same name, our source point, under threshold) then rule c (same name,
    same prefecture and municipality). A hotel stops at the first rule that finds any candidate."""
    index = collections.defaultdict(list)
    for j, o in enumerate(ov):
        if o['key']:
            index[o['key']].append(j)
    out = []
    for r in ours:
        cand = sorted({j for k in r['keys'] for j in index.get(k, ())})
        rule, hits = None, []
        if 'b' in rules and r['grade'] == 1 and cand:
            hits = [j for j in cand if meters(r['lat'], r['lng'], ov[j]['lat'], ov[j]['lng']) < threshold]
            rule = 'b' if hits else None
        if not hits and 'c' in rules and r['rest'] and cand:
            hits = [j for j in cand if ov[j]['pref'] == r['pref'] and muni_match(r['rest'], ov[j]['locality'])]
            rule = 'c' if hits else None
        out.append({'rule': rule, 'hits': hits, 'name_only': bool(cand) and not hits})
    return out


def summarize(ours, ov, res, rules=('b', 'c')):
    s = {}
    used = collections.defaultdict(set)  # ov index -> hotels that hit it, any rule
    for n, x in enumerate(res):
        for j in x['hits']:
            used[j].add(n)
    pairs = []
    for rule in rules:
        mine = [(n, x) for n, x in enumerate(res) if x['rule'] == rule]
        per_ov = collections.Counter(j for _, x in mine for j in x['hits'])
        unique = [(n, x['hits'][0]) for n, x in mine if len(x['hits']) == 1]
        mutual = [(n, j) for n, j in unique if per_ov[j] == 1]
        clean = [(n, j) for n, j in mutual if len(used[j]) == 1]
        s[rule] = {'hotels_with_candidates': len(mine), 'one_match': len(unique), 'several_matches': len(mine) - len(unique),
                   'overture_hit_by_several': sum(1 for c in per_ov.values() if c > 1),
                   'one_to_one': len(mutual), 'one_to_one_no_cross_rule_conflict': len(clean)}
        pairs += [(rule, n, j) for n, j in clean]
    s['name_only_not_joined'] = sum(1 for x in res if x['name_only'])
    s['no_name_match'] = sum(1 for x in res if x['rule'] is None and not x['name_only'])
    s['joined_total'] = len(pairs)
    return s, pairs


def shuffled(rows, fields, seed):
    vals = [tuple(r[f] for f in fields) for r in rows]
    random.Random(seed).shuffle(vals)
    out = []
    for r, v in zip(rows, vals):
        c = dict(r)
        c.update(zip(fields, v))
        out.append(c)
    return out
