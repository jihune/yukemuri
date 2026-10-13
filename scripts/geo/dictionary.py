#!/usr/bin/env python3
"""The jageocoder address dictionary (D06), pinned by size and SHA-256 in pins.json.

  fetch   --zip <file>              download unless <file> already matches the pin
  verify  --zip <file>              check size and SHA-256 only
  install --zip <file> --db-dir <d> verify, then install with the pinned jageocoder

A file that does not match the pin is deleted and the command fails: a
dictionary is never used unverified. deploy.yml keeps the zip in actions/cache.
--pins <file> replaces pins.json (checks only).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.request

PINS = Path(__file__).with_name('pins.json')


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def matches(path, pin):
    """None when the file matches the pin, else the reason it does not."""
    if not os.path.exists(path):
        return 'missing'
    size = os.path.getsize(path)
    if size != pin['bytes']:
        return f'size {size}, pinned {pin["bytes"]}'
    sha = digest(path)
    if sha != pin['sha256']:
        return f'sha256 {sha[:16]}…, pinned {pin["sha256"][:16]}…'
    return None


def fetch(path, pin):
    if matches(path, pin) is None:
        print(f'Dictionary from cache matches the pin: {pin["file"]}')
        return
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    part = path + '.part'
    request = urllib.request.Request(pin['url'], headers={'User-Agent': 'YukemuriSnapshotBuilder/1.0 (+https://github.com/jihune/yukemuri)'})
    with urllib.request.urlopen(request, timeout=60) as response, open(part, 'wb') as out:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            if out.tell() > pin['bytes']:
                break
    reason = matches(part, pin)
    if reason:
        os.remove(part)
        raise SystemExit(f'Dictionary refused ({reason}): {pin["url"]}')
    os.replace(part, path)
    print(f'Dictionary downloaded and verified: {pin["file"]} ({pin["bytes"]} bytes)')


def verify(path, pin):
    reason = matches(path, pin)
    if reason:
        if os.path.exists(path):
            os.remove(path)
        raise SystemExit(f'Dictionary refused ({reason}): {path}')


def install(path, db_dir, pins):
    verify(path, pins['dictionary'])
    import jageocoder
    if jageocoder.__version__ != pins['jageocoder']:
        raise SystemExit(f'jageocoder {jageocoder.__version__} installed, {pins["jageocoder"]} pinned')
    jageocoder.install_dictionary(path, db_dir=db_dir, skip_confirmation=True)
    if not os.path.exists(os.path.join(db_dir, 'README.md')):
        raise SystemExit('Installed dictionary has no README.md')
    print(f'Dictionary installed in {db_dir}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['fetch', 'verify', 'install'])
    parser.add_argument('--zip', required=True)
    parser.add_argument('--db-dir')
    parser.add_argument('--pins', default=str(PINS))
    args = parser.parse_args()
    pins = json.loads(Path(args.pins).read_text(encoding='utf-8'))
    pin = pins['dictionary']
    if args.command == 'fetch':
        fetch(args.zip, pin)
    elif args.command == 'verify':
        verify(args.zip, pin)
        print('Dictionary matches the pin')
    else:
        if not args.db_dir:
            raise SystemExit('install needs --db-dir')
        install(args.zip, args.db_dir, pins)


if __name__ == '__main__':
    sys.exit(main())
