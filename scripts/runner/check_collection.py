#!/usr/bin/env python3
"""Offline checks for run-collection.py: target, budget, pacing and secrets."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('collection', Path(__file__).with_name('run-collection.py'))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
KEY = 'test-only-never-a-real-secret-0123456789'
ORIGIN = 'https://yukemuri.example-sub.workers.dev'
ENABLED = {'workerName': 'yukemuri', 'databaseName': 'yukemuri', 'databaseId': '0123abcd-4567-89ab-cdef-0123456789ab',
           'publicOrigin': ORIGIN, 'autoDeploy': True}


class CollectionChecks(unittest.TestCase):
    def test_budget_matches_the_runner(self):
        # jihune/yukemuri-script-runner b7f9c64: run-updates.py MODES, run_step pacing, --time-limit 240.
        self.assertEqual(launcher.MODES, {'check-access': [['--health-only']], 'gentle': [['--gentle', '--max-pages', '16']]})
        self.assertEqual(launcher.PACING, ['--interval', '8', '--jitter', '4'])
        self.assertEqual(launcher.TIME_LIMIT, 240)
        self.assertEqual(launcher.COLLECTOR, launcher.ROOT / 'scripts/crawler/update-site.py')
        self.assertTrue(launcher.COLLECTOR.is_file())

    def test_target_is_the_recorded_worker_only(self):
        self.assertEqual(launcher.target_origin(ENABLED), ORIGIN)
        committed = json.loads((launcher.ROOT / 'cloudflare-deploy.json').read_text())
        if committed['publicOrigin'] is None:
            with self.assertRaisesRegex(ValueError, 'publicOrigin is not recorded'):
                launcher.target_origin(committed)
        for bad in [dict(ENABLED, publicOrigin=None), dict(ENABLED, publicOrigin='https://yukemuri.jihun7891.chatgpt.site'),
                    dict(ENABLED, publicOrigin=ORIGIN + '/'), dict(ENABLED, publicOrigin='https://evil.example'),
                    dict(ENABLED, publicOrigin='http://yukemuri.example-sub.workers.dev'),
                    dict(ENABLED, publicOrigin='https://yukemuri.example-sub.workers.dev.evil.example'),
                    dict(ENABLED, autoDeploy=False), dict(ENABLED, databaseId=None), None, []]:
            with self.assertRaises(ValueError, msg=repr(bad)):
                launcher.target_origin(bad)

    def test_key_from_environment_only_once(self):
        with patch.dict(os.environ, {'YUKEMURI_CRAWL_ACCESS_KEY': KEY}):
            self.assertEqual(launcher.load_key(), KEY)
            self.assertNotIn('YUKEMURI_CRAWL_ACCESS_KEY', os.environ)
        for bad in ['', 'short', KEY + ' x']:
            with patch.dict(os.environ, {'YUKEMURI_CRAWL_ACCESS_KEY': bad}), self.assertRaises(ValueError):
                launcher.load_key()

    def test_key_only_on_stdin_and_redacted(self):
        access = {'url': ORIGIN, 'token': KEY}
        result = subprocess.CompletedProcess([], 0, stdout='saved ' + KEY, stderr='warn ' + KEY)
        with patch.dict(os.environ, {'GITHUB_TOKEN': 'unrelated', 'YUKEMURI_CRAWL_ACCESS_KEY': KEY}), \
                patch.object(launcher.subprocess, 'run', return_value=result) as run, \
                contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(launcher.run_step(['--gentle', '--max-pages', '16'], access, time.monotonic() + 10), 'ok')
        command, kwargs = run.call_args.args[0], run.call_args.kwargs
        self.assertEqual(command[2:], [str(launcher.COLLECTOR), '--gentle', '--max-pages', '16', '--interval', '8', '--jitter', '4'])
        self.assertNotIn(KEY, repr(command))
        self.assertEqual(json.loads(kwargs['input']), access)
        self.assertNotIn('GITHUB_TOKEN', kwargs['env'])
        self.assertNotIn('YUKEMURI_CRAWL_ACCESS_KEY', kwargs['env'])
        self.assertLessEqual(kwargs['timeout'], 10)
        self.assertNotIn(KEY, out.getvalue())
        self.assertIn('[REDACTED]', out.getvalue())

    def test_budget_and_failure(self):
        access = {'url': ORIGIN, 'token': KEY}
        timeout = subprocess.TimeoutExpired([], 1, output=('partial ' + KEY).encode())
        with patch.object(launcher.subprocess, 'run', side_effect=timeout), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(launcher.run_step(['--health-only'], access, time.monotonic() + 10), 'budget')
        self.assertNotIn(KEY, out.getvalue())
        with patch.object(launcher.subprocess, 'run') as run:
            self.assertEqual(launcher.run_step([], access, time.monotonic() - 1), 'budget')
            run.assert_not_called()
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'cloudflare-deploy.json'
            config.write_text(json.dumps(ENABLED))
            for mode, state, code in [('gentle', 'budget', 0), ('check-access', 'budget', 1), ('gentle', 'failed', 1), ('gentle', 'ok', 0)]:
                with patch.dict(os.environ, {'YUKEMURI_CRAWL_ACCESS_KEY': KEY}), patch.object(launcher, 'run_step', return_value=state), \
                        contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(launcher.main(['--mode', mode, '--config', str(config)]), code, (mode, state))

    def test_stops_before_any_request_without_target_or_key(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'cloudflare-deploy.json'
            for value, key in [(dict(ENABLED, publicOrigin=None), KEY), (ENABLED, '')]:
                config.write_text(json.dumps(value))
                with patch.dict(os.environ, {'YUKEMURI_CRAWL_ACCESS_KEY': key}), patch.object(launcher, 'run_step') as run, \
                        contextlib.redirect_stderr(io.StringIO()) as err:
                    self.assertEqual(launcher.main(['--mode', 'gentle', '--config', str(config)]), 1)
                run.assert_not_called()
                self.assertNotIn(KEY, err.getvalue())


if __name__ == '__main__':
    unittest.main(verbosity=1)
