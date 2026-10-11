"""Production Worker checks in an isolated local D1; leaves user data untouched."""
import os
import sys
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

root=Path(__file__).resolve().parents[1]
node=['node','--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js']
config='dist/server/wrangler.json'
if '--public-access' in sys.argv:
 subprocess.run(['node','--import','./scripts/sites-env.mjs','scripts/check-public-worker.mjs'],cwd=root,check=True,timeout=200)
 sys.exit(0)
with tempfile.TemporaryDirectory(prefix='yukemuri-runtime-') as folder:
 state=Path(folder)/'db'
 for migration in sorted((root/'drizzle').glob('*.sql')):
  result=subprocess.run(node+['d1','execute','DB','--config',config,'--local','--persist-to',str(state),'--file',str(migration)],cwd=root,capture_output=True,text=True,timeout=90)
  if result.returncode:raise RuntimeError(result.stdout+result.stderr)
 result=subprocess.run(node+['d1','execute','DB','--config',config,'--local','--persist-to',str(state),'--command',"INSERT INTO favorites(hotel_id) VALUES ('toya-02')"],cwd=root,capture_output=True,text=True,timeout=60)
 if result.returncode:raise RuntimeError(result.stdout+result.stderr)
 with (Path(folder)/'worker.log').open('w+') as log:
  test_args=['--var','CRAWL_ACCESS_KEY:local-runtime-maintenance-test'] if '--public-access' in sys.argv else []
  server=subprocess.Popen(node+['dev','--config',config,'--local','--persist-to',str(state),'--ip','127.0.0.1','--port','8787','--inspector-port','0']+test_args,cwd=root,stdout=log,stderr=subprocess.STDOUT)
  try:
   deadline=time.monotonic()+50
   while True:
    if server.poll() is not None:raise RuntimeError('Worker exited early')
    try:
     with urllib.request.urlopen('http://127.0.0.1:8787/api/hotels',timeout=10) as r:
      if r.status==200:break
    except (urllib.error.URLError,TimeoutError):
     if time.monotonic()>deadline:raise RuntimeError('Worker startup timed out')
     time.sleep(.5)
   test='scripts/check-public-access.py' if '--public-access' in sys.argv else 'scripts/check-runtime.py'
   subprocess.run(['python',test],cwd=root,check=True,timeout=180)
  except Exception:
   log.seek(0);print(log.read()[-8000:]);raise
  finally:
   server.terminate()
   try:server.wait(timeout=5)
   except subprocess.TimeoutExpired:server.kill();server.wait()
