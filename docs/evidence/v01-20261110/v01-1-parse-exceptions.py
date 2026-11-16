"""V01 scratch: which malformed-but-plausible pages raise an exception type that
update-site.py's page handler does not catch (URLError, TimeoutError, ValueError, OSError)."""
import json, sys, http.client, urllib.error
sys.path.insert(0, 'scripts/crawler')  # run from the repository root
import collect

CAUGHT = (urllib.error.URLError, TimeoutError, ValueError, OSError)

def page(doc):
    return '<html><head><title>t</title><script type="application/ld+json">' + json.dumps(doc, ensure_ascii=False) + '</script></head><body></body></html>'

URL = 'https://www.jalan.net/yad399999/'
base = {'@type': 'Hotel', 'name': '試験の宿', 'url': URL, 'address': {'addressRegion': '東京都', 'addressCountry': 'JP'}}
cases = {
    'control: well-formed detail': base,
    'address is a list of PostalAddress': {**base, 'address': [{'addressRegion': '東京都', 'addressCountry': 'JP'}]},
    'geo is a list': {**base, 'geo': [{'latitude': 35.0, 'longitude': 139.0}]},
    'url is null': {**base, 'url': None},
    'url is a number': {**base, 'url': 1},
    'image is a list of dicts': {**base, 'image': [{'url': 'https://cdn.jalan.jp/x.jpg'}]},
    'aggregateRating is a list': {**base, 'aggregateRating': [{'ratingValue': 4.5, 'reviewCount': 10}]},
    'addressCountry is a list': {**base, 'address': {'addressRegion': '東京都', 'addressCountry': ['JP']}},
    'name is a dict': {**base, 'name': {'@value': '試験の宿'}},
}
uncaught = 0
for label, doc in cases.items():
    try:
        observations, links, foreign, diagnostic = collect.parse_source_page(page(doc), 'jalan', URL, collect.now(), 'pref-tokyo', 'detail')
        print(f'OK        {label}: observations={len(observations)} reviewReason={diagnostic["reviewReason"]}')
    except CAUGHT as error:
        print(f'CAUGHT    {label}: {type(error).__name__}: {error}')
    except Exception as error:
        uncaught += 1
        print(f'UNCAUGHT  {label}: {type(error).__name__}: {error}')
print('IncompleteRead caught by handler:', issubclass(http.client.IncompleteRead, CAUGHT))
print('LookupError caught by handler:', issubclass(LookupError, CAUGHT))
try:
    b'x'.decode('x-not-a-charset', errors='replace')
except Exception as error:
    print('unknown charset raises', type(error).__name__, '| caught:', isinstance(error, CAUGHT))
print(f'uncaught_cases={uncaught} of {len(cases)}')
