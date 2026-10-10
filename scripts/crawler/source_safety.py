"""Small source-request guard: transparent UA, robots and paced safe redirects.
No credentials, cookie jars, proxy rotation, browser impersonation, or parallel fetches.
"""
import html,random,re,time,urllib.error,urllib.parse,urllib.request
from retry_policy import retry_after
AGENT='YukemuriCatalogUpdater'
USER_AGENT=AGENT+'/1.0 (+https://yukemuri.jihun7891.chatgpt.site)'
HOSTS={'www.jalan.net','www.trip.com','kr.trip.com'}

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
   public_path=bool(re.fullmatch(r'/yad\d+/?|/robots\.txt|/hotels/[a-z0-9-]+-hotel-detail-\d+/[^/]+/?',u.path))
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

def robots_policy(text,agent=AGENT):
 groups=[];agents=[];rules=[];delay=0;seen_rules=False
 def finish():
  if agents:groups.append((agents[:],rules[:],delay))
 for raw in text.splitlines():
  line=raw.split('#',1)[0].strip()
  if ':' not in line:continue
  key,value=line.split(':',1);key=key.strip().lower();value=value.strip()
  if key=='user-agent':
   if seen_rules:finish();agents=[];rules=[];delay=0;seen_rules=False
   agents.append(value.lower())
  elif agents:
   if key in ('allow','disallow'):
    seen_rules=True
    if value:rules.append((key=='allow',value))
   elif key=='crawl-delay':
    seen_rules=True
    try:delay=max(delay,float(value))
    except ValueError:raise SourcePolicyDenied('invalid_robots_crawl_delay') from None
   elif key=='request-rate':
    seen_rules=True
    try:
     requests,seconds=map(float,value.split('/'));delay=max(delay,seconds/requests)
    except (ValueError,ZeroDivisionError):raise SourcePolicyDenied('invalid_robots_request_rate') from None
 finish()
 if text.strip() and not groups:raise SourcePolicyDenied('robots_response_requires_review')
 ranked=[(max((len(a) for a in ag if a!='*' and a in agent.lower()),default=0),ag,ru,de) for ag,ru,de in groups]
 best=max((x[0] for x in ranked),default=0)
 selected=[x for x in ranked if x[0]==best and (best>0 or '*' in x[1])]
 return [r for x in selected for r in x[2]],max((x[3] for x in selected),default=0)

def robots_allowed(rules,url):
 u=urllib.parse.urlsplit(url);path=u.path+('?' + u.query if u.query else '')
 matched=[]
 for allow,pattern in rules:
  end=pattern.endswith('$');p=pattern[:-1] if end else pattern
  regex='^'+'.*'.join(re.escape(part) for part in p.split('*'))+('$' if end else '')
  if re.search(regex,path):matched.append((len(p.replace('*','')),allow))
 return max(matched,default=(0,True))[1]

class SourceGuard:
 def __init__(self,interval=8,jitter=4,request=None,sleep=time.sleep,clock=time.monotonic):
  self.interval=max(8,interval);self.jitter=max(0,jitter);self.request=request or urllib.request.build_opener(NoSourceRedirect()).open
  self.sleep=sleep;self.clock=clock;self.policies={};self.next_at={};self.redirects=[]
 def _url(self,url):
  return source_url(url)
 def _request(self,url):
  req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'text/html,text/plain;q=0.8'})
  return self.request(req,timeout=30)
 def check(self,url):
  u=self._url(url);host=u.hostname
  if host not in self.policies:
   try:
    with self._request('https://'+host+'/robots.txt') as response:
     data=response.read(131073)
     if len(data)>131072:raise SourcePolicyDenied('robots_response_too_large')
     rules,delay=robots_policy(data.decode('utf-8-sig',errors='replace'))
   except SourceRedirect as e:raise SourcePolicyDenied('robots_redirect_requires_review' if not e.provider_wait else e.reason,e.wait,e.provider_wait,e.diagnostic,stop_run=True,wait_reason=e.wait_reason) from None
   except urllib.error.HTTPError as e:
    if e.code in (404,410):rules,delay=[],0
    else:
     from retry_policy import source_failure
     policy=source_failure(e,0)
     raise SourcePolicyDenied('robots_http_'+str(e.code),policy['retryAfterSeconds'],policy['providerCooldownSeconds'],stop_run=True,wait_reason=policy.get('providerWaitReason')) from None
   except (urllib.error.URLError,TimeoutError,OSError):raise SourcePolicyDenied('robots_unavailable',stop_run=True) from None
   except SourcePolicyDenied as e:e.stop_run=True;raise
   if not 0<=delay<=120:raise SourcePolicyDenied('robots_crawl_delay_requires_review',stop_run=True)
   self.policies[host]=(rules,delay)
   self.next_at[host]=self.clock()+max(self.interval,delay)
  rules,delay=self.policies[host]
  if not robots_allowed(rules,url):raise SourcePolicyDenied('robots_disallowed')
  return host,delay
 def open(self,url,follow_redirects=True):
  self.redirects=[];seen={url}
  for hop in range(3):
   host,delay=self.check(url)
   self.sleep(max(0,self.next_at.get(host,0)-self.clock()))
   try:return self._request(url)
   except SourceRedirect as e:
    self.redirects.append(e.diagnostic)
    if not follow_redirects or not e.safe:raise
    if hop==2 or e.target in seen:raise SourcePolicyDenied('source_redirect_page_review',diagnostic=e.diagnostic) from None
    seen.add(e.target);url=e.target
   finally:self.next_at[host]=self.clock()+max(self.interval,delay)+random.uniform(0,self.jitter)
