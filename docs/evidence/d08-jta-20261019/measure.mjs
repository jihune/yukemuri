// D08 PR 1: the JTA link rule (lib/jta-registration.ts) over a saved public search snapshot.
// The snapshot carries each stay's names, aliases and prefecture; the stored address is cut from
// the search context by scripts/priority-plan-diff.py's rule (stored_text). The builder reads
// the stored payload instead, so the deployed cards can differ from this where a cut fails.
// Usage: node docs/evidence/d08-jta-20261019/measure.mjs --dir saved [--out links.json]
//   saved/: core.json, cards.json and text.json of one snapshot (public GETs of /snapshot/manifest.json and its files).
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {compileLib} from '../../../scripts/build-search-snapshot.mjs';

const argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:null,dir=arg('--dir');
if(!dir)throw new Error('--dir saved-snapshot is required');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-jta-measure-'));
try{
 const {jtaCandidates,resolveJtaLinks}=createRequire(import.meta.url)(compileLib(temp,'lib/jta-registration.ts'));
 const read=name=>JSON.parse(readFileSync(join(dir,name+'.json'),'utf8')),core=read('core'),cards=read('cards'),text=read('text');
 const cut=JSON.parse(execFileSync('python3',['-c',[
  'import json,importlib.util,sys',
  "s=importlib.util.spec_from_file_location('p','scripts/priority-plan-diff.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
  "d=sys.argv[1];cards=json.load(open(d+'/cards.json',encoding='utf-8'));text=json.load(open(d+'/text.json',encoding='utf-8'))",
  "x=[m.stored_text(c,t or '') for c,t in zip(cards,text['context'])]",
  'json.dump([v[1] if v else None for v in x],sys.stdout,ensure_ascii=False)',
 ].join(String.fromCharCode(10)),dir],{maxBuffer:1<<28,encoding:'utf8'}));
 const candidates=new Map();
 core.ids.forEach((id,i)=>{const found=jtaCandidates({names:cards[i].names,aliases:text.names[i]??[],prefecture:core.prefecture[i],location:{address:cut[i]??''}});if(found.length)candidates.set(id,found)});
 const links=resolveJtaLinks(candidates),rows=new Map();
 for(const [id,l] of links)rows.set(l.number,[...(rows.get(l.number)??[]),id]);
 const how=h=>[...links].filter(([id,l])=>candidates.get(id).some(c=>c.number===l.number&&c.how===h)).length;
 const source=id=>/^(jalan|trip)-/.exec(id)?.[1]??'curated';
 const data=JSON.parse(readFileSync('data/jta-registered.json','utf8'));
 const result={
  stays:core.ids.length,addressNotCut:cut.filter(c=>c===null).length,
  linkedStays:links.size,byKind:{hotel:[...links.values()].filter(l=>l.kind==='hotel').length,ryokan:[...links.values()].filter(l=>l.kind==='ryokan').length},
  bySource:Object.fromEntries(['jalan','trip','curated'].map(s=>[s,[...links.keys()].filter(id=>source(id)===s).length])),byName:{exact:how('exact'),part:how('part')},
  listRows:data.rows.length,linkedRows:rows.size,rowsWithSeveralStays:[...rows.values()].filter(v=>v.length>1).length,
  candidatesDropped:[...candidates.keys()].filter(id=>!links.has(id)).map(id=>[id,candidates.get(id)]),
  links:[...links].map(([id,l])=>[id,l.number]),
 };
 const body=JSON.stringify({...result,links:undefined,candidatesDropped:undefined});
 if(arg('--out'))writeFileSync(arg('--out'),'{'+Object.entries(result).map(([k,v])=>JSON.stringify(k)+':'+(k==='links'?'['+String.fromCharCode(10)+v.map(x=>JSON.stringify(x)).join(','+String.fromCharCode(10))+']':JSON.stringify(v))).join(','+String.fromCharCode(10))+'}'+String.fromCharCode(10));
 console.log(body);
}finally{rmSync(temp,{recursive:true,force:true})}
