#!/usr/bin/env python3
"""Run existing regression checks in an isolated cloud checkout."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--full', action='store_true', help='Build and check Workers against temporary DBs')
args = parser.parse_args()
os.chdir(ROOT)
commands = [
    [sys.executable, 'scripts/materialize-source-assets.py'],
    [sys.executable, 'scripts/crawler/check.py'],
    [sys.executable, 'scripts/crawler/check_diagnostics.py'],
    [sys.executable, 'scripts/crawler/check_retry_policy.py'],
    ['node', 'scripts/build-collector-release.mjs'],
    [sys.executable, 'scripts/runner/check_bootstrap.py'],
    [sys.executable, 'scripts/check-checkpoint.py'],
    [sys.executable, 'scripts/check-chat-export.py'],
    ['node', 'node_modules/typescript/bin/tsc', '--noEmit'],
    ['node', 'scripts/check-listing-query.mjs'],
    ['node', 'scripts/check-api-client.mjs'],
    ['node', 'scripts/check-local-search.mjs'],
]
if args.full:
    commands += [
        ['node', 'scripts/run-framework.mjs', 'build'],
        ['node', 'scripts/check-collector-release-worker.mjs'],
        ['node', 'scripts/check-crawl-queue-worker.mjs'],
        ['node', 'scripts/check-collection-status-worker.mjs'],
        ['node', 'scripts/check-comparison-worker.mjs'],
        ['node', 'scripts/check-catalog-worker.mjs'],
        ['node', 'scripts/check-map-area-worker.mjs'],
    ]
for command in commands:
    if shutil.which(command[0]) is None:
        raise SystemExit('Missing executable: ' + command[0])
    print('Running: ' + ' '.join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)
print('Cloud checks passed. Browser/mobile checks and production deployment are separate.')
