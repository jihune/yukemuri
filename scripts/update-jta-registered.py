#!/usr/bin/env python3
"""Refreshes data/jta-registered.json (D08 PR 1): the Japan Tourism Agency's
lists of hotels and ryokan registered under the International Tourism Hotel
Act (国際観光ホテル整備法 登録ホテル一覧, 登録旅館一覧). The agency's site is
under the Public Data License 1.0 (PDL1.0, CC BY 4.0 compatible); the page
credits the agency and says the lists were processed (lib/jta-registration.ts).

The PDF addresses change every month, so the script reads them from the list
page. Four GETs to www.mlit.go.jp, one at a time, 3 seconds apart: robots.txt
(none there on 2026-10-19, which allows everything; any other failure stops the
run), the list page and the two PDFs. A redirect to another host or a
robots.txt delay over 120 seconds stops the run. Needs `pdftotext` (poppler-utils). Run by hand
after the monthly update (the page's 最終更新日), check the counts, commit.

The monthly 登録ホテル・旅館更新情報 (registrations and removals) is not read:
a removal is not evidence that a stay closed (D08 9.2).

Usage: python3 scripts/update-jta-registered.py [--from DIR]
  --from DIR reads the list page and the PDFs saved in DIR instead (index.html,
  hotel.pdf, ryokan.pdf). The PDFs' public addresses still come from the saved
  page, and the time retrieved is when the page was saved.
"""
import argparse
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/crawler'))
from source_safety import AGENT, robots_allowed, robots_policy

OUT = ROOT / 'data/jta-registered.json'
PAGE = 'https://www.mlit.go.jp/kankocho/seisaku_seido/kokusaikankohotel/index.html'
UA = AGENT + '/1.0 (+https://github.com/jihune/yukemuri)'
TITLES = {'hotel': '登録ホテル一覧', 'ryokan': '登録旅館一覧'}
PREFECTURE = re.compile(r'(北海道|東京都|京都府|大阪府|\S{2,3}県)')


class SameHost(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to HTTPS on the same host: another host's robots.txt was never
    read, and plain HTTP is another origin (Codex review on PR #211)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        if target.scheme != 'https' or target.netloc != urllib.parse.urlsplit(req.full_url).netloc:
            raise SystemExit(f'Redirect refused (another host or not HTTPS): {newurl}')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.build_opener(SameHost()).open(request, timeout=120) as response:
        return response.read()


def robots(url):
    """The host's robots.txt rules for this updater and its crawl delay, read before any other
    request there. None there (404, 410) allows everything; any other failure stops the run."""
    site = urllib.parse.urlsplit(url)
    try:
        text = get(f'{site.scheme}://{site.netloc}/robots.txt').decode('utf-8-sig', errors='replace')
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            return [], 0
        raise SystemExit(f'robots.txt: HTTP {e.code}, nothing fetched') from None
    rules, delay = robots_policy(text, AGENT)
    # The crawler's limit (scripts/crawler/source_safety.py): a longer wait needs a person to look.
    if not 0 <= delay <= 120:
        raise SystemExit(f'robots.txt asks for {delay} seconds between requests: review before running')
    return rules, delay


def pdf_links(html):
    """{'hotel': url, 'ryokan': url} from the list page's links."""
    links = {}
    for href, title in re.findall(r'href="(/kankocho/content/\d+\.pdf)"[^>]*>\s*<span>([^<]+)', html):
        for kind, name in TITLES.items():
            if title.strip() == name:
                links[kind] = 'https://www.mlit.go.jp' + href
    if set(links) != set(TITLES):
        raise SystemExit(f'List page links not found: {sorted(set(TITLES) - set(links))}')
    return links


def parse(text, kind):
    """Rows [number, name, address, phone] of one list, and its header (count, as-of date).

    pdftotext -layout keeps the columns apart by two or more spaces. The last
    one or two columns are the phone and the corporate number (法人番号), which
    is left out; a phone printed as '-' is ''. A line that does not start a row
    continues the previous one: the name when it starts under the name column,
    the address otherwise; a line of digits ends a corporate number.
    """
    head = re.search(r'登録数\s*(\d+)件\s*令和(\d+)年(\d+)月(\d+)日', text)
    if not head:
        raise SystemExit(f'{kind}: header not found')
    count, as_of = int(head[1]), f'{2018 + int(head[2]):04d}-{int(head[3]):02d}-{int(head[4]):02d}'
    rows = []
    for raw in text.replace('\x0c', '').split('\n'):
        line = unicodedata.normalize('NFKC', raw).rstrip()
        if not line.strip() or line.lstrip().startswith(('登録番号', '国際観光ホテル整備法')):
            continue
        row = re.match(r'^([HR]\d{4})\s+(.*)$', line)
        if not row:
            if rows and not re.fullmatch(r'\s*\d+', line):
                rows[-1][1 if len(line) - len(line.lstrip()) < 20 else 2] += line.strip()
            continue
        cols = re.split(r'\s{2,}', row[2])
        # A phone and a corporate number one space apart (R2771).
        if re.fullmatch(r"[\d()-]+ '?[\d-]+", cols[-1]):
            cols[-1:] = cols[-1].split(' ')
        numeric = 0
        while numeric < min(2, len(cols) - 1) and re.fullmatch(r"'?[\d()-]*", cols[-1 - numeric]):
            numeric += 1
        if numeric == 1 and len(re.sub(r'\D', '', cols[-1])) == 13:
            phone = ''
        elif numeric:
            phone = '' if cols[-numeric].strip('-') == '' else cols[-numeric]
        else:
            raise SystemExit(f'{kind}: no phone in {raw!r}')
        text_cols = cols[:len(cols) - numeric]
        # A phone one space after a long address (H1675).
        joined = re.fullmatch(r'(.*\S)\s+(\d{2,5}-\d{1,4}-\d{3,5})', text_cols[-1])
        if not phone and joined:
            text_cols[-1], phone = joined[1], joined[2]
        if len(text_cols) == 1:
            at = next((m.start() for m in PREFECTURE.finditer(text_cols[0]) if m.start() and text_cols[0][m.start() - 1] == ' '), None)
            if at is None:
                raise SystemExit(f'{kind}: name and address not split in {raw!r}')
            text_cols = [text_cols[0][:at], text_cols[0][at:]]
        if len(text_cols) != 2:
            raise SystemExit(f'{kind}: {len(text_cols)} text columns in {raw!r}')
        rows.append([row[1], text_cols[0].strip(), text_cols[1].strip(), phone])
    return rows, count, as_of


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--from', dest='source', type=Path)
    args = parser.parse_args(argv)
    retrieved = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    if args.source:
        page = args.source / 'index.html'
        retrieved = datetime.fromtimestamp(page.stat().st_mtime, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        links = pdf_links(page.read_text(encoding='utf-8'))
        pdfs = {kind: (args.source / f'{kind}.pdf').read_bytes() for kind in TITLES}
    else:
        rules, delay = robots(PAGE)
        pause = max(3, delay)
        if not robots_allowed(rules, PAGE):
            raise SystemExit('robots.txt disallows the list page')
        time.sleep(pause)
        links = pdf_links(get(PAGE).decode('utf-8'))
        pdfs = {}
        for kind, url in links.items():
            if not robots_allowed(rules, url):
                raise SystemExit(f'robots.txt disallows the {kind} PDF')
            time.sleep(pause)
            pdfs[kind] = get(url)
    lists = {}
    for kind, body in pdfs.items():
        text = subprocess.run(['pdftotext', '-layout', '-', '-'], input=body, capture_output=True, check=True).stdout.decode('utf-8')
        rows, count, as_of = parse(text, kind)
        numbers = [r[0] for r in rows]
        if len(rows) != count or len(set(numbers)) != count:
            raise SystemExit(f'{kind}: {len(rows)} rows ({len(set(numbers))} numbers), the header says {count}')
        lists[kind] = {'url': links[kind], 'asOf': as_of, 'count': count, 'rows': sorted(rows)}
    data = {
        'source': PAGE, 'retrievedAt': retrieved, 'license': 'PDL1.0',
        'licenseUrl': 'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0',
        'credit': '「国際観光ホテル整備法 登録ホテル一覧・登録旅館一覧」（観光庁）（' + PAGE + '）を加工して作成',
        'note': 'Columns: registration number, name, address, phone (as the PDFs print them, NFKC). Corporate numbers left out. lib/jta-registration.ts links a stay only when the name and the address agree.',
        **{kind: {k: v for k, v in lists[kind].items() if k != 'rows'} for kind in TITLES},
        'rows': lists['hotel']['rows'] + lists['ryokan']['rows'],
    }
    body = '{\n' + ',\n'.join(' ' + json.dumps(k, ensure_ascii=False) + ':' + (
        '[\n' + ',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in v) + '\n ]' if k == 'rows' else json.dumps(v, ensure_ascii=False))
        for k, v in data.items()) + '\n}\n'
    OUT.write_text(body, encoding='utf-8')
    sys.stdout.write(f"JTA lists: {lists['hotel']['count']} hotels and {lists['ryokan']['count']} ryokan as of {lists['hotel']['asOf']}, written to {OUT.relative_to(ROOT)}\n")


if __name__ == '__main__':
    main()
