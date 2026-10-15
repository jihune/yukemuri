# Sample production hotel details by public GET (browser UA), paced under the 30/60s limit.
import json
import random
import re
import sys
import time
import urllib.error
import urllib.request

PROD=sys.argv[1]; OUT=sys.argv[2]
with open(PROD+'/core.json',encoding='utf-8') as f:
  core=json.load(f)
ids=core['ids'];known=core['known']
rng=random.Random(20261015)
uniform=rng.sample(range(len(ids)),150)
bath=[i for i in range(len(ids)) if known[i]]
rest=[i for i in bath if i not in set(uniform)]
bathsample=rng.sample(rest,60)
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
hang=re.compile(r'[가-힣]')
def needs_ko(t):
  import unicodedata
  n=unicodedata.normalize('NFKC',t)
  ko=len(hang.findall(n));other=sum(1 for ch in hang.sub('',n) if ch.isalpha())
  if not other:return False
  if not ko:return True
  return other>=20 and other>ko
rows=[]
for group,idx in (('uniform',uniform),('bath',bathsample)):
  for i in idx:
    hid=ids[i];url=PROD_URL='https://yukemuri.jihune.workers.dev/api/hotels/'+hid
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
    for attempt in range(3):
      try:
        with urllib.request.urlopen(req,timeout=30) as r:status=r.status;body=json.loads(r.read().decode('utf-8'))
        break
      except urllib.error.HTTPError as e:
        status=e.code;body=None
        if e.code==429:time.sleep(65);continue
        break
      except Exception as e:
        status=str(type(e).__name__);body=None;time.sleep(5)
    rec={'group':group,'id':hid,'status':status}
    if body:
      h=body.get('hotel',body)
      src=h.get('sources') or [{}]
      d=h.get('description') or ''
      rec.update(detail='상세' in (src[0].get('label') or ''),label=src[0].get('label'),desc=bool(d.strip()),descLen=len(d),needsKo=needs_ko(d) if d.strip() else None,translated=bool(h.get('descriptionTranslation')),
        rooms=bool(h.get('rooms')),roomTypes=sum(len(s.get('items',[])) for s in h.get('roomTypes') or []),roomPhotos=sum(len(it.get('photos',[])) for s in h.get('roomTypes') or [] for it in s.get('items',[])),
        years=bool(h.get('facilityYears')),opened=(h.get('facilityYears') or {}).get('opened'),renovated=(h.get('facilityYears') or {}).get('renovated'),
        nameKo=bool(hang.search(h['names']['ko'])),nameLocale=any(s.get('nameLocaleUrl') for s in src),spring=bool((h.get('spring') or {}).get('types')),keys=sorted(h.keys()))
    rows.append(rec)
    with open(OUT,'w',encoding='utf-8') as f:json.dump(rows,f,ensure_ascii=False)
    time.sleep(2.3)
print('done',len(rows))
