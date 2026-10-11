#!/usr/bin/env python3
"""Read pending descriptions in any language or save Korean translations via hidden stdin.
Input: {url,token,patches?}. The caller supplies the translations in patches.
Nothing runs this on a schedule: the scheduled collector does not translate, and
the earlier agent schedule that did is stopped (docs/checkpoint-20261007.md).
"""
import json,sys,urllib.parse,urllib.request
from source_safety import site_api
if sys.stdin.isatty():
 import termios
 previous=termios.tcgetattr(sys.stdin);hidden=termios.tcgetattr(sys.stdin)
 # Canonical terminals truncate long lines at about 4 KiB. A batch contains
 # multiple full descriptions; read the complete hidden JSON without that cap.
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
 headers={**site_headers,'Content-Type':'application/json'}
 body=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
 with opener.open(urllib.request.Request(base+path,data=body,headers=headers,method='PUT' if body else 'GET'),timeout=90) as response:return json.loads(response.read())
if 'patches' not in access:print(json.dumps(api('/api/hotel-descriptions?limit=40'),ensure_ascii=False))
else:
 patches=access['patches'];print(json.dumps(api('/api/hotel-descriptions',{'patches':patches}),ensure_ascii=False))
 for patch in patches:
  hotel=api('/api/hotels/'+urllib.parse.quote(patch['id'],safe=''))
  assert hotel['description']==patch['sourceText']
  assert hotel['descriptionTranslation']['text']==patch['textKo'].strip()
 print(json.dumps({'readbackVerified':len(patches)}))
