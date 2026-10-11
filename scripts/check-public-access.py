"""Anonymous reads and isolated durable favorites against the local Worker."""
import json, urllib.request, urllib.error, urllib.parse
base='http://127.0.0.1:8787'
def api(path,method='GET',data=None,visitor=None,maintenance=False,status=200):
 headers={'Content-Type':'application/json'}
 if visitor:headers['X-Yukemuri-Visitor']=visitor
 if maintenance:headers['X-Yukemuri-Crawl-Key']='local-runtime-maintenance-test'
 body=json.dumps(data).encode() if data is not None else None
 try:response=urllib.request.urlopen(urllib.request.Request(base+path,data=body,headers=headers,method=method),timeout=90)
 except urllib.error.HTTPError as error:response=error
 result=json.loads(response.read());assert response.status==status,(path,response.status,result)
 return result
pages=[api('/api/hotels?region=all&q=&provider=trip&rating=0&reviews=0&features=&ryokan=0&saved=0&sort=recommended&page='+str(page)) for page in range(1,5)]
ids=[hotel['id'] for page in pages for hotel in page['hotels']]
assert len(ids)==160 and len(set(ids))==160
for page in pages:assert page['total']==pages[0]['total']
for ident in ['jalan-327522','konosumika',ids[-1]]:assert api('/api/hotels/'+ident)['id']==ident
assert api('/api/hotels?'+urllib.parse.urlencode({'q':'아소 소잔쿄'}))['hotels'][0]['id']=='jalan-327522'
first='1'*64;second='2'*64
assert api('/api/favorites',visitor=first)['ids']==[]
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':True},first)
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':True},first)
assert api('/api/favorites',visitor=first)['ids']==['konosumika']
assert api('/api/favorites',visitor=second)['ids']==[]
assert api('/api/favorites')['ids']==[]
assert api('/api/hotels?saved=1',visitor=first)['total']==1
assert api('/api/hotels?saved=1',visitor=second)['total']==0
assert api('/api/hotels?saved=1')['total']==0
suggest='/api/hotels/suggestions?saved=1&q=konosumika'
assert api(suggest,visitor=first)['suggestions']
assert api(suggest,visitor=second)['suggestions']==[]
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':False},second)
assert api('/api/favorites',visitor=first)['ids']==['konosumika']
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':False},first)
assert api('/api/favorites',visitor=first)['ids']==[]
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':True},status=400)
api('/api/favorites','PUT',{'hotelId':'konosumika','saved':True},visitor='invalid',status=400)
queue='/api/crawl?provider=jalan&kind=detail&limit=1'
api(queue,status=403);api('/api/crawl','PUT',{},status=403)
assert api(queue,maintenance=True)['jobs']
api('/api/crawl','PUT',{},maintenance=True,status=400)
print('Public-access checks passed: 160 unique hotel rows; anonymous detail/search; persistent favorites isolated per browser; saved-only search/suggestions isolated; maintenance reads/writes protected.')

# Korean names are durable data, invalidate cached queries, and retain facts.
api('/api/hotel-names',status=403);api('/api/hotel-names','PUT',{},status=403)
api('/api/hotel-names','PUT',{},maintenance=True,status=400)
from pathlib import Path
seeds=json.loads(Path('data/korean-hotel-names.json').read_text())
for patch in seeds:
 if patch['id'] in {'jalan-302815','jalan-322254','trip-42519346','trip-688186'}:continue
 hotel=api('/api/hotels/'+patch['id'])
 assert hotel['names']['ko']==patch['nameKo']
 assert any(s.get('nameLocaleUrl')==patch['sourceUrl'] for s in hotel['sources'])
 result=api('/api/hotels?'+urllib.parse.urlencode({'q':patch['nameKo']}))
 assert patch['id'] in {h['id'] for h in result['hotels']}
candidates=api('/api/hotel-names?limit=20',maintenance=True)['hotels']
assert candidates and all(not any('가'<=c<='힣' for c in h['names']['ko']) for h in candidates)
chosen=next(h for h in candidates if h['id'].startswith('jalan-'))
before=api('/api/hotels/'+chosen['id'])
query='/api/hotels?'+urllib.parse.urlencode({'q':'검증용 한글숙소명 영속성'})
assert api(query)['total']==0
patch={'id':chosen['id'],'nameKo':'검증용 한글숙소명 영속성','aliases':[],'matchedName':chosen['names']['ko'],'sourceUrl':'https://example.org/ko/hotel','sourceLabel':'Local test fixture','identityEvidence':'Local fixture identity; original name matches','verifiedAt':'2026-10-04T08:00:00Z'}
api('/api/hotel-names','PUT',{'patches':[{**patch,'matchedName':'Wrong hotel'}]},maintenance=True,status=409)
assert api('/api/hotels/'+chosen['id'])==before
assert api('/api/hotel-names','PUT',{'patches':[patch]},maintenance=True)['accepted']==1
after=api('/api/hotels/'+chosen['id'])
assert after['features']==before['features'] and after['ratings']==before['ratings'] and after['links']==before['links']
assert chosen['id'] in {h['id'] for h in api(query)['hotels']},'Name write clears search cache'
assert api('/api/hotels/suggestions?'+urllib.parse.urlencode({'q':patch['nameKo']}))['suggestions']
# Resubmit a newer original crawl observation; localized name/source must survive.
import copy
observation=copy.deepcopy(before)
url=observation['sources'][0]['url']
for source in observation['sources']:source['retrievedAt']='2026-10-05T08:00:00Z'
api('/api/crawl','PUT',{'url':url,'status':'done','observations':[observation],'links':[]},maintenance=True)
assert api('/api/hotels/'+chosen['id'])['names']['ko']==patch['nameKo']
# The combined count query must preserve facility AND and rating boundaries.
filtered=api('/api/hotels?features=natural,outdoor&provider=jalan&rating=4&reviews=50')
for h in filtered['hotels']:
 assert all(h['features'][key]['value'] is True for key in ['natural','outdoor'])
 rating=next(r for r in h['ratings'] if r['provider']=='jalan');assert rating['score']>=4 and rating['reviewCount']>=50
assert filtered['total']<=min(filtered['featureCounts']['natural'],filtered['featureCounts']['outdoor'])
print('Search/name checks passed: verified Korean search and sources; missing-name queue; identity rejection; facts preserved; cache invalidation; original crawler cannot erase localized names; facility/rating counts.')

# The page is one static shell (P03): no catalogue in the HTML; the list and
# the name index come from the static search snapshot.
far=next(h['id'] for h in candidates if h['id'] not in {h['id'] for h in pages[0]['hotels']})
with urllib.request.urlopen(base+'/',timeout=90) as response:html=response.read().decode()
assert pages[0]['hotels'][0]['id'] not in html and far not in html,'The page must not carry catalogue rows'
assert far in {h['id'] for h in api('/api/hotels/search-index')['hotels']}
print('Initial-screen check passed: static shell without catalogue rows; full catalogue available through the snapshot index; HTML bytes',len(html.encode()))

# Translations are source-bound data; anonymous visitors can read, never write.
api('/api/hotel-descriptions',status=403)
api('/api/hotel-descriptions','PUT',{},status=403)
api('/api/hotel-descriptions','PUT',{},maintenance=True,status=400)
api('/api/hotel-descriptions?limit=41',maintenance=True,status=400)
# Seed representative foreign source languages only in the isolated local DB.
fixture_ids=[h['id'] for h in json.loads(Path('lib/hotels.crawled.json').read_text()) if h['id'].startswith('trip-')][:3]
source_texts=['This hotel is located near the station in Tokyo. A restaurant called ブリランテ serves breakfast for a fee from 7:00 AM to 10:00 AM. Free wireless internet is available in some rooms.','露天風呂があります。','酒店设有餐厅和温泉。']
for ident,source_text in zip(fixture_ids,source_texts):
 fixture=api('/api/hotels/'+ident)
 fixture['description']=source_text
 fixture['sources']=[s for s in fixture['sources'] if s['sourceId']==ident]
 url=next(link['url'] for link in fixture['links'] if link['provider']=='trip')
 for source in fixture['sources']:source.update({'retrievedAt':'2026-10-05T08:00:00Z','label':'Trip.com 숙소 상세','url':url})
 api('/api/crawl','PUT',{'url':url,'status':'done','observations':[fixture],'links':[]},maintenance=True)
 api('/api/hotels/'+ident) # Request translation priority as an anonymous visitor.
translations=api('/api/hotel-descriptions',maintenance=True)
assert translations['hotels'] and len(translations['hotels'])<=40 and translations['sourceCharacters']<=60000
assert set(fixture_ids).issubset({h['id'] for h in translations['hotels']}),'All source languages must be queued'
for ident,text_ko in zip(fixture_ids[1:],['노천탕이 있습니다.','호텔에는 레스토랑과 온천이 있습니다.']):
 source_text=source_texts[fixture_ids.index(ident)]
 assert api('/api/hotel-descriptions','PUT',{'patches':[{'id':ident,'sourceText':source_text,'textKo':text_ko}]},maintenance=True)['accepted']==1
 detail=api('/api/hotels/'+ident)
 assert detail['description']==source_text and detail['descriptionTranslation']['text']==text_ko
candidate=next(h for h in translations['hotels'] if h['id']==fixture_ids[0])
before=api('/api/hotels/'+candidate['id'])
assert next(h for h in api('/api/hotel-descriptions',maintenance=True)['hotels'] if h['id']==candidate['id'])['requestedAt']
translated={'id':candidate['id'],'sourceText':candidate['sourceText'],'textKo':'이 호텔은 도쿄의 역 근처에 있습니다. 브리란테 레스토랑에서 오전 7시부터 오전 10시까지 조식을 유료로 제공합니다. 일부 객실에서 무료 무선 인터넷을 이용할 수 있습니다.'}
api('/api/hotel-descriptions','PUT',{'patches':[{**translated,'textKo':'English only text'}]},maintenance=True,status=400)
api('/api/hotel-descriptions','PUT',{'patches':[{**translated,'features':{}}]},maintenance=True,status=400)
api('/api/hotel-descriptions','PUT',{'patches':[translated,translated]},maintenance=True,status=400)
another=next(h for h in translations['hotels'] if h['id']!=candidate['id'] and h['id'] not in fixture_ids[1:])
stale={'id':another['id'],'sourceText':another['sourceText']+' (stale)','textKo':translated['textKo']}
api('/api/hotel-descriptions','PUT',{'patches':[translated,stale]},maintenance=True,status=409)
assert 'descriptionTranslation' not in api('/api/hotels/'+candidate['id']),'No partial write from stale batch'
assert api('/api/hotel-descriptions','PUT',{'patches':[translated]},maintenance=True)['accepted']==1
after=api('/api/hotels/'+candidate['id'])
assert after['descriptionTranslation']['text']==translated['textKo']
assert {key:value for key,value in after.items() if key!='descriptionTranslation'}==before
assert candidate['id'] not in {h['id'] for h in api('/api/hotel-descriptions',maintenance=True)['hotels']}
original=copy.deepcopy(before)
original['sources']=[s for s in original['sources'] if s['sourceId']==original['id']]
for source in original['sources']:source['retrievedAt']='2026-10-06T08:00:00Z'
api('/api/crawl','PUT',{'url':original['sources'][0]['url'],'status':'done','observations':[original],'links':[]},maintenance=True)
assert api('/api/hotels/'+candidate['id'])['descriptionTranslation']['text']==translated['textKo'],'Same source re-crawl retains translation'
original['description']=original['description'][:5700]+' The property description has been updated.'
for source in original['sources']:source['retrievedAt']='2026-10-07T08:00:00Z'
api('/api/crawl','PUT',{'url':original['sources'][0]['url'],'status':'done','observations':[original],'links':[]},maintenance=True)
changed=api('/api/hotels/'+candidate['id'])
assert 'descriptionTranslation' not in changed,'Changed source must not display the old translation'
assert next(h for h in api('/api/hotel-descriptions',maintenance=True)['hotels'] if h['id']==candidate['id'])['sourceText']==original['description']
api('/api/hotel-descriptions','PUT',{'patches':[translated]},maintenance=True,status=409)
assert api('/api/hotel-descriptions','PUT',{'patches':[{**translated,'sourceText':original['description']}]},maintenance=True)['accepted']==1
assert api('/api/hotels/'+candidate['id'])['descriptionTranslation']['text']==translated['textKo']
print('Description checks passed: protected writes; prioritized view queue; no partial stale batches; original/facts preserved; re-crawl retention; changed-source invalidation and retranslation.')
