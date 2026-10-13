#!/usr/bin/env python3
"""Fixture checks for scripts/geo/geocode.py and dictionary.py (D06), without
jageocoder or the 351MB dictionary: a fake module stands in for jageocoder."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


geocode = load('geocode')


class Node:
    def __init__(self, names, level, y, x, parents=()):
        self.names, self.level, self.y, self.x, self.id = names, level, y, x, '/'.join(names)
        self.parents = list(parents)

    def get_pref_name(self):
        return self.names[0]

    def has_valid_coordinate_values(self):
        return self.y is not None

    def get_parent_list(self):
        return self.parents + [self]


class Result:
    def __init__(self, node):
        self.node = node


class FakeJageocoder:
    """searchNode answers from a dict of query -> nodes; postcodes likewise."""
    def __init__(self, searches, postcodes=None):
        self.searches, self.postcodes, self.asked = searches, postcodes or {}, []

    def searchNode(self, query):
        self.asked.append(query)
        return [Result(n) for n in self.searches.get(query, [])]

    def search_by_postcode(self, code):
        self.asked.append('〒' + code)
        return self.postcodes.get(code, [])


pref = Node(['長崎県'], 1, 32.75, 129.87)
city = Node(['長崎県', '諫早市'], 3, 32.84, 130.05, [pref])
oaza = Node(['長崎県', '諫早市', '天満町'], 5, 32.856, 130.044, [pref, city])
block = Node(['長崎県', '諫早市', '天満町', '36番'], 7, 32.85677, 130.04475, [pref, city, oaza])
other = Node(['佐賀県', '小城市'], 3, 33.28, 130.2)

# Levels to grades (lib/search-snapshot.ts GEO_GRADE).
assert [geocode.grade_of(level) for level in (8, 7, 6, 5, 4, 3, 2, 1, 0, -1)] == [2, 2, 3, 3, 4, 4, 5, 5, None, None]
assert geocode.postcode_of('Ninotaira1297-5, 250-0407 하코네') == '2500407'
assert geocode.postcode_of('〒８７９－５１０２ 大分県') == '8795102'
assert geocode.postcode_of('長崎県諫早市天満町３６―１１') is None
assert geocode.postcode_of('Tel 0120-123-4567') is None, 'a phone number is not a postcode'

# A Japanese address to its block.
j = FakeJageocoder({'長崎県諫早市天満町３６―１１': [block]})
assert geocode.locate(j, {'address': '長崎県諫早市天満町３６―１１', 'prefecture': '長崎県', 'places': ['長崎県諫早市']}) == [32.85677, 130.04475, 2]
assert j.asked == ['長崎県諫早市天満町３６―１１'], 'a block match asks nothing more'
# Another prefecture's match is never used; the place names stand in, never finer than a city.
j = FakeJageocoder({'長崎県天満町': [Node(['佐賀県', '小城市', '天満町'], 5, 33.2, 130.2)], '長崎県諫早市': [oaza]})
assert geocode.locate(j, {'address': '長崎県天満町', 'prefecture': '長崎県', 'places': ['長崎県諫早市', '長崎県']}) == [32.856, 130.044, 4]
# An address matched only to its city: the postcode's 大字 is finer.
j = FakeJageocoder({'Somewhere 854-0072 長崎県諫早市': [city]}, {'8540072': [oaza]})
assert geocode.locate(j, {'address': 'Somewhere 854-0072 長崎県諫早市', 'prefecture': '長崎県', 'places': []}) == [32.856, 130.044, 3]
# Romanized Trip address: no address search, postcode only.
j = FakeJageocoder({}, {'8540072': [oaza]})
assert geocode.locate(j, {'address': 'Tenmancho 36-11, 854-0072 Isahaya', 'prefecture': '長崎県', 'places': ['長崎県']}) == [32.856, 130.044, 3]
assert j.asked == ['〒8540072']
# One postcode over places far apart in one city: that city; in two cities: nothing from it.
far = Node(['長崎県', '諫早市', '多良見町'], 5, 32.83, 129.95, [pref, city])
j = FakeJageocoder({}, {'8540072': [oaza, far]})
assert geocode.locate(j, {'address': '854-0072', 'prefecture': '長崎県', 'places': []}) == [32.84, 130.05, 4]
j = FakeJageocoder({}, {'8540072': [oaza, Node(['長崎県', '大村市', '某'], 5, 32.9, 129.95, [pref, Node(['長崎県', '大村市'], 3, 32.9, 129.95)])]})
assert geocode.locate(j, {'address': '854-0072', 'prefecture': '長崎県', 'places': []}) is None
j = FakeJageocoder({}, {'8450001': [Node(['佐賀県', '小城市', '某'], 5, 33.2, 130.2)]})
assert geocode.locate(j, {'address': '845-0001', 'prefecture': '長崎県', 'places': []}) is None, 'postcode in another prefecture'
# No address: place names in order, then the prefecture alone (grade 5).
j = FakeJageocoder({'長崎県諫早町': [], '長崎県諫早市': [city], '長崎県': [pref]})
assert geocode.locate(j, {'address': '', 'prefecture': '長崎県', 'places': ['長崎県諫早町', '長崎県諫早市', '長崎県']}) == [32.84, 130.05, 4]
j = FakeJageocoder({'長崎県': [pref]})
assert geocode.locate(j, {'address': '', 'prefecture': '長崎県', 'places': ['長崎県雲仙市', '長崎県']}) == [32.75, 129.87, 5]
j = FakeJageocoder({'長崎県': [other]})
assert geocode.locate(j, {'address': '', 'prefecture': '長崎県', 'places': ['長崎県']}) is None
assert geocode.locate(FakeJageocoder({}), {'address': '', 'prefecture': None, 'places': []}) is None

# The dictionary pin: size and SHA-256 must both match; a mismatch is deleted.
with tempfile.TemporaryDirectory() as temp:
    temp = Path(temp)
    payload = b'PK fake dictionary for the pin check'
    good = {'jageocoder': '2.2.1.1', 'dictionary': {'url': (temp / 'served.zip').as_uri(), 'file': 'd.zip', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}}
    (temp / 'served.zip').write_bytes(payload)
    pins = temp / 'pins.json'

    def run(command, zip_path, pin, *more):
        pins.write_text(json.dumps(pin))
        return subprocess.run([sys.executable, '-I', str(HERE / 'dictionary.py'), command, '--zip', str(zip_path), '--pins', str(pins), *more], capture_output=True, text=True)

    r = run('fetch', temp / 'cache' / 'd.zip', good)
    assert r.returncode == 0 and (temp / 'cache' / 'd.zip').read_bytes() == payload, r.stderr
    r = run('fetch', temp / 'cache' / 'd.zip', good)
    assert r.returncode == 0 and 'from cache' in r.stdout, 'a cached file that matches is reused'
    bad_hash = json.loads(json.dumps(good))
    bad_hash['dictionary']['sha256'] = '0' * 64
    r = run('verify', temp / 'cache' / 'd.zip', bad_hash)
    assert r.returncode != 0 and 'refused' in r.stderr and not (temp / 'cache' / 'd.zip').exists(), 'hash mismatch refused and deleted'
    r = run('fetch', temp / 'other' / 'd.zip', bad_hash)
    assert r.returncode != 0 and 'refused' in r.stderr and not (temp / 'other' / 'd.zip').exists() and not (temp / 'other' / 'd.zip.part').exists(), 'a download that does not match is never kept'
    bad_size = json.loads(json.dumps(good))
    bad_size['dictionary']['bytes'] += 1
    r = run('fetch', temp / 'size' / 'd.zip', bad_size)
    assert r.returncode != 0 and 'size' in r.stderr, 'size mismatch refused'
    r = run('install', temp / 'missing.zip', good, '--db-dir', str(temp / 'db'))
    assert r.returncode != 0 and 'missing' in r.stderr, 'nothing installs without a verified file'
    assert not (temp / 'db').exists()

# The committed pin is the dictionary the D06 plan names.
pinned = json.loads((HERE / 'pins.json').read_text())
assert pinned['jageocoder'] == geocode.JAGEOCODER_VERSION == '2.2.1.1'
assert pinned['dictionary']['bytes'] == 351216233 and len(pinned['dictionary']['sha256']) == 64
assert pinned['dictionary']['url'].endswith('/' + pinned['dictionary']['file'])
requirements = (HERE / 'requirements.txt').read_text()
assert 'jageocoder==2.2.1.1 \\' in requirements
for line in requirements.splitlines():
    if line and not line.startswith(('#', ' ')):
        assert '==' in line and line.endswith('\\'), 'every requirement pinned with hashes: ' + line
print('Geocoder checks passed: grades by level, postcode and place fallbacks, prefecture guard, dictionary pin (size, SHA-256, deleted on mismatch), pinned requirements.')
