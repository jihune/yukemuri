#!/usr/bin/env python3
"""Restore hash-checked source resources using Python's standard library."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / 'source-assets'
MANIFEST = STORE / 'manifest.json'


def checked_path(value):
    candidate = ROOT / value
    if candidate.is_symlink() or not candidate.resolve().is_relative_to(ROOT):
        raise ValueError('Unsafe source path: ' + value)
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', action='store_true', help='Record edited resources in versioned chunks')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for index, entry in enumerate(manifest['files']):
        target = checked_path(entry['path'])
        if args.pack:
            data = target.read_bytes()
            encoded = base64.b64encode(gzip.compress(data, compresslevel=9, mtime=0)).decode('ascii')
            folder = STORE / f"{entry.get('storageIndex', index):03d}"
            folder.mkdir(parents=True, exist_ok=True)
            for old in folder.glob('*.b64'):
                old.unlink()
            parts = []
            for number, offset in enumerate(range(0, len(encoded), 60000)):
                part = folder / f'{number:03d}.b64'
                part.write_text(encoded[offset:offset + 60000], encoding='ascii')
                parts.append(part.relative_to(ROOT).as_posix())
            entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), parts=parts)
        else:
            encoded = ''.join(checked_path(p).read_text(encoding='ascii') for p in entry['parts'])
            data = gzip.decompress(base64.b64decode(encoded, validate=True))
            if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('Resource hash mismatch: ' + entry['path'])
            if target.exists():
                if target.read_bytes() != data:
                    raise ValueError('Edited resource: run --pack before setup: ' + entry['path'])
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    if args.pack:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(('Packed' if args.pack else 'Verified/restored') + f" {len(manifest['files'])} source resources")


if __name__ == '__main__':
    main()
