"""V01 scratch: pages the Python parser accepts; the payloads update-site.py would PUT."""
import json, sys
sys.path.insert(0, 'scripts/crawler')  # run from the repository root
import collect
OUT = sys.argv[1]
def page(docs, extra=''):
    return '<html><head><title>t</title>' + ''.join('<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + '</script>' for d in docs) + '</head><body>' + extra + '</body></html>'
def detail(ident, **over):
    url = f'https://www.jalan.net/yad{ident}/'
    return url, {'@type': 'Hotel', 'name': '試験の宿', 'url': url, 'address': {'addressRegion': '東京都', 'addressLocality': '千代田区', 'streetAddress': '1-1', 'addressCountry': 'JP'}, **over}
cases = {}
url, doc = detail(399001); cases['control'] = (url, 'detail', page([doc]))
url, doc = detail(399002, name='宿' * 401); cases['name of 401 characters'] = (url, 'detail', page([doc]))
url, doc = detail(399003); doc['address']['streetAddress'] = '丁' * 1001; cases['street address of 1001 characters'] = (url, 'detail', page([doc]))
url, doc = detail(399004); doc['address']['streetAddress'] = '丁' * 230; cases['address whose maps link passes 2000 characters'] = (url, 'detail', page([doc]))
url, doc = detail(399005, image='https://cdn.jalan.jp/' + 'a' * 2000 + '.jpg'); cases['image URL over 2000 characters'] = (url, 'detail', page([doc]))
url, doc = detail(399006); cases['outdoor bath row of 3001 characters'] = (url, 'detail', page([doc], '<table><tr><th>露天風呂</th><td>あり' + '湯' * 3001 + '</td></tr></table>'))
lst = 'https://www.jalan.net/130000/LRG_136200/'
cases['list page of 81 hotels'] = (lst, 'list', page([detail(398000 + i)[1] for i in range(81)]))
cases['list page of 601 links'] = (lst, 'list', page([detail(397000)[1]], ''.join(f'<a href="/yad{396000 + i}/">x</a>' for i in range(601))))
out = {}
for label, (url, kind, raw) in cases.items():
    observations, links, foreign, diagnostic = collect.parse_source_page(raw, 'jalan', url, collect.now(), 'pref-tokyo', kind)
    out[label] = dict(url=url, kind=kind, reviewReason=diagnostic['reviewReason'], payload=dict(url=url, status='done', error=None, observations=observations, links=[dict(url=u, kind=k, prefecture=p) for u, (k, p) in links.items()]))
    print(f'{label}: python observations={len(observations)} links={len(links)} reviewReason={diagnostic["reviewReason"]}')
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
