#!/usr/bin/env python3
"""Public Japan hotel catalogue collector. Standard-library only; no API key.

One request at a time per host, persistent SQLite queue, public-link discovery,
source observations and a portable checkpoint. Never treats an empty/blocked
page as a completed catalogue or retries an access denial in a tight loop.
"""
import argparse
import hashlib
import html
import json
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from retry_policy import source_failure
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFS = json.loads((ROOT / 'data/prefectures.json').read_text())
FEATURES = ['natural', 'largeBath', 'outdoor', 'privateBath', 'roomOnsen', 'roomOutdoor','communalOutdoor','privateOutdoor','roomIndoorOnsen','roomOutdoorOnsen','nigori','freeFlow','jalanHighClass','viewBath']
# Jalan detail parser version. A Jalan detail saved by an older version is
# revisited by the 'baths' phase (v3: room count, view bath and room photos, D05).
BATH_DATA_VERSION = 'v3'
JAPAN_COUNTRIES = ['JP', 'Japan', '日本', '일본']
TRIP_CITY_PREF = {'tokyo':'tokyo','kyoto':'kyoto','osaka':'oosaka','fukuoka':'fukuoka','naha':'okinawa','chatan':'okinawa','nagoya':'aichi','narita':'chiba','urayasu':'chiba','sapporo':'hokkaido','hakodate':'hokkaido','otaru':'hokkaido','noboribetsu':'hokkaido','toyako':'hokkaido','sobetsu':'hokkaido','niseko':'hokkaido','kushiro':'hokkaido','kamikawa':'hokkaido','minami-ward':'hokkaido','hakone':'kanagawa','yokohama':'kanagawa','kamakura':'kanagawa','kanazawa':'ishikawa','kobe':'hyogo','sendai':'miyagi','matsumoto':'nagano','fujikawaguchiko':'yamanashi','izumisano':'oosaka','towada':'aomori','nago':'okinawa','beppu':'ooita','atami':'shizuoka','yufu':'ooita','yufuin':'ooita','kumamoto':'kumamoto','aso':'kumamoto','minamioguni':'kumamoto','ishigaki':'okinawa','miyakojima':'okinawa','miyako':'okinawa','tomigusuku':'okinawa','motobu':'okinawa','onnason':'okinawa','onna':'okinawa'}


def country_of(doc):
    address=doc.get('address') or {}
    country=address.get('addressCountry','') if isinstance(address,dict) else ''
    return country.get('name','') if isinstance(country,dict) else country


def outside_japan(docs):
    countries=[country_of(d) for d in docs]
    return bool(countries) and all(c and c not in JAPAN_COUNTRIES for c in countries)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def text(raw):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', raw))).strip()


def bounded_description(value):
    # The Site validates strings in UTF-16 code units, as JavaScript does.
    # Keep the complete source URL and facility evidence separately; only the
    # optional display description is shortened to the API's 6,000-unit cap.
    encoded = value.encode('utf-16-le')
    return value if len(encoded) <= 12000 else encoded[:11998].decode('utf-16-le', errors='ignore') + '…'


def image_url(value):
    if not isinstance(value, str):
        return ''
    value=html.unescape(value).strip()
    parsed=urllib.parse.urlsplit(value)
    if parsed.scheme!='https' or parsed.username or parsed.password:
        return ''
    if re.fullmatch(r'[a-z0-9-]+\.tripcdn\.com',parsed.hostname or '',re.I):
        matches=list(re.finditer(r'/([a-z0-9-]+\.tripcdn\.com)/images/',parsed.path,re.I))
        if matches:
            embedded=matches[-1]
            return urllib.parse.urlunsplit(('https',embedded[1],'/images/'+parsed.path[embedded.end():].lstrip('/'),parsed.query,''))
        value=urllib.parse.urlunsplit((parsed.scheme,parsed.netloc,re.sub(r'/+','/',parsed.path),parsed.query,''))
    return value


def localized_names(doc, provider, raw, detail):
    name=html.unescape(str(doc['name']))
    names=dict(ko=name,ja=name,en=name)
    alternate=doc.get('alternateName') or []
    aliases=[name]+([alternate] if isinstance(alternate,str) else alternate if isinstance(alternate,list) else [])
    if provider=='trip' and detail:
        # Read only this property's nameInfo, never names in recommendation cards.
        decoded=raw.replace('\\"','"')
        ident=re.search(r'hotel-detail-(\d+)',str(doc.get('url','')))
        if ident:
            block=re.search(r'"masterHotelId"\s*:\s*'+ident[1]+r'\s*,\s*"nameInfo"\s*:\s*(\{[^{}]{1,3000}\})',decoded)
            if block:
                try:
                    info=json.loads(block[1])
                    local=info.get('nameLocale') or info.get('name') or name
                    native=re.split(r'[:：]',info.get('localNameTip',''),maxsplit=1)[-1].strip()
                    english=info.get('nameEn') or (local if re.search(r'[a-zA-Z]',local) and not re.search(r'[가-힣]',local) else name if not re.search(r'[가-힣]',name) else '')
                    names=dict(ko=local,ja=native or local,en=english)
                    aliases += [info.get('name',''),local,native,english]
                except (ValueError,TypeError):
                    pass
    return names,list(dict.fromkeys(str(a).strip()[:400] for a in aliases if a and isinstance(a,str)))[:30]


def trip_property(raw, ident):
    """This property's own SSR props on kr.trip.com, never another hotel's."""
    def walk(value, depth=0):
        if depth > 12:
            return
        if isinstance(value, dict):
            if isinstance(value.get('hotelDetailResponse'), dict):
                yield value
            for child in value.values():
                yield from walk(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child, depth + 1)
    for payload in trip_page_data(raw):
        for props in walk(payload):
            base = props['hotelDetailResponse'].get('hotelBaseInfo')
            if isinstance(base, dict) and str(base.get('masterHotelId')) == ident:
                return props
    return None


def trip_room_count(props):
    info = props['hotelDetailResponse'].get('hotelDescriptionInfo')
    for label in (info.get('lables') if isinstance(info, dict) else None) or []:
        match = re.fullmatch(r'객실 수:\s*(\d{1,4})', label.strip()) if isinstance(label, str) else None
        if match and 0 < int(match[1]) <= 5000:
            return int(match[1]), label.strip()
    return None


def trip_facility_years(props, latest):
    """Opening and renovation years when the field and the visible label agree (D04).
    A field and a label that disagree (or one without the other) are reported, not stored."""
    base = props['hotelDetailResponse'].get('hotelBaseInfo') or {}
    info = props['hotelDetailResponse'].get('hotelDescriptionInfo')
    labels = [l.strip() for l in (info.get('lables') if isinstance(info, dict) else None) or [] if isinstance(l, str)]
    years, notes, mismatches = {}, [], []
    for key, field, title in [('opened', 'openYear', '호텔 설립연도'), ('renovated', 'fitmentYear', '리모델링 연도')]:
        value = base.get(field)
        value = str(value) if isinstance(value, (str, int)) and not isinstance(value, bool) else ''
        titled = [l for l in labels if re.fullmatch(re.escape(title) + r':\s*\S.*', l)]
        label = next((l for l in titled if re.fullmatch(re.escape(title) + r':\s*' + re.escape(value), l)), None) if value else None
        if (value or titled) and not label:
            mismatches.append(dict(field=field, value=value or None, labels=titled[:3]))
        if re.fullmatch(r'\d{4}', value) and 1000 <= int(value) <= latest and label:
            years[key] = int(value)
            notes.append(label)
    return years, notes, mismatches


def trip_room_types(props):
    """Room type names and up to three photos each, in the page's room order."""
    rooms = ((props.get('seoSSRData') or {}).get('seoHotelRooms') or {}) if isinstance(props.get('seoSSRData'), dict) else {}
    found = rooms.get('physicRoomMap') if isinstance(rooms, dict) else None
    if not isinstance(found, dict):
        return []
    order = [str(r.get('key')) for r in rooms.get('roomList') or [] if isinstance(r, dict)]
    items = []
    for key in list(dict.fromkeys(order + list(found))):
        room = found.get(key)
        name = re.sub(r'\s+', ' ', room.get('name', '')).strip() if isinstance(room, dict) and isinstance(room.get('name'), str) else ''
        if not name:
            continue
        photos = [u for u in (image_url(p.get('url')) for p in room.get('pictureInfo') or [] if isinstance(p, dict)) if re.fullmatch(r'[a-z0-9-]+\.tripcdn\.com', urllib.parse.urlsplit(u).hostname or '')]
        items.append(dict(name=name[:200], photos=[dict(url=u, caption='') for u in list(dict.fromkeys(photos))[:3]]))
    return items[:30]


def source_request_url(url, kind):
    # Korean Trip.com detail pages include the English and native hotel names.
    # This still uses one public request per queue item, with no account or token.
    return url.replace('https://www.trip.com/','https://kr.trip.com/') if kind=='detail' else url


def trip_page_data(raw):
    """Decode public SSR JSON only; never execute a source's JavaScript."""
    decoder = json.JSONDecoder()
    for script in re.findall(r'<script\b[^>]*>(.*?)</script>', raw, re.S | re.I):
        for match in re.finditer(r'self\.__next_f\.push\(\s*', script):
            try:
                chunk, _ = decoder.raw_decode(script, match.end())
                if not isinstance(chunk, list) or len(chunk) != 2 or chunk[0] != 1 or not isinstance(chunk[1], str):
                    continue
                # Flight records carry an ID followed by a JSON value.
                for record in chunk[1].splitlines():
                    prefix, separator, payload = record.partition(':')
                    if separator and re.fullmatch(r'J?[a-fA-F0-9]+', prefix):
                        yield json.loads(payload)
            except (ValueError, TypeError, RecursionError):
                continue


def json_hotels(raw, url=None):
    seen = set()
    def walk(value, depth=0):
        if depth > 40:
            return
        if isinstance(value, dict):
            types = value.get('@type', [])
            types = [types] if isinstance(types, str) else types if isinstance(types, list) else []
            if any(isinstance(t, str) and t.rstrip('/').rsplit('/', 1)[-1] == 'Hotel' for t in types):
                prop = canonical(value.get('url', ''), url or '') if isinstance(value.get('url'), str) else None
                key = provider_id(prop) if prop and provider_id(prop)[1] else json.dumps(value, sort_keys=True, ensure_ascii=False)
                if key in seen:
                    return
                seen.add(key)
                yield value
            for child in value.values():
                yield from walk(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child, depth + 1)
        elif isinstance(value, str) and depth < 40 and value.lstrip().startswith(('{', '[')) and '"@type"' in value:
            try:
                yield from walk(json.loads(value), depth + 1)
            except (ValueError, TypeError, RecursionError):
                pass
    for payload in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', raw, re.S | re.I):
        try:
            yield from walk(json.loads(payload, strict=False))
        except (ValueError, TypeError, RecursionError):
            continue
    # Some Trip pages expose the same public JSON-LD inside their SSR payload.
    if url and provider_id(url)[0] == 'trip':
        for payload in trip_page_data(raw):
            yield from walk(payload)


def canonical(url, base):
    parsed = urllib.parse.urlsplit(urllib.parse.urljoin(base, html.unescape(url)))
    if parsed.hostname not in ['www.jalan.net', 'www.trip.com', 'kr.trip.com'] or parsed.scheme not in ['http', 'https']:
        return None
    if parsed.hostname=='kr.trip.com':
        parsed=parsed._replace(netloc='www.trip.com')
    path = re.sub(r'/+', '/', parsed.path)
    if parsed.hostname == 'www.jalan.net':
        match = re.fullmatch(r'/yad(\d+)/?', path)
        if match:
            path = '/yad' + match[1] + '/'
        elif not re.fullmatch(r'/ikisaki/map/[a-z]+/|/\d{6}/LRG_\d{6}/(?:page\d+\.html)?', path):
            return None
    elif not re.fullmatch(r'/hotels/country/japan.html|/hotels/[a-z0-9-]+-hotels-list-\d+/(?:location\d+/|zone\d+/)?|/hotels/[a-z0-9-]+-hotel-detail-\d+/[^/]+/?', path):
        return None
    return urllib.parse.urlunsplit(('https', parsed.hostname, path, '', ''))


def provider_id(url):
    match = re.search(r'/yad(\d+)|hotel-detail-(\d+)', url)
    return ('jalan', match[1]) if match and match[1] else ('trip', match[2]) if match else (None, None)


def discover(raw, url, pref=None):
    links = {}
    # OTA navigation includes worldwide destinations. Detail URLs need a
    # Japanese Hotel document or a known Japanese city; unknown links stay out.
    japanese_urls={canonical(d.get('url',''),url) for d in json_hotels(raw) if country_of(d) in JAPAN_COUNTRIES}
    japanese_cities={m[1] for u in japanese_urls if u and (m:=re.search(r'/hotels/([a-z0-9-]+)-hotel-detail-',u))}
    for href in re.findall(r'href=[\"\']([^\"\']+)', raw):
        clean = canonical(href, url)
        if not clean or clean == url:
            continue
        provider, ident = provider_id(clean)
        kind = 'detail' if ident else 'list'
        slug = re.search(r'/ikisaki/map/([a-z]+)/', clean)
        found_pref = next((p['id'] for p in PREFS if slug and p['slug'] == slug[1]), pref)
        # A nationwide menu can link another prefecture's district.
        code=re.search(r'^https://www\.jalan\.net/(\d{2})0000/LRG_',clean)
        if code and 1<=int(code[1])<=47:found_pref=PREFS[int(code[1])-1]['id']
        if 'trip.com' in clean:
            city=re.search(r'/hotels/([a-z0-9-]+)-(?:hotels-list|hotel-detail)-',clean)
            if city:
                if clean not in japanese_urls and city[1] not in TRIP_CITY_PREF and city[1] not in japanese_cities:
                    continue
                found_pref='pref-'+TRIP_CITY_PREF[city[1]] if city[1] in TRIP_CITY_PREF else pref
        links[clean] = (kind, found_pref)
    # Jalan's actual selectPage handler uses pageN.html with dateUndecided.
    # Follow every page number advertised in this page, never guess an end.
    if re.search(r'/LRG_\d+/', url):
        base = re.sub(r'page\d+\.html$', '', url)
        for page in re.findall(r"selectPage\('\d+',\s*'(\d+)'\)", raw):
            if int(page) > 1:
                links[base + 'page' + page + '.html'] = ('list', pref)
    return links


def normalize(doc, provider, url, fetched_at, raw='', pref=None, detail=False):
    prop_url = canonical(doc.get('url', url), url)
    if not prop_url:
        return None
    p, ident = provider_id(prop_url)
    if p != provider or not ident or not doc.get('name'):
        return None
    if detail and provider_id(url) != (p, ident):
        return None
    address = doc.get('address') or {}
    if isinstance(address, str):
        address = {'streetAddress': address}
    region = str(address.get('addressRegion', ''))
    # Only Japanese addresses enter this Japan catalogue.
    country = address.get('addressCountry', '')
    country = country.get('name', '') if isinstance(country, dict) else country
    if country and country not in JAPAN_COUNTRIES:
        return None
    found = next((p['id'] for p in PREFS if p['ja'] == region or p['en'].split()[0].lower() == region.lower() or p['name'] == region.replace(' 현','').replace(' 부','')), pref)
    if not found and provider == 'trip':
        city = re.search(r'/hotels/([a-z0-9-]+)-hotel-detail-', prop_url)
        if city and city[1] in TRIP_CITY_PREF:
            found='pref-'+TRIP_CITY_PREF[city[1]]
    geo = doc.get('geo') or {}
    lat, lng = geo.get('latitude'), geo.get('longitude')
    if detail and provider == 'jalan':
        match = re.search(r'staticmap\?center=(-?[\d.]+),(-?[\d.]+)', raw)
    else:
        match = None
    if match:
        lat, lng = float(match[1]), float(match[2])
    try:
        lat, lng = float(lat), float(lng)
        if not (20 < lat < 46.5 and 122 < lng < 154):
            lat, lng = None, None
    except (ValueError, TypeError):
        lat, lng = None, None
    if provider=='trip' and not found and country not in JAPAN_COUNTRIES and lat is None:
        return None
    source = provider + '-' + ident
    facts = {k: {'value': None, 'sourceId': source, 'verifiedAt': None} for k in FEATURES}
    water = ''
    rooms = None
    room_types = []
    facility_years = None
    props = trip_property(raw, ident) if detail and provider == 'trip' else None
    if props:
        stated_rooms = trip_room_count(props)
        if stated_rooms:
            rooms = dict(total=stated_rooms[0], sourceId=source, verifiedAt=fetched_at[:10], note='Trip.com 숙소 정보: ' + stated_rooms[1])
        room_types = trip_room_types(props)
        years, year_notes, _ = trip_facility_years(props, int(fetched_at[:4]))
        if years:
            facility_years = dict(**years, sourceId=source, verifiedAt=fetched_at[:10], note='Trip.com 숙소 정보: ' + ' / '.join(year_notes))
    if detail and provider == 'jalan':
        rows = {text(k): text(v) for k, v in re.findall(r'<th[^>]*>((?:(?!</th>).)*?)</th>\s*<td[^>]*>(.*?)</td>', raw, re.S)}
        own_description=text(str(doc.get('description','')))
        outdoor = rows.get('露天風呂', '')
        date=fetched_at[:10]
        def fact(key,value,note,scope='property'):
            facts[key].update(value=value,verifiedAt=date,note=note[:3000],scope=scope)
        if outdoor.startswith(('あり', '有り')):
            facts['outdoor'].update(value=True, verifiedAt=fetched_at[:10], note=outdoor)
            if '男女' in outdoor or '混浴' in outdoor or '貸切不可' in outdoor:
                fact('communalOutdoor',True,outdoor)
        elif outdoor.startswith(('なし', '無し')):
            facts['outdoor'].update(value=False, verifiedAt=fetched_at[:10], note=outdoor)
            fact('communalOutdoor',False,'자란 공용 노천탕 항목: '+outdoor)
        table = re.search(r'<table class="jlnpc-shisetsu-bath">(.*?)</table>', raw, re.S)
        if table:
            counts = [int(v) for v in re.findall(r'<td>\s*(\d+)\s*</td>', table[1])]
            if len(counts) == 9 and sum(counts[3:6]) > 0 and '大浴場' in own_description+' '+rows.get('風呂利用条件',''):
                facts['largeBath'].update(value=True, verifiedAt=fetched_at[:10], note='Jalan 숙소 안내에 대욕장 명시, 시설표 내탕 확인')
        # '貸切不可' for an outdoor bath says nothing about other private baths.
        other = rows.get('その他の風呂施設', '')
        private_row=rows.get('貸切風呂','')
        if private_row.startswith(('あり','有り')) or '貸切風呂' in other or '家族風呂' in other:
            facts['privateBath'].update(value=True, verifiedAt=fetched_at[:10], note=other)
        elif private_row.startswith(('なし','無し')):
            fact('privateBath',False,private_row)
        # Jalan lists a view bath among the other bath facilities. It has no
        # 'none' wording, so a missing entry stays unknown.
        view_rows = [k + ': ' + rows[k] for k in ['その他の風呂施設', '風呂利用条件'] if re.search(r'展望(?:大浴場|浴場|風呂|露天)', rows.get(k, ''))]
        if view_rows and not re.search(r'展望(?:大浴場|浴場|風呂|露天風呂|露天)(?:は)?(?:なし|無し|ございません|ありません)', ' '.join(view_rows)):
            fact('viewBath', True, '자란 욕탕 항목: ' + ' / '.join(view_rows))
        # The 部屋・部屋施設 table puts the room types and the counts on separate
        # rows. Keep the stated total; Jalan's parts need not add up to it.
        room_table = re.search(r'<table class="shisetsu-roomsetsubi_body">.*?<table>(.*?)</table>', raw, re.S)
        if room_table:
            heads = [text(c) for c in re.findall(r'<th[^>]*>(.*?)</th>', room_table[1], re.S)]
            cells = [text(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', room_table[1], re.S)]
            stated = dict(zip(heads, cells)) if len(heads) == len(cells) else {}
            room_counts = {k: int(m[1]) for k, v in stated.items() if (m := re.fullmatch(r'(\d{1,4})室', v))}
            if 0 < room_counts.get('総部屋数', 0) <= 5000:
                rooms = dict(total=room_counts['総部屋数'], sourceId=source, verifiedAt=fetched_at[:10], note='자란 객실 수 표: ' + ', '.join(k + ' ' + v for k, v in stated.items()))
                parts = {'western': '洋室', 'japanese': '和室', 'japaneseWestern': '和洋室', 'other': 'その他'}
                if all(v in room_counts for v in parts.values()):
                    rooms['byType'] = {k: room_counts[v] for k, v in parts.items()}
        # The 部屋・部屋施設 gallery shows a few of this property's room photos
        # with its own captions; Jalan names no room type here.
        gallery = re.search(r'<h3 class="jlnpc-title">部屋・部屋施設</h3>(.*?)<table class="shisetsu-roomsetsubi_body">', raw, re.S)
        photos = []
        for tag in re.findall(r'<img\b[^>]*>', gallery[1] if gallery else '', re.I):
            src = re.search(r'\bsrc=["\']([^"\']+)', tag, re.I)
            alt = re.search(r'\balt=["\']([^"\']*)', tag, re.I)
            photo = image_url(src[1]) if src else ''
            if re.fullmatch(r'https://cdn\.jalan\.jp/jalan/images/[^?#]*/Y' + re.escape(ident) + r'[^/?#]*\.jpg', photo) and photo not in [p['url'] for p in photos]:
                photos.append(dict(url=photo, caption=text(alt[1])[:300] if alt else ''))
        if photos:
            room_types = [dict(name=None, photos=photos[:6])]
        water = ' / '.join(v for k, v in rows.items() if k in ['温泉', '風呂利用条件'])
        spring_row=rows.get('温泉','')
        if spring_row.startswith(('無し','なし')):
            fact('natural',False,'자란 온천 항목: '+spring_row)
        elif '人工温泉' in spring_row and '人工温泉含まず' not in spring_row:
            fact('natural',False,'자란 온천 항목: '+spring_row)
        if facts['natural']['value'] is not False and ('人工温泉含まず' in spring_row or '天然温泉' in spring_row or '天然温泉' in own_description) and not re.search(r'天然温泉(?:では|じゃ|でない|はありません|なし|無し)',spring_row+' '+own_description):
            facts['natural'].update(value=True,verifiedAt=fetched_at[:10],note=spring_row if '人工温泉含まず' in spring_row or '天然温泉' in spring_row else own_description[:500])
        # '温泉 有り' without explicit natural-water evidence remains unknown.
        if facts['natural']['value'] is True:
            if re.search(r'(?:源泉|温泉)[掛か]け流し',spring_row) and not re.search(r'(?:掛け流し|かけ流し)(?:ではない|でない|ではありません)',spring_row):
                fact('freeFlow',True,spring_row+' / 가수·가온과 모든 욕탕 적용 여부는 별도 확인')
            if re.search(r'にごり湯|濁り湯|白濁',spring_row) and not re.search(r'(?:にごり湯|濁り湯)(?:なし|ではない)',spring_row):
                fact('nigori',True,spring_row)
        # Only this property's description, facility rows and own photo captions
        # can prove room/private facilities, never related-hotel recommendations.
        captions=[]
        for tag in re.findall(r'<img\b[^>]*>',raw,re.I):
            if re.search(r'/Y'+re.escape(ident)+r'[/\d]',tag,re.I):
                alt=re.search(r'\balt=[\"\']([^\"\']*)',tag,re.I)
                if alt:captions.append(text(alt[1]))
        own=' '.join([own_description,rows.get('部屋補足',''),rows.get('風呂利用条件',''),other,*captions])
        if table and len(counts)==9 and sum(counts[3:6])>0 and '大浴場' in own:
            fact('largeBath',True,'자란 숙소의 대욕장 안내 및 시설표 공용 내탕 확인')
        if facts['privateBath']['value'] is not False and re.search(r'貸切(?:半)?露天|家族(?:半)?露天|貸切風呂.{0,12}露天',own) and not re.search(r'(?:貸切|家族)(?:半)?露天.{0,8}(?:なし|無し|ございません|ありません)',own):
            fact('privateBath',True,'자란 숙소 안내에 전세 노천탕 명시')
            fact('privateOutdoor',True,'자란 숙소 안내: '+next((c for c in captions if re.search(r'貸切.*露天',c)),own_description)[:800])
        # A resort-wide/day-use facility is not proof of hotel-owned baths.
        # Keep the source water/fee notice, but clear claims from that table.
        external_bath=bool(re.search(r'温泉施設はリゾート内の施設|温泉施設は(?:館外|敷地外|別施設)|(?:館外|敷地外|外部)の温泉施設',water))
        if external_bath:
            for key in ['natural','largeBath','outdoor','privateBath','communalOutdoor','privateOutdoor','nigori','freeFlow','viewBath']:
                facts[key]={'value':None,'sourceId':source,'verifiedAt':None,'note':'리조트 공용 또는 외부 온천 안내입니다. 숙소 내 욕탕 여부는 별도 확인이 필요합니다.'}
        room_evidence=' '.join([own_description,rows.get('部屋補足',''),*captions])
        if re.search(r'露天風呂(?:付|付き)客室|客室(?:露天|に露天風呂)|露天(?:風呂)?付.{0,12}(?:客室|スイート|和洋室)',room_evidence):
            fact('roomOutdoor',True,'자란 객실 안내에 노천탕 포함 객실 타입 명시. 모든 객실은 아님','someRooms')
            fact('outdoor',True,'공용 또는 객실 노천탕 확인. 이용 위치는 세부 항목 확인')
        if re.search(r'温泉(?:露天)?風呂(?:付|付き)客室|温泉露天(?:風呂)?(?:付|付き)客室|客室(?:の|に|専用)(?:天然温泉|温泉)(?:風呂|露天風呂)|全(?:室|客室).{0,8}温泉(?:露天|風呂|浴室)|客室温泉',room_evidence):
            fact('roomOnsen',True,'자란 객실 안내에 객실 온천 명시. 해당 객실 타입에만 적용','someRooms')
        if re.search(r'温泉露天風呂(?:付|付き)客室|露天温泉(?:風呂)?(?:付|付き)客室|客室(?:の|に|専用)(?:露天温泉|温泉露天)|全(?:室|客室).{0,8}(?:温泉露天|露天温泉)',room_evidence):
            fact('roomOutdoorOnsen',True,'자란 객실 안내에 노천 온천 명시','someRooms')
        if re.search(r'客室(?:の|に|専用)(?:温泉の内湯|内湯の温泉|室内温泉)|温泉(?:内湯|内風呂|室内風呂)(?:付|付き)客室',room_evidence):
            fact('roomIndoorOnsen',True,'자란 객실 안내에 실내 온천탕 명시','someRooms')
            fact('roomOnsen',True,'자란 객실 안내에 실내 온천탕 명시','someRooms')
        # A High Class search/list page may include non-certified properties.
        # Accept the property's badge near its own title only.
        header_match=re.search(r'<!--/{3}\s*YADO HEADER.*?-->(.*?)<!-+\s*YADO HEADER.*?-->',raw,re.S|re.I)
        if header_match:
            header=header_match[1]
            own_title=re.search(r'<a\b[^>]*class=["\'][^"\']*\byado-name\b[^"\']*["\'][^>]*>(.*?)</a>',header,re.S|re.I)
            if own_title and re.sub(r'\s','',text(own_title[1]))==re.sub(r'\s','',text(str(doc['name']))) and re.search(r'(?:alt=["\']ハイクラス["\']|>\s*ハイクラス\s*<)',header):
                fact('jalanHighClass',True,'자란 숙소 제목 영역의 하이클래스 표시 확인')
    rating = doc.get('aggregateRating') or {}
    ratings = []
    try:
        score = float(rating['ratingValue'])
        count = int(str(rating.get('reviewCount', rating.get('ratingCount', 0))).replace(',', ''))
        scale = 10 if provider == 'trip' else 5
        if 0 < score <= scale and count > 0:
            ratings.append(dict(sourceId=source, provider=provider, score=score, scale=scale, reviewCount=count, summary='', highlights=[], isMock=False, verifiedAt=fetched_at[:10]))
    except (KeyError, ValueError, TypeError):
        pass
    image = doc.get('image') or ''
    if isinstance(image, list):
        image = image[0] if image else ''
    if isinstance(image, dict):
        image = image.get('url', '')
    image=image_url(image)
    name = html.unescape(str(doc['name']))
    names,aliases=localized_names(doc,provider,raw,detail)
    region_part, locality, street = (str(address.get(k, '')) for k in ['addressRegion', 'addressLocality', 'streetAddress'])
    # Trip's streetAddress is already the formatted full address that repeats
    # its locality and region; Jalan sends parts that must always be joined.
    full_address = street if provider == 'trip' and locality and region_part and locality in street and region_part in street else region_part + locality + street
    maps = 'https://www.google.com/maps/search/?api=1&query=' + urllib.parse.quote(full_address or name)
    return dict(id=source, names=names, aliases=aliases, kind='ryokan' if re.search(r'旅館|Ryokan', name, re.I) else 'hotel' if re.search(r'ホテル|Hotel',name,re.I) else 'unknown', regionId=found or 'unassigned', prefecture=found,
                location=dict(label=region or (next((p['name'].split(' · ')[0] for p in PREFS if p['id'] == found), '일본')), address=full_address, latitude=lat, longitude=lng, isApproximate=False),
                description=bounded_description(text(str(doc.get('description', ''))) or '예약 사이트에서 확인한 실제 숙소입니다. 상세 시설은 숙소 안내에서 확인하세요.'),
                image=dict(url=image, alt=name + ' 숙소 사진', sourceId=source, isRepresentative=False), features=facts, **({'rooms': rooms} if rooms else {}), **({'roomTypes': [dict(sourceId=source, verifiedAt=fetched_at[:10], items=room_types)]} if room_types else {}), **({'facilityYears': facility_years} if facility_years else {}),
                spring=dict(types=[], waterNotes=water, useNotes='객실 온천·객실 노천탕은 확인된 객실 타입을 예약해야 이용할 수 있습니다.'), ratings=ratings,
                links=[dict(provider=provider, url=prop_url, kind='property', label='숙소 페이지'), dict(provider='maps', url=maps, kind='coordinates', label='주소로 위치 확인')],
                sources=[dict(sourceId=source, sourceType='web', label=('Trip.com' if provider == 'trip' else 'Jalan') + (' 숙소 상세' if detail else ' 숙소 목록'), retrievedAt=fetched_at, verifiedAt=fetched_at[:10], url=url, isMock=False,**({'bathDataVersion':BATH_DATA_VERSION} if detail and provider=='jalan' else {}))])


def parse_source_page(raw, provider, url, fetched_at, pref=None, kind='detail'):
    """Use the same identity/empty-data checks for collection and diagnosis."""
    docs = list(json_hotels(raw, url))
    document_count = len(docs)
    if kind == 'detail':
        docs = [d for d in docs if provider_id(canonical(d.get('url', url), url) or '') == provider_id(url)]
    foreign = provider == 'trip' and outside_japan(docs)
    links = discover(raw, url, pref) if kind == 'list' and not foreign else {}
    observations = [h for d in docs if (h := normalize(d, provider, url, fetched_at, raw, pref, kind == 'detail'))]
    if provider == 'trip' and kind == 'detail':
        for h in observations:
            for source in h['sources']:
                source['nameLocaleUrl'] = source_request_url(url, kind)
    review_reason = None
    if not foreign:
        if kind == 'detail' and not observations:
            review_reason = 'missing_hotel_document' if not document_count else 'hotel_identity_mismatch' if not docs else 'no_valid_hotel_observation'
        elif kind == 'list' and not observations and not links:
            review_reason = 'empty_listing'
    for h in observations:
        prop = next(link['url'] for link in h['links'] if link['provider'] == provider)
        if prop != url:
            links[prop] = ('detail', h['prefecture'])
    diagnostic = dict(hotelDocuments=document_count, matchingHotelDocuments=len(docs), observations=len(observations), links=len(links), outsideJapan=foreign, reviewReason=review_reason)
    props = trip_property(raw, provider_id(url)[1]) if provider == 'trip' and kind == 'detail' and observations else None
    mismatches = trip_facility_years(props, int(fetched_at[:4]))[2] if props else []
    if mismatches:
        diagnostic['facilityYearMismatch'] = mismatches
    return observations, links, foreign, diagnostic


def open_db(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript('''CREATE TABLE IF NOT EXISTS jobs(url TEXT PRIMARY KEY, provider TEXT, kind TEXT, prefecture TEXT, status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, next_at REAL DEFAULT 0, error TEXT, fetched_at TEXT);
    CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, payload TEXT NOT NULL, detail INTEGER NOT NULL, observed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hosts(host TEXT PRIMARY KEY, next_at REAL NOT NULL);''')
    checkpoint = ROOT / 'data/crawl-checkpoint.json'
    if not db.execute('SELECT 1 FROM jobs LIMIT 1').fetchone() and checkpoint.exists():
        saved = json.loads(checkpoint.read_text())
        for job in saved.get('jobs', []):
            db.execute('INSERT OR IGNORE INTO jobs VALUES (:url,:provider,:kind,:prefecture,:status,:attempts,:next_at,:error,:fetched_at)', job)
        for record in saved.get('observations', []):
            db.execute('INSERT OR IGNORE INTO observations VALUES (?,?,?,?)', (record['id'], json.dumps(record['payload'], ensure_ascii=False), record['detail'], record['observed_at']))
    db.execute("UPDATE jobs SET status='pending' WHERE status='running'")
    db.commit()
    return db


def enqueue(db, url, kind, pref=None):
    provider = 'jalan' if 'jalan.net' in url else 'trip'
    db.execute('INSERT OR IGNORE INTO jobs(url,provider,kind,prefecture) VALUES(?,?,?,?)', (url, provider, kind, pref))


def process(db, job, raw):
    fetched = now()
    docs = list(json_hotels(raw))
    if job['kind'] == 'detail' and not docs:
        raise ValueError('Hotel structured data missing; page retained for retry')
    links = discover(raw, job['url'], job['prefecture']) if job['kind'] == 'list' else {}
    if job['kind'] == 'list' and not links and not docs:
        raise ValueError('No public hotel/list links; not marking coverage complete')
    for url, (kind, pref) in links.items():
        enqueue(db, url, kind, pref)
    for doc in docs:
        record = normalize(doc, job['provider'], job['url'], fetched, raw, job['prefecture'], job['kind'] == 'detail')
        if not record:
            continue
        db.execute('''INSERT INTO observations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,detail=excluded.detail,observed_at=excluded.observed_at WHERE excluded.detail>=observations.detail''', (record['id'], json.dumps(record, ensure_ascii=False), job['kind'] == 'detail', fetched))
        enqueue(db, next(l['url'] for l in record['links'] if l['provider'] == job['provider']), 'detail', record['prefecture'])
    db.execute("UPDATE jobs SET status='done',fetched_at=?,error=NULL WHERE url=?", (fetched, job['url']))
    db.commit()
    return len(docs), len(links)


def export(db):
    records = [json.loads(r['payload']) for r in db.execute('SELECT * FROM observations ORDER BY id')]
    curated = json.loads((ROOT / 'lib/hotels.real.json').read_text())
    known = {provider_id(l['url']): h['id'] for h in curated for l in h['links'] if l.get('url') and l['provider'] in ['trip', 'jalan']}
    records = [h for h in records if provider_id(next(l['url'] for l in h['links'] if l['provider'] in ['trip', 'jalan'])) not in known]
    # Cross-provider matches require coordinates + name evidence. Uncertain
    # pairs stay separate, explicitly counted as provider records in coverage.
    (ROOT / 'lib/hotels.crawled.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    jobs = [dict(r) for r in db.execute('SELECT * FROM jobs ORDER BY provider,kind,url')]
    (ROOT / 'data/crawl-jobs.json').write_text(json.dumps(jobs, ensure_ascii=False, separators=(',', ':'))+'\n')
    observations = [dict(id=r['id'], payload=json.loads(r['payload']), detail=r['detail'], observed_at=r['observed_at']) for r in db.execute('SELECT * FROM observations ORDER BY id')]
    saved = dict(exportedAt=now(), jobs=jobs, observations=observations)
    (ROOT / 'data/crawl-checkpoint.json').write_text(json.dumps(saved, ensure_ascii=False, separators=(',', ':')) + '\n')
    summary = dict(updatedAt=now(), records=len(records)+len(curated), crawledRecords=len(records), curatedRecords=len(curated), prefectures=len(set(h.get('prefecture') for h in records if h.get('prefecture')) | {'pref-hokkaido'}), discoveredDetailUrls=sum(j['kind']=='detail' for j in jobs), completedDetailPages=sum(j['kind']=='detail' and j['status']=='done' for j in jobs), pending=sum(j['status'] in ['pending','retry','running'] for j in jobs), failed=sum(j['status']=='failed' for j in jobs), inventoryComplete=False, providers={p:dict(discovered=sum(j['provider']==p and j['kind']=='detail' for j in jobs), completed=sum(j['provider']==p and j['status']=='done' for j in jobs)) for p in ['jalan','trip']})
    (ROOT / 'data/coverage.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
    credits = json.loads((ROOT / 'public/images/credits.json').read_text())
    credits = [c for c in credits if not c.get('hotelId','').startswith(('jalan-', 'trip-'))]
    for h in records:
        if h['image']['url']:
            credits.append(dict(hotelId=h['id'], imageUrl=h['image']['url'], sourceUrl=h['sources'][0]['url'], credit=h['sources'][0]['label'], rights='사진 저작권은 원출처에 있습니다.', retrievedAt=h['sources'][0]['retrievedAt']))
    (ROOT / 'public/images/credits.json').write_text(json.dumps(credits, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(summary, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=ROOT/'work/catalog.sqlite')
    parser.add_argument('--max-pages', type=int, default=100)
    parser.add_argument('--interval', type=float, default=3)
    parser.add_argument('--provider', choices=['jalan','trip'])
    parser.add_argument('--kind', choices=['list','detail'])
    parser.add_argument('--prefectures', help='Comma-separated Jalan slugs; omit for all 47')
    parser.add_argument('--url', action='append', default=[])
    parser.add_argument('--cached-page', action='append', default=[], help='URL=local HTML; imports previously retrieved observations')
    parser.add_argument('--export-only', action='store_true')
    args = parser.parse_args()
    db = open_db(args.state)
    for p in PREFS:
        enqueue(db, 'https://www.jalan.net/ikisaki/map/'+p['slug']+'/', 'list', p['id'])
    enqueue(db, 'https://www.trip.com/hotels/country/japan.html', 'list')
    for url in args.url:
        clean = canonical(url, url)
        if not clean:
            parser.error('Only observed Jalan/Trip public hotel/catalog URLs are supported')
        enqueue(db, clean, 'detail' if provider_id(clean)[1] else 'list')
    db.commit()
    for item in args.cached_page:
        url, file = item.split('=', 1)
        clean = canonical(url,url)
        enqueue(db,clean,'detail' if provider_id(clean)[1] else 'list')
        job=db.execute('SELECT * FROM jobs WHERE url=?',(clean,)).fetchone()
        process(db,job,Path(file).read_text())
    if args.export_only:
        export(db)
        return
    completed = 0
    try:
        while completed < args.max_pages:
            conditions, params = ["status IN ('pending','retry')", 'next_at<=?'], [time.time()]
            for field, value in [('provider',args.provider),('kind',args.kind)]:
                if value:
                    conditions.append(field+'=?');params.append(value)
            if args.prefectures:
                selected=['pref-'+s for s in args.prefectures.split(',')]
                conditions.append('prefecture IN ('+','.join('?' for _ in selected)+')');params.extend(selected)
            # Seed prefectures before regional pages, then pagination; retry
            # only after ready time. No simultaneous requests on the same host.
            job = db.execute('SELECT * FROM jobs j WHERE '+' AND '.join(conditions)+" ORDER BY attempts,CASE WHEN url LIKE '%/ikisaki/map/%' THEN 0 ELSE 1 END,kind DESC,(SELECT COUNT(*) FROM jobs d WHERE d.prefecture=j.prefecture AND d.kind=j.kind AND d.status='done'),url LIMIT 1", params).fetchone()
            if not job:
                break
            host=urllib.parse.urlsplit(job['url']).hostname
            pace=db.execute('SELECT next_at FROM hosts WHERE host=?',(host,)).fetchone()
            wait=max(0,(pace[0] if pace else 0)-time.time())
            if wait>60:break
            time.sleep(wait)
            db.execute("UPDATE jobs SET status='running',attempts=attempts+1 WHERE url=?",(job['url'],));db.commit()
            try:
                with urllib.request.urlopen(source_request_url(job['url'],job['kind']),timeout=30) as response:
                    body=response.read(8*1024*1024)
                    enc=response.headers.get_content_charset() or 'utf-8'
                    raw=body.decode('cp932' if enc.lower() in ['windows-31j','shift_jis','sjis'] else enc,errors='replace')
                docs,links=process(db,job,raw)
                print(json.dumps(dict(status='done',url=job['url'],hotels=docs,links=links),ensure_ascii=False),flush=True)
            except (urllib.error.URLError,TimeoutError,ValueError,OSError) as error:
                policy=source_failure(error,job['attempts'])
                delay=policy['retryAfterSeconds'];status=policy['status']
                if policy['providerCooldownSeconds']:
                    db.execute('INSERT INTO hosts VALUES(?,?) ON CONFLICT(host) DO UPDATE SET next_at=MAX(hosts.next_at,excluded.next_at)',(host,time.time()+policy['providerCooldownSeconds']))
                db.execute('UPDATE jobs SET status=?,next_at=?,error=? WHERE url=?',(status,time.time()+delay,policy['error'],job['url']));db.commit()
                print(json.dumps(dict(status=status,url=job['url'],error=type(error).__name__,retryAfterSeconds=delay)),flush=True)
            finally:
                db.execute('INSERT INTO hosts VALUES(?,?) ON CONFLICT(host) DO UPDATE SET next_at=MAX(hosts.next_at,excluded.next_at)',(host,time.time()+max(3,args.interval)));db.commit()
            completed+=1
            if completed%5==0:export(db)
    finally:
        export(db)
        db.close()


if __name__=='__main__':
    main()
