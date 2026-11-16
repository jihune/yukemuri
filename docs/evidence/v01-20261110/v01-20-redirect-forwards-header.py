"""V01-20 (라): what urllib does with a custom request header on a redirect when no handler stops it.
Two servers on 127.0.0.1 only; the first answers 302 to the second. No outside request."""
import http.server, threading, urllib.request
seen = {}
class Target(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        seen['key'] = self.headers.get('X-Yukemuri-Crawl-Key'); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b'{}')
    def log_message(self, *args): pass
target = http.server.HTTPServer(('127.0.0.1', 0), Target)
class First(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(302); self.send_header('Location', 'http://127.0.0.1:%d/elsewhere' % target.server_address[1]); self.end_headers()
    def log_message(self, *args): pass
first = http.server.HTTPServer(('127.0.0.1', 0), First)
for server in (target, first): threading.Thread(target=server.handle_request, daemon=True).start()
request = urllib.request.Request('http://127.0.0.1:%d/api/crawl' % first.server_address[1], headers={'X-Yukemuri-Crawl-Key': 'placeholder-not-a-key'})
with urllib.request.build_opener().open(request, timeout=10) as response: response.read()
print('default opener followed the redirect; header at the second server:', seen.get('key'))
class NoSiteRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): raise RuntimeError('Private Site redirected; credential was not forwarded')
seen.clear()
for server in (target, first): threading.Thread(target=server.handle_request, daemon=True).start()
try:
    urllib.request.build_opener(NoSiteRedirect()).open(request, timeout=10)
except RuntimeError as error:
    print('with update-site.py\'s handler:', error, '| header at the second server:', seen.get('key'))
