"""Offline release, credential, budget and redirect boundary checks."""
import copy
from email.message import Message
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import unittest
from unittest.mock import patch
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('bootstrap.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
WORKERS_ORIGIN = re.compile(r'https://yukemuri\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev')


def sites_release(raw):
    # deploy.yml builds the release for the Worker's own workers.dev origin
    # (YUKEMURI_SITE_ORIGIN); this bootstrap pins the Sites origin, so check the
    # same files signed for it. The original is validated first with its own
    # origin (duplicate keys, limits, file and release checksums), so re-signing
    # cannot hide a broken release. Any other origin is left for validate_release.
    origin = json.loads(raw.decode('utf-8')).get('siteOrigin')
    if not isinstance(origin, str) or not WORKERS_ORIGIN.fullmatch(origin):
        return raw
    pinned = runner.SITE_ORIGIN
    runner.SITE_ORIGIN = origin
    try:
        release = runner.validate_release(raw)
    finally:
        runner.SITE_ORIGIN = pinned
    payload = {key: value for key, value in release.items() if key != 'release'}
    payload['siteOrigin'] = runner.SITE_ORIGIN
    payload['release'] = runner.digest(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
    return (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


RAW = sites_release((ROOT / 'data/collector-release.generated.json').read_bytes())
RELEASE = runner.validate_release(RAW)
ACCESS = {'url': runner.SITE_ORIGIN, 'token': 'test-only-maintenance-key'}


def encode(value):
    return json.dumps(value, ensure_ascii=False).encode()


class BootstrapChecks(unittest.TestCase):
    def test_current_sources_and_unicode_digest(self):
        self.assertEqual({item['path'] for item in RELEASE['files']}, runner.FILES)
        for item in RELEASE['files']:
            self.assertEqual(item['content'], (ROOT / item['path']).read_text())

    def test_workers_release_validated_before_resigning(self):
        def workers(release):
            payload = {key: value for key, value in release.items() if key != 'release'}
            payload['siteOrigin'] = 'https://yukemuri.jihune.workers.dev'
            payload['release'] = runner.digest(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
            return payload
        pinned = runner.SITE_ORIGIN
        good = workers(copy.deepcopy(RELEASE))
        self.assertEqual(runner.validate_release(sites_release(encode(good)))['siteOrigin'], pinned)
        bad_file = copy.deepcopy(RELEASE)
        bad_file['files'][0]['sha256'] = '0' * 64
        broken = [
            (encode(dict(good, release='0' * 64)), 'release checksum'),
            (encode(workers(bad_file)), 'file checksum'),
            (encode(good)[:-1] + b',"schemaVersion":1}', 'duplicate key'),
        ]
        for raw, label in broken:
            with self.subTest(label), self.assertRaises(runner.ReleaseError):
                sites_release(raw)
            self.assertEqual(runner.SITE_ORIGIN, pinned)

    def test_malformed_oversized_and_duplicate_json(self):
        for raw in (b'not-json', b'null', b'[]', b'\xff', b' ' * (runner.MAX_BYTES + 1), b'{"schemaVersion":1,"schemaVersion":1}'):
            with self.subTest(raw=raw[:50]), self.assertRaises(runner.ReleaseError):
                runner.validate_release(raw)

    def test_release_boundaries(self):
        mutations = [
            (lambda r: r.update(siteOrigin='https://other.example'), 'destination'),
            (lambda r: r.update(entrypoint='scripts/private.py'), 'entrypoint'),
            (lambda r: r.update(schemaVersion=True), 'schema'),
            (lambda r: r.update(secret='not-allowed'), 'fields'),
            (lambda r: r['files'][0].update(path='../private'), 'path'),
            (lambda r: r['files'][0].update(path='/tmp/private'), 'path'),
            (lambda r: r['files'].__setitem__(0, r['files'][1]), 'duplicate'),
            (lambda r: r['files'][0].update(content='changed'), 'checksum'),
            (lambda r: r['files'].pop(), 'count'),
            (lambda r: r.update(release='0' * 64), 'checksum'),
        ]
        for mutate, reason in mutations:
            value = copy.deepcopy(RELEASE)
            mutate(value)
            with self.subTest(reason=reason), self.assertRaisesRegex(runner.ReleaseError, reason):
                runner.validate_release(encode(value))

    def test_budget_and_pacing_cannot_be_weakened(self):
        for name, values in {'maxPages':[0,17,True], 'maxSeconds':[0,241], 'intervalSeconds':[7,61], 'jitterSeconds':[3,31]}.items():
            for value in values:
                release = copy.deepcopy(RELEASE)
                release['limits'][name] = value
                with self.subTest(name=name,value=value), self.assertRaises(runner.ReleaseError):
                    runner.validate_release(encode(release))

    def test_exact_site_and_hidden_credential(self):
        self.assertEqual(runner.validate_access({**ACCESS, 'url':ACCESS['url']+'/'}),ACCESS)
        for url in ('http://yukemuri.jihun7891.chatgpt.site', ACCESS['url']+'.other.example', ACCESS['url']+'?key=secret', ACCESS['url']+'/api', 'https://user:pass@yukemuri.jihun7891.chatgpt.site', ACCESS['url']+':443'):
            with self.subTest(url=url), self.assertRaises(runner.ReleaseError):
                runner.validate_access({**ACCESS, 'url':url})
        for token in ('', 'line\nvalue', 'x'*4097, None):
            with self.subTest(token=str(token)[:20]), self.assertRaises(runner.ReleaseError):
                runner.validate_access({**ACCESS, 'token':token})

    def test_download_bound_and_same_origin_headers(self):
        class Response:
            status=200
            headers=Message()
            headers['Content-Type']='application/json'
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,size):
                self.size=size
                return RAW
        response=Response()
        class Opener:
            def open(self,request,timeout):
                self.request=request
                self.timeout=timeout
                return response
        opener=Opener()
        self.assertEqual(runner.fetch_release(ACCESS,opener),RELEASE)
        self.assertEqual(opener.request.full_url,ACCESS['url']+'/api/collector-release')
        self.assertEqual(opener.request.get_header('X-yukemuri-crawl-key'),ACCESS['token'])
        self.assertEqual(response.size,runner.MAX_BYTES+1)
        self.assertEqual(opener.timeout,30)

    def test_real_redirect_never_forwards_credentials(self):
        requests=[]
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path,self.headers.get('X-Yukemuri-Crawl-Key')))
                self.send_response(302)
                self.send_header('Location','/redirect-target')
                self.end_headers()
            def log_message(self,*args): pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            request=urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+'/release',headers={'X-Yukemuri-Crawl-Key':ACCESS['token']})
            with self.assertRaisesRegex(runner.ReleaseError,'not forwarded'):
                urllib.request.build_opener(runner.NoRedirect()).open(request,timeout=5)
            self.assertEqual(requests,[('/release',ACCESS['token'])])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_temporary_execution_and_secret_isolation(self):
        roots=[]
        def execute(command,**kwargs):
            root=Path(kwargs['cwd'])
            roots.append(root)
            self.assertTrue((root/RELEASE['entrypoint']).is_file())
            self.assertEqual(set(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()),runner.FILES)
            self.assertEqual(json.loads(kwargs['input']),ACCESS)
            self.assertNotIn(ACCESS['token'],' '.join(command))
            self.assertNotIn('GITHUB_TEST_SECRET',kwargs['env'])
            self.assertEqual(kwargs['env']['HTTPS_PROXY'],'http://test-proxy.invalid:8080')
            self.assertEqual(kwargs['timeout'],240)
            self.assertIn('--gentle',command)
            return subprocess.CompletedProcess(command,0)
        with patch.dict(os.environ,{'GITHUB_TEST_SECRET':'unrelated','HTTPS_PROXY':'http://test-proxy.invalid:8080'}),patch.object(runner.subprocess,'run',side_effect=execute):
            self.assertEqual(runner.run_release(RELEASE,ACCESS,'collect'),0)
        self.assertFalse(roots[0].exists())
        with patch.object(runner.subprocess,'run',side_effect=subprocess.TimeoutExpired('collector',240)):
            self.assertEqual(runner.run_release(RELEASE,ACCESS,'collect'),0)


if __name__=='__main__':
    unittest.main()
