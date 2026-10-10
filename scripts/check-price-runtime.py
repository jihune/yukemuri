"""Opt-in real upstream quote check, isolated local production Worker/D1."""
import json
import urllib.request
import urllib.error
import sys
from datetime import datetime,timedelta,timezone
root='http://127.0.0.1:8787'
today=datetime.now(timezone(timedelta(hours=9))).date()
checkin=datetime(2026,11,10).date() if '--fixture' in sys.argv else max(today+timedelta(days=30),datetime(2026,11,10).date())
params=f'hotelId=daiichi-takimotokan&checkIn={checkin}&checkOut={checkin+timedelta(days=1)}&adults=2'
try:
 with urllib.request.urlopen(root+'/api/prices?'+params,timeout=60) as r:quote=json.load(r)
except urllib.error.HTTPError as e:
 print('Quote HTTP',e.code,e.read().decode()[:500]);raise
assert quote['plans'] and not quote['cached']
assert quote['query']['adults']==2 and quote['query']['checkIn']==str(checkin)
with urllib.request.urlopen(root+'/api/prices?'+params,timeout=30) as r:again=json.load(r)
assert again['cached'] and again['retrievedAt']==quote['retrievedAt']
assert again['plans']==quote['plans']
print(json.dumps(dict(checkIn=str(checkin),plans=len(quote['plans']),lowestObservedTotal=quote['plans'][0]['total'],currency='JPY',cachedReadback=True)))
