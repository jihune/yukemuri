#!/usr/bin/env python3
"""Offline geocoding for the search snapshot (D06), run by build-search-snapshot.mjs.

Reads a JSON list on stdin, one entry per hotel without source coordinates:
  {"address": str, "prefecture": "長崎県" | null, "places": ["長崎県諫早", ...]}
and writes a JSON list of the same length on stdout: [lat, lng, grade] or null.
Grades (lib/search-snapshot.ts GEO_GRADE): 2 街区, 3 大字・字, 4 市区町村, 5 都道府県.
Order: the Japanese address, then its postcode (大字), then the place names
(city or onsen area, at most 市区町村), then the prefecture alone.
A result whose prefecture differs from the hotel's is never used.
Usage: python3 -I scripts/geo/geocode.py --db-dir <installed dictionary>
"""
import argparse
import json
import re
import sys

JAGEOCODER_VERSION = '2.2.1.1'
BLOCK, OAZA, CITY, PREF = 2, 3, 4, 5
KANA_KANJI = re.compile(r'[぀-ヿ㐀-鿿]')
# 'NNN-NNNN' standing alone (not inside a phone number), or 7 digits after 〒.
POSTCODE = re.compile(r'〒\s*(\d{3})-?(\d{4})(?!\d)|(?<![\d-])(\d{3})-(\d{4})(?![\d-])')
DASHES = str.maketrans({c: '-' for c in '‐－ー−―'})
ZENKAKU = str.maketrans('０１２３４５６７８９－', '0123456789-')


def grade_of(level):
    """jageocoder AddressLevel to a snapshot grade (None: unusable)."""
    if level >= 7:
        return BLOCK
    if level >= 5:
        return OAZA
    if level >= 3:
        return CITY
    if level >= 1:
        return PREF
    return None


def postcode_of(address):
    """The 7-digit postcode in an address ('250-0407' or '〒2500407'), else None."""
    match = POSTCODE.search((address or '').translate(ZENKAKU).translate(DASHES))
    return ''.join(g for g in match.groups() if g) if match else None


def same_prefecture(node, prefecture):
    return not prefecture or node.get_pref_name() == prefecture


def point(node, grade):
    if not node.has_valid_coordinate_values():
        return None
    return [round(node.y, 6), round(node.x, 6), grade]


def best_search(jageocoder, query, prefecture):
    """The first search result in the hotel's prefecture, as [lat, lng, grade]."""
    for result in jageocoder.searchNode(query):
        node = result.node
        grade = grade_of(node.level)
        if grade is not None and same_prefecture(node, prefecture):
            return point(node, grade)
    return None


def by_postcode(jageocoder, code, prefecture):
    """A postcode's 大字 when every node of the code is that one place."""
    nodes = [n for n in jageocoder.search_by_postcode(code) if n.has_valid_coordinate_values()]
    if not nodes or not all(same_prefecture(n, prefecture) for n in nodes):
        return None
    first = nodes[0]
    if all(abs(n.y - first.y) <= 0.01 and abs(n.x - first.x) <= 0.01 for n in nodes[1:]):
        return point(first, OAZA)
    # One code over places more than about 1 km apart: the city they share, if any.
    cities = {getattr(c, 'id', None): c for c in map(city_of, nodes)}
    city = next(iter(cities.values())) if len(cities) == 1 else None
    return point(city, CITY) if city is not None else None


def city_of(node):
    """The 市区町村 (or 政令市の区) node above a node, else None."""
    found = None
    for parent in node.get_parent_list():
        if 3 <= parent.level <= 4:
            found = parent
    return found


def locate(jageocoder, entry):
    prefecture = entry.get('prefecture')
    address = entry.get('address') or ''
    found = None
    if KANA_KANJI.search(address):
        found = best_search(jageocoder, address, prefecture)
    if found is None or found[2] > OAZA:
        code = postcode_of(address)
        coded = by_postcode(jageocoder, code, prefecture) if code else None
        if coded and (found is None or coded[2] < found[2]):
            found = coded
    if found is None or found[2] > CITY:
        for place in entry.get('places') or []:
            hit = best_search(jageocoder, place, prefecture)
            # A place name stands for a whole city or onsen area: never finer than 市区町村.
            if hit and hit[2] <= CITY:
                found = [hit[0], hit[1], CITY]
                break
            if hit and found is None:
                found = hit
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db-dir', required=True)
    args = parser.parse_args()
    import jageocoder
    if jageocoder.__version__ != JAGEOCODER_VERSION:
        raise SystemExit(f'jageocoder {jageocoder.__version__} installed, {JAGEOCODER_VERSION} pinned')
    jageocoder.init(db_dir=args.db_dir, mode='r')
    entries = json.load(sys.stdin)
    if not isinstance(entries, list):
        raise SystemExit('Expected a JSON list on stdin')
    out = []
    for entry in entries:
        try:
            out.append(locate(jageocoder, entry) if isinstance(entry, dict) else None)
        except Exception:  # one address must not lose the others
            out.append(None)
    json.dump(out, sys.stdout, separators=(',', ':'))


if __name__ == '__main__':
    main()
