#!/usr/bin/env python3
"""Inventory a ChatGPT export or preserve explicitly selected conversations.

Write owner-only output outside tracked repository content. Preserve every
mapping node and the original conversation JSON, including alternate branches.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zip', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True, help='New owner-only directory; never commit')
parser.add_argument('--ids', type=Path, help='JSON array of selected conversation IDs; omit to inventory only')
parser.add_argument('--library-ids', type=Path, help='Additional explicitly selected Library IDs')
args = parser.parse_args()
source = args.zip.resolve()
output = args.out.resolve()
if output.exists(): raise SystemExit('Refusing existing output directory')
repo = Path(__file__).resolve().parents[1]
if output.is_relative_to(repo) and not output.is_relative_to(repo/'private'):
    raise SystemExit('Use a private directory outside tracked repository content')

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def save(name, value):
    p = output/name
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    p.chmod(0o600)

with zipfile.ZipFile(source) as archive:
    names = archive.namelist()
    choices = [n for n in names if Path(n).name == 'conversations.json' and not n.endswith('/')]
    if len(names) != len(set(names)): raise SystemExit('Duplicate ZIP entry')
    if len(choices) > 1: raise SystemExit('Ambiguous conversations.json')
    choices = choices or sorted(n for n in names if re.search(r'(^|/)conversations-\d+\.json$',n))
    if not choices: raise SystemExit('No supported conversation JSON or numbered shards')
    conversations = []
    for entry in choices:
        values = json.loads(archive.read(entry))
        if not isinstance(values,list): raise SystemExit('Unexpected conversations format')
        conversations.extend(values)
    library = json.loads(archive.read('library_files.json')) if 'library_files.json' in names else []
    def library_id(item):
        value=item.get('id')
        return value.get('id') if isinstance(value,dict) else value
    library_by_id={library_id(item):item for item in library}
    asset_names=json.loads(archive.read('conversation_asset_file_names.json')) if 'conversation_asset_file_names.json' in names else {}
    by_id = {}
    for c in conversations:
        cid = c.get('id') or c.get('conversation_id')
        if not isinstance(cid,str) or cid in by_id: raise SystemExit('Missing or duplicate conversation ID')
        by_id[cid] = c
    selected_ids = json.loads(args.ids.read_text()) if args.ids else []
    if not isinstance(selected_ids,list) or any(not isinstance(x,str) for x in selected_ids):
        raise SystemExit('--ids must contain a JSON array of conversation IDs')
    if len(set(selected_ids)) != len(selected_ids): raise SystemExit('Duplicate selected ID')
    missing = set(selected_ids)-by_id.keys()
    if missing: raise SystemExit('Selected IDs not found: '+', '.join(sorted(missing)))
    extra_ids=json.loads(args.library_ids.read_text()) if args.library_ids else []
    if not isinstance(extra_ids,list) or any(not isinstance(x,str) for x in extra_ids): raise SystemExit('Invalid Library selection')
    if len(set(extra_ids))!=len(extra_ids) or set(extra_ids)-library_by_id.keys(): raise SystemExit('Unknown or duplicate Library selection')
    referenced_library=set(extra_ids)
    os.umask(0o077)
    output.mkdir(parents=True,mode=0o700)
    save('inventory.json',[{'id':cid,'title':c.get('title'),'createTime':c.get('create_time'),
          'updateTime':c.get('update_time'),'mappingNodes':len(c.get('mapping') or {}),
          'candidate':bool(re.search(r'유케무리|yukemuri|湯けむり',json.dumps(c,ensure_ascii=False),re.I))}
          for cid,c in by_id.items() if not args.ids or cid in selected_ids])
    summary = []
    asset_registry = {}
    def copy_assets(references):
        assets=[]
        for name in names:
            if name.endswith('/') or name in choices: continue
            base=Path(name).name
            if not any(ref in base for ref in references): continue
            if name not in asset_registry:
                local=output/'assets'/hashlib.sha256(name.encode()).hexdigest()
                local.parent.mkdir(exist_ok=True)
                with archive.open(name) as src,local.open('xb') as dst: shutil.copyfileobj(src,dst)
                local.chmod(0o600)
                asset_registry[name]={'zipEntry':name,'savedAs':str(local.relative_to(output)),
                    'originalFilename':asset_names.get(name,base),'bytes':local.stat().st_size,'sha256':digest(local)}
            assets.append(asset_registry[name])
        matched={r for r in references if any(r in a['zipEntry'] for a in assets)}
        return assets,sorted(references-matched)
    for cid in selected_ids:
        c = by_id[cid]
        stem = hashlib.sha256(cid.encode()).hexdigest()[:24]
        save('conversations/'+stem+'.json',c)
        mapping = c.get('mapping') or {}
        parts = ['# '+str(c.get('title','Untitled')),'','Conversation ID: '+cid,
                 'All exported mapping nodes follow; this is not a single selected branch.','']
        for node_id,node in mapping.items():
            message = node.get('message') or {}
            if not message: continue
            author = message.get('author') or {}
            parts += ['## '+str(author.get('role','unknown'))+' · '+str(message.get('create_time','')),
                      'Node: '+str(node_id)+'; parent: '+str(node.get('parent')),'',
                      '```json',json.dumps(message,ensure_ascii=False,indent=2),'```','']
        md = output/'conversations'/(stem+'.md')
        md.write_text('\n'.join(parts)); md.chmod(0o600)
        text = json.dumps(c,ensure_ascii=False)
        # Provider icons and help-page slugs are not conversation attachments.
        def reference_text(value):
            if isinstance(value,dict): return ' '.join(reference_text(v) for k,v in value.items() if k!='tool_icons')
            if isinstance(value,list): return ' '.join(reference_text(v) for v in value)
            return value if isinstance(value,str) else ''
        references=set(re.findall(r'(?<![A-Za-z0-9_])(?:file-[A-Za-z0-9_-]{10,}|file_[0-9a-fA-F]{32})',reference_text(c)))
        references={r for r in references if r.startswith('file_') or re.search(r'[A-Z0-9]',r[5:]) or any(r in Path(n).name for n in names)}
        libraries=set(re.findall(r'libfile_[A-Za-z0-9]+',text)) & library_by_id.keys()
        referenced_library |= libraries
        references |= {library_by_id[x]['file_id'] for x in libraries if library_by_id[x].get('file_id')}
        assets,unresolved=copy_assets(references)
        summary.append({'id':cid,'title':c.get('title'),'json':'conversations/'+stem+'.json',
                        'mappingNodes':len(mapping),'assets':assets,
                        'unresolvedFileReferences':unresolved})
    project_library=[library_by_id[x] for x in sorted(referenced_library)]
    save('project-library-files.json',project_library)
    _,unresolved_library=copy_assets({x['file_id'] for x in project_library if x.get('file_id')})
    save('manifest.json',{'format':'yukemuri-chat-export-selection','version':2,
          'sourceZipSha256':digest(source),'sourceEntries':choices,
          'exportedConversations':len(conversations),'selectedConversations':summary,'assets':list(asset_registry.values()),
          'selectedLibraryFiles':len(project_library),'unresolvedLibraryFileReferences':unresolved_library,
          'coverage':'Export contents only. Project membership, missing Work sessions and non-file asset references require manual reconciliation.'})
print(json.dumps({'output':str(output),'exportedConversations':len(conversations),'selected':len(summary)},ensure_ascii=False))
