"""Maintenance key destinations for the collector scripts; no network."""
import contextlib
import io
import json
import runpy
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch
from source_safety import site_api

ROOT=Path(__file__).parent
SECRET='site-access-test-secret'
SITES=['https://yukemuri.jihun7891.chatgpt.site','https://yukemuri-hokkaido.jihun7891.chatgpt.site/']
WORKER='https://yukemuri.example-account.workers.dev'

class Response:
 def __init__(self,value):self.body=json.dumps(value).encode();self.headers=Message()
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.body

class SiteAccessChecks(unittest.TestCase):
 def test_sites_keep_both_headers(self):
  for url in SITES:
   base,headers=site_api(url,SECRET)
   self.assertEqual(base,url.rstrip('/'))
   self.assertEqual(headers,{'X-Yukemuri-Crawl-Key':SECRET,'OAI-Sites-Authorization':'Bearer '+SECRET})

 def test_worker_gets_only_the_app_key(self):
  base,headers=site_api(WORKER+'/',SECRET)
  self.assertEqual(base,WORKER);self.assertEqual(headers,{'X-Yukemuri-Crawl-Key':SECRET})

 def test_other_destinations_are_rejected(self):
  for url in ['http://yukemuri.jihun7891.chatgpt.site','https://other.jihun7891.chatgpt.site','https://evil.chatgpt.site',
              'https://other.example-account.workers.dev','https://yukemuri.a.b.workers.dev','https://yukemuri.workers.dev',
              'https://yukemuri.example-account.workers.dev.evil.example','https://user:pass@yukemuri.example-account.workers.dev',
              'https://yukemuri.-bad.workers.dev','https://example.com']:
   with self.subTest(url=url),self.assertRaises(ValueError):site_api(url,SECRET)

 def run_script(self,script,url,argv,extra):
  sent=[]
  class Site:
   def open(self,request,timeout):
    sent.append((request.full_url,dict(request.header_items())));return Response({'coverage':{'records':1}})
  with patch('sys.argv',[script,*argv]),patch('sys.stdin',io.StringIO(json.dumps(dict(url=url,token=SECRET,**extra))+'\n')),patch('urllib.request.build_opener',return_value=Site()),contextlib.redirect_stdout(io.StringIO()):
   # Only the first request matters here; later steps may reject the stub reply.
   with contextlib.suppress(KeyError,TypeError,ValueError,SystemExit):runpy.run_path(str(ROOT/script),run_name='__main__')
  return sent

 def test_scripts_send_headers_by_destination(self):
  # urllib stores header names capitalized: 'X-yukemuri-crawl-key'.
  for script,argv,extra in [('update-site.py',['--health-only'],{}),('update-names.py',[],{}),('update-descriptions.py',[],{}),
                            ('update-lifecycle.py',[],{'seeds':[{}]}),('update-source-groups.py',[],{'patches':[{'hotelId':'qa'}]})]:
   with self.subTest(script=script):
    for url,sites in [(SITES[0],True),(WORKER,False)]:
     sent=self.run_script(script,url,argv,extra)
     self.assertTrue(sent)
     for full_url,headers in sent:
      self.assertTrue(full_url.startswith(url+'/api/'))
      self.assertEqual(headers.get('X-yukemuri-crawl-key'),SECRET)
      self.assertEqual('Oai-sites-authorization' in headers,sites)

if __name__=='__main__':unittest.main()
