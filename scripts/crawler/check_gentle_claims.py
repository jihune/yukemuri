"""Claims of a gentle run (C07): a group whose claim returned no page is not asked again; no network."""
import contextlib
import io
import json
import runpy
import unittest
import urllib.error
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

class CollectorRun(unittest.TestCase):
 def run_collector(self,queue,argv,later=None,busy=None,says=True,unavailable=()):
  """queue: (provider, phase) -> page URLs. later: (provider, phase) -> (claims sent before it is due, URL).
  busy: provider -> claims sent before it is free (an active claim or a wait: empty, not exhausted).
  says: the Worker tells whether an empty claim was exhausted (False: a Worker from before C07).
  unavailable: (URL, Retry-After or None) the source answers with 503, in the order asked.
  Returns the claims sent ((provider, phase, lane, url or None)), the saved URLs and the printed lines;
  the saved results themselves are in self.sent."""
  queue={group:list(urls) for group,urls in queue.items()};claims=[];saved=[];sent=self.sent=[];errors=list(unavailable)
  class Site:
   def open(self,request,timeout):
    path=request.full_url.split('.workers.dev',1)[1]
    if path=='/api/crawl-prepare':return Response({'done':True})
    if path=='/api/crawl' and request.method=='POST':
     claim=json.loads(request.data);group=(claim['provider'],claim['phase'])
     for due in [g for g,(after,_) in (later or {}).items() if len(claims)>=after]:queue.setdefault(due,[]).append(later.pop(due)[1])
     waiting=len(claims)<(busy or {}).get(claim['provider'],0)
     url=queue[group].pop(0) if queue.get(group) and not waiting else None
     claims.append((*group,claim['lane'],url))
     answer={'jobs':[{'url':url,'kind':'detail' if claim['phase'] in ['detail','baths','names','refresh'] else 'list','prefecture':'pref-tokyo','attempts':0,'lease_token':claim['token']}] if url else [],'leaseSeconds':180}
     if says and not url:answer['exhausted']=not waiting
     return Response(answer)
    if path=='/api/crawl' and request.method=='PUT':
     sent.append(json.loads(request.data));saved.append(sent[-1]['url']);return Response({'accepted':0,'coverage':{'records':1}})
    return Response({'coverage':{'records':1,'pending':0}})
  class Guard:
   def __init__(self,*args):self.redirects=[]
   def open(self,url,*args,**kwargs):
    if errors and errors[0][0] in str(url):
     _,wait=errors.pop(0);headers=Message()
     if wait:headers['Retry-After']=wait
     raise urllib.error.HTTPError(str(url),503,'Service Unavailable',headers,None)
    return Response('<html></html>')
  output=io.StringIO()
  with patch('sys.argv',['update-site.py',*argv]),patch('sys.stdin',io.StringIO(json.dumps({'url':'https://yukemuri.example-account.workers.dev','token':SECRET})+'\n')),\
       patch('urllib.request.build_opener',return_value=Site()),patch('source_safety.SourceGuard',Guard),patch('source_safety.check_source_body'),\
       patch('collect.parse_source_page',return_value=([],{},False,{'reviewReason':None})),patch('time.sleep'),contextlib.redirect_stdout(output):
   runpy.run_path(str(ROOT/'update-site.py'),run_name='__main__')
  self.assertNotIn(SECRET,output.getvalue())
  return claims,saved,[json.loads(line) for line in output.getvalue().splitlines()],queue

class GentleClaimChecks(CollectorRun):

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

 def test_busy_provider_keeps_its_groups(self):
  # Jalan holds an active claim or waits through round 1 (Codex review of a511969):
  # its empty claims there are not exhausted, so its groups are asked again.
  jd,td=pages('jalan',3),pages('trip',3)
  claims,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','6'],busy={'jalan':9})
  self.assertEqual(saved,[td[0],jd[0],td[1],jd[1],td[2],jd[2]])
  self.assertEqual([line for line in lines if 'emptyGroup' in line],[{'emptyGroup':'trip/'+q,'round':1} for q in ['refresh','list','names']]+[{'emptyGroup':'jalan/'+q,'round':2} for q in ['baths','refresh','list','localnames']])
  self.assertEqual(len([c for c in claims if c[:2]==('jalan','baths')]),2)

 def test_worker_that_does_not_say_keeps_every_group(self):
  jd=pages('jalan',2)
  claims,saved,lines,_=self.run_collector({('jalan','detail'):jd},['--gentle','--max-pages','5'],says=False)
  self.assertEqual(saved,jd)
  self.assertEqual([c[:2] for c in claims],GENTLE*3)
  self.assertFalse([line for line in lines if 'emptyGroup' in line])

 def test_other_modes_still_ask_every_group_in_every_round(self):
  jd=pages('jalan',2)
  claims,saved,lines,_=self.run_collector({('jalan','detail'):jd},['--provider','jalan','--kind','detail','--max-pages','5'])
  self.assertEqual(saved,jd)
  self.assertEqual([c[:2] for c in claims],[('jalan','detail'),('jalan','baths')]*3)
  self.assertFalse([line for line in lines if 'emptyGroup' in line])
  self.assertIn({'rounds':3,'claims':6},lines)

class UnavailableProviderChecks(CollectorRun):
 """C09 (user 2026-10-26): Retry-After-less 503s in a row pause a provider for this run only."""
 def jalan_out(self,count,**more):
  jd,td=pages('jalan',6),pages('trip',3)
  claims,saved,lines,queue=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],unavailable=[(u,None) for u in jd[:count]],**more)
  return jd,td,claims,saved,lines,queue

 def test_three_503s_in_a_row_pause_the_provider_for_the_rest_of_the_run(self):
  jd,td,claims,saved,lines,queue=self.jalan_out(6)
  self.assertEqual(saved,[jd[0],td[0],jd[1],td[1],jd[2],td[2]],'the third 503 is the last Jalan page asked; Trip.com goes on')
  self.assertEqual([r['error'] for r in self.sent if r['url'] in jd],['http_503']*3)
  self.assertTrue(all('providerCooldownSeconds' not in r for r in self.sent),'no provider wait goes to the queue')
  self.assertFalse([c for c in claims[[c[3] for c in claims].index(jd[2])+1:] if c[0]=='jalan'],'no Jalan claim after the pause')
  self.assertEqual(queue[('jalan','detail')],jd[3:],'the other Jalan pages stay queued for the next run')
  paused=[line for line in lines if 'providerPaused' in line]
  self.assertEqual([{k:v for k,v in line.items() if k!='at'} for line in paused],[{'providerPaused':'jalan','reason':'http_503','consecutive':3}])
  self.assertRegex(paused[0]['at'],r'^\d{4}-\d\d-\d\dT')
  self.assertEqual([line['pausedProviders'] for line in lines if 'rounds' in line],[['jalan']])

 def test_two_503s_in_a_row_do_not_pause(self):
  jd,td,claims,saved,lines,queue=self.jalan_out(2)
  self.assertEqual(sorted(saved),sorted(jd+td))
  self.assertFalse([line for line in lines if 'providerPaused' in line])
  self.assertNotIn('pausedProviders',next(line for line in lines if 'rounds' in line))

 def test_another_result_starts_the_count_again(self):
  jd,td=pages('jalan',6),pages('trip',1)
  _,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],unavailable=[(jd[0],None),(jd[1],None),(jd[3],None),(jd[4],None)])
  self.assertEqual(sorted(saved),sorted(jd+td),'503, 503, done, 503, 503 is never three in a row')
  self.assertFalse([line for line in lines if 'providerPaused' in line])

 def test_retry_after_still_waits_as_before(self):
  jd,td=pages('jalan',3),pages('trip',2)
  claims,saved,lines,queue=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],unavailable=[(jd[0],'900')])
  first=next(r for r in self.sent if r['url']==jd[0])
  self.assertEqual((first['error'],first['providerCooldownSeconds']),('http_503',900),'a provider wait of the Retry-After goes to the queue')
  self.assertEqual(queue[('jalan','detail')],jd[1:])
  self.assertFalse([line for line in lines if 'providerPaused' in line])

 def test_the_next_run_asks_the_paused_provider_again(self):
  jd,td,_,_,_,queue=self.jalan_out(6)
  _,saved,lines,_=self.run_collector({('jalan','detail'):queue[('jalan','detail')]},['--gentle','--max-pages','20'])
  self.assertEqual(saved,jd[3:])
  self.assertFalse([line for line in lines if 'providerPaused' in line])

if __name__=='__main__':unittest.main()
