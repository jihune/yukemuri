#!/usr/bin/env python3
"""Refreshes data/oita-ryokan-permits.json (D08 PR 3): Oita Prefecture's list
of lodging business permits (旅館業営業許可施設一覧, stays outside Oita city,
which keeps its own list), published on BODIK (a local-government open data
catalog) under CC BY 4.0; the page credits the prefecture and says the list
was processed (lib/oita-attribution.ts).

Each row keeps the list ID, the facility name, the kind of business, the
address, the permit number and the permit date. The operator's name
(開設者名（法人名）) and the phone are dropped as the CSV is read and never
written, logged or committed (D08 16). A row whose facility name holds the
whole name of an operator who is a person, not a company or another body
(<name>宅, a home taking guests), is dropped with it. The CSV itself is never
saved.

Every 旅館・ホテル row is written. A 簡易宿所 or 下宿 row is written only when a
stay of ours links it (lib/lodging-lists.ts over a saved public search
snapshot): one nothing links is often a private home, where a name and an
address can point to a person (D08 16, the ninth parent's answer of 18:20Z).
Their count is noted in the file.

Three GETs to data.bodik.jp, one at a time, 3 seconds apart: robots.txt, the
catalog's package record (license and the CSV's address) and the CSV. Run by
hand after the prefecture updates the list, check the counts, commit. A row
that leaves the list is not evidence that a stay closed (D08 9.2).

Usage: python3 scripts/update-oita-permits.py --snapshot DIR
  DIR holds manifest.json, core.json, cards.json and text.json of the public
  search snapshot (public GETs of /snapshot/manifest.json and its files).
"""
import argparse
import csv
import importlib.util
import io
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

OUT = ROOT / 'data/oita-ryokan-permits.json'
DATASET = 'https://data.bodik.jp/dataset/440001_ryokan_business'
PACKAGE = 'https://data.bodik.jp/api/3/action/package_show?id=440001_ryokan_business'
UA = AGENT + '/1.0 (+https://github.com/jihune/yukemuri)'
LICENSE = 'cc-by-40-intl'
# The columns kept, in the order written. Every other column (the operator, the phone) is dropped.
KEPT = ['ID', '施設名称', '営業の種類', '所在地_連結表記', '許可番号', '許可年月日']
# Read only to drop the rows whose facility name holds a person's name.
OPERATOR = '開設者名（法人名）'
BODY = re.compile(r'会社|\(株\)|\(有\)|法人|組合|協会|財団|社団|機構|公社')
KINDS = {'旅館・ホテル', '簡易宿所', '下宿'}


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=120) as response:
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
    return robots_policy(text, AGENT)


def key(text):
    return re.sub(r'[\s・･]', '', unicodedata.normalize('NFKC', text))


def rows(text):
    """Rows [ID, name, kind, address, permit number, permit date] of the CSV, NFKC, the date as
    YYYY-MM-DD ('' when the list has none), and how many rows were dropped because the facility
    name holds the name of an operator who is a person. Only the KEPT columns are kept."""
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    missing = [c for c in [*KEPT, OPERATOR] if c not in header]
    if missing:
        raise SystemExit(f'Columns not found: {missing}')
    at, operator = [header.index(c) for c in KEPT], header.index(OPERATOR)
    out, dropped = [], 0
    for record in reader:
        if not any(record):
            continue
        person = key(record[operator])
        if len(person) >= 2 and not BODY.search(person) and person in key(record[at[1]]):
            dropped += 1
            continue
        row = [unicodedata.normalize('NFKC', record[i]).strip() for i in at]
        date = re.fullmatch(r'(\d{4})/(\d{1,2})/(\d{1,2})', row[5])
        if row[5] and not date:
            raise SystemExit(f'{row[0]}: permit date {row[5]!r}')
        row[5] = f'{date[1]}-{int(date[2]):02d}-{int(date[3]):02d}' if date else ''
        if row[2] not in KINDS:
            raise SystemExit(f'{row[0]}: kind {row[2]!r}')
        out.append(row)
    if len({r[0] for r in out}) != len(out):
        raise SystemExit('Duplicate list IDs')
    return sorted(out), dropped


def stays(snapshot):
    """The snapshot's ID and its stays in Oita Prefecture: names, aliases and the stored address,
    cut from the search context as scripts/priority-plan-diff.py does (the same way as
    docs/evidence/d08-oita-20261019/measure.mjs)."""
    spec = importlib.util.spec_from_file_location('plan_diff', ROOT / 'scripts/priority-plan-diff.py')
    plan_diff = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plan_diff)
    core, cards, text, manifest = (json.loads((snapshot / f'{name}.json').read_text(encoding='utf-8')) for name in ('core', 'cards', 'text', 'manifest'))
    found = []
    for i, stay in enumerate(core['ids']):
        if core['prefecture'][i] == 'pref-ooita':
            cut = plan_diff.stored_text(cards[i], text['context'][i] or '')
            found.append({'id': stay, 'names': cards[i]['names'], 'aliases': text['names'][i] or [], 'prefecture': 'pref-ooita', 'location': {'address': cut[1] if cut else ''}})
    return manifest['id'], found


def linked_rows(found, oita):
    run = subprocess.run(['node', 'scripts/link-oita-rows.mjs'], input=json.dumps({'rows': found, 'stays': oita}, ensure_ascii=False),
                         capture_output=True, encoding='utf-8', cwd=ROOT, check=False)
    if run.returncode:
        raise SystemExit('Linking failed: ' + run.stderr[-2000:])
    return set(json.loads(run.stdout))


def as_of(note):
    """The month the list is as of, from the catalog's description: 令和8年3月時点 is 2026-03. The
    CSV's upload date is not it (Codex review on PR #211)."""
    found = re.search(r'令和(\d+)年(\d+)月時点', unicodedata.normalize('NFKC', note))
    if not found:
        raise SystemExit(f'No as-of month in the description {note!r}')
    return f'{2018 + int(found[1]):04d}-{int(found[2]):02d}'


def keep(found, linked):
    """The rows written: every 旅館・ホテル row, the others only where a stay links them."""
    return [r for r in found if r[2] == '旅館・ホテル' or r[0] in linked]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--snapshot', type=Path, required=True)
    snapshot, oita = stays(parser.parse_args(argv).snapshot)
    rules, delay = robots(PACKAGE)
    pause = max(3, delay)
    if not robots_allowed(rules, PACKAGE):
        raise SystemExit('robots.txt disallows the package record')
    time.sleep(pause)
    package = json.loads(get(PACKAGE))['result']
    if package['license_id'] != LICENSE:
        raise SystemExit(f"License is {package['license_id']}, not {LICENSE}")
    [resource] = [r for r in package['resources'] if r['format'].upper() == 'CSV']
    if not robots_allowed(rules, resource['url']):
        raise SystemExit('robots.txt disallows the CSV')
    time.sleep(pause)
    retrieved = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    found, dropped = rows(get(resource['url']).decode('utf-8-sig'))
    linked = linked_rows(found, oita)
    written = keep(found, linked)
    data = {
        'source': DATASET, 'csv': resource['url'], 'retrievedAt': retrieved,
        'asOf': as_of(resource.get('description') or ''), 'asOfNote': resource.get('description') or '', 'uploadedAt': resource['last_modified'][:10],
        'license': 'CC BY 4.0', 'licenseUrl': package['license_url'],
        'credit': '「' + package['title'] + '」（' + package['organization']['title'] + '）（' + DATASET + '）を加工して作成',
        'note': 'Columns: list ID, facility name, kind of business, address, permit number, permit date (NFKC). The operator and the phone are dropped as the CSV is read. Every 旅館・ホテル row; 簡易宿所 and 下宿 rows only where a stay of the snapshot named in linked links them. lib/oita-permits.ts links a stay only when the name and the address agree.',
        'leftOut': {'namedAfterPerson': dropped, 'notLinkedNotHotel': len(found) - len(written)},
        'linked': {'snapshot': snapshot, 'rows': sorted(linked)},
        'count': len(written),
        'rows': written,
    }
    body = '{\n' + ',\n'.join(' ' + json.dumps(k, ensure_ascii=False) + ':' + (
        '[\n' + ',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in v) + '\n ]' if k == 'rows' else json.dumps(v, ensure_ascii=False))
        for k, v in data.items()) + '\n}\n'
    OUT.write_text(body, encoding='utf-8')
    kinds = {k: sum(r[2] == k for r in written) for k in sorted(KINDS)}
    sys.stdout.write(f'Oita permits: {len(written)} rows {kinds} as of {data["asOf"]}, {len(linked)} linked in snapshot {snapshot} ({dropped} named after a person who runs it and {len(found) - len(written)} other rows no stay links left out), written to {OUT.relative_to(ROOT)}\n')


if __name__ == '__main__':
    main()
