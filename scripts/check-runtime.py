"""Run against an isolated, locally migrated production Worker on port 8787."""
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

root='http://127.0.0.1:8787'
def call(method,path,payload=None,headers=None,raw=None):
 body=raw if raw is not None else json.dumps(payload).encode() if payload is not None else None
 hs={'Content-Type':'application/json'};hs.update(headers or {})
 try:
  with urllib.request.urlopen(urllib.request.Request(root+path,data=body,headers=hs,method=method),timeout=90) as r:return r.status,r.read().decode()
 except urllib.error.HTTPError as e:return e.code,e.read().decode()
def api(path='/api/hotels',method='GET',payload=None,expected=200,headers=None,raw=None):
 status,body=call(method,path,payload,headers,raw);assert status==expected,(path,status,body[:400]);return json.loads(body)

data=api()
assert data['total']>1000 and len(data['hotels'])==40 and data['page']==1
second=api('/api/hotels?page=2')
assert not set(h['id'] for h in data['hotels'])&set(h['id'] for h in second['hotels'])
assert second['total']==data['total']
last=api('/api/hotels?page=99999')
assert last['page']==(last['total']+39)//40
assert 0<len(last['hotels'])<=40
for slug in ['tokyo','kyoto','oosaka','fukuoka','okinawa','hokkaido']:
 scoped=api('/api/hotels?region=pref-'+slug)
 assert scoped['total']>0 and all(h['prefecture']=='pref-'+slug for h in scoped['hotels'])
assert api('/api/hotels?region=sapporo')['total']>5
verified=api('/api/hotels?rating=9&reviews=50')
for h in verified['hotels']:
 assert any(r['provider']=='trip' and r['scale']==10 and r['score']>=9 and r['reviewCount']>=50 for r in h['ratings'])
jalan=api('/api/hotels?provider=jalan&rating=4.5&reviews=50&sort=rating')
assert jalan['total']>20
assert all(any(r['provider']=='jalan' and r['scale']==5 and r['score']>=4.5 and r['reviewCount']>=50 for r in h['ratings']) for h in jalan['hotels'])
assert api('/api/hotels?features=roomOutdoor&region=noboribetsu&rating=9&reviews=50')['total']==2
assert api('/api/hotels?features=natural&region=pref-tokyo')['total']==0
assert api('/api/hotels?'+urllib.parse.urlencode({'q':'湖の栖'}))['total']==1
for name in ['소잔쿄','Sozankyo','SOZAN-KYO','Ｓｏｚａｎｋｙｏ','蘇山郷','阿蘇内牧温泉 蘇山郷','蘇る山と故郷　阿蘇内牧温泉　蘇山郷']:
 result=api('/api/hotels?'+urllib.parse.urlencode({'q':name}))
 assert result['total']==1,(name,result['total'])
 assert result['hotels'][0]['id']=='jalan-327522'
sozankyo=api('/api/hotels/jalan-327522')
assert sozankyo['names']=={'ko':'소잔쿄','ja':'蘇る山と故郷　阿蘇内牧温泉　蘇山郷','en':'Sozankyo'}
assert all(f['value'] for f in sozankyo['features'].values())
assert sozankyo['features']['roomOutdoor']['scope']=='someRooms'
assert {r['provider'] for r in sozankyo['ratings']}=={'trip','jalan'}
assert api('/api/hotels?'+urllib.parse.urlencode({'q':'소운쿄'}))['total']>=1
assert api('/api/hotels?'+urllib.parse.urlencode({'q':'層雲峡'}))['total']>=1
assert api('/api/hotels?'+urllib.parse.urlencode({'q':"%' OR 1=1 --"}))['total']==0
assert api('/api/hotels?'+urllib.parse.urlencode({'q':'あ'*100}))['total']==0
for query in ['provider=bad','features=constructor','features=nope','rating=NaN','provider=jalan&rating=9','page=-1','sort=random']:
 api('/api/hotels?'+query,expected=400)
detail=api('/api/hotels/konosumika');assert detail['id']=='konosumika'
api('/api/hotels/not-found',expected=404)
api('/api/prices?hotelId=konosumika&checkIn=2026-02-30&checkOut=2026-03-01&adults=2',expected=410)
api('/api/prices?hotelId=konosumika&checkIn=2026-11-10&checkOut=2026-11-11&adults=0',expected=410)
lv=api('/api/hotels/jalan-307416');assert lv['location']['latitude']==35.64728
assert lv['features']['outdoor']['value'] is True
assert api('/api/favorites')['ids']==[]
for ident in ['konosumika','jalan-307416']:
 item={'hotelId':ident,'saved':True}
 api('/api/favorites','PUT',item);api('/api/favorites','PUT',item)
 assert ident in api('/api/favorites')['ids']
saved=api('/api/hotels?saved=1');assert saved['total']==2
assert set(h['id'] for h in saved['hotels'])=={'konosumika','jalan-307416'}
for payload in [{'hotelId':'toya-02','saved':True},{'hotelId':'konosumika','saved':'true'},None]:
 api('/api/favorites','PUT',payload,expected=400,raw=b'null' if payload is None else None)
api('/api/favorites','PUT',expected=400,raw=b'{')
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':True},expected=403,headers={'Origin':'https://example.invalid'})
for ident in ['konosumika','jalan-307416']:api('/api/favorites','PUT',{'hotelId':ident,'saved':False})
assert api('/api/favorites')['ids']==[]
status,home=call('GET','/');assert status==200 and '일본 전국' in home and 'v0.4' in home and 'role="checkbox"' in home
assert home.count('class="hotel-card ')==40
photos=api('/api/photo-credits');assert photos['total']>1000 and len(photos['items'])==40 and photos['next']
print(f"Worker/D1 checks passed: {data['total']} records; nationwide filters, provider scales, 40-row pagination, literal/long query handling, tri-state AND facilities, detail routes and durable favorites.")

# A supported service writer is protected by the hosted private Site boundary.
queue=api('/api/crawl?provider=jalan&kind=detail&limit=2')
assert len(queue['jobs'])<=2 and queue['coverage']['records']>1000
api('/api/crawl?provider=bad&kind=detail',expected=400)
api('/api/crawl','PUT',{'url':'https://example.invalid/','status':'done'},expected=400)
api('/api/crawl','PUT',{'url':'https://www.jalan.net/yad307416/','status':'done','observations':[],'links':[]},expected=400)
original=api('/api/hotels/jalan-307416')
job_url='https://www.jalan.net/yad307416/'
update={'url':job_url,'status':'done','observations':[original],'links':[]}
api('/api/crawl','PUT',update);api('/api/crawl','PUT',update)
assert api('/api/hotels/jalan-307416')['location']['latitude']==35.64728
corrupt=json.loads(json.dumps(update));corrupt['observations'][0]['ratings'][0]['scale']=10
api('/api/crawl','PUT',corrupt,expected=400)
print('Hosted writer checks passed: bounded queue reads, actual idempotent observation write/readback, source and scale validation.')
api('/api/crawl?provider=jalan&kind=detail&names=1',expected=400)
names_queue=api('/api/crawl?provider=trip&kind=detail&names=1&limit=2')
assert all(j['provider']=='trip' and j['kind']=='detail' for j in names_queue['jobs'])
api('/api/crawl','PUT',{'url':job_url,'status':'skipped','error':'Explicit non-Japanese source country'},expected=400)
api('/api/crawl','PUT',{'url':job_url,'status':'done','observations':[original],'links':[],'excludedCity':'tokyo'},expected=400)
