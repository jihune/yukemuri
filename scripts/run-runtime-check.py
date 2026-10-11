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
# List and search no longer reach the Worker (P03); the runner answers them
# from a snapshot of the same isolated D1 and passes the rest to the Worker.
subprocess.run(['node','--import','./scripts/sites-env.mjs','scripts/serve-former-worker.mjs','scripts/check-runtime.py'],cwd=root,check=True,timeout=400)
