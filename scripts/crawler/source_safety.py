"""Small source-request guard: transparent UA, host pacing and paced safe redirects.
No credentials, cookie jars, proxy rotation, browser impersonation, or parallel fetches.
robots.txt is not requested (C08, user decision 2026-10-21); pacing does not change.
"""
import html,random,re,time,urllib.parse,urllib.request
from retry_policy import retry_after
AGENT='YukemuriCatalogUpdater'
USER_AGENT=AGENT+'/1.0 (+https://yukemuri.jihune.workers.dev)'
HOSTS={'www.jalan.net','www.trip.com','kr.trip.com'}
SITE_HOSTS={'yukemuri.jihun7891.chatgpt.site','yukemuri-hokkaido.jihun7891.chatgpt.site'}
WORKER_HOST=re.compile(r'yukemuri\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev')

def site_api(url,token):
 """Return the Yukemuri API base and headers. The key goes only to these hosts."""
 site=urllib.parse.urlsplit(url);host=site.hostname or ''
 sites=host in SITE_HOSTS
 if site.scheme!='https' or not(sites or WORKER_HOST.fullmatch(host)) or site.username or site.password:
  raise ValueError('Expected the Yukemuri Site URL')
 # Cloudflare answers the urllib default User-Agent (Python-urllib) with error 1010
 # before the Worker sees the request, so name the collector as for sources.
 headers={'X-Yukemuri-Crawl-Key':token,'User-Agent':USER_AGENT}
 # Only the Sites access gateway reads this header; the Cloudflare Worker is public.
 if sites:headers['OAI-Sites-Authorization']='Bearer '+token
 return urllib.parse.urlunsplit((site.scheme,site.netloc,'','','')),headers

class SourcePolicyDenied(ValueError):
 def __init__(self,reason,wait=60,provider_wait=0,diagnostic=None,stop_run=False,wait_reason=None):
  super().__init__(reason);self.reason=reason;self.wait=wait;self.provider_wait=provider_wait;self.diagnostic=diagnostic;self.stop_run=stop_run;self.wait_reason=wait_reason

def check_source_body(raw):
 # Inspect rendered text, not challenge vocabulary in scripts or translations.
 visible=html.unescape(re.sub(r'<[^>]+>',' ',re.sub(r'<(script|style)\b[^>]*>.*?</\1>|<!--.*?-->',' ',raw,flags=re.I|re.S)))
 title=re.search(r'<title\b[^>]*>(.*?)</title>',raw,re.I|re.S)
 blocked=re.search(r'\b(?:verify (?:that )?you are (?:a )?human|checking your browser|unusual traffic from your computer network|sending automated queries|complete the security check)\b',visible,re.I)
 if blocked or title and re.fullmatch(r'\s*(?:just a moment[.!…]*|checking your browser[.!…]*)\s*',html.unescape(title[1]),re.I):
  raise SourcePolicyDenied('source_access_bot_challenge',86400,86400,stop_run=True)

def source_url(url):
 try:
  u=urllib.parse.urlsplit(url)
  if u.scheme=='https' and u.hostname in HOSTS and not u.username and not u.password and u.port is None:return u
 except ValueError:pass
 raise SourcePolicyDenied('unsupported_source')

def property_identity(url):
 u=source_url(url)
 match=re.fullmatch(r'/yad(\d+)/?',u.path) if u.hostname=='www.jalan.net' else re.fullmatch(r'/hotels/[a-z0-9-]+-hotel-detail-(\d+)/[^/]+/?',u.path)
 return ('jalan' if u.hostname=='www.jalan.net' else 'trip',match[1]) if match else None

class SourceRedirect(SourcePolicyDenied):
 def __init__(self,source,target,code,headers):
  # The raw target stays in memory only. Query values, fragments and user info
  # never enter logs, persisted errors or source credentials.
  self.target=target;self.safe=False;diagnostic=dict(httpStatus=code,destination='unapproved destination',queryPresent=True)
  try:
   u=urllib.parse.urlsplit(target)
   public_path=bool(re.fullmatch(r'/yad\d+/?|/hotels/[a-z0-9-]+-hotel-detail-\d+/[^/]+/?',u.path))
   destination=u.scheme+'://'+(u.hostname or '')+(u.path[:300] if public_path else '/[unreviewed path]')
   diagnostic=dict(httpStatus=code,destination=destination,queryPresent=bool(u.query))
   current=source_url(source);candidate=source_url(target)
   access=bool(re.search(r'(?:^|/)(?:captcha|challenge|verify-human|bot-check)(?:/|$)',candidate.path,re.I))
   self.safe=not access and not candidate.query and not candidate.fragment and current.hostname==candidate.hostname and property_identity(source) is not None and property_identity(source)==property_identity(target) and source!=target
   # Even an ordinary unknown redirect is not followed. Hold the page only;
   # security destinations and a server-requested pause hold the provider.
   reason='source_access_bot_challenge' if access else 'source_redirect_page_review'
  except (ValueError,SourcePolicyDenied):
   reason='source_redirect_page_review'
  hint=retry_after(headers)
  if hint:self.safe=False
  wait=max(86400 if reason=='source_access_bot_challenge' else 60,hint)
  super().__init__(reason,wait,wait if reason=='source_access_bot_challenge' or hint else 0,diagnostic,wait_reason='retry_after' if hint else None)

def policy_failure(error,redirect_count=1):
 # Repetition of an ordinary redirect is still not evidence of blocking.
 return dict(status='retry',error=error.reason,retryAfterSeconds=error.wait,providerCooldownSeconds=error.provider_wait,
             **({'providerWaitReason':error.wait_reason} if error.wait_reason else {}))

class NoSourceRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if fp is not None:fp.close()
  raise SourceRedirect(req.full_url,newurl,code,headers)

class SourceGuard:
 def __init__(self,interval=8,jitter=4,request=None,sleep=time.sleep,clock=time.monotonic):
  self.interval=max(8,interval);self.jitter=max(0,jitter);self.request=request or urllib.request.build_opener(NoSourceRedirect()).open
  self.sleep=sleep;self.clock=clock;self.next_at={};self.redirects=[]
 def _request(self,url):
  req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'text/html,text/plain;q=0.8'})
  return self.request(req,timeout=30)
 def open(self,url,follow_redirects=True):
  self.redirects=[];seen={url}
  for hop in range(3):
   host=source_url(url).hostname
   self.sleep(max(0,self.next_at.get(host,0)-self.clock()))
   try:return self._request(url)
   except SourceRedirect as e:
    self.redirects.append(e.diagnostic)
    if not follow_redirects or not e.safe:raise
    if hop==2 or e.target in seen:raise SourcePolicyDenied('source_redirect_page_review',diagnostic=e.diagnostic) from None
    seen.add(e.target);url=e.target
   finally:self.next_at[host]=self.clock()+self.interval+random.uniform(0,self.jitter)
