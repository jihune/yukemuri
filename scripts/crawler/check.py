#!/usr/bin/env python3
"""Regression checks against reduced, actually retrieved HTML fixtures."""
import tempfile
import re
from pathlib import Path
from collect import json_hotels, normalize, discover, open_db, enqueue, process, canonical, outside_japan, image_url, localized_names, parse_source_page

fixtures=Path(__file__).parent/'fixtures'
raw=(fixtures/'jalan-list.html').read_text()
docs=list(json_hotels(raw))
assert len(docs)==30
links=discover(raw,'https://www.jalan.net/130000/LRG_137100/','pref-tokyo')
assert 'https://www.jalan.net/130000/LRG_137100/page2.html' in links
record=normalize(docs[0],'jalan','https://www.jalan.net/130000/LRG_137100/','2026-10-03T13:30:00Z',raw,'pref-tokyo')
assert record['ratings'][0]['scale']==5
assert record['prefecture']=='pref-tokyo'
assert record['location']['latitude'] is None
assert all(f['value'] is None for f in record['features'].values())
raw=(fixtures/'jalan-detail.html').read_text()
doc=next(json_hotels(raw))
record=normalize(doc,'jalan','https://www.jalan.net/yad307416/','2026-10-03T13:30:00Z',raw,detail=True)
assert record['location']['latitude']==35.64728
assert record['features']['largeBath']['value'] is True
assert record['features']['outdoor']['value'] is True
assert record['features']['natural']['value'] is True  # own Hotel description explicitly says 天然温泉
without_natural=dict(doc,description='温泉がある宿泊施設')
assert normalize(without_natural,'jalan','https://www.jalan.net/yad307416/','2026-10-03T13:30:00Z',raw,detail=True)['features']['natural']['value'] is None
assert record['features']['privateBath']['value'] is None  # outdoor 貸切不可 is not all baths
assert '露天風呂は沸し湯' in record['spring']['waterNotes']
assert record['features']['communalOutdoor']['value'] is True
assert record['features']['roomOnsen']['value'] is None
assert record['features']['roomOutdoorOnsen']['value'] is None
assert record['features']['jalanHighClass']['value'] is None
# The property header, not a High Class navigation/list recommendation, proves
# the classification. The reduced block below came from the current property.
soz=(fixtures/'jalan-sozankyo-baths.html').read_text();soz_doc=next(json_hotels(soz))
soz_record=normalize(soz_doc,'jalan','https://www.jalan.net/yad327522/','2026-10-04T05:30:00Z',soz,detail=True)
for key in ['natural','largeBath','communalOutdoor','privateBath','freeFlow','jalanHighClass']:
 assert soz_record['features'][key]['value'] is True,key
assert soz_record['features']['nigori']['value'] is None
# The observed Miyakojima notice describes a separate resort facility, with
# its own admission fee. It cannot prove the hotel's natural/public baths.
external_raw=soz+'<table><tr><th>風呂利用条件</th><td>※温泉施設はリゾート内の施設となります。■要別途入館料 ※宿泊者優待料金あり</td></tr></table>'
external_raw=re.sub(r'<img\b[^>]*>','',external_raw)
external_doc=dict(soz_doc,description='リゾートホテル。')
external_record=normalize(external_doc,'jalan','https://www.jalan.net/yad327522/','2026-10-04T05:30:00Z',external_raw,detail=True)
for key in ['natural','largeBath','outdoor','privateBath','communalOutdoor','privateOutdoor','freeFlow']:
 assert external_record['features'][key]['value'] is None,key
assert '要別途入館料' in external_record['spring']['waterNotes']
room_doc=dict(soz_doc,description='温泉内湯付き客室をご用意。')
assert normalize(room_doc,'jalan','https://www.jalan.net/yad327522/','2026-10-04T05:30:00Z',external_raw,detail=True)['features']['roomIndoorOnsen']['value'] is True,'Independent guest-room evidence is retained'
wrong_header=soz.replace('class="yado-name">'+soz_doc['name'],'class="yado-name">別の宿')
assert normalize(soz_doc,'jalan','https://www.jalan.net/yad327522/','2026-10-04T05:30:00Z',wrong_header,detail=True)['features']['jalanHighClass']['value'] is None
assert normalize(doc,'jalan','https://www.jalan.net/yad307416/','2026-10-04T05:30:00Z',raw+'<footer><li>ハイクラス</li></footer>',detail=True)['features']['jalanHighClass']['value'] is None
ordinary=raw.replace('有り','無し')
assert normalize(doc,'jalan','https://www.jalan.net/yad307416/','2026-10-04T05:30:00Z',ordinary,detail=True)['features']['natural']['value'] is False
public_only=dict(doc,description='客室は全館禁煙。天然温泉大浴場を完備。')
assert normalize(public_only,'jalan','https://www.jalan.net/yad307416/','2026-10-04T05:30:00Z',raw,detail=True)['features']['roomOnsen']['value'] is None
# D05: reduced Jalan detail pages retrieved 2026-10-13. The room table puts
# the types and the counts on separate rows; その他の風呂施設 names a view bath.
def jalan_rooms(name,ident,page=None):
 page=page or (fixtures/name).read_text()
 return normalize(next(json_hotels(page)),'jalan','https://www.jalan.net/yad'+ident+'/','2026-10-13T12:06:52Z',page,detail=True)
plaza_raw=(fixtures/'jalan-rooms-greenplaza.html').read_text()
plaza=jalan_rooms(None,'345284',plaza_raw)
assert plaza['rooms']=={'total':123,'byType':{'western':31,'japanese':42,'japaneseWestern':38,'other':12},'sourceId':'jalan-345284','verifiedAt':'2026-10-13','note':'자란 객실 수 표: 洋室 31室, 和室 42室, 和洋室 38室, その他 12室, 総部屋数 123室'},plaza['rooms']
assert plaza['features']['viewBath']['value'] is True and plaza['features']['viewBath']['scope']=='property'
assert '展望風呂（条件有り）' in plaza['features']['viewBath']['note'] and plaza['sources'][0]['bathDataVersion']=='v3'
# The room gallery: this property's photos with its own captions, no room type names.
[plaza_photos]=plaza['roomTypes']
assert plaza_photos['sourceId']=='jalan-345284' and plaza_photos['verifiedAt']=='2026-10-13' and len(plaza_photos['items'])==1 and plaza_photos['items'][0]['name'] is None
assert [p['url'].rsplit('/',1)[1] for p in plaza_photos['items'][0]['photos']]==['Y345284AS7.jpg','Y345284AU2.jpg','Y345284AT9.jpg','Y345284AG9.jpg']
assert plaza_photos['items'][0]['photos'][0]['caption'].startswith('【富士見和洋室】') and plaza_photos['items'][0]['photos'][3]['caption']==''
# Another property's image or a page without the room section adds no room photo.
assert len(jalan_rooms(None,'345284',plaza_raw.replace('Y345284/Y345284AS7','Y999999/Y999999AS7'))['roomTypes'][0]['items'][0]['photos'])==3
assert 'roomTypes' not in jalan_rooms(None,'345284',plaza_raw.replace('部屋・部屋施設','部屋'))
hanayu=jalan_rooms('jalan-rooms-hanayu.html','321273')
# The stated total stays although the stated parts add up to 31.
assert hanayu['rooms']['total']==33 and sum(hanayu['rooms']['byType'].values())==31,hanayu['rooms']
assert hanayu['features']['viewBath']['value'] is True
shinanoki=jalan_rooms('jalan-rooms-shinanoki.html','312415')
assert shinanoki['rooms']['total']==40 and shinanoki['rooms']['byType']['japanese']==40
# No view-bath entry on the page (only scenic photo captions): unknown, not none.
assert shinanoki['features']['viewBath']=={'value':None,'sourceId':'jalan-312415','verifiedAt':None}
# The new sections leave the existing observation as the parser before D05 made
# it: the page URL in sources and links, and the same bath facts (the room
# table's counts once hid the bath table's counts from the 大浴場 caption check).
for page,ident,known in [(plaza,'345284',{'outdoor':True,'communalOutdoor':True,'viewBath':True}),(hanayu,'321273',{'largeBath':True,'outdoor':True,'communalOutdoor':True,'viewBath':True}),
                         (shinanoki,'312415',{'largeBath':True,'outdoor':True,'roomOutdoor':True,'communalOutdoor':True})]:
 assert page['sources'][0]['url']==page['links'][0]['url']=='https://www.jalan.net/yad'+ident+'/',page['sources'][0]['url']
 assert {k:v['value'] for k,v in page['features'].items() if v['value'] is not None}==known,(ident,page['features'])
# Pages without the room table have no room count.
assert 'rooms' not in record and 'rooms' not in soz_record and record['features']['viewBath']['value'] is None
assert 'roomTypes' not in record and 'roomTypes' not in soz_record
# Mismatched header and value cells, a non-number or a zero total make no count.
for broken in [plaza_raw.replace('<th>その他</th>','',1),plaza_raw.replace('123室','多数',1),plaza_raw.replace('123室','0室',1)]:
 assert 'rooms' not in jalan_rooms(None,'345284',broken)
# 'None' wording, a non-bath 展望 and an external resort bath make no view bath.
for broken in [plaza_raw.replace('展望風呂（条件有り）','展望風呂なし'),plaza_raw.replace('展望風呂（条件有り）','展望ラウンジ'),
               plaza_raw+'<table><tr><th>風呂利用条件</th><td>※温泉施設はリゾート内の施設となります。</td></tr></table>']:
 assert jalan_rooms(None,'345284',broken)['features']['viewBath']['value'] is None
raw_trip=(fixtures/'trip-list.html').read_text()
trip=normalize(next(json_hotels(raw_trip)),'trip','https://www.trip.com/hotels/tokyo-hotels-list-228/','2026-10-03T13:30:00Z',raw_trip)
assert trip['ratings'][0]['scale']==10
assert trip['prefecture']=='pref-tokyo'
assert outside_japan([{'address':{'addressCountry':'Thailand'}}])
assert not outside_japan([{'address':{'addressCountry':'JP'}}])
assert not outside_japan([{'address':{'addressCountry':'일본'}}])
assert not outside_japan([{'address':{}}])
nav=raw_trip+'<a href="https://www.trip.com/hotels/bali-hotels-list-723/">Bali</a>'
assert not any('bali-' in u for u in discover(nav,'https://www.trip.com/hotels/tokyo-hotels-list-228/'))
cross=discover('<a href="https://www.jalan.net/400000/LRG_400100/">Fukuoka</a>','https://www.jalan.net/140000/LRG_141600/','pref-kanagawa')
assert cross['https://www.jalan.net/400000/LRG_400100/'][1]=='pref-fukuoka'
islands=discover('<a href="https://www.trip.com/hotels/miyakojima-hotels-list-50334/">Miyakojima</a><a href="https://www.trip.com/hotels/ishigaki-hotels-list-1174/">Ishigaki</a>','https://www.trip.com/hotels/naha-hotels-list-92573/','pref-okinawa')
assert len(islands)==2 and all(p=='pref-okinawa' for k,p in islands.values())
assert canonical('https://other.example/yad1/','https://www.jalan.net/') is None
assert canonical('/yad307416/?dateUndecided=1','https://www.jalan.net/')=='https://www.jalan.net/yad307416/'
assert image_url('https://ak-d.tripcdn.com/images//aw-d.tripcdn.com/images//0220x12000evnt92e2843_R_300_225_R5.jpg')=='https://aw-d.tripcdn.com/images/0220x12000evnt92e2843_R_300_225_R5.jpg'
assert image_url('https://cdn.jalan.jp/jalan/images/photo.jpg')=='https://cdn.jalan.jp/jalan/images/photo.jpg'
assert not image_url('javascript:alert(1)')
korean=(fixtures/'trip-detail-names.html').read_text()
kr_doc=next(json_hotels(korean))
kr=normalize(kr_doc,'trip','https://www.trip.com/hotels/aso-hotel-detail-1458363/sozankyo/','2026-10-04T01:00:00Z',korean,'pref-kumamoto',True)
assert kr['names']==dict(ko='소잔쿄',ja='阿蘇内牧温泉 蘇山郷',en='Sozankyo')
assert '소잔쿄(Sozankyo)' in kr['aliases']
# Trip's streetAddress is already the whole formatted address and repeats its
# addressLocality and addressRegion; joining all three doubled them (D01).
assert kr['location']['address']=='145-1 Uchinomaki, 869-2301 아소, 구마모토 현, 일본',kr['location']['address']
# Jalan sends separate parts, which are still joined, even when the street
# happens to contain both other parts (a 東京都道 road name).
assert soz_record['location']['address']=='熊本県阿蘇市内牧温泉145-1',soz_record['location']['address']
road_doc=dict(soz_doc,address=dict(soz_doc['address'],addressRegion='東京都',addressLocality='府中市',streetAddress='府中市東京都道15号1-2'))
road=normalize(road_doc,'jalan','https://www.jalan.net/yad327522/','2026-10-04T05:30:00Z',soz,detail=True)['location']['address']
assert road=='東京都府中市府中市東京都道15号1-2',road
# A Trip list item has no address; it stays empty instead of being guessed.
assert trip['location']['address']=='',trip['location']['address']
# Diagnosis must validate observations, not just count a Hotel document.
stamp='2026-10-08T16:00:00Z'
listed=(fixtures/'jalan-list.html').read_text()
observations,found_links,foreign,diagnostic=parse_source_page(listed,'jalan','https://www.jalan.net/130000/LRG_137100/',stamp,'pref-tokyo','list')
assert len(observations)==30 and found_links and not foreign and diagnostic['reviewReason'] is None
observations,_,_,diagnostic=parse_source_page(raw,'jalan','https://www.jalan.net/yad999999/',stamp,kind='detail')
assert not observations and diagnostic['reviewReason']=='hotel_identity_mismatch'
for kind,reason in [('detail','missing_hotel_document'),('list','empty_listing')]:
 observations,found_links,_,diagnostic=parse_source_page('<title>Sign in</title>','jalan','https://www.jalan.net/yad307416/' if kind=='detail' else 'https://www.jalan.net/130000/LRG_137100/',stamp,kind=kind)
 assert not observations and not found_links and diagnostic['reviewReason']==reason
nameless=re.sub(r'"name"\s*:\s*"[^"\n]*"','"name":""',raw)
assert parse_source_page(nameless,'jalan','https://www.jalan.net/yad307416/',stamp,kind='detail')[3]['reviewReason']=='no_valid_hotel_observation'
assert parse_source_page(korean,'trip','https://www.trip.com/hotels/aso-hotel-detail-1458363/sozankyo/',stamp,kind='detail')[0][0]['sources'][0]['nameLocaleUrl'].startswith('https://kr.trip.com/')
# D05: Trip.com states the room count in this property's SSR labels (reduced
# from kr.trip.com, 2026-10-13). Another hotel's labels are never read.
trip_rooms_raw=(fixtures/'trip-detail-rooms.html').read_text()
fujiya_url='https://www.trip.com/hotels/hakone-hotel-detail-704264/fujiya-hotel/'
fujiya=parse_source_page(trip_rooms_raw,'trip',fujiya_url,stamp,kind='detail')[0][0]
assert fujiya['rooms']=={'total':120,'sourceId':'trip-704264','verifiedAt':stamp[:10],'note':'Trip.com 숙소 정보: 객실 수: 120'},fujiya.get('rooms')
assert fujiya['features']['viewBath']['value'] is None and 'bathDataVersion' not in fujiya['sources'][0]
# Room type names in the page's room order, at most three photos each.
[fujiya_types]=fujiya['roomTypes']
assert fujiya_types['sourceId']=='trip-704264' and [t['name'] for t in fujiya_types['items']]==['포레스트 윙 코너 트윈룸','욕조가 있는 디럭스, 트윈룸, 산 전망','COMFY LODGE& RESTFUL COTTAGE Building Twin Room','웨스턴스타일 빌딩 스위트'],fujiya_types
assert all(len(t['photos'])==3 and all(p['url'].startswith('https://aw-d.tripcdn.com/images/') and p['caption']=='' for p in t['photos']) for t in fujiya_types['items'])
other_hotel=trip_rooms_raw.replace('\\"masterHotelId\\":704264','\\"masterHotelId\\":704265')
assert other_hotel!=trip_rooms_raw and not {'rooms','roomTypes'}&set(parse_source_page(other_hotel,'trip',fujiya_url,stamp,kind='detail')[0][0])
assert not {'rooms','roomTypes'}&set(parse_source_page(korean,'trip','https://www.trip.com/hotels/aso-hotel-detail-1458363/sozankyo/',stamp,kind='detail')[0][0])
# D04: the opening/renovation year this property's Trip.com page states (reduced
# from kr.trip.com, 2026-10-13), only when the field and the visible label agree.
assert fujiya['facilityYears']=={'renovated':2020,'sourceId':'trip-704264','verifiedAt':stamp[:10],'note':'Trip.com 숙소 정보: 리모델링 연도: 2020'},fujiya.get('facilityYears')
years_raw=(fixtures/'trip-detail-years.html').read_text()
byakudan_url='https://www.trip.com/hotels/hakone-hotel-detail-10019167/hakone-gora-byakudan/'
def stated_years(page,at=stamp):
 return parse_source_page(page,'trip',byakudan_url,at,kind='detail')[0][0].get('facilityYears')
assert stated_years(years_raw)=={'opened':2016,'sourceId':'trip-10019167','verifiedAt':stamp[:10],'note':'Trip.com 숙소 정보: 호텔 설립연도: 2016'},stated_years(years_raw)
opened='\\"openYear\\":\\"2016\\"'
assert opened in years_raw and '호텔 설립연도: 2016' in years_raw
assert stated_years(years_raw.replace(opened,'\\"openYear\\":\\"2015\\"')) is None,'The field and the label must agree'
assert stated_years(years_raw.replace('호텔 설립연도: 2016','호텔 정보: 2016')) is None,'No label, no year'
assert stated_years(years_raw,'2015-12-31T00:00:00Z') is None,'A year after the check is a plan, not a fact'
assert stated_years(years_raw.replace(opened,'\\"openYear\\":\\"16\\"').replace('호텔 설립연도: 2016','호텔 설립연도: 16')) is None
assert stated_years(years_raw.replace('\\"masterHotelId\\":10019167','\\"masterHotelId\\":10019168')) is None,"Another hotel's record"
assert 'facilityYears' not in parse_source_page(korean,'trip','https://www.trip.com/hotels/aso-hotel-detail-1458363/sozankyo/',stamp,kind='detail')[0][0]
# Jalan states no year field; its free-text years (mostly one room) are not read.
assert not any('facilityYears' in h for h in [plaza,jalan_rooms('jalan-rooms-hanayu.html','321273'),jalan_rooms('jalan-rooms-shinanoki.html','312415'),jalan_rooms('jalan-sozankyo-baths.html','327522')])
with tempfile.TemporaryDirectory() as folder:
 db=open_db(Path(folder)/'queue.sqlite')
 url='https://www.jalan.net/yad307416/'
 enqueue(db,url,'detail','pref-tokyo');db.commit()
 process(db,db.execute('SELECT * FROM jobs WHERE url=?',(url,)).fetchone(),raw)
 count=db.execute('SELECT COUNT(*) FROM observations').fetchone()[0]
 enqueue(db,url,'detail','pref-tokyo');db.commit()
 assert db.execute('SELECT COUNT(*) FROM jobs WHERE url=?',(url,)).fetchone()[0]==1
 db.execute("UPDATE jobs SET status='running' WHERE url=?",(url,));db.commit();db.close()
 db=open_db(Path(folder)/'queue.sqlite')
 assert db.execute('SELECT status FROM jobs WHERE url=?',(url,)).fetchone()[0]=='pending'
 assert db.execute('SELECT COUNT(*) FROM observations').fetchone()[0]==count
 db.close()
print('Crawler checks passed: actual list/detail parsing, pagination, coordinate unknowns, provider scales, facility evidence, URL deduplication and interrupted queue recovery.')
