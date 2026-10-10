#!/usr/bin/env python3
"""Private portable checkpoint and fresh local SQLite recovery drill.

Export access is supplied as {url, token} on hidden stdin. Archives include
hashed visitor favorites, so keep them private. Reads are NOT atomic backups.
Restore refuses existing destinations and never contacts production.
"""
import argparse, gzip, hashlib, json, os, sqlite3, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import tempfile,threading
ROOT=Path(__file__).resolve().parents[1]
TABLES={'hotel_source_groups','hotel_source_observations','hotel_lifecycle','hotel_lifecycle_events','hotels','hotel_names','catalog_meta','crawl_jobs','favorites','visitor_favorites','hotel_name_localizations','hotel_description_translations','hotel_description_requests'}
def encoded(value):return (json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def migration_digest():
 digest=hashlib.sha256()
 for path in sorted((ROOT/'drizzle').glob('*.sql')):digest.update(path.name.encode()+b'\n'+path.read_bytes()+b'\n')
 return digest.hexdigest()
def read_access():
 if not sys.stdin.isatty():return json.loads(sys.stdin.readline())
 import termios
 previous=termios.tcgetattr(sys.stdin);hidden=termios.tcgetattr(sys.stdin);hidden[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
 print('Ready for private Site access JSON on stdin (input is hidden).',flush=True)
 try:return json.loads(sys.stdin.readline())
 finally:termios.tcsetattr(sys.stdin,termios.TCSANOW,previous)
def export(destination):
 access=read_access();site=urllib.parse.urlsplit(access['url'])
 if site.scheme!='https' or not site.hostname or not site.hostname.endswith('.chatgpt.site') or site.username or site.password:raise ValueError('Expected this Sites HTTPS URL')
 base=urllib.parse.urlunsplit((site.scheme,site.netloc,'','',''))
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):raise RuntimeError('Site redirected; private credential was not forwarded')
 clients=threading.local()
 def api(params=None):
  url=base+'/api/catalog-export'+('?' + urllib.parse.urlencode(params) if params else '')
  request=urllib.request.Request(url,headers={'OAI-Sites-Authorization':'Bearer '+access['token'],'X-Yukemuri-Crawl-Key':access['token'],'Accept':'application/json'})
  if not hasattr(clients,'opener'):clients.opener=urllib.request.build_opener(NoRedirect())
  with clients.opener.open(request,timeout=90) as response:return json.loads(response.read())
 if destination.exists():raise FileExistsError(destination)
 manifest=api();digest=hashlib.sha256();counts={}
 with tempfile.TemporaryDirectory(prefix='yukemuri-export-') as temporary:
  def collect(table):
   name=table['name']
   if name not in TABLES:raise ValueError('Unknown export table')
   path=Path(temporary)/name;count=0;cursor=None
   with open(path,'xb') as output:
    os.chmod(path,0o600)
    while True:
     params={'table':name,'limit':1000}
     if cursor is not None:params['after']=json.dumps(cursor,ensure_ascii=False)
     page=api(params)
     for row in page['rows']:output.write(encoded({'type':'row','table':name,'row':row}));count+=1
     next_cursor=page['next']
     if next_cursor is None:break
     if next_cursor==cursor:raise ValueError('Export cursor did not advance')
     cursor=next_cursor
   print(json.dumps({'exportedTable':name,'rows':count}),flush=True)
   return name,count
  # Three independent table traversals, each with a sequential PK cursor.
  with ThreadPoolExecutor(max_workers=3) as pool:
   for task in as_completed([pool.submit(collect,table) for table in manifest['tables']]):
    name,count=task.result();counts[name]=count
  after=api()
  with open(destination,'xb') as raw:
   os.chmod(destination,0o600)
   with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as archive:
    first=encoded({'type':'manifest','source':site.hostname,'migrationsSha256':migration_digest(),'manifest':manifest});archive.write(first);digest.update(first)
    for table in manifest['tables']:
     with open(Path(temporary)/table['name'],'rb') as rows:
      for line in rows:digest.update(line);archive.write(line)
    archive.write(encoded({'type':'complete','sha256':digest.hexdigest(),'counts':counts,'countsBefore':{t['name']:t['count'] for t in manifest['tables']},'countsAfter':{t['name']:t['count'] for t in after['tables']},'finishedAt':datetime.now(timezone.utc).isoformat(),'consistency':'non_atomic'}))
 print(json.dumps({'archive':str(destination.resolve()),'rows':counts,'bytes':destination.stat().st_size,'consistency':'non_atomic'},ensure_ascii=False))
def restore(archive,destination):
 # Reserving the file before opening SQLite prevents accidental overwrites.
 fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
 db=sqlite3.connect(destination);digest=hashlib.sha256();counts={};footer=None
 try:
  for path in sorted((ROOT/'drizzle').glob('*.sql')):db.executescript(path.read_text().replace('--> statement-breakpoint',''))
  with gzip.open(archive,'rb') as stream:
   first=stream.readline();header=json.loads(first);digest.update(first)
   if header.get('type')!='manifest' or header.get('migrationsSha256')!=migration_digest() or header['manifest'].get('format')!='yukemuri-checkpoint' or header['manifest'].get('version')!=1:raise ValueError('Checkpoint format/schema does not match this checkout')
   definitions={table['name']:table for table in header['manifest']['tables']}
   if set(definitions)!=TABLES:raise ValueError('Incomplete or unknown table set')
   columns={}
   for name in TABLES:
    actual=[row[1] for row in db.execute('PRAGMA table_info('+name+')')]
    if actual!=definitions[name]['columns']:raise ValueError('Column schema mismatch')
    columns[name]=actual;counts[name]=0
   for line in stream:
    value=json.loads(line)
    if value.get('type')=='complete':
     if footer is not None:raise ValueError('Duplicate completion record')
     footer=value
     if stream.read(1):raise ValueError('Trailing checkpoint data')
     break
    digest.update(line)
    name=value.get('table');row=value.get('row')
    if value.get('type')!='row' or name not in TABLES or not isinstance(row,dict) or set(row)!=set(columns[name]):raise ValueError('Invalid checkpoint row')
    db.execute('INSERT INTO '+name+' ('+','.join(columns[name])+') VALUES ('+','.join('?' for _ in columns[name])+')',[row[k] for k in columns[name]]);counts[name]+=1
   if footer is None or footer.get('sha256')!=digest.hexdigest() or footer.get('counts')!=counts:raise ValueError('Checkpoint integrity/count check failed')
  # In-flight jobs cannot be restored with claims from a previous runtime.
  db.execute("UPDATE crawl_jobs SET status=CASE WHEN status='running' THEN 'retry' ELSE status END,lease_token=NULL,lease_until=0,last_token=NULL")
  db.commit()
  if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity check failed')
  print(json.dumps({'restored':str(destination.resolve()),'rows':counts,'integrity':'ok','productionChanged':False,'consistency':footer['consistency']},ensure_ascii=False))
 except BaseException:
  db.close();destination.unlink(missing_ok=True);raise
 finally:db.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='action',required=True)
 e=sub.add_parser('export');e.add_argument('--out',type=Path,required=True)
 r=sub.add_parser('restore');r.add_argument('--archive',type=Path,required=True);r.add_argument('--out',type=Path,required=True)
 args=parser.parse_args()
 if args.action=='export':export(args.out)
 else:restore(args.archive,args.out)
