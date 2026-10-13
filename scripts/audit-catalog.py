#!/usr/bin/env python3
"""Inspect a recovered catalog without modifying it or auto-merging hotels."""
import argparse, collections, json, math, re, sqlite3, unicodedata
from datetime import datetime, timezone
from pathlib import Path

def normal(text):return ''.join(c for c in unicodedata.normalize('NFKC',text or '').casefold() if c.isalnum())
def provider(h):return h['id'].split('-',1)[0] if h['id'].startswith(('jalan-','trip-')) else 'curated'
def precise(h):
 p=h['location'];return not p.get('isApproximate') and isinstance(p.get('latitude'),(float,int)) and isinstance(p.get('longitude'),(float,int))
def distance(a,b):
 if not precise(a) or not precise(b):return None
 x,y=a['location'],b['location'];lat1,lat2=math.radians(x['latitude']),math.radians(y['latitude']);dlat=lat2-lat1;dlon=math.radians(y['longitude']-x['longitude']);v=math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
 return round(6371000*2*math.asin(min(1,math.sqrt(v))))
# Same bit order as FEATURE_LABELS / featureMasks in schema 0009.
FEATURE_KEYS=['natural','largeBath','outdoor','privateBath','roomOnsen','roomOutdoor','communalOutdoor','privateOutdoor','roomIndoorOnsen','roomOutdoorOnsen','nigori','freeFlow','jalanHighClass','viewBath']
def audit(path):
 db=sqlite3.connect('file:'+str(path.resolve())+'?mode=ro',uri=True);records=list(db.execute('SELECT payload,bath_known,bath_features FROM hotels ORDER BY id'));hotels=[json.loads(row[0]) for row in records]
 stats=collections.defaultdict(collections.Counter);feature_counts=collections.defaultdict(collections.Counter);prefectures=collections.defaultdict(collections.Counter);names=collections.defaultdict(list);addresses=collections.defaultdict(list);now=datetime.now(timezone.utc);ages=collections.Counter()
 for h,record in zip(hotels,records):
  known_mask=int(record[1] or 0);true_mask=int(record[2] or 0)
  p=provider(h);s=stats[p];s['records']+=1
  detail=any('상세' in source.get('label','') for source in h['sources']);known=bool(known_mask & ~(1<<12));s['withRawKnownBathFacts']+=any(isinstance(v.get('value'),bool) for key,v in h['features'].items() if key!='jalanHighClass');s['withAnyKnownFeature']+=known_mask>0;s['detail']+=detail;s['withKnownBathFacts']+=known;s['withKoreanName']+=bool(re.search('[가-힣]',h['names']['ko']));s['withPreciseCoordinates']+=precise(h)
  for i,key in enumerate(FEATURE_KEYS):
   feature_counts[key]['known']+=bool(known_mask & (1<<i));feature_counts[key]['true']+=bool(true_mask & (1<<i))
  pref=h.get('prefecture');prefectures[pref or 'unknown']['records']+=1;prefectures[pref or 'unknown']['detail']+=detail;prefectures[pref or 'unknown']['withKnownBathFacts']+=known
  try:
   stamp=datetime.fromisoformat(h['sources'][0]['retrievedAt'].replace('Z','+00:00'));stamp=stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc);days=(now-stamp).total_seconds()/86400
   ages['future' if days<0 else '0-7d' if days<=7 else '8-30d' if days<=30 else '31-90d' if days<=90 else 'over90d']+=1
  except (KeyError,IndexError,TypeError,ValueError):ages['unknown']+=1
  if pref:
   for name in set(normal(n) for n in h['names'].values()):
    if len(name)>=6:names[(pref,name)].append(h)
   address=normal(h['location'].get('address'))
   if len(address)>=10:addresses[(pref,address)].append(h)
 pairs={}
 for groups in (names,addresses):
  for values in groups.values():
   for i,a in enumerate(values):
    for b in values[i+1:]:
     if provider(a)==provider(b) or 'curated' in (provider(a),provider(b)):continue
     ids=tuple(sorted((a['id'],b['id'])));pairs[ids]=(a,b)
 candidates=[]
 for ids,(a,b) in pairs.items():
  common=set(normal(n) for n in a['names'].values())&set(normal(n) for n in b['names'].values());common={n for n in common if len(n)>=6}
  aa,ba=normal(a['location'].get('address')),normal(b['location'].get('address'));same_address=bool(len(aa)>=10 and aa==ba);meters=distance(a,b)
  signals=[]
  if common:signals.append('exact_primary_name')
  if same_address:signals.append('exact_address')
  if meters is not None and meters<=100:signals.append('precise_coordinates_within_100m')
  conflict=meters is not None and meters>1000
  level='conflict_review' if conflict else 'strong_review' if common and (same_address or meters is not None and meters<=100) else 'review'
  candidates.append({'ids':ids,'names':[a['names']['ko'],b['names']['ko']],'prefecture':a.get('prefecture'),'signals':signals,'distanceMeters':meters,'level':level,'addresses':[a['location'].get('address'),b['location'].get('address')],'links':[[l['url'] for l in h['links'] if l['provider'] in ('trip','jalan') and l.get('url')] for h in (a,b)]})
 candidates.sort(key=lambda c:({'strong_review':0,'conflict_review':1,'review':2}[c['level']],c['ids']))
 reviews_path=Path(__file__).resolve().parents[1]/'data'/'hotel-mapping-reviews.json'
 reviews=json.loads(reviews_path.read_text()) if reviews_path.exists() else []
 candidate_ids={tuple(c['ids']) for c in candidates}
 reviews=[r for r in reviews if tuple(sorted(r['ids'])) in candidate_ids]
 translations=db.execute("SELECT COUNT(*) FROM hotel_description_translations t JOIN hotels h ON h.id=t.hotel_id AND t.source_text=json_extract(h.payload,'$.description')").fetchone()[0]
 localized=db.execute('SELECT COUNT(*) FROM hotel_name_localizations WHERE payload IS NOT NULL').fetchone()[0]
 return{'auditedAt':now.isoformat(),'records':len(hotels),'featureCountScope':'D1 indexed facts in schema 0009; raw payload counts are reported separately','providerCounts':dict(stats),'featureCounts':dict(feature_counts),'prefectureQuality':dict(sorted(prefectures.items())),'sourceAgeBuckets':dict(ages),'currentDescriptionTranslations':translations,'researchedKoreanNames':localized,'mappingCandidateCounts':dict(collections.Counter(c['level'] for c in candidates)),'mappingCandidates':candidates,'reviewAnnotations':reviews,'limitations':['Candidates are evidence for review, never automatic merges.','Exact names and addresses may still describe separate wings or chain branches.','Source age is the last primary observation, not proof every field was verified then.','Recovered checkpoint spans multiple requests and is not an atomic production snapshot.']}
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('database',type=Path);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args();result=audit(args.database);args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:result[k] for k in ('records','providerCounts','currentDescriptionTranslations','researchedKoreanNames','mappingCandidateCounts')},ensure_ascii=False))
