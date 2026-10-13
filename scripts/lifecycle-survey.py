#!/usr/bin/env python3
"""Count hotels and lifecycle states in the public search snapshot (L01).

Public GET only: the manifest and its versioned files under /snapshot/, no
maintenance key. Town membership uses the rule of hotelPlaceSearchText
(lib/japan-place-labels.ts): same prefecture and a town term in the search
context, the card label or the Japanese name. A closed or temporarily closed
hotel has no search context in the snapshot, and Trip.com records with a
Korean address carry no Japanese or English town term, so the Korean town name
in the card label is counted as a second rule and reported beside the first.
"""
import argparse
import collections
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = json.loads((ROOT / 'cloudflare-deploy.json').read_text(encoding='utf-8'))['publicOrigin']
TOWNS = ('하코네', '유후인', '구로카와')


def get(origin, path):
    request = urllib.request.Request(origin + path, headers={'User-Agent': 'YukemuriLifecycleSurvey/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode('utf-8'))


def survey(manifest, core, text, cards, plan):
    def by(indexes, values):
        return dict(sorted(collections.Counter(str(values[i]) for i in indexes).items()))
    states = core['state']
    providers = [hotel_id.split('-')[0] for hotel_id in core['ids']]
    towns = {}
    for town in plan['towns']:
        if town['name'] not in TOWNS:
            continue
        terms = [term.lower() for term in town['terms']]
        rule, label = set(), set()
        for i in range(len(core['ids'])):
            if core['prefecture'][i] != town['prefecture']:
                continue
            card = cards[i]
            evidence = ' '.join([text['context'][i] or '', card['location'].get('label', ''), card['names'].get('ja') or '']).lower()
            if any(term in evidence for term in terms):
                rule.add(i)
            if town['name'] in card['location'].get('label', ''):
                label.add(i)
        both = rule | label
        towns[town['name']] = {
            'prefecture': town['prefecture'],
            'termRule': len(rule), 'koreanLabel': len(label), 'either': len(both),
            'labelOnly': sorted(core['ids'][i] for i in label - rule),
            'providers': by(both, providers), 'states': by(both, states),
            'bathKnown': sum(1 for i in both if core['known'][i]),
            'official': [{'id': core['ids'][i], 'state': states[i]} for i in sorted(both) if states[i] not in (None, 'unverified')],
        }
    official = [{'id': core['ids'][i], 'name': core['name'][i], 'prefecture': core['prefecture'][i], 'state': s}
                for i, s in enumerate(states) if s not in (None, 'unverified')]
    return {
        'snapshot': manifest['id'], 'generatedAt': manifest['generatedAt'], 'hotels': manifest['hotels'],
        'states': dict(sorted(collections.Counter(str(s) for s in states).items())),
        'reviewNeeded': sum(1 for card in cards if card.get('lifecycle', {}).get('reviewNeeded')),
        'official': official, 'towns': towns,
        'meaning': 'provider records; cross-provider duplicates may remain. None: no hotel_lifecycle row.',
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default=ORIGIN)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args(argv)
    measured = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    manifest = get(args.origin, '/snapshot/manifest.json')
    files = {}
    for name in ('core', 'text', 'cards'):
        files[name] = get(args.origin, manifest['files'][name])
    plan = json.loads((ROOT / 'data/collection-priorities.json').read_text(encoding='utf-8'))
    result = {'measuredAt': measured, 'origin': args.origin, **survey(manifest, files['core'], files['text'], files['cards'], plan)}
    body = json.dumps(result, ensure_ascii=False, indent=1) + '\n'
    if args.out:
        args.out.write_text(body, encoding='utf-8')
    sys.stdout.write(body)


if __name__ == '__main__':
    main()
