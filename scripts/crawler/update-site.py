#!/usr/bin/env python3
"""Resume the hosted queue and write observations without rebuilding the Site.

Supply {url, token} once on stdin. Token is sent ONLY to the approved Yukemuri
Site (source_safety.site_api), never to source websites.
"""
import argparse
import json
import sys
import time
import re
import uuid
import random
import hashlib
from pathlib import Path
from retry_policy import source_failure
from source_safety import SourceGuard,SourcePolicyDenied,policy_failure,check_source_body,site_api
import urllib.error
import urllib.parse
import urllib.request
from collect import canonical, now, source_request_url, provider_id, parse_source_page, parse_locale_names, json_hotels

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--max-pages',type=int,default=40)
parser.add_argument('--refresh-only',action='store_true',help='Recheck due completed/failed lists and details for changes')
parser.add_argument('--health-only',action='store_true',help='Read protected aggregate quality and queue diagnostics without collecting')
parser.add_argument('--prepare-only',action='store_true',help='Resume bounded search and collection-priority maintenance without source crawling')
parser.add_argument('--interval',type=float,default=8)
parser.add_argument('--jitter',type=float,default=4)
parser.add_argument('--gentle',action='store_true',help='Mix small discovery/detail/refresh batches under the same host guard')
parser.add_argument('--diagnostic-dir',help='Save public source bodies locally for offline diagnosis; never writes Site credentials')
parser.add_argument('--url',help='Recheck one queued, verified source URL')
parser.add_argument('--diagnose-source',action='store_true',help='Inspect one public source without following redirects or changing the queue')
parser.add_argument('--provider',choices=['jalan','trip'])
parser.add_argument('--kind',choices=['list','detail'])
parser.add_argument('--enrich-names',action='store_true',help='Revisit Trip.com detail pages missing multilingual names')
parser.add_argument('--enrich-baths',action='store_true',help='Revisit Jalan details missing bath/High Class metadata')
args=parser.parse_args()
if args.enrich_names:
 args.provider='trip';args.kind='detail'
if args.enrich_baths:
 args.provider='jalan';args.kind='detail'
if sys.stdin.isatty():
 import termios
 previous=termios.tcgetattr(sys.stdin);hidden=termios.tcgetattr(sys.stdin);hidden[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
 print('Ready for private Site access JSON on stdin (input is hidden).',flush=True)
 try:access=json.loads(sys.stdin.readline())
 finally:termios.tcsetattr(sys.stdin,termios.TCSANOW,previous)
else:access=json.loads(sys.stdin.readline())
base,site_headers=site_api(access['url'],access['token'])
class NoSiteRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):
  raise RuntimeError('Private Site redirected; credential was not forwarded')
site_opener=urllib.request.build_opener(NoSiteRedirect())

def api(path,payload=None,method=None):
 body=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
 headers={**site_headers,'Content-Type':'application/json'}
 request=urllib.request.Request(base+path,data=body,headers=headers,method=method or ('PUT' if payload is not None else 'GET'))
 # Observation and acknowledgement writes are idempotent. Retry transient
 # network/service failures briefly; access failures stop the run.
 for attempt in range(3):
  try:
   with site_opener.open(request,timeout=90) as response:return json.loads(response.read())
  except urllib.error.HTTPError as error:
   if error.code<500 or attempt==2:raise
  except (urllib.error.URLError,TimeoutError):
   if attempt==2:raise
  time.sleep(2**attempt*(0.5+random.random()/2))

if args.health_only:
 print(json.dumps(api('/api/crawl?report=1'),ensure_ascii=False),flush=True)
 sys.exit(0)

def save_source_body(url,body,enc,headers):
 if not args.diagnostic_dir:return
 target=Path(args.diagnostic_dir);target.mkdir(parents=True,exist_ok=True)
 stem=hashlib.sha256(url.encode()).hexdigest()[:16]
 (target/(stem+'.body')).write_bytes(body)
 (target/(stem+'.json')).write_text(json.dumps(dict(url=url,charset=enc,bodyBytes=len(body),bodySha256=hashlib.sha256(body).hexdigest(),contentType=headers.get('Content-Type',''),contentEncoding=headers.get('Content-Encoding','identity'))))

if args.diagnose_source:
 if not args.url or canonical(args.url,args.url)!=args.url:raise ValueError('Expected one supported catalogue URL')
 provider=provider_id(args.url)[0] or ('jalan' if 'www.jalan.net' in args.url else 'trip')
 kind='detail' if provider_id(args.url)[1] else 'list'
 if args.kind and args.kind!=kind:raise ValueError('Diagnostic kind does not match the URL')
 if args.provider and args.provider!=provider:raise ValueError('Diagnostic provider does not match the URL')
 guard=SourceGuard(args.interval,args.jitter)
 stage='source_request'
 try:
  with guard.open(source_request_url(args.url,kind),follow_redirects=False) as response:
   body=response.read(8*1024*1024);enc=response.headers.get_content_charset() or 'utf-8'
   raw=body.decode('cp932' if enc.lower() in ['windows-31j','shift_jis','sjis'] else enc,errors='replace')
   save_source_body(args.url,body,enc,response.headers)
   stage='body_check'
   check_source_body(raw)
   stage='source_parse'
   observations,links,foreign,diagnostic=parse_source_page(raw,provider,args.url,now(),kind=kind)
   title=re.search(r'<title\b[^>]*>(.*?)</title>',raw,re.S|re.I)
   print(json.dumps(dict(sourceDiagnostic=True,url=args.url,kind=kind,httpStatus=response.status,bodyBytes=len(body),charset=enc,**diagnostic,diagnosticValid=not diagnostic['reviewReason'],reason='source_data_requires_review' if diagnostic['reviewReason'] else None,title=re.sub(r'\s+',' ',title[1])[:200] if title else '',queueChanged=False)),flush=True)
 except SourcePolicyDenied as error:
  print(json.dumps(dict(sourceDiagnostic=True,url=args.url,reason=error.reason,redirect=error.diagnostic,stage=stage,diagnosticValid=False,queueChanged=False)),flush=True)
 except (urllib.error.URLError,TimeoutError,ValueError,OSError) as error:
  print(json.dumps(dict(sourceDiagnostic=True,url=args.url,httpStatus=getattr(error,'code',None),error=type(error).__name__,stage=stage,diagnosticValid=False,queueChanged=False)),flush=True)
 sys.exit(0)

for batch in range(100):
 prepared=api('/api/crawl-prepare',method='POST')
 print(json.dumps(dict(preparationBatch=batch+1,**prepared),ensure_ascii=False),flush=True)
 if prepared['done']:break
else:
 raise RuntimeError('Preparation advanced 100 batches; safely resume in the next run before collecting')
if args.prepare_only:sys.exit(0)

completed=0;next_request={};next_claim={};first_written=None;blocked_hosts=set();redirect_counts={};first_detail_claims=set()
# C07: in a gentle run a group whose claim found no due page while its provider
# was free (the Worker says exhausted) is not asked again; an empty claim writes
# nothing, so the other groups' claims stay the same. Pages that become due in
# such a group during the run (a retry or refresh, or a detail page a list page
# found) wait for the next run. A claim that is empty because the provider waits
# or holds another claim, or a Worker that does not say, keeps the group.
empty_groups=set();rounds=0;claims=0
guard=SourceGuard(args.interval,args.jitter)
# Each round gives both providers list discovery and detail enrichment.
# Jalan's Korean and English list pages (names only, D07) come last in each round.
groups=[('jalan','list'),('jalan','detail'),('jalan','baths'),('trip','list'),('trip','detail'),('trip','names'),('jalan','localnames')]
if args.gentle:groups=[('jalan','detail'),('jalan','baths'),('trip','detail'),('jalan','refresh'),('trip','refresh'),('jalan','list'),('trip','list'),('trip','names'),('jalan','localnames')]
groups=[('jalan','refresh'),('trip','refresh')] if args.refresh_only else [('jalan','baths')] if args.enrich_baths else [('trip','names')] if args.enrich_names else [g for g in groups if (not args.provider or g[0]==args.provider) and (not args.kind or ('detail' if g[1] in ['names','baths'] else g[1])==args.kind)]
while completed<args.max_pages:
 progress=False;rounds+=1
 for provider,phase in groups:
  kind='detail' if phase in ['names','baths'] else phase
  if provider in blocked_hosts or (provider,phase) in empty_groups:continue
  time.sleep(max(0,min(60,next_claim.get(provider,0)-time.time())))
  # Give each provider's due detail retries a slot in every gentle run. This
  # does not change page limits, source pacing or any saved restriction.
  first_detail=args.gentle and phase=='detail' and provider not in first_detail_claims
  if first_detail:first_detail_claims.add(provider)
  claim=dict(provider=provider,phase=phase,token=str(uuid.uuid4()),lane='national' if first_detail or completed%5==4 else 'priority')
  if args.refresh_only and args.kind:claim['kind']=args.kind
  if args.url:claim['url']=args.url
  answer=api('/api/crawl',claim,method='POST');batch=answer['jobs'];claims+=1
  if args.gentle and not batch and answer.get('exhausted') is True:
   empty_groups.add((provider,phase))
   print(json.dumps(dict(emptyGroup=provider+'/'+phase,round=rounds)),flush=True)
  for job in batch:
   kind=job['kind']
   progress=True
   url=canonical(job['url'],job['url'])
   if url!=job['url']:raise ValueError('Queue contained an unsupported URL')
   host=urllib.parse.urlsplit(url).hostname
   time.sleep(max(0,next_request.get(host,0)-time.time()))
   stage='source_request';diagnostic={}
   try:
    # No Site credential, cookies, or API keys are attached to public sources.
    with guard.open(source_request_url(url,kind)) as response:
     body=response.read(8*1024*1024);enc=response.headers.get_content_charset() or 'utf-8'
     raw=body.decode('cp932' if enc.lower() in ['windows-31j','shift_jis','sjis'] else enc,errors='replace')
    save_source_body(url,body,enc,response.headers)
    stage='body_check';check_source_body(raw)
    if guard.redirects:print(json.dumps(dict(sourceDiagnostic=True,url=url,redirects=guard.redirects,approved=True)),flush=True)
    stage='source_parse'
    if kind=='names':
     names,links,diagnostic=parse_locale_names(raw,url);observations,foreign=[],False
     print(json.dumps(dict(sourceDiagnostic=True,url=url,**diagnostic)),flush=True)
    else:
     names=[];observations,links,foreign,diagnostic=parse_source_page(raw,provider,url,now(),job['prefecture'],kind)
    if provider=='trip':
     title=re.search(r'<title\b[^>]*>(.*?)</title>',raw,re.S|re.I)
     print(json.dumps(dict(sourceDiagnostic=True,url=url,bodyBytes=len(body),contentType=response.headers.get('Content-Type',''),contentEncoding=response.headers.get('Content-Encoding','identity'),title=re.sub(r'\s+',' ',title[1])[:200] if title else '',**diagnostic)),flush=True)
    if diagnostic['reviewReason']:raise SourcePolicyDenied('source_data_requires_review')
    payload=dict(url=url,status='skipped' if foreign else 'done',error='Explicit non-Japanese source country' if foreign else None,observations=observations,links=[dict(url=u,kind=k,prefecture=p if k!='names' else job['prefecture']) for u,(k,p) in links.items()],**({'localeNames':names} if kind=='names' else {}))
    city=re.search(r'/hotels/([a-z0-9-]+)-hotels-list-\d+/',url)
    if foreign and kind=='list' and city and all(str(d.get('url','')).startswith('https://www.trip.com/hotels/'+city[1]+'-hotel-detail-') for d in json_hotels(raw,url)):
     payload['excludedCity']=city[1]
   except (urllib.error.URLError,TimeoutError,ValueError,OSError) as error:
    if isinstance(error,SourcePolicyDenied):
     if error.reason=='source_redirect_page_review':redirect_counts[provider]=redirect_counts.get(provider,0)+1
     policy=policy_failure(error,redirect_counts.get(provider,1))
     if error.diagnostic:print(json.dumps(dict(sourceDiagnostic=True,url=url,reason=policy['error'],redirect=error.diagnostic)),flush=True)
    else:policy=source_failure(error,job['attempts'])
    if isinstance(error,ValueError) and stage!='source_request':
     print(json.dumps(dict(sourceDiagnostic=True,url=url,reason=policy['error'],error=type(error).__name__,stage=stage,**diagnostic)),flush=True)
    cooldown=policy.pop('providerCooldownSeconds')
    payload=dict(url=url,observations=[],links=[],**policy)
    if isinstance(error,SourcePolicyDenied) and error.stop_run:blocked_hosts.add(provider)
    if cooldown:
     payload['providerCooldownSeconds']=cooldown
     blocked_hosts.add(provider)
   payload['claimToken']=job['lease_token']
   result=api('/api/crawl',payload)
   if payload['status']=='done' and result['accepted'] and payload['observations'] and not first_written:first_written=result.get('readbackId') or payload['observations'][0]['id']
   print(json.dumps(dict(url=url,status=payload['status'],reason=payload.get('error'),providerCooldownSeconds=payload.get('providerCooldownSeconds',0),accepted=result['accepted'],records=result['coverage']['records'])),flush=True)
   next_request[host]=time.time()+max(3,args.interval);next_claim[provider]=time.time()+max(3,args.interval);completed+=1
  if completed>=args.max_pages:break
 if not progress:break
if first_written:
 readback=api('/api/hotels/'+urllib.parse.quote(first_written))
 assert readback['id']==first_written
print(json.dumps(dict(rounds=rounds,claims=claims)),flush=True)
final=api('/api/crawl?provider=jalan&kind=list&limit=1')['coverage']
print(json.dumps(dict(processed=completed,readbackId=first_written,coverage=final)),flush=True)
