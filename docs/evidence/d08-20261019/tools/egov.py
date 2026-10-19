import json, sys, collections, urllib.parse
d=json.load(open(sys.argv[1],encoding='utf-8'))['result']
print('count', d['count'], 'returned', len(d['results']))
c=collections.Counter(); lic=collections.Counter(); rows=[]
for r in d['results']:
    t=r.get('title','')
    if '旅館' not in t: continue
    org=(r.get('organization') or {}).get('title','')
    c[org]+=1; lic[r.get('license_title') or r.get('license_id')]+=1
    rows.append((org,t,r.get('license_title'),r.get('metadata_modified','')[:10],r.get('frequency_of_update')))
print('titles with 旅館:', len(rows))
for k,v in lic.most_common(): print('LIC',k,v)
for x in sorted(rows): print(x)
