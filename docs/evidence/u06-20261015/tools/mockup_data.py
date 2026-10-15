# U06 1단계 시안 값 만들기. 운영 스냅숏 파일(manifest·status·core·cards·text·geo)과
# 상세 API 표본(sample.json, sample2.json)을 읽어 시안이 읽는 data.js와 요약 measure.json을 쓴다.
# 실행: python3 -I mockup_data.py <스냅숏 폴더> <표본 폴더> <출력 폴더>
# 스냅숏 폴더에는 https://yukemuri.jihune.workers.dev/snapshot/manifest.json 이 가리키는 파일을 받아 둔다.
import collections
import datetime
import json
import os
import re
import sys

SNAP, SAMPLE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..')
HANGUL = re.compile('[가-힣]')


def load(name, folder=SNAP):
    with open(f'{folder}/{name}', encoding='utf-8') as f:
        return json.load(f)


manifest, status, core, cards, text, geo = (load(n) for n in ('manifest.json', 'status.json', 'core.json', 'cards.json', 'text.json', 'geo.json'))
plan = load('collection-priorities.json', os.path.join(REPO, 'data'))
samples = load('sample.json', SAMPLE) + load('sample2.json', SAMPLE)
ids = core['ids']
N = len(ids)
pos = {h: i for i, h in enumerate(ids)}


def provider(hid):
    head = hid.split('-')[0]
    return head if head in ('jalan', 'trip') else 'curated'


prov = [provider(h) for h in ids]
SCOPES = {'all': ('전체', None), 'jalan': ('자란넷', 'jalan'), 'trip': ('Trip.com', 'trip')}
# BATH_FEATURE_MASK (lib/hotel-bath-facts.ts): every feature bit but jalanHighClass (bit 12).
MASK = sum(1 << i for i in range(14) if i != 12)


def kst(iso):
    t = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00')) + datetime.timedelta(hours=9)
    return f'{t.month}월 {t.day}일 {t.hour:02d}:{t.minute:02d}'


def members(p):
    return [i for i in range(N) if p is None or prov[i] == p]


def ok(r):
    return r['status'] == 200


# Sample estimates (shares, then scaled). Items with a detail page are estimated from the
# detail items of every sample; list-only items carry no rooms, years or translation.
def share(rows, key):
    rows = [r for r in rows if ok(r)]
    return (sum(1 for r in rows if key(r)) / len(rows), len(rows)) if rows else (0, 0)


ESTIMATED = (('rooms', lambda r: r['rooms'] or r['roomTypes'] > 0), ('years', lambda r: r['years']),
             ('descKo', lambda r: r['desc'] and (not r['needsKo'] or r['translated'])), ('descNone', lambda r: not r['desc']))


# Per provider: detail items take the share of that provider's sampled details (the 'bath'
# group is Jalan details; nearly every Jalan detail has bath facts), list-only items the share
# of its sampled list-only items. 'all' adds the two; the 20 curated items are not sampled (0).
def estimate(p):
    if p is None:
        a, b = estimate('jalan'), estimate('trip')
        return {k: (a[k] + b[k] if not k.endswith('N') else (a[k][0] + b[k][0], a[k][1] + b[k][1])) for k in a}
    detail_items = next(x for x in status['providers'] if x['provider'] == p)['completedDetailPages']
    list_items = sum(1 for x in prov if x == p) - detail_items
    det = [r for r in samples if provider(r['id']) == p and ok(r) and r.get('detail')]
    lst = [r for r in samples if provider(r['id']) == p and ok(r) and not r.get('detail') and r['group'] in ('uniform', 'trip')]
    est = {}
    for key, fn in ESTIMATED:
        sd, nd = share(det, fn)
        sl, nl = share(lst, fn)
        est[key] = round(sd * detail_items + sl * list_items)
        est[key + 'N'] = (nd, nl)
    return est


pages = []
for prow in status['providers']:
    p = prow['provider']
    cov = manifest['coverage']['providers'][p]
    total = cov['discovered']
    retry, failed = prow['retryPages'], prow['failedPages']
    # status pendingPages counts list and detail pages; detail pending is what the detail total leaves.
    detail_pending = total - prow['completedDetailPages'] - (retry if p == 'jalan' else 0) - (failed if p == 'jalan' else 0)
    pages.append({'label': '자란넷' if p == 'jalan' else 'Trip.com', 'done': prow['completedDetailPages'], 'pending': detail_pending,
                      'retry': retry if p == 'jalan' else 0, 'failed': failed if p == 'jalan' else 0, 'total': total,
                      'listDone': cov['completed'] - prow['completedDetailPages'], 'listPending': prow['pendingPages'] - detail_pending,
                      'listFailed': failed if p == 'trip' else 0, 'last': kst(prow['lastSuccessAt'])})

scopes = {}
measure = {}
for key, (label, p) in SCOPES.items():
    m = members(p)
    n = len(m)
    if p is None:
        detail = status['quality']['detailRecords']
    else:
        detail = next(x for x in status['providers'] if x['provider'] == p)['completedDetailPages']
    bath = sum(1 for i in m if (core['known'][i] or 0) & MASK)
    rating = sum(1 for i in m if cards[i]['ratings'])
    photo = sum(1 for i in m if cards[i]['image']['url'])
    ko = sum(1 for i in m if HANGUL.search(cards[i]['names']['ko']))
    est = estimate(p)
    jalan_items = sum(1 for i in m if prov[i] == 'jalan')
    rows = [
        {'key': 'detail', 'group': '시설 정보', 'label': '상세 정보', 'filled': detail, 'none': 0, 'est': False,
             'states': ['상세 페이지 받음', '해당 없음', '목록 정보만'], 'note': '출처 상세 페이지를 받은 항목입니다. 탕·객실·연도는 상세에서만 나옵니다.'},
        {'key': 'bath', 'group': '시설 정보', 'label': '탕 조건', 'filled': bath, 'none': 0, 'est': False,
             'states': ['13개 탕 항목 중 하나 이상 확인', '상세에 탕 표기 없음', '확인 전'], 'note': '자란넷 상세에서만 읽습니다. Trip.com 항목은 비어 있습니다.'},
        {'key': 'rooms', 'group': '시설 정보', 'label': '객실 정보', 'filled': est['rooms'], 'none': 0, 'est': True,
             'states': ['객실 수나 객실 사진 있음', '상세에 객실 표기 없음', '확인 전'], 'note': '객실 수, 객실 타입 이름, 객실 사진(D05).'},
        {'key': 'years', 'group': '시설 정보', 'label': '설립·리모델링 연도', 'filled': est['years'], 'none': jalan_items, 'est': True,
             'states': ['연도 있음', '자란넷에는 연도 칸이 없음', 'Trip.com 상세 전이거나 표기 없음'], 'note': 'Trip.com에만 있는 정보입니다(D04). 자란넷 항목은 출처에 없음으로 셉니다.'},
        {'key': 'rating', 'group': '시설 정보', 'label': '평점', 'filled': rating, 'none': n - rating, 'est': False,
             'states': ['Trip.com이나 자란넷 평점 있음', '받은 페이지에 평점 없음', '해당 없음'], 'note': '원래 척도(Trip.com 10점, 자란넷 5점) 그대로입니다.'},
        {'key': 'photo', 'group': '시설 정보', 'label': '대표 사진', 'filled': photo, 'none': n - photo, 'est': False,
             'states': ['사진 있음', '받은 페이지에 사진 없음', '해당 없음'], 'note': '사진 저작권은 원출처에 있습니다.'},
        {'key': 'nameKo', 'group': '한국어', 'label': '한국어 이름', 'filled': ko, 'none': 0, 'est': False,
             'states': ['한국어 이름 있음', '찾아봤지만 없음', '아직 찾아보지 않음'], 'note': 'Trip.com 한국어 페이지나 확인한 출처의 이름입니다. 시안에서는 ‘찾아봤지만 없음’을 따로 세지 못했습니다.'},
        {'key': 'descKo', 'group': '한국어', 'label': '한국어 설명', 'filled': est['descKo'], 'none': est['descNone'], 'est': True,
             'states': ['한국어 원문이거나 지금 원문의 번역 있음', '출처 설명 없음', '번역 전(원문이 바뀐 옛 번역 포함)'], 'note': '설명 번역은 지금 정기적으로 추가하지 않습니다(D03).'},
    ]
    grades = collections.Counter(geo['grade'][i] for i in m)
    geo_rows = [{'label': '건물 위치', 'n': grades[1] + grades[6], 'desc': '출처 좌표나 Wikidata'},
                {'label': '번지 블록', 'n': grades[2], 'desc': '주소의 번지 묶음(가이쿠)'},
                {'label': '동네', 'n': grades[3], 'desc': '주소의 오아자 중심'},
                {'label': '넓은 범위', 'n': grades[4] + grades[5], 'desc': '시정촌·도도부현 중심'}]
    scopes[key] = {'label': label, 'items': n, 'rows': rows, 'geo': geo_rows}
    measure[key] = {'items': n, 'rows': {r['key']: {'filled': r['filled'], 'none': r['none'], 'estimated': r['est']} for r in rows},
                        'sampleSizes': {k: est[k + 'N'] for k in ('rooms', 'years', 'descKo')}, 'geoGrades': dict(sorted(grades.items()))}

# Onsen towns: the town search the list uses is a name query in the prefecture; this mockup
# approximates it by substring on the snapshot search text (the build will call searchSnapshot).
towns = []
for t in plan['towns']:
    q = t['query'].lower()
    rows = [i for i in range(N) if core['prefecture'][i] == t['prefecture'] and (q in (text['searchText'][i] or '') or any(q in k for k in text['nameKeys'][i]))]
    towns.append({'name': t['name'], 'n': len(rows), 'bath': sum(1 for i in rows if (core['known'][i] or 0) & MASK),
                      'ko': sum(1 for i in rows if HANGUL.search(cards[i]['names']['ko'])), 'geo': sum(1 for i in rows if geo['grade'][i] in (1, 2, 6))})

defs = [
    ('곳(숙소 기록)', '목록에서 1곳으로 세는 단위이고, 출처별 숙소 기록 하나입니다. 같은 숙소가 자란넷과 Trip.com에 함께 있으면 2곳으로 셉니다. 직접 연결한 20곳만 하나로 합칩니다.'),
    ('페이지', '수집기가 받는 출처 페이지입니다. 상세 페이지 하나가 숙소 기록 하나의 상세 정보가 됩니다. 목록 페이지는 숙소 기록을 찾는 데 씁니다.'),
    ('채움·출처에 없음·아직 비어 있음', '채움은 값이 있는 것, 출처에 없음은 출처를 확인했지만 그 정보가 없는 것, 아직 비어 있음은 아직 확인하지 않았거나 번역하지 않은 것입니다. 없음과 확인 전을 섞지 않습니다.'),
    ('계산 시각', '배포와 수집 실행이 끝날 때 검색 자료를 만들면서 한 번 계산합니다. 화면을 열 때 서버에서 다시 세지 않습니다.'),
] + [(r['label'], f"채움: {r['states'][0]}. 출처에 없음: {r['states'][1]}. 아직 비어 있음: {r['states'][2]}. {r['note']}") for r in scopes['all']['rows']]
data = {'asOf': f"{kst(manifest['generatedAt'])} 기준 · 검색 자료를 만들 때 계산", 'scopes': scopes, 'pages': pages, 'towns': towns, 'defs': defs,
            'pagesMinor': '목록 페이지: ' + ' · '.join(f"{p['label']} {p['listDone']:,}쪽 완료, 대기 {p['listPending']:,}쪽" + (f", <span class=\"issue\">실패 {p['listFailed']}쪽(페이지 없음)</span>" if p['listFailed'] else '') for p in pages),
            'mockNote': f"시안입니다. 값은 운영 스냅숏 {manifest['id']}({kst(manifest['generatedAt'])})에서 계산했습니다. ‘표본 추정’ 줄은 상세 API 표본 {sum(1 for r in samples if ok(r))}곳으로 추정했고, 출처별 탭의 상세 정보는 그 출처의 상세 페이지 완료 수로 대신했습니다. 온천마을 수는 이름 부분일치 근사입니다. 구현에서는 모두 검색 자료를 만들 때 전수로 셉니다."}
with open(f'{OUT}/data.js', 'w', encoding='utf-8') as f:
    f.write('window.U06_DATA=' + json.dumps(data, ensure_ascii=False) + ';\n')
with open(f'{OUT}/measure.json', 'w', encoding='utf-8') as f:
    json.dump({'snapshot': manifest['id'], 'generatedAt': manifest['generatedAt'], 'sample': {'ok': sum(1 for r in samples if ok(r)), 'requests': len(samples)},
                   'pages': pages, 'scopes': measure, 'towns': towns}, f, ensure_ascii=False, indent=1)
print('ok', N, {k: v['items'] for k, v in scopes.items()})
