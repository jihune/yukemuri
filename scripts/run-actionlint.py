#!/usr/bin/env python3
"""Lint .github/workflows with actionlint 1.7.7 (pinned release, SHA-256 checked).

The binary is cached under .sites-runtime/actionlint/. shellcheck and pyflakes
are turned off so the result does not depend on what the machine has installed.
Only the unknown concurrency.queue key is ignored (see IGNORE).
"""
import hashlib
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.7.7'
# actionlint_1.7.7_checksums.txt from the GitHub release.
SHA256 = {
    'linux_amd64': '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757',
    'linux_arm64': '401942f9c24ed71e4fe71b76c7d638f66d8633575c4016efd2977ce7c28317d0',
}
CACHE = ROOT / '.sites-runtime/actionlint' / VERSION


def binary():
    machine = {'x86_64': 'amd64', 'amd64': 'amd64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine().lower())
    target = f'{platform.system().lower()}_{machine}'
    if target not in SHA256:
        raise SystemExit('actionlint check supports ' + ', '.join(SHA256) + '; this machine is ' + target)
    path = CACHE / target / 'actionlint'
    if path.is_file():
        return path
    url = f'https://github.com/rhysd/actionlint/releases/download/v{VERSION}/actionlint_{VERSION}_{target}.tar.gz'
    with urllib.request.urlopen(url, timeout=60) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != SHA256[target]:
        raise SystemExit('actionlint download does not match the pinned SHA-256')
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as folder:
        tarball = Path(folder) / 'actionlint.tar.gz'
        tarball.write_bytes(archive)
        with tarfile.open(tarball) as bundle:
            member = bundle.getmember('actionlint')
            if not member.isfile():
                raise SystemExit('Unexpected actionlint archive')
            path.write_bytes(bundle.extractfile(member).read())
    path.chmod(0o755)
    return path


workflows = sorted(str(p.relative_to(ROOT)) for p in (ROOT / '.github/workflows').glob('*.yml'))
# GitHub documents concurrency.queue (single|max) for github.com; actionlint
# 1.7.7–1.7.12 does not know the key yet. check-deploy-config.mjs and
# check-collect-workflow.mjs assert its value instead.
IGNORE = 'unexpected key "queue" for "concurrency" section'
result = subprocess.run([str(binary()), '-shellcheck=', '-pyflakes=', '-ignore', IGNORE, *workflows], cwd=ROOT, check=False)
if result.returncode:
    sys.exit(result.returncode)
print(f'actionlint {VERSION} passed: {len(workflows)} workflows.')
