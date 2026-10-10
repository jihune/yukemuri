"""Read-only diagnostic CLI checks; no network or operating database."""
import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch
from source_safety import SourcePolicyDenied

ROOT=Path(__file__).parent
SECRET='diagnostic-test-secret'

class Response:
 status=200
 def __init__(self,raw):
  self.body=raw.encode('utf-8');self.headers=Message();self.headers['Content-Type']='text/html; charset=utf-8'
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,*args):return self.body

class DiagnosticChecks(unittest.TestCase):
 def run_diagnostic(self,url,raw,extra=(),error=None):
  calls=[]
  class Guard:
   def __init__(self,interval,jitter):calls.append(('pacing',interval,jitter))
   def open(self,url,follow_redirects=True):
    calls.append(('source',url,follow_redirects))
    if error:raise error
    return Response(raw)
  output=io.StringIO()
  with tempfile.TemporaryDirectory() as folder:
   argv=['update-site.py','--diagnose-source','--url',url,'--diagnostic-dir',folder,*extra]
   with patch('sys.argv',argv),patch('sys.stdin',io.StringIO(json.dumps(dict(url='https://yukemuri.jihun7891.chatgpt.site',token=SECRET))+'\n')),patch('source_safety.SourceGuard',Guard),patch('urllib.request.OpenerDirector.open',side_effect=AssertionError('Diagnostic must not call Site API')),contextlib.redirect_stdout(output):
    with self.assertRaises(SystemExit) as exit:runpy.run_path(str(ROOT/'update-site.py'),run_name='__main__')
   self.assertEqual(exit.exception.code,0)
   for path in Path(folder).iterdir():self.assertNotIn(SECRET,path.read_text())
   bodies=list(Path(folder).glob('*.body'))
   if not error:self.assertEqual(bodies[0].read_bytes(),raw.encode())
  self.assertNotIn(SECRET,output.getvalue());self.assertEqual(calls[0],('pacing',8,4))
  self.assertFalse(calls[1][2],'Read-only diagnosis never follows a redirect')
  result=json.loads(output.getvalue());self.assertFalse(result['queueChanged'])
  return result,calls

 def test_actual_listing_is_normalized_and_saved(self):
  raw=(ROOT/'fixtures/jalan-list.html').read_text()
  result,_=self.run_diagnostic('https://www.jalan.net/130000/LRG_137100/',raw,('--kind','list'))
  self.assertEqual(result['kind'],'list');self.assertEqual(result['observations'],30);self.assertTrue(result['diagnosticValid']);self.assertGreater(result['links'],30)

 def test_empty_and_wrong_identity_are_not_valid(self):
  for url,raw,reason in [('https://www.jalan.net/yad999999/',(ROOT/'fixtures/jalan-detail.html').read_text(),'hotel_identity_mismatch'),('https://www.jalan.net/130000/LRG_137100/','<title>Sign in</title>','empty_listing')]:
   result,_=self.run_diagnostic(url,raw)
   self.assertFalse(result['diagnosticValid']);self.assertEqual(result['reviewReason'],reason);self.assertEqual(result['reason'],'source_data_requires_review')

 def test_parse_error_never_prints_exception_contents(self):
  result,_=self.run_diagnostic('https://www.jalan.net/yad999999/','',error=ValueError(SECRET))
  self.assertFalse(result['diagnosticValid']);self.assertEqual(result['stage'],'source_request');self.assertEqual(result['error'],'ValueError')

 def test_source_access_policy_is_preserved(self):
  result,_=self.run_diagnostic('https://www.jalan.net/yad999999/','',error=SourcePolicyDenied('robots_disallowed'))
  self.assertEqual(result['reason'],'robots_disallowed')

 def test_live_empty_response_keeps_retry_and_claim(self):
  url='https://www.jalan.net/yad999999/';claim='00000000-0000-4000-8000-000000000001';writes=[]
  class Guard:
   redirects=[]
   def __init__(self,*args):pass
   def open(self,*args):return Response('<title>Sign in</title>')
  class Site:
   def open(self,request,timeout):
    path=request.full_url.split('.site',1)[1]
    if path=='/api/crawl-prepare':value={'done':True}
    elif request.method=='POST':value={'jobs':[dict(url=url,kind='detail',prefecture='pref-tokyo',attempts=1,lease_token=claim)]}
    elif request.method=='PUT':
     writes.append(json.loads(request.data));value={'accepted':0,'coverage':{'records':1}}
    else:value={'coverage':{'records':1}}
    return Response(json.dumps(value))
  output=io.StringIO()
  with patch('sys.argv',['update-site.py','--max-pages','1','--url',url,'--provider','jalan','--kind','detail']),patch('sys.stdin',io.StringIO(json.dumps(dict(url='https://yukemuri.jihun7891.chatgpt.site',token=SECRET))+'\n')),patch('source_safety.SourceGuard',Guard),patch('urllib.request.build_opener',return_value=Site()),contextlib.redirect_stdout(output):
   runpy.run_path(str(ROOT/'update-site.py'),run_name='__main__')
  self.assertEqual(len(writes),1);payload=writes[0]
  self.assertEqual(payload['status'],'retry');self.assertEqual(payload['error'],'source_data_requires_review');self.assertEqual(payload['observations'],[]);self.assertEqual(payload['links'],[]);self.assertEqual(payload['claimToken'],claim)
  self.assertEqual(payload['retryAfterSeconds'],60);self.assertNotIn('providerCooldownSeconds',payload);self.assertNotIn(SECRET,output.getvalue())
  diagnostic=json.loads(output.getvalue().splitlines()[1]);self.assertEqual(diagnostic['stage'],'source_parse');self.assertEqual(diagnostic['reviewReason'],'missing_hotel_document')

if __name__=='__main__':unittest.main()
