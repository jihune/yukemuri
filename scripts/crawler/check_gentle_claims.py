"""Claims of a gentle run (C07): a group whose claim returned no page is not asked again; no network."""
import contextlib
import io
import json
import runpy
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).parent
SECRET='gentle-claims-test-secret'
GENTLE=[('jalan','detail'),('jalan','baths'),('trip','detail'),('jalan','refresh'),('trip','refresh'),('jalan','list'),('trip','list'),('trip','names'),('jalan','localnames')]

class Response:
 status=200
 def __init__(self,value):
  self.body=(value if isinstance(value,str) else json.dumps(value)).encode();self.headers=Message();self.headers['Content-Type']='text/html; charset=utf-8'
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.body

def pages(provider,count,first=900000):
 return [f'https://www.jalan.net/yad{first+i}/' if provider=='jalan' else f'https://www.trip.com/hotels/tokyo-hotel-detail-{first+i}/qa-hotel/' for i in range(count)]

class GentleClaimChecks(unittest.TestCase):
 def run_collector(self,queue,argv,later=None):
  """queue: (provider, phase) -> page URLs. later: (provider, phase) -> (claims sent before it is due, URL).
  Returns the claims sent ((provider, phase, lane, url or None)), the saved URLs and the printed lines."""
  queue={group:list(urls) for group,urls in queue.items()};claims=[];saved=[]
  class Site:
   def open(self,request,timeout):
    path=request.full_url.split('.workers.dev',1)[1]
    if path=='/api/crawl-prepare':return Response({'done':True})
    if path=='/api/crawl' and request.method=='POST':
     claim=json.loads(request.data);group=(claim['provider'],claim['phase'])
     for due in [g for g,(after,_) in (later or {}).items() if len(claims)>=after]:queue.setdefault(due,[]).append(later.pop(due)[1])
     url=queue[group].pop(0) if queue.get(group) else None
     claims.append((*group,claim['lane'],url))
     return Response({'jobs':[{'url':url,'kind':'detail' if claim['phase'] in ['detail','baths','names','refresh'] else 'list','prefecture':'pref-tokyo','attempts':0,'lease_token':claim['token']}] if url else [],'leaseSeconds':180})
    if path=='/api/crawl' and request.method=='PUT':
     saved.append(json.loads(request.data)['url']);return Response({'accepted':0,'coverage':{'records':1}})
    return Response({'coverage':{'records':1,'pending':0}})
  class Guard:
   def __init__(self,*args):self.redirects=[]
   def open(self,*args,**kwargs):return Response('<html></html>')
  output=io.StringIO()
  with patch('sys.argv',['update-site.py',*argv]),patch('sys.stdin',io.StringIO(json.dumps({'url':'https://yukemuri.example-account.workers.dev','token':SECRET})+'\n')),\
       patch('urllib.request.build_opener',return_value=Site()),patch('source_safety.SourceGuard',Guard),patch('source_safety.check_source_body'),\
       patch('collect.parse_source_page',return_value=([],{},False,{'reviewReason':None})),patch('time.sleep'),contextlib.redirect_stdout(output):
   runpy.run_path(str(ROOT/'update-site.py'),run_name='__main__')
  self.assertNotIn(SECRET,output.getvalue())
  return claims,saved,[json.loads(line) for line in output.getvalue().splitlines()],queue

 def test_empty_group_is_asked_once_and_the_pages_keep_their_order(self):
  jd,jb,td=pages('jalan',6),pages('jalan',2,800000),pages('trip',3)
  claims,saved,lines,_=self.run_collector({('jalan','detail'):jd,('jalan','baths'):jb,('trip','detail'):td},['--gentle','--max-pages','8'])
  # Round 1 asks every group; later rounds only the groups that gave a page.
  # Lanes follow the pages done, as before: the first detail claim of each
  # provider and every fifth page use the national lane.
  self.assertEqual(claims,[('jalan','detail','national',jd[0]),('jalan','baths','priority',jb[0]),('trip','detail','national',td[0]),
                           *[(*group,'priority',None) for group in GENTLE[3:]],
                           ('jalan','detail','priority',jd[1]),('jalan','baths','national',jb[1]),('trip','detail','priority',td[1]),
                           ('jalan','detail','priority',jd[2]),('jalan','baths','priority',None),('trip','detail','priority',td[2])])
  # The pages are the ones a run asking every group in every round takes (21 claims).
  self.assertEqual(saved,[jd[0],jb[0],td[0],jd[1],jb[1],td[1],jd[2],td[2]])
  for i,(provider,phase,_,url) in enumerate(claims):
   if url is None:self.assertNotIn((provider,phase),[c[:2] for c in claims[i+1:]],f'{provider}/{phase} was asked again after it was empty')
  self.assertEqual([line for line in lines if 'emptyGroup' in line],[*[{'emptyGroup':p+'/'+q,'round':1} for p,q in GENTLE[3:]],{'emptyGroup':'jalan/baths','round':3}])
  self.assertIn({'rounds':3,'claims':15},lines)
  self.assertEqual(lines[-1]['processed'],8)

 def test_run_ends_once_every_group_is_empty(self):
  jd=pages('jalan',2)
  claims,saved,lines,_=self.run_collector({('jalan','detail'):jd},['--gentle','--max-pages','20'])
  self.assertEqual(saved,jd)
  self.assertEqual(claims,[('jalan','detail','national',jd[0]),('jalan','baths','priority',None),('trip','detail','national',None),
                           *[(*group,'priority',None) for group in GENTLE[3:]],('jalan','detail','priority',jd[1]),('jalan','detail','priority',None)])
  self.assertIn({'rounds':3,'claims':11},lines)

 def test_page_due_after_its_group_was_empty_waits_for_the_next_run(self):
  jd,due=pages('jalan',3),'https://www.trip.com/hotels/osaka-hotel-detail-777/due-later/'
  claims,saved,lines,queue=self.run_collector({('jalan','detail'):jd},['--gentle','--max-pages','10'],later={('trip','refresh'):(9,due)})
  self.assertEqual(saved,jd)
  self.assertEqual([c for c in claims if c[:2]==('trip','refresh')],[('trip','refresh','priority',None)])
  self.assertEqual(queue[('trip','refresh')],[due],'the page stays queued for the next run')
  self.assertIn({'emptyGroup':'trip/refresh','round':1},lines)

 def test_other_modes_still_ask_every_group_in_every_round(self):
  jd=pages('jalan',2)
  claims,saved,lines,_=self.run_collector({('jalan','detail'):jd},['--provider','jalan','--kind','detail','--max-pages','5'])
  self.assertEqual(saved,jd)
  self.assertEqual([c[:2] for c in claims],[('jalan','detail'),('jalan','baths')]*3)
  self.assertFalse([line for line in lines if 'emptyGroup' in line])
  self.assertIn({'rounds':3,'claims':6},lines)

if __name__=='__main__':unittest.main()
