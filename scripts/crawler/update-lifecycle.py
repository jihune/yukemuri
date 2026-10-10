#!/usr/bin/env python3
"""Review operational-state candidates or submit official evidence/discovery seeds.
Hidden stdin: {url,token,patches?:[...],seeds?:[{url,prefecture}]}.
Public research must confirm identity and operational dates before submission.
"""
import json,sys,urllib.parse,urllib.request
if sys.stdin.isatty():
 import termios
 previous=termios.tcgetattr(sys.stdin);hidden=termios.tcgetattr(sys.stdin)
 hidden[3]&=~(termios.ECHO|termios.ICANON);hidden[6][termios.VMIN]=1;hidden[6][termios.VTIME]=0
 termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
 print('Ready for private Site access JSON (input hidden).',flush=True)
 try:access=json.loads(sys.stdin.readline())
 finally:termios.tcsetattr(sys.stdin,termios.TCSANOW,previous)
else:access=json.loads(sys.stdin.readline())
site=urllib.parse.urlsplit(access['url'])
if site.scheme!='https' or site.hostname not in ['yukemuri.jihun7891.chatgpt.site','yukemuri-hokkaido.jihun7891.chatgpt.site'] or site.username or site.password:raise ValueError('Expected the Yukemuri Site URL')
base=urllib.parse.urlunsplit((site.scheme,site.netloc,'','',''))
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise RuntimeError('Site redirected; credential was not forwarded')
opener=urllib.request.build_opener(NoRedirect())
def api(path,payload=None):
 body=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
 headers={'OAI-Sites-Authorization':'Bearer '+access['token'],'X-Yukemuri-Crawl-Key':access['token'],'Content-Type':'application/json'}
 with opener.open(urllib.request.Request(base+path,data=body,headers=headers,method='PUT' if body else 'GET'),timeout=90) as response:return json.loads(response.read())
for seed in access.get('seeds',[]):print(json.dumps(api('/api/crawl-seeds',seed),ensure_ascii=False),flush=True)
for patch in access.get('patches',[]):
 result=api('/api/hotel-lifecycle',patch)
 hotel=api('/api/hotels/'+urllib.parse.quote(patch['id'],safe=''))
 assert hotel['lifecycle']['state']==patch['state'] and hotel['lifecycle']['evidence']==patch
 print(json.dumps({'id':patch['id'],'result':result['result'],'state':hotel['lifecycle']['state'],'readbackVerified':True},ensure_ascii=False),flush=True)
if not access.get('seeds') and not access.get('patches'):print(json.dumps(api('/api/hotel-lifecycle'),ensure_ascii=False),flush=True)
