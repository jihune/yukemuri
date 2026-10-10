#!/usr/bin/env python3
"""Download the authenticated Sites collector. Stdlib only; no LLM calls.

Access comes from hidden stdin as {"url": "https://...", "token": "..."}.
The GitHub workflow installs this launcher once. Future collector edits live
in Sites. An unavailable or invalid release stops this run; no stale fallback.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request

SITE_ORIGIN = 'https://yukemuri.jihun7891.chatgpt.site'
MAX_BYTES = 2 * 1024 * 1024
FILES = frozenset({
    'data/prefectures.json', 'scripts/crawler/collect.py',
    'scripts/crawler/retry_policy.py', 'scripts/crawler/source_safety.py',
    'scripts/crawler/update-site.py',
})


class ReleaseError(Exception):
    pass


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def validate_release(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise ReleaseError('Release exceeds the download limit')
    def unique_object(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ReleaseError('Duplicate JSON key')
            value[key] = item
        return value
    try:
        release = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object)
        if set(release) != {'schemaVersion', 'siteOrigin', 'entrypoint', 'limits', 'files', 'release'}:
            raise ReleaseError('Unsupported release fields')
        if type(release['schemaVersion']) is not int or release['schemaVersion'] != 1:
            raise ReleaseError('Unsupported release schema')
        if release['siteOrigin'] != SITE_ORIGIN or release['entrypoint'] != 'scripts/crawler/update-site.py':
            raise ReleaseError('Unexpected release destination or entrypoint')
        limits = release['limits']
        if set(limits) != {'maxPages', 'maxSeconds', 'intervalSeconds', 'jitterSeconds'} or any(type(v) is not int for v in limits.values()):
            raise ReleaseError('Invalid run limits')
        if not (1 <= limits['maxPages'] <= 16 and 1 <= limits['maxSeconds'] <= 240
                and 8 <= limits['intervalSeconds'] <= 60 and 4 <= limits['jitterSeconds'] <= 30):
            raise ReleaseError('Run exceeds the approved budget or reduces source pacing')
        files = release['files']
        if not isinstance(files, list) or len(files) != len(FILES):
            raise ReleaseError('Invalid release file count')
        seen = set()
        for item in files:
            if set(item) != {'path', 'sha256', 'content'} or item['path'] not in FILES or item['path'] in seen:
                raise ReleaseError('Unapproved or duplicate release path')
            if not isinstance(item['content'], str) or not item['content'] or digest(item['content']) != item['sha256']:
                raise ReleaseError('Release file checksum does not match')
            seen.add(item['path'])
        payload = {key: value for key, value in release.items() if key != 'release'}
        if digest(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))) != release['release']:
            raise ReleaseError('Release checksum does not match')
        return release
    except ReleaseError:
        raise
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise ReleaseError('Invalid release document') from None


def validate_access(access):
    if not isinstance(access, dict) or set(access) != {'url', 'token'}:
        raise ReleaseError('Expected Site access on stdin')
    if access['url'] not in (SITE_ORIGIN, SITE_ORIGIN + '/'):
        raise ReleaseError('Site origin must match the approved HTTPS destination')
    token = access['token']
    if not isinstance(token, str) or not 1 <= len(token) <= 4096 or any(ord(c) < 33 or ord(c) > 126 for c in token):
        raise ReleaseError('Invalid maintenance credential')
    return {'url': SITE_ORIGIN, 'token': token}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ReleaseError('Release redirected; maintenance credential was not forwarded')


def fetch_release(access, opener=None):
    access = validate_access(access)
    opener = opener or urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(SITE_ORIGIN + '/api/collector-release', headers={
        'Accept': 'application/json',
        'OAI-Sites-Authorization': 'Bearer ' + access['token'],
        'X-Yukemuri-Crawl-Key': access['token'],
    })
    with opener.open(request, timeout=30) as response:
        if response.status != 200 or response.headers.get_content_type() != 'application/json':
            raise ReleaseError('Maintenance release unavailable')
        return validate_release(response.read(MAX_BYTES + 1))


@contextmanager
def materialized_release(release):
    # Check again at the filesystem boundary; never trust callers with paths.
    release = validate_release(json.dumps(release, ensure_ascii=False).encode('utf-8'))
    with tempfile.TemporaryDirectory(prefix='yukemuri-collector-') as folder:
        root = Path(folder)
        for item in release['files']:
            target = root / item['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(item['content'], encoding='utf-8')
        yield root


def collector_env():
    # Preserve explicit transport settings, never unrelated workflow secrets.
    allowed = {'PATH', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
               'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR'}
    environment = {key: value for key, value in os.environ.items() if key in allowed}
    environment.update(PYTHONUNBUFFERED='1', PYTHONUTF8='1')
    return environment


def run_release(release, access, mode):
    limits = release['limits']
    with materialized_release(release) as root:
        command = [sys.executable, str(root / release['entrypoint'])]
        if mode == 'health':
            command.append('--health-only')
        else:
            command += ['--gentle', '--max-pages', str(limits['maxPages']),
                        '--interval', str(limits['intervalSeconds']), '--jitter', str(limits['jitterSeconds'])]
        try:
            result = subprocess.run(command, cwd=root, input=json.dumps(access) + '\n',
                                    text=True, env=collector_env(), timeout=limits['maxSeconds'])
            return result.returncode
        except subprocess.TimeoutExpired:
            # Persisted claims expire normally. Do not clear leases or waits.
            print('Collector reached its '+str(limits['maxSeconds'])+'-second budget; saved leases remain in effect.', flush=True)
            return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['collect', 'health'], default='collect')
    args = parser.parse_args()
    # Match the existing collector's hidden-stdin handling for manual Work runs.
    if sys.stdin.isatty():
        import termios
        state = termios.tcgetattr(sys.stdin.fileno())
        hidden = state[:]
        hidden[3] &= ~termios.ECHO
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, hidden)
        print('Ready for Site access JSON on stdin (input is hidden).', flush=True)
        try:
            line = sys.stdin.readline(MAX_BYTES + 1)
        finally:
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, state)
    else:
        line = sys.stdin.readline(MAX_BYTES + 1)
    try:
        access = validate_access(json.loads(line))
        release = fetch_release(access)
        print(json.dumps({'collectorRelease': release['release'], 'mode': args.mode}), flush=True)
        return run_release(release, access, args.mode)
    except (ReleaseError, ValueError, OSError) as error:
        # Network errors can contain request details. Log only the safe category.
        print('Collector launcher stopped: ' + (str(error) if isinstance(error, ReleaseError) else type(error).__name__), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
