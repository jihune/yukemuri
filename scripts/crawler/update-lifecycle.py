#!/usr/bin/env python3
"""Review operational-state candidates or submit official evidence/discovery seeds.
Hidden stdin: {url,token,patches?:[...],seeds?:[{url,prefecture}]}.
Public research must confirm identity and operational dates before submission.
"""
import json,sys,urllib.error,urllib.parse,urllib.request
from source_safety import site_api
if sys.stdin.isatty():
 import termios
 previous=termios.tcgetattr(sys.stdin);hidden=termios.tcgetattr(sys.stdin)
 hidden[3]&=~(termios.ECHO|termios.ICANON);hidden[6][termios.VMIN]=1;hidden[6][termios.VTIME]=0
 termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
 print('Ready for private Site access JSON (input hidden).',flush=True)
 try:access=json.loads(sys.stdin.readline())
 finally:termios.tcsetattr(sys.stdin,termios.TCSANOW,previous)
else:access=json.loads(sys.stdin.readline())
base,site_headers=site_api(access['url'],access['token'])
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise RuntimeError('Site redirected; credential was not forwarded')
opener=urllib.request.build_opener(NoRedirect())
def api(path,payload=None):
 body=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
 headers={**site_headers,'Content-Type':'application/json'}
 with opener.open(urllib.request.Request(base+path,data=body,headers=headers,method='PUT' if body else 'GET'),timeout=90) as response:return json.loads(response.read())
for seed in access.get('seeds',[]):print(json.dumps(api('/api/crawl-seeds',seed),ensure_ascii=False),flush=True)
failed=0
for patch in access.get('patches',[]):
 # One refused patch does not stop the rest: 409 newer evidence is stored, 404 unknown
 # record, 400 refused by the contract. The run still fails at the end.
 try:
  result=api('/api/hotel-lifecycle',patch)
 except urllib.error.HTTPError as error:
  failed+=1
  print(json.dumps({'id':patch.get('id'),'result':{409:'stale',404:'unknown',400:'invalid'}.get(error.code,'http_error'),'httpStatus':error.code},ensure_ascii=False),flush=True)
  continue
 # A failed read back does not hide a store that happened: the result line keeps it.
 try:life,readback=api('/api/hotels/'+urllib.parse.quote(patch['id'],safe='')).get('lifecycle') or {},None
 except urllib.error.HTTPError as error:life,readback={},error.code
 verified=life.get('state')==patch['state'] and life.get('evidence')==patch
 failed+=not verified
 print(json.dumps({'id':patch['id'],'result':result['result'],'state':life.get('state'),'readbackVerified':verified,**({'readbackStatus':readback} if readback else {})},ensure_ascii=False),flush=True)
if not access.get('seeds') and not access.get('patches'):print(json.dumps(api('/api/hotel-lifecycle'),ensure_ascii=False),flush=True)
if failed:sys.exit(1)
