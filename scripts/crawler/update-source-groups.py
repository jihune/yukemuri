#!/usr/bin/env python3
"""Read or save verified same-property OTA/Google Place ID links.
Hidden stdin: {url,token,patches?:[{hotelId,tripHotelId?,jalanHotelId?,
googlePlaceId?,matchedName,sourceUrl,sourceLabel,identityEvidence,
sameInventory:true,checkedAt}]}.
Never link by name similarity alone or submit Google ratings/photos as patches.
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
for patch in access.get('patches',[]):
 result=api('/api/hotel-source-groups',patch)
 hotel=api('/api/hotels/'+urllib.parse.quote(patch['hotelId'],safe=''))
 groups=api('/api/hotel-source-groups?after='+urllib.parse.quote('',safe=''))
 while not any(g['hotel_id']==patch['hotelId'] for g in groups['groups']) and groups.get('next'):
  groups=api('/api/hotel-source-groups?after='+urllib.parse.quote(groups['next'],safe=''))
 group=next(g for g in groups['groups'] if g['hotel_id']==patch['hotelId'])
 assert json.loads(group['payload'])==patch and hotel['id']==patch['hotelId']
 if patch.get('googlePlaceId'):assert hotel.get('googlePlaceId')==patch['googlePlaceId']
 print(json.dumps({'id':patch['hotelId'],'result':result['result'],'readbackVerified':True,'ratingProviders':[r.get('provider') for r in hotel['ratings']],'photoSourceId':hotel['image']['sourceId']},ensure_ascii=False),flush=True)
if not access.get('patches'):
 cursor=''
 while True:
  page=api('/api/hotel-source-groups?after='+urllib.parse.quote(cursor,safe=''))
  print(json.dumps(page,ensure_ascii=False),flush=True)
  if not page.get('next'):break
  cursor=page['next']
