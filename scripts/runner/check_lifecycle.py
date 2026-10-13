#!/usr/bin/env python3
"""Offline checks for the L01 evidence path: apply-lifecycle.py and update-lifecycle.py.

No network and no key: a stand-in Worker answers update-lifecycle.py, and the
launcher's child process is replaced. The committed evidence file is loaded with
the launcher's own reader (scripts/check-lifecycle-official.mjs checks each entry
against the Worker contract).
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('lifecycle', HERE / 'apply-lifecycle.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
UPDATE = launcher.ROOT / 'scripts/crawler/update-lifecycle.py'
KEY = 'test-only-never-a-real-secret-0123456789'
ORIGIN = 'https://yukemuri.example-sub.workers.dev'
ENABLED = {'workerName': 'yukemuri', 'databaseName': 'yukemuri', 'databaseId': '0123abcd-4567-89ab-cdef-0123456789ab',
           'publicOrigin': ORIGIN, 'autoDeploy': True}
PATCH = {'id': 'jalan-1', 'state': 'temporarily_closed', 'sourceUrl': 'https://example.jp/news', 'sourceKind': 'official_property',
         'sourceLabel': 'Official notice', 'evidence': 'Closed for renovation.', 'identityEvidence': 'Name and address match.',
         'checkedAt': '2026-10-13T00:00:00Z', 'effectiveDate': '2026-03-01'}


def entry(hotel_id, **changes):
    return dict(PATCH, id=hotel_id, **changes)


class Worker:
    """PUT /api/hotel-lifecycle and GET /api/hotels/<id>, as lib/hotel-lifecycle.ts answers them."""

    def __init__(self, stored=None, refuse=None, readback=None):
        self.stored = dict(stored or {})
        self.refuse = refuse or {}
        self.readback = readback or {}
        self.sent = []

    def open(self, request, timeout):
        self.sent.append((request.full_url, dict(request.header_items()), request.data))
        path = request.full_url[len(ORIGIN):]
        if path == '/api/hotel-lifecycle':
            body = json.loads(request.data)
            code = self.refuse.get(body['id'])
            if code:
                raise urllib.error.HTTPError(request.full_url, code, 'refused', {}, io.BytesIO(b'{"error":"refused"}'))
            result = 'replayed' if self.stored.get(body['id']) == body else 'saved'
            self.stored[body['id']] = body
            return Response({'result': result})
        hotel_id = path.rsplit('/', 1)[1]
        evidence = self.readback.get(hotel_id, self.stored.get(hotel_id))
        return Response({'id': hotel_id, 'lifecycle': {'state': evidence['state'], 'evidence': evidence} if evidence else None})


class Response(io.BytesIO):
    def __init__(self, body):
        super().__init__(json.dumps(body).encode())


def run_update(worker, access):
    """Run update-lifecycle.py against the stand-in Worker; (exit code, stdout)."""
    out = io.StringIO()
    code = 0
    with patch('sys.argv', [str(UPDATE)]), patch('sys.stdin', io.StringIO(json.dumps(access) + '\n')), \
            patch('sys.path', [str(UPDATE.parent), *sys.path]), patch('urllib.request.build_opener', return_value=worker), \
            contextlib.redirect_stdout(out):
        try:
            runpy.run_path(str(UPDATE), run_name='__main__')
        except SystemExit as error:
            code = error.code or 0
    return code, out.getvalue()


class UpdateLifecycleChecks(unittest.TestCase):
    def test_every_patch_is_sent_and_refusals_fail_at_the_end(self):
        replay = entry('jalan-2')
        mismatch = entry('jalan-6')
        worker = Worker(stored={'jalan-2': replay}, refuse={'jalan-3': 409, 'jalan-4': 404, 'jalan-5': 400},
                        readback={'jalan-6': dict(mismatch, evidence='Something else entirely.')})
        patches = [entry('jalan-1'), replay, entry('jalan-3'), entry('jalan-4'), entry('jalan-5'), mismatch, entry('jalan-7')]
        code, out = run_update(worker, {'url': ORIGIN, 'token': KEY, 'patches': patches})
        rows = [json.loads(line) for line in out.splitlines()]
        self.assertEqual(code, 1)
        self.assertEqual([(r['id'], r['result']) for r in rows], [
            ('jalan-1', 'saved'), ('jalan-2', 'replayed'), ('jalan-3', 'stale'), ('jalan-4', 'unknown'),
            ('jalan-5', 'invalid'), ('jalan-6', 'saved'), ('jalan-7', 'saved')])
        self.assertEqual([r.get('readbackVerified') for r in rows], [True, True, None, None, None, False, True])
        puts = [url for url, _, data in worker.sent if data is not None]
        self.assertEqual(len(puts), len(patches), 'a refused patch does not stop the ones after it')
        self.assertNotIn(KEY, out)
        for _, headers, _ in worker.sent:
            self.assertEqual(headers.get('X-yukemuri-crawl-key'), KEY)

    def test_the_same_file_twice_writes_nothing_new(self):
        worker = Worker()
        patches = [entry('jalan-1'), entry('jalan-2', state='closed')]
        first = run_update(worker, {'url': ORIGIN, 'token': KEY, 'patches': patches})
        second = run_update(worker, {'url': ORIGIN, 'token': KEY, 'patches': patches})
        self.assertEqual(first[0], 0)
        self.assertEqual(second[0], 0)
        self.assertEqual([json.loads(line)['result'] for line in second[1].splitlines()], ['replayed', 'replayed'])


class ApplyLifecycleChecks(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        root = Path(self.folder.name)
        self.config = root / 'cloudflare-deploy.json'
        self.config.write_text(json.dumps(ENABLED))
        self.evidence = root / 'lifecycle-official.json'
        self.output = root / 'github-output'
        self.output.write_text('')

    def run_main(self, patches, child=None, key=KEY, config=ENABLED):
        self.config.write_text(json.dumps(config))
        self.evidence.write_text(json.dumps({'version': 1, 'patches': patches}, ensure_ascii=False))
        env = {'YUKEMURI_CRAWL_ACCESS_KEY': key, 'GITHUB_OUTPUT': str(self.output), 'GITHUB_TOKEN': 'unrelated'}
        with patch.dict(os.environ, env), patch.object(launcher.subprocess, 'run', side_effect=child) as run, \
                contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
            code = launcher.main(['--config', str(self.config), '--evidence', str(self.evidence)])
        return code, run, out.getvalue() + err.getvalue()

    def outputs(self):
        return dict(line.split('=', 1) for line in self.output.read_text().splitlines())

    def test_key_only_on_stdin_and_counts_from_readback(self):
        patches = [entry('jalan-1'), entry('jalan-2'), entry('jalan-3')]
        printed = '\n'.join(json.dumps(row) for row in [
            {'id': 'jalan-1', 'result': 'saved', 'readbackVerified': True},
            {'id': 'jalan-2', 'result': 'replayed', 'readbackVerified': True},
            {'id': 'jalan-3', 'result': 'saved', 'readbackVerified': False}]) + '\nechoed ' + KEY + '\n'
        result = subprocess.CompletedProcess([], 1, stdout=printed, stderr='warn ' + KEY)
        code, run, out = self.run_main(patches, child=[result])
        self.assertEqual(code, 0, 'refusals fail the run in the verdict job, after the snapshot')
        command, kwargs = run.call_args.args[0], run.call_args.kwargs
        self.assertEqual(command[2:], [str(UPDATE)])
        self.assertNotIn(KEY, repr(command))
        self.assertEqual(json.loads(kwargs['input']), {'url': ORIGIN, 'token': KEY, 'patches': patches})
        for name in ('YUKEMURI_CRAWL_ACCESS_KEY', 'GITHUB_TOKEN', 'GITHUB_OUTPUT'):
            self.assertNotIn(name, kwargs['env'])
        self.assertNotIn('YUKEMURI_CRAWL_ACCESS_KEY', os.environ)
        self.assertNotIn(KEY, out)
        self.assertIn('[REDACTED]', out)
        self.assertEqual(self.outputs(), {'saved': '1', 'failed': '1'})

    def test_a_child_that_stops_early_counts_the_rest_as_failed(self):
        patches = [entry('jalan-1'), entry('jalan-2'), entry('jalan-3')]
        timeout = subprocess.TimeoutExpired([], 1, output=(json.dumps({'id': 'jalan-1', 'result': 'saved', 'readbackVerified': True}) + '\n').encode())
        code, _, out = self.run_main(patches, child=timeout)
        self.assertEqual(code, 0)
        self.assertEqual(self.outputs(), {'saved': '1', 'failed': '2'})
        # Lines for ids outside the file, or repeated, do not count.
        stray = subprocess.CompletedProcess([], 0, stdout='\n'.join(json.dumps({'id': i, 'result': 'saved', 'readbackVerified': True}) for i in ['jalan-1', 'jalan-1', 'jalan-9']), stderr='')
        self.output.write_text('')
        self.run_main(patches, child=[stray])
        self.assertEqual(self.outputs(), {'saved': '1', 'failed': '2'})

    def test_no_entries_no_request(self):
        code, run, _ = self.run_main([])
        self.assertEqual(code, 0)
        run.assert_not_called()
        self.assertEqual(self.outputs(), {'saved': '0', 'failed': '0'})

    def test_stops_before_any_request_without_target_key_or_file_shape(self):
        for config, key in [(dict(ENABLED, publicOrigin=None), KEY), (dict(ENABLED, autoDeploy=False), KEY), (ENABLED, ''), (ENABLED, 'short')]:
            code, run, out = self.run_main([entry('jalan-1')], key=key, config=config)
            self.assertEqual(code, 1, (config, key))
            run.assert_not_called()
            self.assertNotIn(KEY, out)
        self.assertEqual(self.output.read_text(), '', 'no outputs: the snapshot job does not run')
        for bad in [[], {'patches': []}, {'version': 2, 'patches': []}, {'version': 1, 'patches': {}}, {'version': 1, 'patches': [], 'extra': 1}]:
            self.evidence.write_text(json.dumps(bad))
            with self.assertRaises(ValueError, msg=repr(bad)):
                launcher.load_patches(self.evidence)

    def test_committed_file_loads(self):
        patches = launcher.load_patches(launcher.EVIDENCE)
        ids = [p['id'] for p in patches]
        self.assertEqual(len(ids), len(set(ids)), 'one entry per record')


if __name__ == '__main__':
    unittest.main(verbosity=1)
