import sys, re, html
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.out=[]; s.skip=0
    def handle_starttag(s,t,a):
        if t in ('script','style','noscript'): s.skip+=1
        if t in ('p','br','li','div','h1','h2','h3','h4','h5','tr','dt','dd','section','article','td','th'): s.out.append('\n')
    def handle_endtag(s,t):
        if t in ('script','style','noscript') and s.skip: s.skip-=1
    def handle_data(s,d):
        if not s.skip: s.out.append(d)
raw=open(sys.argv[1],'rb').read()
enc='utf-8'
m=re.search(rb'charset=["\']?([A-Za-z0-9_-]+)',raw[:3000])
if m: enc=m.group(1).decode()
if enc.lower() in ('shift_jis','sjis','x-sjis'): enc='cp932'
t=raw.decode(enc,errors='replace')
p=P(); p.feed(t)
txt=''.join(p.out)
txt=re.sub(r'[ \t\r\f\v]+',' ',txt)
txt=re.sub(r'\n\s*\n+','\n',txt)
open(sys.argv[2],'w',encoding='utf-8').write(txt)
print(len(txt))
