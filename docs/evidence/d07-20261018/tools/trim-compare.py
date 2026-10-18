# D07 PR 2, 4th review P3-2 (D07-20261019.md 'results (PR 2)' 20): which one-character strings JS trim
# (zod .trim() in lib/crawl-contract.ts) empties and Python str.strip() keeps, and the other way round,
# over every code point outside the surrogates. Needs node. Usage: python3 trim-compare.py
import json
import subprocess

JS = 'const o=[];for(let c=0;c<0x110000;c++){if(c>=0xd800&&c<=0xdfff)continue;if(String.fromCodePoint(c).trim()==="")o.push(c)}console.log(JSON.stringify(o))'
js = set(json.loads(subprocess.run(['node', '-e', JS], capture_output=True, encoding='utf-8', check=True).stdout))
py = {c for c in range(0x110000) if not 0xD800 <= c <= 0xDFFF and chr(c).strip() == ''}
print(json.dumps({'jsOnly': [f'U+{c:04X}' for c in sorted(js - py)], 'pythonOnly': [f'U+{c:04X}' for c in sorted(py - js)], 'js': len(js), 'python': len(py)}))
