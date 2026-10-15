#!/usr/bin/env python3
"""Which crawl jobs a change of data/collection-priorities.json moves (L01).

Public GET only: the search snapshot (manifest, core, cards, text, status), no
maintenance key. For every provider record (jalan-*, trip-*: one detail job
each) it recomputes the priority of lib/collection-priorities.ts under the plan
at a git ref (default origin/main) and the plan in the working tree, from the
same text the Worker uses: every name, the stored label and the stored address
(addressTerms: the address alone). The snapshot's search context starts with
the stored label and address, then the list label (cards) and the prefecture,
so they are cut there; the stored label is the leading 'A · B' run (its last
part one word). A record where the cut is not found is counted under 'uncut'
and uses the whole context as both texts.

D1 writes when the new plan version runs once (prepareCollectionPriorities):
one row and one idx_crawl_jobs_claim_priority entry per moved job, and one
catalog_meta progress row per batch of 500 jobs. The pass reads every crawl_jobs
row; status.json counts only done detail, pending, running, retry and failed
jobs (activePages overlaps them), so without --queue-jobs (the full count, from
the maintenance-only /api/collection-status) the progress rows are a lower
bound: each 500 uncounted jobs (done list pages, skipped) adds one row.
"""
import argparse
import collections
import json
import math
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAN = 'data/collection-priorities.json'
ORIGIN = json.loads((ROOT / 'cloudflare-deploy.json').read_text(encoding='utf-8'))['publicOrigin']


def get(origin, path):
    request = urllib.request.Request(origin + path, headers={'User-Agent': 'YukemuriPrioritySurvey/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode('utf-8'))


def matches(town, prefecture, text, address):
    return prefecture == town['prefecture'] and (any(term.lower() in text.lower() for term in town['terms'])
                                                 or any(term.lower() in address.lower() for term in town.get('addressTerms', [])))


def priority(plan, prefecture, text, address):
    """collectionPriority() for a detail job of a stored hotel."""
    for town in plan['towns']:
        if matches(town, prefecture, text, address):
            return town['priority']
    if prefecture in plan['primaryPrefectures']:
        return 20
    if prefecture in plan['secondaryPrefectures']:
        return 40
    return 60 if prefecture in plan['tertiaryPrefectures'] else 90


def stored_text(card, context):
    """(names, stored label and address; the address), or None when the cut is not found."""
    label = card['location'].get('label', '')
    at = context.find(label + ' ' + label.split(' · ')[-1]) if label else -1
    if at < 0:
        return None
    stored = context[:at].strip()
    split = re.match(r'((?:[^·]+ · )+[^\s·]+) ?(.*)', stored)
    names = ' '.join(value for value in card['names'].values() if value)
    return names + ' ' + stored, split.group(2) if split else stored


def town_of(plan, prefecture, text, address):
    return next((town['name'] for town in plan['towns'] if matches(town, prefecture, text, address)), None)


def diff(old, new, core, cards, text, status, queue_jobs=None):
    moved, uncut, records = [], 0, 0
    for i, hotel_id in enumerate(core['ids']):
        if not hotel_id.startswith(('jalan-', 'trip-')):
            continue
        records += 1
        cut = stored_text(cards[i], text['context'][i] or '')
        if cut is None:
            uncut += 1
            whole = ' '.join(value for value in cards[i]['names'].values() if value) + ' ' + (text['context'][i] or '')
            cut = whole, whole
        prefecture = core['prefecture'][i]
        before, after = priority(old, prefecture, *cut), priority(new, prefecture, *cut)
        if before != after:
            moved.append({'id': hotel_id, 'name': core['name'][i], 'address': cut[1], 'from': before, 'to': after,
                          'oldTown': town_of(old, prefecture, *cut), 'newTown': town_of(new, prefecture, *cut)})
    counted = sum(p['completedDetailPages'] + p['pendingPages'] + p['retryPages'] + p['failedPages'] for p in status['providers'])
    jobs = queue_jobs or counted
    batches = math.ceil(jobs / 500)
    return {
        'records': records, 'uncut': uncut, 'moved': len(moved),
        'byChange': dict(sorted(collections.Counter(f"{m['from']}->{m['to']} {m['oldTown'] or '-'}->{m['newTown'] or '-'}" for m in moved).items())),
        'queueJobs': jobs, 'queueJobsSource': 'given' if queue_jobs else 'status.json (lower bound: done list pages and skipped jobs uncounted)',
        'batches': batches,
        'rowsWrittenEstimate': {'movedJobs': 2 * len(moved), 'progress': batches, 'total': 2 * len(moved) + batches,
                                'lowerBound': not queue_jobs},
        'movedRecords': sorted(moved, key=lambda m: m['id']),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default=ORIGIN)
    parser.add_argument('--old-ref', default='origin/main')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--queue-jobs', type=int, help='every crawl_jobs row, when known')
    args = parser.parse_args(argv)
    old = json.loads(subprocess.run(['git', 'show', f'{args.old_ref}:{PLAN}'], cwd=ROOT, capture_output=True, encoding='utf-8', check=True).stdout)
    new = json.loads((ROOT / PLAN).read_text(encoding='utf-8'))
    measured = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    manifest = get(args.origin, '/snapshot/manifest.json')
    files = {name: get(args.origin, manifest['files'][name]) for name in ('core', 'cards', 'text', 'status')}
    result = {'measuredAt': measured, 'origin': args.origin, 'snapshot': manifest['id'], 'generatedAt': manifest['generatedAt'],
              'oldVersion': old['version'], 'newVersion': new['version'],
              **diff(old, new, files['core'], files['cards'], files['text'], files['status'], args.queue_jobs)}
    body = json.dumps(result, ensure_ascii=False, indent=1) + '\n'
    if args.out:
        args.out.write_text(body, encoding='utf-8')
    sys.stdout.write(body)


if __name__ == '__main__':
    main()
