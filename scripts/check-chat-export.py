#!/usr/bin/env python3
"""Exercise sharded/legacy exports, shared assets and private-output boundaries."""
import hashlib,json,subprocess,sys,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILE='file_'+'1'*32
LIB='libfile_'+'2'*32

def invoke(archive,out,ids,library=None):
 args=[sys.executable,str(ROOT/'scripts/import-chat-export.py'),'--zip',str(archive),'--out',str(out),'--ids',str(ids)]
 if library:args+=['--library-ids',str(library)]
 return subprocess.run(args,text=True,capture_output=True)

with tempfile.TemporaryDirectory() as temp:
 temp=Path(temp); ids=temp/'ids.json';ids.write_text(json.dumps(['one','two']))
 conversations=[{'id':cid,'title':'fixture','mapping':{'root':{'parent':None,'message':None},
  'message':{'parent':'root','message':{'author':{'role':'user'},'content':{'parts':['sediment://'+FILE]},'metadata':{'tool_icons':['file_'+'9'*32]}}},
  'alternate':{'parent':'root','message':{'author':{'role':'assistant'},'content':{'parts':['alternate preserved']}}}}} for cid in ['one','two']]
 archive=temp/'split.zip'
 with zipfile.ZipFile(archive,'w') as z:
  z.writestr('conversations-000.json',json.dumps([conversations[0]]));z.writestr('conversations-001.json',json.dumps([conversations[1]]))
  z.writestr('sectioned_conversations.json','[]');z.writestr('../../'+FILE+'.dat',b'original attachment')
  z.writestr('conversation_asset_file_names.json',json.dumps({'../../'+FILE+'.dat':'original.png'}))
 result=invoke(archive,temp/'split',ids);assert result.returncode==0,result.stderr
 manifest=json.loads((temp/'split/manifest.json').read_text());assert len(manifest['assets'])==1
 assert len(manifest['selectedConversations'])==2 and all(not x['unresolvedFileReferences'] for x in manifest['selectedConversations'])
 for expected,entry in zip(conversations,manifest['selectedConversations']):
  assert json.loads((temp/'split'/entry['json']).read_text())==expected
 asset=manifest['assets'][0];assert (temp/'split'/asset['savedAs']).read_bytes()==b'original attachment'
 assert asset['originalFilename']=='original.png';assert not (temp.parent/FILE).exists()
 assert invoke(archive,temp/'split',ids).returncode!=0
 assert invoke(archive,ROOT/'tracked-output-forbidden',ids).returncode!=0
 assert not (ROOT/'tracked-output-forbidden').exists()
 legacy=temp/'legacy.zip'
 with zipfile.ZipFile(legacy,'w') as z:
  z.writestr('conversations.json',json.dumps(conversations));z.writestr(FILE+'.dat',b'original attachment')
 assert invoke(legacy,temp/'legacy',ids).returncode==0
 duplicated=temp/'duplicate.zip'
 with zipfile.ZipFile(duplicated,'w') as z:
  z.writestr('conversations-000.json',json.dumps([conversations[0]]));z.writestr('conversations-001.json',json.dumps([conversations[0]]))
 assert invoke(duplicated,temp/'duplicate',ids).returncode!=0
 assert not (temp/'duplicate').exists()
 ids.write_text(json.dumps(['not-present']));assert invoke(archive,temp/'unknown',ids).returncode!=0
 assert not (temp/'unknown').exists()
print('Chat export checks passed: shards/legacy, every branch, shared asset reuse, icon exclusion, traversal-safe names, duplicate/unknown ID and overwrite/repository refusal.')
