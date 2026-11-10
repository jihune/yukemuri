#!/usr/bin/env python3
"""Replace one exact passage in the findings file; fail unless it occurs exactly once.

Usage: python3 -I fix_text.py <findings.md> <old.txt> <new.txt>
"""
import sys
from pathlib import Path

target = Path(sys.argv[1])
old = Path(sys.argv[2]).read_text(encoding='utf-8').rstrip('\n')
new = Path(sys.argv[3]).read_text(encoding='utf-8').rstrip('\n')
text = target.read_text(encoding='utf-8')
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one occurrence, found {count}')
target.write_text(text.replace(old, new), encoding='utf-8')
print('replaced 1 passage')
