"""Checks scripts/geo/update-overture.py's join rules with fixtures (D08 PR 4):
names, municipalities, house numbers, the one-to-one join and each condition
that keeps a pair. No DuckDB and no network. Run by check-snapshot-geo.mjs.
"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('update_overture', Path(__file__).resolve().parent / 'update-overture.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

assert u.norm_name('ホテル・ヶ丘 Inn') == u.norm_name('ﾎﾃﾙケ丘inn') == 'ホテルケ丘inn'
assert u.strip_county('知多郡南知多町豊浜') == '南知多町豊浜'
assert u.strip_county('郡山市駅前') == '郡山市駅前' and u.strip_county('小郡市大板井') == '小郡市大板井'
assert u.muni_match('知多郡南知多町豊浜1', '南知多町') and u.muni_match('札幌市中央区北1条', '札幌市中央区')
assert not u.muni_match('府中市宮町1', '府中町') and not u.muni_match('箱根町1', 'Hakone')
assert u.address_agreement('箱根町湯本256-1', '湯本256-1 〒250-0311', '箱根町') == 'agree'
assert u.address_agreement('箱根町湯本256-1', '湯本258', '箱根町') == 'disagree'
assert u.address_agreement('箱根町湯本', '湯本256', '箱根町') == 'unknown'
assert u.address_agreement('箱根町湯本２５６', '〒250-0311 湯本256', '箱根町') == 'agree', 'full-width digits; a postcode is no house number'

# Hotels (grade, point) and places; every kept pair needs grade 3-6, house numbers agree,
# confidence 0.5 or more, a move within the grade's range and a CDLA or CC0 license.
CDLA = ['CDLA-Permissive-2.0', 'CDLA-Permissive-2.0']


def hotel(hid, name, grade, lat, rest='箱根町湯本256-1'):
    return {'id': hid, 'keys': {u.norm_name(name)}, 'pref': '神奈川県', 'rest': rest, 'grade': grade, 'lat': lat, 'lng': 139.0}


def place(pid, name, lat, conf=0.9, freeform='湯本256-1', licenses=CDLA, locality='箱根町'):
    return {'id': pid, 'name': name, 'key': u.norm_name(name), 'pref': '神奈川県', 'locality': locality, 'freeform': freeform,
            'lat': lat, 'lng': 139.0, 'confidence': conf, 'licenses': licenses, 'datasets': ['meta', 'Overture'], 'region': None}


ours = [hotel('jalan-1', '湯本館', 3, 35.0), hotel('jalan-2', '山荘', 3, 35.0), hotel('jalan-3', '月の宿', 2, 35.0),
        hotel('jalan-4', '花の宿', 3, 35.0), hotel('jalan-5', '星の宿', 3, 35.0), hotel('jalan-6', '海の宿', 4, 35.0),
        hotel('jalan-7', '森の宿', 3, 35.0), hotel('jalan-8', '川の宿', 3, 35.0), hotel('trip-9', '川の宿', 3, 35.0),
        hotel('jalan-10', '空の宿', 1, 35.0, rest=None), hotel('jalan-11', '雪の宿', 3, 35.0, rest='箱根町宮ノ下1')]
places = [place('a', '湯本館', 35.02), place('b', '山荘', 35.06), place('c', '月の宿', 35.001),
          place('d', '花の宿', 35.01, conf=0.4), place('e', '星の宿', 35.01, freeform='湯本999'),
          place('f', '海の宿', 35.15), place('g', '森の宿', 35.01, licenses=['Apache-2.0', 'CDLA-Permissive-2.0']),
          place('h', '川の宿', 35.01), place('i', '空の宿', 35.0005), place('k', '雪の宿', 35.01, locality='小田原市')]
pairs = u.join(ours, places)
joined = {ours[n]['id']: places[j]['id'] for n, j in pairs}
assert 'jalan-8' not in joined and 'trip-9' not in joined, 'a place two of our hotels match is not one-to-one'
assert joined.get('jalan-10') == 'i', 'rule b: a source point within 150 m'
assert 'jalan-11' not in joined, 'rule c needs the same municipality'
kept, why = u.keep(ours, places, pairs)
assert sorted(ours[n]['id'] for n, _ in kept) == ['jalan-1', 'jalan-6'], kept
assert why == {'our point is a source, block-level or no point': 2, 'move beyond the grade range': 1, 'confidence under 0.5': 1,
               'house numbers do not agree': 1, 'license not CDLA Permissive 2.0 or CC0 (Foursquare)': 1}, why
print(f'Overture join rules passed: names, municipalities, house numbers, one-to-one, {len(why)} reasons to leave a pair out.')
