import sys,unittest,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'crawler'))
from source_safety import SourceGuard,SourcePolicyDenied,robots_policy,robots_allowed,USER_AGENT,SourceRedirect,policy_failure,check_source_body
from retry_policy import source_failure

class Response:
 def __init__(self,data):self.data=data
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.data

class SafetyChecks(unittest.TestCase):
 def test_rules_and_agent_groups(self):
  rules,delay=robots_policy('User-agent: *\nDisallow: /hotels/private*\nAllow: /hotels/private/public$\nCrawl-delay: 11\n')
  self.assertFalse(robots_allowed(rules,'https://www.trip.com/hotels/private-room'))
  self.assertTrue(robots_allowed(rules,'https://www.trip.com/hotels/private/public'))
  self.assertFalse(robots_allowed(rules,'https://www.trip.com/hotels/private/public/more'))
  self.assertEqual(delay,11)
  rules,_=robots_policy('User-agent: *\nDisallow: /\nUser-agent: YukemuriCatalogUpdater\nAllow: /hotels/\nDisallow: /account/\n')
  self.assertTrue(robots_allowed(rules,'https://www.trip.com/hotels/normal'))
  self.assertFalse(robots_allowed(rules,'https://www.trip.com/account/private'))
 def test_host_spacing_robot_cache_and_source_headers(self):
  clock=[0.0];calls=[]
  def request(req,timeout):
   calls.append((req.full_url,clock[0],dict(req.header_items())))
   return Response(b'User-agent: *\nDisallow: /account/\nCrawl-delay: 10\n' if req.full_url.endswith('robots.txt') else b'hotel')
  def sleep(n):clock[0]+=n
  guard=SourceGuard(request=request,sleep=sleep,clock=lambda:clock[0])
  guard.open('https://www.jalan.net/yad123456/');guard.open('https://www.jalan.net/yad123457/')
  self.assertEqual(len(calls),3);self.assertGreaterEqual(calls[1][1]-calls[0][1],10);self.assertGreaterEqual(calls[2][1]-calls[1][1],10)
  for _,_,headers in calls:
   self.assertEqual(headers['User-agent'],USER_AGENT)
   self.assertFalse(any('authorization' in k.lower() or 'crawl-key' in k.lower() or 'cookie' in k.lower() for k in headers))
 def test_denied_unavailable_and_unknown_hosts(self):
  calls=[]
  def denied(req,timeout):calls.append(req.full_url);return Response(b'User-agent: *\nDisallow: /yad\n')
  guard=SourceGuard(request=denied,sleep=lambda x:None)
  with self.assertRaises(SourcePolicyDenied):guard.open('https://www.jalan.net/yad123456/')
  self.assertEqual(len(calls),1)
  def unavailable(req,timeout):raise urllib.error.HTTPError(req.full_url,503,'unavailable',{},None)
  with self.assertRaises(SourcePolicyDenied):SourceGuard(request=unavailable).open('https://www.trip.com/hotels/test')
  with self.assertRaises(SourcePolicyDenied):guard.open('https://evil.example/yad123456/')
  with self.assertRaises(SourcePolicyDenied):robots_policy('<html>Sign in to continue</html>')
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
 def test_safe_redirect_is_paced_and_robots_checked(self):
  clock=[0.0];calls=[];url='https://www.jalan.net/yad329012/'
  def request(req,timeout):
   calls.append((req.full_url,clock[0]))
   if req.full_url.endswith('robots.txt'):return Response(b'User-agent: *\nAllow: /\n')
   if req.full_url==url:raise SourceRedirect(url,url.rstrip('/'),301,{})
   return Response(b'hotel')
  guard=SourceGuard(request=request,sleep=lambda n:clock.__setitem__(0,clock[0]+n),clock=lambda:clock[0],jitter=0)
  self.assertEqual(guard.open(url).read(),b'hotel');self.assertEqual(len(calls),3)
  self.assertGreaterEqual(calls[2][1]-calls[1][1],8)
  with self.assertRaises(SourceRedirect):guard.open(url,follow_redirects=False)
  self.assertEqual(calls[-1][0],url)
  def denied_target(req,timeout):
   if req.full_url.endswith('robots.txt'):return Response(b'User-agent: *\nDisallow: /yad329012$\n')
   raise SourceRedirect(url,url.rstrip('/'),301,{})
  with self.assertRaisesRegex(SourcePolicyDenied,'robots_disallowed'):SourceGuard(request=denied_target,sleep=lambda n:None).open(url)
 def test_redirect_loop_unknown_target_and_robots_redirect_stop(self):
  url='https://www.jalan.net/yad329012/';calls=[]
  def looping(req,timeout):
   calls.append(req.full_url)
   if req.full_url.endswith('robots.txt'):return Response(b'User-agent: *\nAllow: /\n')
   raise SourceRedirect(req.full_url,url.rstrip('/') if req.full_url==url else url,302,{})
  with self.assertRaisesRegex(SourcePolicyDenied,'source_redirect_page_review'):SourceGuard(request=looping,sleep=lambda n:None).open(url)
  self.assertEqual(len(calls),3,'A loop never makes a third page request')
  def robots_redirect(req,timeout):raise SourceRedirect(req.full_url,url,302,{})
  with self.assertRaisesRegex(SourcePolicyDenied,'robots_redirect_requires_review') as caught:SourceGuard(request=robots_redirect,sleep=lambda n:None).open(url)
  self.assertEqual(caught.exception.provider_wait,0);self.assertTrue(caught.exception.stop_run)
  def unknown(req,timeout):
   calls.append(req.full_url)
   if req.full_url.endswith('robots.txt'):return Response(b'User-agent: *\nAllow: /\n')
   raise SourceRedirect(url,url+'?unknown=private-value',302,{})
  calls.clear()
  with self.assertRaises(SourceRedirect) as caught:SourceGuard(request=unknown,sleep=lambda n:None).open(url)
  self.assertEqual(len(calls),2);self.assertNotIn('private-value',str(caught.exception.diagnostic))

 def test_clear_challenge_and_ordinary_hotel_bodies(self):
  for raw in ['<title>Just a moment...</title>','<p>Verify you are human</p>','<p>Unusual traffic from your computer network</p>']:
   with self.assertRaisesRegex(SourcePolicyDenied,'source_access_bot_challenge') as caught:check_source_body(raw)
   self.assertEqual(caught.exception.provider_wait,86400)
  for raw in ['<title>温泉ホテル</title><script>"Verify you are human"</script>','<title>Sign in</title>','<p>温泉旅館</p><!-- Checking your browser -->']:
   check_source_body(raw)
  error=SourceRedirect('https://www.jalan.net/yad329012/','https://www.jalan.net/captcha/',302,{})
  self.assertEqual(policy_failure(error)['providerCooldownSeconds'],86400)
 def test_robots_fail_closed_without_inventing_future_pause(self):
  for data in [b'<html>Sign in</html>',b'User-agent: *\nCrawl-delay: broken\n']:
   calls=[]
   def request(req,timeout):calls.append(req.full_url);return Response(data)
   with self.assertRaises(SourcePolicyDenied) as caught:SourceGuard(request=request).open('https://www.jalan.net/yad329012/')
   self.assertEqual(len(calls),1);self.assertTrue(caught.exception.stop_run);self.assertEqual(caught.exception.provider_wait,0)
  for code,headers,minimum in [(503,{},0),(503,{'Retry-After':'900'},900),(403,{},86400),(429,{},21600)]:
   def request(req,timeout):raise urllib.error.HTTPError(req.full_url,code,'test',headers,None)
   with self.assertRaises(SourcePolicyDenied) as caught:SourceGuard(request=request).open('https://www.jalan.net/yad329012/')
   self.assertTrue(caught.exception.stop_run);self.assertEqual(caught.exception.provider_wait,minimum)

if __name__=='__main__':unittest.main()
