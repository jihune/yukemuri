// D08 PR 3: the Oita Prefecture permit link rule (lib/oita-permits.ts) over a saved public search
// snapshot, the same way as docs/evidence/d08-jta-20261019/measure.mjs (the stored address cut
// from the search context; the builder reads the stored payload instead). Also writes the list's
// 旅館・ホテル rows no stay links: candidates for an L01 check only, never the collection queue.
// Usage: node docs/evidence/d08-oita-20261019/measure.mjs --dir saved [--out links.json] [--unlinked list-only.json]
//   saved/: core.json, cards.json and text.json of one snapshot (public GETs of /snapshot/manifest.json and its files).
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {compileLib} from '../../../scripts/build-search-snapshot.mjs';

const argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:null,dir=arg('--dir');
if(!dir)throw new Error('--dir saved-snapshot is required');
const NL=String.fromCharCode(10),temp=mkdtempSync(join(tmpdir(),'yukemuri-oita-measure-'));
const lines=(rows)=>'['+NL+rows.map(x=>JSON.stringify(x)).join(','+NL)+']';
try{
 const require=createRequire(import.meta.url),{oitaCandidates,resolveOitaPermits}=require(compileLib(temp,'lib/oita-permits.ts')),{addressParts}=require(join(temp,'lib/lodging-lists.js'));
 const read=name=>JSON.parse(readFileSync(join(dir,name+'.json'),'utf8')),core=read('core'),cards=read('cards'),text=read('text');
 const cut=JSON.parse(execFileSync('python3',['-c',[
  'import json,importlib.util,sys',
  "s=importlib.util.spec_from_file_location('p','scripts/priority-plan-diff.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
  "d=sys.argv[1];cards=json.load(open(d+'/cards.json',encoding='utf-8'));text=json.load(open(d+'/text.json',encoding='utf-8'))",
  "x=[m.stored_text(c,t or '') for c,t in zip(cards,text['context'])]",
  'json.dump([v[1] if v else None for v in x],sys.stdout,ensure_ascii=False)',
 ].join(NL),dir],{maxBuffer:1<<28,encoding:'utf8'}));
 const candidates=new Map(),oita=core.ids.flatMap((id,i)=>core.prefecture[i]==='pref-ooita'?[i]:[]);
 core.ids.forEach((id,i)=>{const found=oitaCandidates({names:cards[i].names,aliases:text.names[i]??[],prefecture:core.prefecture[i],location:{address:cut[i]??''}});if(found.length)candidates.set(id,found)});
 const links=resolveOitaPermits(candidates),rows=new Map();
 for(const [id,l] of links)rows.set(l.id,[...(rows.get(l.id)??[]),id]);
 const how=h=>[...links].filter(([id,l])=>candidates.get(id).some(c=>c.id===l.id&&c.how===h)).length;
 const source=id=>/^(jalan|trip)-/.exec(id)?.[1]??'curated',count=(xs,f)=>xs.reduce((m,x)=>(m[f(x)]=(m[f(x)]??0)+1,m),{});
 const data=JSON.parse(readFileSync('data/oita-ryokan-permits.json','utf8')),unlinked=data.rows.filter(r=>r[2]==='旅館・ホテル'&&!rows.has(r[0]));
 const result={
  stays:core.ids.length,oitaStays:oita.length,oitaCityStays:oita.filter(i=>addressParts(cut[i]??'').city==='大分市').length,oitaAddressNotCut:oita.filter(i=>cut[i]===null).length,
  linkedStays:links.size,bySource:Object.fromEntries(['jalan','trip','curated'].map(s=>[s,[...links.keys()].filter(id=>source(id)===s).length])),byName:{exact:how('exact'),part:how('part')},
  byKind:count([...links.values()],l=>l.kind),listRows:data.rows.length,listByKind:count(data.rows,r=>r[2]),linkedRows:rows.size,rowsWithSeveralStays:[...rows.values()].filter(v=>v.length>1).length,
  unlinkedHotelRyokanRows:unlinked.length,
  candidatesDropped:[...candidates.keys()].filter(id=>!links.has(id)).map(id=>[id,candidates.get(id)]),
  links:[...links].map(([id,l])=>[id,l.id]),
 };
 if(arg('--out'))writeFileSync(arg('--out'),'{'+Object.entries(result).map(([k,v])=>JSON.stringify(k)+':'+(k==='links'?lines(v):JSON.stringify(v))).join(','+NL)+'}'+NL);
 // ID, name and address only: the list as committed, never the operator or the phone.
 if(arg('--unlinked'))writeFileSync(arg('--unlinked'),'{"note":'+JSON.stringify('旅館・ホテル rows of data/oita-ryokan-permits.json (as of '+data.asOf+') no stay of the snapshot links. Not evidence that a stay is missing, unlicensed or closed; candidates for an L01 check only, never the collection queue.')+','+NL+'"rows":'+lines(unlinked.map(r=>[r[0],r[1],r[3]]))+'}'+NL);
 console.log(JSON.stringify({...result,links:undefined,candidatesDropped:undefined}));
}finally{rmSync(temp,{recursive:true,force:true})}
