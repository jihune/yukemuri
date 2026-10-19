import re, sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
# strip fenced code blocks
t2 = re.sub(r'```.*?```', '', t, flags=re.S)
issues = []
for i, line in enumerate(t2.split('\n'), 1):
    s = re.sub(r'`[^`]*`', '', line)          # inline code
    s = re.sub(r'https?://\S+|s3://\S+', '', s)  # URLs
    if re.search(r'[㐀-䶿一-鿿豈-﫿]', s): issues.append((i, 'HANJA', s.strip()[:80]))
    if re.search(r'[぀-ヿ]', s): issues.append((i, 'KANA', s.strip()[:80]))
    if '·' in s or '・' in s: issues.append((i, 'MIDDOT', s.strip()[:80]))
    if '**' in s: issues.append((i, 'BOLD', s.strip()[:80]))
    if re.search(r'(고|며|지만|으며),\s', s): issues.append((i, 'CONN-COMMA', s.strip()[:80]))
    if re.match(r'\s*(따라서|즉|결론적으로|요컨대)\b', s): issues.append((i, 'SUMMARY-CONN', s.strip()[:80]))
for x in issues: print(x)
print('issues', len(issues), 'PASS' if not issues else 'FAIL')
