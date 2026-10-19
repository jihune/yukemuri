# Inputs: what the public snapshot and the Overture extract hold for the join.
# Control: the phone pattern that finds no phone in our snapshot must find phones in Overture's strings.
import sys, os, re, json, unicodedata, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

ours, manifest = load_ours()
ov = load_overture()
print(f"snapshot {manifest['id']} generated {manifest['generatedAt']}: {len(ours)} hotels (manifest says {manifest['hotels']})")
print('our grades:', dict(sorted(collections.Counter(r['grade'] for r in ours).items())))
print('our provider prefix:', dict(collections.Counter(r['id'].split('-')[0] if r['id'].split('-')[0] in ('jalan', 'trip') else 'curated' for r in ours)))
kind = lambda r: r['id'].split('-')[0] if r['id'].split('-')[0] in ('jalan', 'trip') else 'curated'
print('our provider x grade:', dict(sorted(collections.Counter((kind(r), r['grade']) for r in ours).items())))
print('our hotels with a Japanese address led by their prefecture:', sum(1 for r in ours if r['addr']),
      '| without, by provider:', dict(collections.Counter(kind(r) for r in ours if not r['addr'])))
print('our hotels with a name key (ja/en, no Hangul):', sum(1 for r in ours if r['keys']))
print('Overture places (country JP):', len(ov), '| with a name key:', sum(1 for o in ov if o['key']),
      '| with locality:', sum(1 for o in ov if o['locality']), '| with phone:', sum(1 for o in ov if o['phones']),
      '| with website:', sum(1 for o in ov if o['websites']))
print('Overture by first source:', dict(collections.Counter(o['dataset'] for o in ov)))
print('Overture by confidence bucket:', dict(sorted(collections.Counter(bucket(o['conf']) for o in ov).items())))

# Phones. A Japanese number in any common writing: +81 or 0, then 9 or 10 digits with optional separators.
PHONE = re.compile(r'(?:\+81[\s-]?|(?<!\d)0)\d{1,4}[\s\-ー‐―]?\d{1,4}[\s\-ー‐―]?\d{3,4}(?!\d)')
def phone_count(s):
    # URLs are dropped first (photo file names hold long digit runs); a phone needs 10 digits in all.
    s = re.sub(r'https?://[^"\s]+', ' ', unicodedata.normalize('NFKC', s))
    return sum(1 for m in PHONE.finditer(s) if len(re.sub(r'\D', '', m.group(0))) >= 10 and not m.group(0).startswith('0-'))
snap_hits = collections.Counter()
for f in ('cards', 'core', 'text', 'geo', 'status'):
    snap_hits[f] = phone_count(open(f'{SNAP}/{f}.json', encoding='utf-8').read())
planted = phone_count(open(f'{SNAP}/cards.json', encoding='utf-8').read()[:-1] + ',{"tel":"0977-84-2121","x":"+81 977842121"}]')
ov_strings = [p for o in ov for p in (o['phones'] or [])]
ov_hits = sum(1 for p in ov_strings if PHONE.search(unicodedata.normalize('NFKC', p)))
field_names = set()
def walk(x):
    if isinstance(x, dict):
        for k, v in x.items():
            field_names.add(k); walk(v)
    elif isinstance(x, list):
        for v in x:
            walk(v)
for f in ('cards', 'core', 'text', 'geo'):
    walk(json.load(open(f'{SNAP}/{f}.json', encoding='utf-8')))
phone_fields = sorted(k for k in field_names if re.search('phone|tel', k, re.I))
print('snapshot phone-like strings of 10+ digits per file:', dict(snap_hits), '| field names with phone/tel:', phone_fields)
print(f'control: the same pattern finds {ov_hits} of {len(ov_strings)} Overture phone strings, and {planted} of 2 phones planted in a copy of cards.json')

def digits(p):
    d = re.sub(r'\D', '', unicodedata.normalize('NFKC', p))
    return '0' + d[2:] if d.startswith('81') else d
by_phone = collections.defaultdict(set)
for o in ov:
    for p in o['phones'] or []:
        by_phone[digits(p)].add(o['id'])
shared = {k: v for k, v in by_phone.items() if len(v) > 1}
print(f'Overture distinct normalized phones: {len(by_phone)}; phones on 2+ places: {len(shared)} '
      f'covering {len(set().union(*shared.values())) if shared else 0} places (largest group {max(map(len, shared.values())) if shared else 0})')
ok = sum(snap_hits.values()) == 0 and not phone_fields and ov_hits >= 0.95 * len(ov_strings) and planted == 2
print(f"phone check: our snapshot has {sum(snap_hits.values())} phone-like strings and {len(phone_fields)} phone fields; "
      f"control finds {ov_hits}/{len(ov_strings)} in Overture -> {'PASS' if ok else 'FAIL'} (rule a cannot run on our data)")
