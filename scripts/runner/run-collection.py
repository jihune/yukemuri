#!/usr/bin/env python3
"""Run the in-repo collector against the Cloudflare Worker (H01 step 6).

.github/workflows/collect.yml calls this; the runner repository dispatches that
workflow on its existing cron. Pacing matches the runner's run-updates.py when
collection moved here (jihune/yukemuri-script-runner b7f9c64): every step gets
--interval 8 --jitter 4 per source host. The page count of a gentle run comes
from scripts/collection-budget.mjs (C03, 2026-10-13: as many pages as the free
D1 limits allow, at most 120; 16 before C03 and when usage is unreadable), and
the run gets 11 seconds a page plus 60, never less than 240 seconds. The target
is publicOrigin in cloudflare-deploy.json.
The crawl key comes from YUKEMURI_CRAWL_ACCESS_KEY and reaches the collector
only on stdin, never in arguments, the child environment or logs. No LLM calls.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
COLLECTOR = ROOT / 'scripts/crawler/update-site.py'
MODES = ('check-access', 'gentle')
PACING = ['--interval', '8', '--jitter', '4']
TIME_LIMIT = 240
MAX_PAGES = 120
DEFAULT_PAGES = 16
SECONDS_PER_PAGE = 11


def phases(mode, pages):
    if mode == 'check-access':
        return [['--health-only']]
    return [['--gentle', '--max-pages', str(pages)]]


def time_limit(mode, pages):
    # About 9 seconds a page measured on 2026-10-13 (16 pages in 146 s, two hosts).
    return TIME_LIMIT if mode == 'check-access' else max(TIME_LIMIT, 60 + SECONDS_PER_PAGE * pages)


def page_count(value):
    pages = int(value)
    if not 0 <= pages <= MAX_PAGES:
        raise argparse.ArgumentTypeError(f'pages must be 0-{MAX_PAGES}')
    return pages
# Same rule as scripts/cloudflare-deploy-gate.mjs and source_safety.WORKER_HOST.
WORKER_ORIGIN = re.compile(r'https://yukemuri\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev')


def target_origin(config):
    """The Worker this run may send the crawl key to, or ValueError before the switch."""
    origin = config.get('publicOrigin') if isinstance(config, dict) else None
    if origin is None:
        raise ValueError('publicOrigin is not recorded yet; collection moves here at the H01 switch')
    if not isinstance(origin, str) or not WORKER_ORIGIN.fullmatch(origin):
        raise ValueError('publicOrigin must be https://yukemuri.<subdomain>.workers.dev')
    if config.get('autoDeploy') is not True or not config.get('databaseId'):
        raise ValueError('The search snapshot cannot follow this run: enable autoDeploy with the D1 database id first')
    return origin


def load_key():
    key = os.environ.pop('YUKEMURI_CRAWL_ACCESS_KEY', '')
    if len(key) < 20 or any(c.isspace() for c in key):
        raise ValueError('Missing or invalid crawl access key')
    return key


def child_env():
    # Transport settings only; never the workflow's secrets or tokens.
    allowed = {'PATH', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
               'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR'}
    environment = {key: value for key, value in os.environ.items() if key in allowed}
    environment.update(PYTHONUNBUFFERED='1', PYTHONUTF8='1')
    return environment


def safe_output(value, access):
    if isinstance(value, bytes):
        value = value.decode('utf-8', errors='replace')
    return (value or '').replace(access['token'], '[REDACTED]')


def run_step(args, access, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return 'budget'
    print(json.dumps({'phase': args, 'state': 'started'}), flush=True)
    try:
        result = subprocess.run([sys.executable, '-u', str(COLLECTOR), *args, *PACING],
                                input=json.dumps(access) + '\n', text=True, capture_output=True,
                                cwd=ROOT, env=child_env(), timeout=remaining)
    except subprocess.TimeoutExpired as error:
        # Claims the collector saved expire on the server; nothing is cleared here.
        for output in (error.stdout, error.stderr):
            if output:
                print(safe_output(output, access), flush=True)
        return 'budget'
    for output in (result.stdout, result.stderr):
        if output:
            print(safe_output(output, access), flush=True)
    return 'ok' if result.returncode == 0 else 'failed'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=MODES, required=True)
    parser.add_argument('--config', type=Path, default=ROOT / 'cloudflare-deploy.json')
    parser.add_argument('--pages', type=page_count, default=DEFAULT_PAGES,
                        help='gentle only: pages for this run (0 skips the run; the free daily D1 budget is used up)')
    args = parser.parse_args(argv)
    limit = time_limit(args.mode, args.pages)
    deadline = time.monotonic() + limit
    try:
        origin = target_origin(json.loads(args.config.read_text()))
        access = {'url': origin, 'token': load_key()}
    except (ValueError, OSError) as error:
        print('Collection stopped: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        return 1
    if args.mode == 'gentle' and args.pages == 0:
        print(json.dumps({'mode': args.mode, 'state': 'skipped', 'reason': 'free daily D1 budget used; next scheduled run', 'pages': 0}), flush=True)
        return 0
    print(json.dumps({'mode': args.mode, 'target': origin, 'pages': args.pages if args.mode == 'gentle' else None,
                      'timeLimitSeconds': limit, 'llmCalls': 0}), flush=True)
    for phase in phases(args.mode, args.pages):
        state = run_step(phase, access, deadline)
        if state == 'budget':
            print(json.dumps({'state': 'budget_reached', 'resume': 'next scheduled run; unfinished claims expire on the server', 'inventoryComplete': False}), flush=True)
            return 1 if args.mode == 'check-access' else 0
        if state == 'failed':
            print(json.dumps({'state': 'failed', 'phase': phase, 'continued': False}), flush=True)
            return 1
    print(json.dumps({'state': 'finished', 'mode': args.mode, 'inventoryComplete': False}), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
