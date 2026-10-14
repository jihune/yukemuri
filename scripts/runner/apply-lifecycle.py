#!/usr/bin/env python3
"""Apply the reviewed official evidence in data/lifecycle-official.json (L01).

.github/workflows/lifecycle.yml calls this after a main push that changes the
file, or by hand. Each entry is one Worker lifecycle patch (lib/lifecycle-contract.ts);
scripts/crawler/update-lifecycle.py sends them to PUT /api/hotel-lifecycle and reads
each hotel back. The same entry again is 'replayed' with no write; evidence older
than the stored one is refused (409) and stays refused. Removing an entry does not
undo a state: newer evidence does.
The target and the key handling are run-collection.py's: publicOrigin from
cloudflare-deploy.json, the key from YUKEMURI_CRAWL_ACCESS_KEY, passed to the child
only on stdin and never in arguments, the child environment or logs.
Writes saved=<n> (stores, also when the read back failed) and failed=<n> (entries
not confirmed) to GITHUB_OUTPUT. A refused or unconfirmed entry does not fail
this step; the workflow fails the run after the deploy.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
APPLY = ROOT / 'scripts/crawler/update-lifecycle.py'
EVIDENCE = ROOT / 'data/lifecycle-official.json'
TIME_LIMIT = 300
spec = importlib.util.spec_from_file_location('collection', Path(__file__).with_name('run-collection.py'))
collection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collection)


def load_patches(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or set(data) != {'version', 'patches'} or data['version'] != 1 or not isinstance(data['patches'], list):
        raise ValueError('Expected {"version": 1, "patches": [...]} in ' + path.name)
    return data['patches']


def results(stdout, ids):
    """The last result line per entry of this file, by id."""
    rows = {}
    for line in (stdout or '').splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get('id') in ids:
            rows[row['id']] = row
    return rows


def write_outputs(saved, failed):
    print(json.dumps({'saved': saved, 'failed': failed}), flush=True)
    target = os.environ.get('GITHUB_OUTPUT')
    if target:
        with open(target, 'a', encoding='utf-8') as output:
            output.write(f'saved={saved}\nfailed={failed}\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=ROOT / 'cloudflare-deploy.json')
    parser.add_argument('--evidence', type=Path, default=EVIDENCE)
    args = parser.parse_args(argv)
    try:
        origin = collection.target_origin(json.loads(args.config.read_text()))
        patches = load_patches(args.evidence)
        access = {'url': origin, 'token': collection.load_key(), 'patches': patches}
    except (ValueError, OSError) as error:
        print('Lifecycle apply stopped: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        return 1
    if not patches:
        write_outputs(0, 0)
        return 0
    print(json.dumps({'target': origin, 'entries': len(patches), 'llmCalls': 0}), flush=True)
    try:
        result = subprocess.run([sys.executable, '-u', str(APPLY)], input=json.dumps(access, ensure_ascii=False) + '\n', text=True,
                                capture_output=True, cwd=ROOT, env=collection.child_env(), timeout=TIME_LIMIT)
        stdout, stderr = result.stdout, result.stderr
    except subprocess.TimeoutExpired as error:
        stdout, stderr = error.stdout, error.stderr
    for output in (stdout, stderr):
        if output:
            print(collection.safe_output(output, access), flush=True)
    ids = {patch.get('id') for patch in patches if isinstance(patch, dict)}
    rows = results(stdout if isinstance(stdout, str) else (stdout or b'').decode('utf-8', errors='replace'), ids)
    # saved: stores that happened, also when the read back failed; failed: every
    # entry not stored or replayed and read back unchanged.
    saved = sum(1 for row in rows.values() if row.get('result') == 'saved')
    confirmed = sum(1 for row in rows.values() if row.get('result') in ('saved', 'replayed') and row.get('readbackVerified') is True)
    write_outputs(saved, len(patches) - confirmed)
    return 0


if __name__ == '__main__':
    sys.exit(main())
