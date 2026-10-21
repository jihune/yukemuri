import sys,unittest,urllib.error
from itertools import pairwise
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent/'crawler'))
from source_safety import SourceGuard,SourcePolicyDenied,USER_AGENT,SourceRedirect,policy_failure,check_source_body
from retry_policy import source_failure

class Response:
 def __init__(self,data):self.data=data
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.data

def paced(**kwargs):
 """A guard on a fake clock; calls holds (url, time, headers) of every request."""
 clock=[0.0];calls=[]
 def request(req,timeout):
  calls.append((req.full_url,clock[0],dict(req.header_items())))
  return Response(b'User-agent: *\nDisallow: /\nCrawl-delay: 1\n' if req.full_url.endswith('/robots.txt') else b'hotel')
 return SourceGuard(request=request,sleep=lambda n:clock.__setitem__(0,clock[0]+n),clock=lambda:clock[0],**kwargs),calls

class SafetyChecks(unittest.TestCase):
 # C08 (user decision 2026-10-21): robots.txt is never requested and a robots.txt
 # Disallow no longer stops a page, so only the pages themselves are requested.
 def test_only_the_pages_are_requested(self):
  guard,calls=paced()
  urls=['https://www.jalan.net/yad123456/','https://www.trip.com/hotels/tokyo-hotel-detail-1/a/','https://www.jalan.net/yad123457/']
  for url in urls:self.assertEqual(guard.open(url).read(),b'hotel')
  self.assertEqual([c[0] for c in calls],urls)
  self.assertFalse([c for c in calls if 'robots' in c[0]])
 # Pacing did not shrink with robots.txt gone: one host waits at least the
 # interval (never under 8 seconds) plus up to the jitter between requests.
 def test_host_spacing_did_not_shrink(self):
  for interval,jitter,gap in [(8,0,8),(3,0,8),(0,0,8),(10,0,10),(8,4,8)]:
   guard,calls=paced(interval=interval,jitter=jitter)
   for n in range(4):guard.open(f'https://www.jalan.net/yad12345{n}/')
   gaps=[b[1]-a[1] for a,b in pairwise(calls)]
   self.assertEqual(len(gaps),3);self.assertTrue(all(g>=gap for g in gaps),(interval,jitter,gaps))
  for draw,gap in [(0,8),(4,12)]:
   with patch('source_safety.random.uniform',lambda a,b,draw=draw:draw if (a,b)==(0,4) else None):
    guard,calls=paced()
    guard.open('https://www.jalan.net/yad123456/');guard.open('https://www.jalan.net/yad123457/')
   self.assertEqual(calls[1][1]-calls[0][1],gap,'the default 8 seconds plus a jitter draw of 0 to 4')
  guard,calls=paced(jitter=0)
  guard.open('https://www.jalan.net/yad123456/');guard.open('https://www.trip.com/hotels/tokyo-hotel-detail-1/a/');guard.open('https://www.jalan.net/yad123457/')
  self.assertEqual([c[1] for c in calls],[0,0,8],'each host keeps its own spacing')
 def test_source_headers(self):
  guard,calls=paced()
  guard.open('https://www.jalan.net/yad123456/')
  for _,_,headers in calls:
   self.assertEqual(headers['User-agent'],USER_AGENT)
   self.assertFalse(any('authorization' in k.lower() or 'crawl-key' in k.lower() or 'cookie' in k.lower() for k in headers))
 def test_unknown_hosts_and_page_errors(self):
  guard,calls=paced()
  for url in ['https://evil.example/yad123456/','http://www.jalan.net/yad123456/','https://www.jalan.net:8443/yad123456/']:
   with self.assertRaisesRegex(SourcePolicyDenied,'unsupported_source'):guard.open(url)
  self.assertEqual(calls,[])
  # A page error reaches the caller, which pauses only that page (retry_policy).
  def unavailable(req,timeout):raise urllib.error.HTTPError(req.full_url,503,'unavailable',{},None)
  with self.assertRaises(urllib.error.HTTPError):SourceGuard(request=unavailable,sleep=lambda n:None).open('https://www.trip.com/hotels/tokyo-hotel-detail-1/a/')
 def test_cooldown_does_not_ignore_retry_after(self):
  for code,minimum in [(403,86400),(429,21600)]:
   e=urllib.error.HTTPError('https://www.trip.com/hotels/test',code,'blocked',{'Retry-After':'100000'},None)
   policy=source_failure(e,0,jitter=0)
   self.assertGreaterEqual(policy['providerCooldownSeconds'],minimum)
   self.assertGreaterEqual(policy['retryAfterSeconds'],100000)
   self.assertEqual(policy['providerCooldownSeconds'],policy['retryAfterSeconds'])
 def test_ordinary_errors_retry_only_the_page(self):
  for error in [ValueError('format'),TimeoutError('timeout'),urllib.error.URLError('offline'),urllib.error.HTTPError('https://www.trip.com/hotels/test',503,'unavailable',{},None)]:
   policy=source_failure(error,0,jitter=0)
   self.assertEqual(policy['status'],'retry')
   self.assertEqual(policy['providerCooldownSeconds'],0)
   self.assertEqual(policy['retryAfterSeconds'],60)

 def test_redirect_page_isolation_and_security_pauses(self):
  url='https://www.jalan.net/yad329012/'
  page=SourceRedirect(url,url+'?screenId=UWW3001',302,{})
  self.assertFalse(page.safe);self.assertEqual(policy_failure(page)['providerCooldownSeconds'],0)
  self.assertEqual(policy_failure(page,2)['providerCooldownSeconds'],0)
  self.assertEqual(page.wait,60)
  for target in ['https://www.jalan.net/login/?token=secret','https://other.example/yad329012/','http://www.jalan.net/yad329012/','https://www.jalan.net:443/yad329012/','https://user:secret@www.jalan.net/yad329012/']:
   error=SourceRedirect(url,target,302,{})
   self.assertFalse(error.safe);self.assertEqual(policy_failure(error)['providerCooldownSeconds'],0)
   self.assertNotIn('secret',str(error.diagnostic))
  wait=SourceRedirect(url,url.rstrip('/'),301,{'Retry-After':'100000'})
  self.assertFalse(wait.safe);self.assertEqual(policy_failure(wait)['providerCooldownSeconds'],100000)
  changed=SourceRedirect(url,'https://www.jalan.net/yad999999/',302,{})
  self.assertFalse(changed.safe);self.assertEqual(policy_failure(changed)['providerCooldownSeconds'],0)
 def test_safe_redirect_is_paced(self):
  clock=[0.0];calls=[];url='https://www.jalan.net/yad329012/'
  def request(req,timeout):
   calls.append((req.full_url,clock[0]))
   if req.full_url==url:raise SourceRedirect(url,url.rstrip('/'),301,{})
   return Response(b'hotel')
  guard=SourceGuard(request=request,sleep=lambda n:clock.__setitem__(0,clock[0]+n),clock=lambda:clock[0],jitter=0)
  self.assertEqual(guard.open(url).read(),b'hotel');self.assertEqual([c[0] for c in calls],[url,url.rstrip('/')])
  self.assertGreaterEqual(calls[1][1]-calls[0][1],8)
  with self.assertRaises(SourceRedirect):guard.open(url,follow_redirects=False)
  self.assertEqual(calls[-1][0],url);self.assertGreaterEqual(calls[-1][1]-calls[-2][1],8)
 def test_redirect_loop_and_unknown_target(self):
  url='https://www.jalan.net/yad329012/';calls=[]
  def looping(req,timeout):
   calls.append(req.full_url)
   raise SourceRedirect(req.full_url,url.rstrip('/') if req.full_url==url else url,302,{})
  with self.assertRaisesRegex(SourcePolicyDenied,'source_redirect_page_review'):SourceGuard(request=looping,sleep=lambda n:None).open(url)
  self.assertEqual(len(calls),2,'A loop never makes a third page request')
  def unknown(req,timeout):
   calls.append(req.full_url)
   raise SourceRedirect(url,url+'?unknown=private-value',302,{})
  calls.clear()
  with self.assertRaises(SourceRedirect) as caught:SourceGuard(request=unknown,sleep=lambda n:None).open(url)
  self.assertEqual(len(calls),1);self.assertNotIn('private-value',str(caught.exception.diagnostic))

 def test_clear_challenge_and_ordinary_hotel_bodies(self):
  for raw in ['<title>Just a moment...</title>','<p>Verify you are human</p>','<p>Unusual traffic from your computer network</p>']:
   with self.assertRaisesRegex(SourcePolicyDenied,'source_access_bot_challenge') as caught:check_source_body(raw)
   self.assertEqual(caught.exception.provider_wait,86400)
  for raw in ['<title>温泉ホテル</title><script>"Verify you are human"</script>','<title>Sign in</title>','<p>温泉旅館</p><!-- Checking your browser -->']:
   check_source_body(raw)
  error=SourceRedirect('https://www.jalan.net/yad329012/','https://www.jalan.net/captcha/',302,{})
  self.assertEqual(policy_failure(error)['providerCooldownSeconds'],86400)

if __name__=='__main__':unittest.main()
