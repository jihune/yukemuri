# Websites of the joined Overture places: booking or aggregator, directory or map, SNS or link page,
# or likely official. Control: fixture URLs, lookalike hosts included, must land in the right class.
# With --fetch, the 20 sampled likely-official homepages are read once each (title only) into
# out/websites_fetch.json (http:// asked as https://, see below); without it the saved file is shown,
# so a rerun sends no request.
import sys, os, json, random, re, collections, subprocess
from urllib.parse import urlsplit
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

CLASSES = {
    'booking': ['jalan.net', 'rakuten.co.jp', 'rakuten.com', 'booking.com', 'agoda.com', 'agoda.net', 'expedia.co.jp', 'expedia.com',
                'hotels.com', 'trip.com', 'ctrip.com', 'ikyu.com', 'jtb.co.jp', 'rurubu.travel', 'rurubu.com', 'knt.co.jp',
                'travel.yahoo.co.jp', 'rlx.jp', 'relux.jp', 'yukoyuko.net', 'airbnb.com', 'airbnb.jp', 'vrbo.com', 'hostelworld.com',
                'stayjapan.com', 'tripadvisor.com', 'tripadvisor.jp', 'tripadvisor.co.jp', 'hotpepper.jp', 'mytrip.net', 'travelko.com',
                'skyticket.jp', 'hotelscombined.com', 'trivago.jp', 'trivago.com'],
    'directory_or_map': ['google.com', 'google.co.jp', 'goo.gl', 'g.page', 'g.co', 'itp.ne.jp', 'jyh.or.jp', 'mapion.co.jp',
                         'navitime.co.jp', 'tabelog.com', 'yahoo.co.jp'],
    'sns_or_link': ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'twitter.com', 'x.com', 'line.me', 'lin.ee', 'lit.link',
                    'linktr.ee', 'youtube.com', 'youtu.be', 'tiktok.com', 'ameblo.jp', 'note.com', 'threads.net'],
}


def host(url):
    u = (url or '').strip()
    if not u:
        return ''
    if '://' not in u:
        u = 'http://' + u
    h = (urlsplit(u).hostname or '').lower()
    return h[4:] if h.startswith('www.') else h


def classify(url):
    h = host(url)
    if not h:
        return 'none'
    for cls, domains in CLASSES.items():  # booking first, so travel.yahoo.co.jp is booking, not directory
        if any(h == d or h.endswith('.' + d) for d in domains):
            return cls
    return 'likely_official'


FIXTURES = [('https://www.jalan.net/yad301000/', 'booking'), ('http://travel.rakuten.co.jp/HOTEL/15452/15452.html', 'booking'),
            ('https://hotel.travel.rakuten.co.jp/hinfo/936/', 'booking'), ('https://www.booking.com/hotel/jp/x.html', 'booking'),
            ('https://travel.yahoo.co.jp/00001/', 'booking'), ('https://m.facebook.com/x', 'sns_or_link'),
            ('instagram.com/x', 'sns_or_link'), ('https://maps.app.goo.gl/abc', 'directory_or_map'),
            ('http://nttbj.itp.ne.jp/0748347577/index.html', 'directory_or_map'), ('https://www.tsuruga.com/', 'likely_official'),
            ('https://myjalan.net/', 'likely_official'), ('https://jalan.net.example.com/', 'likely_official'),
            ('https://www.route-inn.co.jp/hotel_list/mie/index_hotel_id_123/', 'likely_official'), ('', 'none')]

d = json.load(open(OUT + '/out/pairs.json', encoding='utf-8'))
pairs = d['pairs']
first = lambda p: next((w for w in (p['websites'] or []) if w and w.strip()), None)
withweb = [p for p in pairs if first(p)]
cls = collections.Counter(classify(first(p)) for p in withweb)
print(f'joined pairs: {len(pairs)}; with a non-empty Overture website: {len(withweb)} ({len(withweb) / len(pairs):.1%}); '
      f"more than one website on any joined place: {sum(1 for p in pairs if len([w for w in (p['websites'] or []) if w.strip()]) > 1)}")
print('by class:', {k: f'{v} ({v / len(withweb):.1%})' for k, v in cls.most_common()})
for c in ('booking', 'directory_or_map', 'sns_or_link'):
    hosts = collections.Counter()
    for p in withweb:
        if classify(first(p)) == c:
            h = host(first(p))
            hosts[next(dd for dd in CLASSES[c] if h == dd or h.endswith('.' + dd))] += 1
    print(f'  {c} domains counted:', dict(hosts.most_common()))
official = [p for p in withweb if classify(first(p)) == 'likely_official']
off_hosts = collections.Counter(host(first(p)) for p in official)
print(f'likely official: {len(official)} pairs on {len(off_hosts)} hosts; hosts used by 2+ joined hotels (chains): '
      f'{sum(1 for v in off_hosts.values() if v > 1)} hosts covering {sum(v for v in off_hosts.values() if v > 1)} pairs')
print('by Overture confidence bucket (with website / likely official / joined):')
for b, _, _ in BUCKETS:
    print(f"  {b}: {sum(1 for p in withweb if bucket(p['conf']) == b)} / {sum(1 for p in official if bucket(p['conf']) == b)} / {sum(1 for p in pairs if bucket(p['conf']) == b)}")
print('by rule (with website / likely official / joined):', {r: (sum(1 for p in withweb if p['rule'] == r), sum(1 for p in official if p['rule'] == r), sum(1 for p in pairs if p['rule'] == r)) for r in ('b', 'c')})

sample = random.Random(SEED).sample(official, 20)
path = OUT + '/out/websites_fetch.json'


def title_of(raw, ctype):
    enc = re.search(r'charset=([\w-]+)', ctype or '', re.I) or re.search(rb'charset=["\']?([\w-]+)', raw[:4000], re.I)
    encs = [enc.group(1) if isinstance(enc.group(1), str) else enc.group(1).decode('ascii', 'ignore')] if enc else []
    for e in encs + ['utf-8', 'cp932', 'euc-jp']:
        try:
            text = raw.decode(e)
            break
        except (LookupError, UnicodeDecodeError):
            continue
    else:
        text = raw.decode('utf-8', 'replace')
    m = re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)
    return re.sub(r'\s+', ' ', m.group(1)).strip()[:150] if m else None


if '--fetch' in sys.argv:
    got = []
    for p in sample:
        url = first(p).strip()
        url = url if '://' in url else 'http://' + url
        # The session's egress proxy takes HTTPS only (plain HTTP gets 405 there, /root/.ccr/README.md),
        # so an http:// address is asked over https:// at the same host and path.
        url = 'https://' + url[len('http://'):] if url.startswith('http://') else url
        r = subprocess.run(['curl', '-sS', '-L', '--max-redirs', '5', '-m', '20', '-x', os.environ.get('HTTPS_PROXY', ''),
                            '-A', 'Mozilla/5.0 (compatible; yukemuri-measure/1.0; one request per site)',
                            '-o', '-', '-w', '\n%{http_code} %{url_effective} %{content_type}', url], capture_output=True)
        body, _, tail = r.stdout.rpartition(b'\n')
        code, final, ctype = (tail.decode('utf-8', 'replace').split(' ', 2) + ['', ''])[:3]
        got.append({'our_id': p['our_id'], 'our_name': p['our_name'], 'url': url, 'status': code, 'final': final,
                    'title': title_of(body, ctype) if code.startswith('2') else None, 'error': r.stderr.decode('utf-8', 'replace').strip()[:120]})
    json.dump({'fetched_utc': subprocess.run(['date', '-u', '+%Y-%m-%dT%H:%M:%SZ'], capture_output=True, text=True).stdout.strip(),
               'rows': got}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if os.path.exists(path):
    f = json.load(open(path, encoding='utf-8'))
    assert [r['our_id'] for r in f['rows']] == [p['our_id'] for p in sample], 'saved fetch is not this sample'
    print(f"sampled likely-official sites (fetched {f['fetched_utc']}):")
    for r, p in zip(f['rows'], sample):
        print(f"  {r['our_id']} | {r['our_name']} | conf {p['conf']:.2f} | {r['url']} -> {r['status']} {r['final'] if r['final'] != r['url'] else ''} | {r['title']} {r['error']}")
else:
    print('sampled likely-official sites (not fetched; run with --fetch):')
    for p in sample:
        print(f"  {p['our_id']} | {p['our_name']} | conf {p['conf']:.2f} | {first(p)}")

hc = OUT + '/handcheck_websites.tsv'
if os.path.exists(hc):
    import csv
    rows = list(csv.DictReader(open(hc, encoding='utf-8'), delimiter='\t'))
    assert [r['our_id'] for r in rows] == [p['our_id'] for p in sample], 'handcheck_websites.tsv is not this sample'
    print('hand-check of the 20 likely-official sites:', dict(collections.Counter(r['verdict'] for r in rows)))
    by = collections.defaultdict(collections.Counter)
    for r, p in zip(rows, sample):
        by[bucket(p['conf'])][r['verdict']] += 1
    print('  by confidence bucket:', {k: dict(v) for k, v in sorted(by.items())})
bad = [(u, want, classify(u)) for u, want in FIXTURES if classify(u) != want]
print(f"website classifier control: {len(FIXTURES) - len(bad)}/{len(FIXTURES)} fixtures classified as expected {bad if bad else ''}"
      f"-> {'PASS' if not bad else 'FAIL'}")
if bad:
    sys.exit(1)
