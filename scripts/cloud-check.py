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
    [sys.executable, 'scripts/crawler/check_site_access.py'],
    ['node', 'scripts/build-collector-release.mjs'],
    [sys.executable, 'scripts/runner/check_bootstrap.py'],
    [sys.executable, 'scripts/runner/check_collection.py'],
    [sys.executable, 'scripts/runner/check_lifecycle.py'],
    ['node', 'scripts/check-lifecycle-official.mjs'],
    ['node', 'scripts/check-collect-workflow.mjs'],
    ['node', 'scripts/check-rollback-workflow.mjs'],
    ['node', 'scripts/check-cloudflare-usage.mjs'],
    ['node', 'scripts/check-collection-budget.mjs'],
    ['node', 'scripts/check-cloudflare-smoke.mjs'],
    [sys.executable, 'scripts/run-actionlint.py'],
    [sys.executable, 'scripts/check-checkpoint.py'],
    [sys.executable, 'scripts/check-chat-export.py'],
    ['node', 'node_modules/typescript/bin/tsc', '--noEmit'],
    ['node', 'scripts/check-listing-query.mjs'],
    ['node', 'scripts/check-booking-links.mjs'],
    ['node', 'scripts/check-api-client.mjs'],
    ['node', 'scripts/check-local-search.mjs'],
    ['node', 'scripts/check-map-bounds.mjs'],
    ['node', 'scripts/check-comparison-differences.mjs'],
    ['node', 'scripts/check-snapshot-geo.mjs'],
]
if args.full:
    commands += [
        ['node', 'scripts/run-framework.mjs', 'build'],
        ['node', 'scripts/check-collector-release-worker.mjs'],
        ['node', 'scripts/check-crawl-queue-worker.mjs'],
        ['node', 'scripts/check-claim-order-worker.mjs'],
        ['node', 'scripts/check-collection-status-worker.mjs'],
        ['node', 'scripts/check-comparison-worker.mjs'],
        ['node', 'scripts/check-catalog-worker.mjs'],
        ['node', 'scripts/check-map-area-worker.mjs'],
        ['node', 'scripts/check-edge-guard-worker.mjs'],
        ['node', 'scripts/check-deploy-config.mjs'],
        ['node', 'scripts/check-search-snapshot-worker.mjs'],
        ['node', 'scripts/check-snapshot-geo.mjs', '--built'],
        ['node', 'scripts/check-public-reads-worker.mjs'],
        ['node', 'scripts/measure-d1-reads.mjs', '--check'],
    ]
for command in commands:
    if shutil.which(command[0]) is None:
        raise SystemExit('Missing executable: ' + command[0])
    print('Running: ' + ' '.join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)
print('Cloud checks passed. Browser/mobile checks and production deployment are separate.')
