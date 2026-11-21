"""Claims of a gentle run (C07): a group whose claim returned no page is not asked again; no network."""
import contextlib
import io
import json
import runpy
import unittest
import http.client
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
 def run_collector(self,queue,argv,later=None,busy=None,says=True,unavailable=(),parse_fails=None,refuse=None,refuse_report=(),attempts=None,catch=False):
  """queue: (provider, phase) -> page URLs. later: (provider, phase) -> (claims sent before it is due, URL).
  busy: provider -> claims sent before it is free (an active claim or a wait: empty, not exhausted).
  says: the Worker tells whether an empty claim was exhausted (False: a Worker from before C07).
  unavailable: (URL, Retry-After or None[, HTTP status, 503 when left out]) the source answers with an
  error, in the order asked.
  parse_fails: URL -> the exception the parser raises on that page. refuse: URL -> the HTTP status the Site
  answers to that page's data PUT (done or skipped); refuse_report: URLs whose failure PUT (retry or failed)
  it refuses with 400 too. attempts: URL -> attempts the queue row already has. catch: keep the exception
  that ends the run in self.stopped (None: the run ended normally) instead of raising it.
  Returns the claims sent ((provider, phase, lane, url or None)), the saved URLs and the printed lines;
  the saved results themselves are in self.sent. Also kept: self.requests (every claim and PUT the Site
  got, a refused PUT too, as (method, URL, status, error)), self.tokens (URL -> its claim token) and
  self.opened (what the source was asked for)."""
  queue={group:list(urls) for group,urls in queue.items()};claims=[];saved=[];sent=self.sent=[];errors=list(unavailable)
  requests=self.requests=[];tokens=self.tokens={};opened=self.opened=[];self.stopped=None
  class Site:
   def open(self,request,timeout):
    path=request.full_url.split('.workers.dev',1)[1]
    if path=='/api/crawl-prepare':return Response({'done':True})
    if path=='/api/crawl' and request.method=='POST':
     claim=json.loads(request.data);group=(claim['provider'],claim['phase'])
     for due in [g for g,(after,_) in (later or {}).items() if len(claims)>=after]:queue.setdefault(due,[]).append(later.pop(due)[1])
     waiting=len(claims)<(busy or {}).get(claim['provider'],0)
     url=queue[group].pop(0) if queue.get(group) and not waiting else None
     claims.append((*group,claim['lane'],url));requests.append(('POST',url,None,None))
     if url:tokens[url]=claim['token']
     answer={'jobs':[{'url':url,'kind':'detail' if claim['phase'] in ['detail','baths','names','refresh'] else 'list','prefecture':'pref-tokyo','attempts':(attempts or {}).get(url,0),'lease_token':claim['token']}] if url else [],'leaseSeconds':180}
     if says and not url:answer['exhausted']=not waiting
     return Response(answer)
    if path=='/api/crawl' and request.method=='PUT':
     body=json.loads(request.data);requests.append(('PUT',body['url'],body['status'],body.get('error')))
     code=(refuse or {}).get(body['url']) if body['status'] in ['done','skipped'] else 400 if body['url'] in refuse_report else None
     if code:raise urllib.error.HTTPError(request.full_url,code,'Refused',Message(),None)
     sent.append(body);saved.append(body['url']);return Response({'accepted':0,'coverage':{'records':1}})
    return Response({'coverage':{'records':1,'pending':0}})
  class Guard:
   def __init__(self,*args):self.redirects=[]
   def open(self,url,*args,**kwargs):
    opened.append(str(url))
    if errors and errors[0][0] in str(url):
     _,wait,*code=errors.pop(0);headers=Message()
     if wait:headers['Retry-After']=wait
     raise urllib.error.HTTPError(str(url),code[0] if code else 503,'Source error',headers,None)
    return Response('<html></html>')
  def parse(raw,provider,url,*args,**kwargs):
   if url in (parse_fails or {}):raise parse_fails[url]
   # A page the Site will refuse carries data, so a failure report is seen to leave it out.
   if url in (refuse or {}):return [{'id':'jalan-1'}],{'https://www.jalan.net/yad1/':('detail','pref-tokyo')},False,{'reviewReason':None}
   return [],{},False,{'reviewReason':None}
  output=io.StringIO()
  with patch('sys.argv',['update-site.py',*argv]),patch('sys.stdin',io.StringIO(json.dumps({'url':'https://yukemuri.example-account.workers.dev','token':SECRET})+'\n')),\
       patch('urllib.request.build_opener',return_value=Site()),patch('source_safety.SourceGuard',Guard),patch('source_safety.check_source_body'),\
       patch('collect.parse_source_page',side_effect=parse),patch('time.sleep'),contextlib.redirect_stdout(output):
   try:runpy.run_path(str(ROOT/'update-site.py'),run_name='__main__')
   except Exception as error:
    if not catch:raise
    self.stopped=error
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

 def test_another_error_starts_the_count_again(self):
  jd,td=pages('jalan',6),pages('trip',1)
  _,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],unavailable=[(jd[0],None),(jd[1],None),(jd[2],None,404),(jd[3],None),(jd[4],None)])
  self.assertEqual([r['error'] for r in self.sent if r['url'] in jd[:5]],['http_503','http_503','http_404','http_503','http_503'])
  self.assertEqual(sorted(saved),sorted(jd+td),'503, 503, 404, 503, 503 is never three 503s in a row')
  self.assertFalse([line for line in lines if 'providerPaused' in line])

 def test_other_errors_in_a_row_do_not_pause(self):
  # Normal runs get 404s and redirects for review now and then (C09 measurement); only 503s count.
  jd,td=pages('jalan',6),pages('trip',1)
  _,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],unavailable=[(u,None,404) for u in jd[:4]])
  self.assertEqual([r['error'] for r in self.sent if r['url'] in jd[:4]],['http_404']*4)
  self.assertEqual(sorted(saved),sorted(jd+td))
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

class PageFailureChecks(CollectorRun):
 """V01-1: what is not the source's answer fails that one page, not the run. Three such pages in a row
 from one provider and kind end the run, after their failures are reported."""
 def failure(self,url):
  return next(r for r in self.sent if r['url']==url)

 def reported_by_the_collector(self,url):
  report=self.failure(url)
  self.assertEqual(report.get('claimToken'),self.tokens[url],f'{url} is reported with the claim it holds')
  self.assertEqual((report['observations'],report['links']),([],[]),'a failed page reports no data')
  self.assertFalse({'providerCooldownSeconds','providerWaitReason'}&set(report),'the collector\'s own failure puts no wait on the provider')
  return report

 def test_exception_of_the_parser_fails_that_page_only(self):
  for error in [AttributeError("'list' object has no attribute 'get'"),TypeError('argument of type NoneType is not iterable'),LookupError('unknown encoding: x-unknown'),http.client.IncompleteRead(b'ab')]:
   with self.subTest(error=type(error).__name__):
    jd,td=pages('jalan',4),pages('trip',2)
    _,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],parse_fails={jd[1]:error},catch=True)
    self.assertIsNone(self.stopped,'a page the parser cannot read fails that page, not the run')
    report=self.reported_by_the_collector(jd[1])
    self.assertEqual((report['status'],report['error']),('retry',type(error).__name__))
    self.assertGreaterEqual(report['retryAfterSeconds'],60)
    self.assertEqual(sorted(saved),sorted(jd+td),'the other pages are read and saved')
    diagnostic=[line for line in lines if line.get('url')==jd[1] and line.get('sourceDiagnostic')]
    self.assertEqual([(line['error'],line['stage']) for line in diagnostic],[(type(error).__name__,'source_parse')],'the log names the exception and the stage')

 def test_third_attempt_of_such_a_page_is_failed(self):
  jd=pages('jalan',3)
  self.run_collector({('jalan','detail'):jd},['--gentle','--max-pages','20'],parse_fails={jd[1]:AttributeError('x')},attempts={jd[1]:2},catch=True)
  self.assertEqual((self.failure(jd[1])['status'],self.failure(jd[1])['error']),('failed','AttributeError'))

 def test_data_the_site_refuses_fails_that_page_with_the_same_claim(self):
  for code,tries,status in [(400,0,'retry'),(413,2,'failed')]:
   with self.subTest(code=code):
    jd,td=pages('jalan',4),pages('trip',2)
    _,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],refuse={jd[1]:code},attempts={jd[1]:tries},catch=True)
    self.assertIsNone(self.stopped,'a page the Site refuses fails that page, not the run')
    refused=self.requests.index(('PUT',jd[1],'done',None))
    self.assertEqual(self.requests[refused+1],('PUT',jd[1],status,f'site_contract_{code}'),'the very next request reports that page failed under the same address')
    self.reported_by_the_collector(jd[1])
    self.assertEqual(sorted(saved),sorted(jd+td),'the other pages are read and saved')
    self.assertIn({'sourceDiagnostic':True,'url':jd[1],'reason':f'site_contract_{code}','httpStatus':code,'stage':'site_put','observations':1,'links':1},lines)

 def test_three_such_pages_in_a_row_from_one_provider_end_the_run(self):
  jd,td=pages('jalan',6),pages('trip',3)
  for cause,more,name in [('the Site refuses the data',dict(refuse={u:400 for u in jd[:3]}),'site_contract_400'),('the parser raises',dict(parse_fails={u:AttributeError('x') for u in jd[:3]}),'AttributeError')]:
   with self.subTest(cause=cause):
    _,saved,lines,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],catch=True,**more)
    self.assertIsInstance(self.stopped,RuntimeError,'the third page ends the run')
    self.assertIn('3 jalan detail pages in a row',str(self.stopped))
    self.assertEqual(saved,[jd[0],td[0],jd[1],td[1],jd[2]],'the three pages are reported, the Trip.com pages between them are saved, and nothing is asked after')
    self.assertEqual([r['error'] for r in self.sent if r['url'] in jd],[name]*3,'the three pages are reported before the run ends')
    self.assertFalse([line for line in lines if 'rounds' in line],'a stopped run prints no summary')

 def test_unsupported_queue_address_fails_that_page_and_counts_too(self):
  bad=['https://WWW.JALAN.NET/yad90000'+str(i)+'/' for i in range(3)]
  jd=pages('jalan',2)
  _,saved,_,_=self.run_collector({('jalan','detail'):[bad[0],*jd]},['--gentle','--max-pages','20'],catch=True)
  self.assertIsNone(self.stopped,'one unsupported address does not end the run')
  report=self.reported_by_the_collector(bad[0])
  self.assertEqual((report['status'],report['error']),('failed','queue_url_unsupported'),'it cannot become supported, so no retries')
  self.assertEqual(saved,[bad[0],*jd])
  self.assertFalse([u for u in self.opened if 'WWW' in u],'the source is not asked for an address the collector does not support')
  self.run_collector({('jalan','detail'):[*bad,*jd]},['--gentle','--max-pages','20'],catch=True)
  self.assertIsInstance(self.stopped,RuntimeError,'three unsupported addresses in a row end the run')

 def test_pages_of_another_kind_do_not_start_the_count_again(self):
  # A gentle run mixes a provider's detail and list pages: a detail parser that fails while the list pages read is still a bug.
  jd=pages('jalan',8);jl=[f'https://www.jalan.net/010000/LRG_010200/page{i}.html' for i in range(1,9)]
  self.run_collector({('jalan','detail'):jd,('jalan','list'):jl},['--gentle','--max-pages','40'],parse_fails={u:AttributeError('x') for u in jd},catch=True)
  self.assertIsInstance(self.stopped,RuntimeError,'list pages read between them do not start the count again')
  self.assertEqual([r['url'] for r in self.sent if r['url'] in jd],jd[:3],'the third detail page ends the run')

 def test_a_page_read_normally_starts_the_count_again(self):
  jd,td=pages('jalan',6),pages('trip',2)
  _,saved,_,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],refuse={u:400 for u in [jd[0],jd[1],jd[3],jd[4]]},catch=True)
  self.assertIsNone(self.stopped,'two, a good page, two is never three in a row')
  self.assertEqual(sorted(saved),sorted(jd+td))

 def test_the_count_is_per_provider(self):
  jd,td=pages('jalan',4),pages('trip',4)
  _,saved,_,_=self.run_collector({('jalan','detail'):jd,('trip','detail'):td},['--gentle','--max-pages','20'],refuse={u:400 for u in [jd[0],jd[1],td[0],td[1]]},catch=True)
  self.assertIsNone(self.stopped,'two pages from each provider are not three in a row from one')
  self.assertEqual(sorted(saved),sorted(jd+td))

 def test_access_errors_still_end_the_run(self):
  jd=pages('jalan',4)
  self.run_collector({('jalan','detail'):jd},['--gentle','--max-pages','20'],refuse={jd[1]:403},catch=True)
  self.assertIsInstance(self.stopped,urllib.error.HTTPError,'a 403 on a data PUT ends the run as before')
  self.assertEqual(self.stopped.code,403)
  self.assertEqual(self.requests[-1],('PUT',jd[1],'done',None),'no failure report follows a 403')

 def test_a_refused_failure_report_ends_the_run(self):
  for cause,more,name in [('the Site refused the data',dict(refuse={pages('jalan',4)[1]:400}),'site_contract_400'),('the parser raised',dict(parse_fails={pages('jalan',4)[1]:AttributeError('x')}),'AttributeError')]:
   with self.subTest(cause=cause):
    jd=pages('jalan',4)
    self.run_collector({('jalan','detail'):jd},['--gentle','--max-pages','20'],refuse_report={jd[1]},catch=True,**more)
    self.assertIsInstance(self.stopped,urllib.error.HTTPError,'a failure report the Site refuses ends the run as before')
    self.assertEqual([r for r in self.requests if r[0]=='PUT' and r[1]==jd[1] and r[2]!='done'],[('PUT',jd[1],'retry',name)],'the failure is reported once, not again')

if __name__=='__main__':unittest.main()
