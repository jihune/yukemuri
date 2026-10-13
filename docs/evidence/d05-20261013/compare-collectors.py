# D05: parse the crawler fixtures listed in `cases` with two collect.py files and
# report whether everything but the D05 fields (rooms, roomTypes,
# features.viewBath, bathDataVersion) is the same. Usage, from the repo root:
#   mkdir -p /tmp/old/scripts/crawler && git show origin/main:scripts/crawler/collect.py > /tmp/old/scripts/crawler/collect.py
#   cp scripts/crawler/retry_policy.py /tmp/old/scripts/crawler/ && ln -s "$PWD/data" /tmp/old/data
#   python3 docs/evidence/d05-20261013/compare-collectors.py /tmp/old/scripts/crawler/collect.py scripts/crawler/collect.py scripts/crawler/fixtures
import sys,json,importlib.util
from pathlib import Path
def load(path,name):
    sys.path.insert(0,str(Path(path).parent))
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);sys.path.pop(0);return m
old=load(sys.argv[1],'old_collect');new=load(sys.argv[2],'new_collect')
F=Path(sys.argv[3])
cases=[('jalan-rooms-greenplaza.html','jalan','https://www.jalan.net/yad345284/','detail'),('jalan-rooms-hanayu.html','jalan','https://www.jalan.net/yad321273/','detail'),('jalan-rooms-shinanoki.html','jalan','https://www.jalan.net/yad312415/','detail'),
 ('jalan-detail.html','jalan','https://www.jalan.net/yad307416/','detail'),('jalan-sozankyo-baths.html','jalan','https://www.jalan.net/yad327522/','detail'),('jalan-list.html','jalan','https://www.jalan.net/130000/LRG_137100/','list'),
 ('trip-detail-rooms.html','trip','https://www.trip.com/hotels/hakone-hotel-detail-704264/fujiya-hotel/','detail'),('trip-detail-names.html','trip','https://www.trip.com/hotels/aso-hotel-detail-1458363/sozankyo/','detail'),('trip-list.html','trip','https://www.trip.com/hotels/tokyo-hotels-list-228/','list')]
bad=0
for f,prov,url,kind in cases:
    raw=(F/f).read_text(encoding='utf-8')
    a=old.parse_source_page(raw,prov,url,'2026-10-13T12:00:00+00:00','pref-kanagawa',kind)
    b=new.parse_source_page(raw,prov,url,'2026-10-13T12:00:00+00:00','pref-kanagawa',kind)
    def clean(obs):
        out=[]
        for h in obs:
            h=json.loads(json.dumps(h));h.pop('rooms',None);h.pop('roomTypes',None);h['features'].pop('viewBath',None)
            for s in h['sources']: s.pop('bathDataVersion',None)
            out.append(h)
        return out
    same=clean(a[0])==clean(b[0]) and a[1]==b[1] and a[3]==b[3]
    diffs=[]
    if not same:
        for x,y in zip(clean(a[0]),clean(b[0])):
            for k in x:
                if x[k]!=y.get(k): diffs.append((k,json.dumps(x[k],ensure_ascii=False)[:150],json.dumps(y.get(k),ensure_ascii=False)[:150]))
    bad+=not same
    print('SAME' if same else 'DIFF',f,len(b[0]),diffs[:3])
print('differences:',bad)
