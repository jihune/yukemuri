// D08 PR 3 Oita Prefecture lodging business permits: the reader of scripts/update-oita-permits.py
// (the operator and the phone never leave it), which rows it writes (a 簡易宿所 or 下宿 row only when
// a stay links it), robots.txt before any other request in both list updaters, the committed list
// (data/oita-ryokan-permits.json), and the link rule
// (lib/oita-permits.ts) on stays shaped like ours against real rows of the list. Every link it
// must make sits beside the nearest stay it must refuse.
// Usage: node scripts/check-oita-permits.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {compileLib} from './build-search-snapshot.mjs';

const require=createRequire(import.meta.url),temp=mkdtempSync(join(tmpdir(),'yukemuri-oita-'));
const NL=String.fromCharCode(10);
const python=(lines,input)=>{const run=spawnSync('python3',['-c',lines.join(NL)],{input,encoding:'utf8'});return{...run,out:run.status===0?JSON.parse(run.stdout):null}};
const load=file=>`import importlib.util as u,json,sys,urllib.error;s=u.spec_from_file_location('m','${file}');m=u.module_from_spec(s);s.loader.exec_module(m)`;
try{
 // The reader, on a list shaped like the prefecture's CSV (made-up rows; the operators and phones
 // here are not real). A person whose whole name is the facility's (湯川太郎宅) takes the row with
 // them; a company named in its facility's name does not.
 const header=['全国地方公共団体コード','ID','地方公共団体名','施設名称','営業の種類','所在地_連結表記','施設電話番号','開設者名（法人名）','許可番号','許可年月日'];
 const csv=[header,
  ['440001','KN440019001','大分県','湯けむり荘','旅館・ホテル','大分県別府市北浜１－２－３','0977-00-0001','湯川花子','1234','2001/4/1'],
  ['440001','KN440019002','大分県','湯川太郎宅','簡易宿所','大分県由布市湯布院町川上９','0977-00-0002','湯川　太郎','指令第1号','2024/12/25'],
  ['440001','KN440019003','大分県','湯の香観光株式会社保養所','旅館・ホテル','大分県竹田市直入町長湯１','0974-00-0003','湯の香観光株式会社','55',''],
  ['440001','KN440019004','大分県','ゲストハウス　ゆのか','下宿','大分県日田市元町２','','（株）ゆのか','',''],
 ].map(r=>r.map(v=>'"'+v+'"').join(',')).join(String.fromCharCode(13,10))+String.fromCharCode(13,10)+String.fromCharCode(13,10);
 const read=python([load('scripts/update-oita-permits.py'),'print(json.dumps(m.rows(sys.stdin.read()),ensure_ascii=False))'],csv);
 assert.equal(read.status,0,read.stderr);
 assert.deepEqual(read.out,[[
  ['KN440019001','湯けむり荘','旅館・ホテル','大分県別府市北浜1-2-3','1234','2001-04-01'],
  ['KN440019003','湯の香観光株式会社保養所','旅館・ホテル','大分県竹田市直入町長湯1','55',''],
  ['KN440019004','ゲストハウス ゆのか','下宿','大分県日田市元町2','',''],
 ],1],'the kept columns, NFKC, the date as YYYY-MM-DD, the row named after a person who runs it dropped');
 for(const word of ['湯川花子','湯川','0977-00-0001','0974-00-0003','(株)ゆのか'])assert(!read.stdout.includes(word),'never written: '+word);
 const noOperator=python([load('scripts/update-oita-permits.py'),'print(json.dumps(m.rows(sys.stdin.read())))'],csv.replace('開設者名（法人名）','代表者'));
 assert.notEqual(noOperator.status,0,'a list without the operator column stops: the person rule cannot run');

 // The rows written: every 旅館・ホテル row, a 簡易宿所 or 下宿 row only when a stay of the saved
 // snapshot links it (a home nothing links can point to a person; D08 16). A made-up snapshot: an
 // Oita stay with ゆのか's name and address, and a Kumamoto stay with 湯川邸's.
 const snap=mkdtempSync(join(temp,'s-')),save=(name,value)=>writeFileSync(join(snap,name+'.json'),JSON.stringify(value));
 save('manifest',{id:'0123456789abcdef'});save('core',{ids:['jalan-1','jalan-2'],prefecture:['pref-ooita','pref-kumamoto']});
 save('cards',[{names:{ja:'ゆのか'},location:{label:'유후인 · 오이타'}},{names:{ja:'湯川邸'},location:{label:'구마모토 · 구마모토'}}]);
 save('text',{names:[['ゆのか'],['湯川邸']],context:['유후인 · 오이타 大分県由布市湯布院町川上１２７０－２８ 유후인 · 오이타 오이타','구마모토 · 구마모토 大分県由布市湯布院町川南9 구마모토 · 구마모토 구마모토']});
 const listed=[
  ['KN440019101','湯けむり荘','旅館・ホテル','大分県別府市北浜1-2-3','1','2001-04-01'],
  ['KN440019102','ゆのか','簡易宿所','大分県由布市湯布院町川上1270-28','2','2020-01-01'],
  ['KN440019103','湯川邸','簡易宿所','大分県由布市湯布院町川南9','3',''],
  ['KN440019104','ゆけむり寮','下宿','大分県日田市元町2','4',''],
 ];
 const kept=python([load('scripts/update-oita-permits.py'),'from pathlib import Path','a=json.load(sys.stdin)','snapshot,oita=m.stays(Path(a["dir"]))','linked=m.linked_rows(a["rows"],oita)','print(json.dumps([snapshot,sorted(linked),[r[0] for r in m.keep(a["rows"],linked)]]))'],JSON.stringify({dir:snap,rows:listed}));
 assert.equal(kept.status,0,kept.stderr);
 assert.deepEqual(kept.out,['0123456789abcdef',['KN440019102'],['KN440019101','KN440019102']],'the hotel, and the guesthouse a stay links; not the guesthouse or boarding house no stay links');

 // robots.txt is read before any other request, its rules hold for every address, and a failure
 // other than none being there (404) stops the run (Claude review on PR #199).
 // 'later': robots.txt allows the first address and refuses the next one (the PDFs, the CSV).
 const updaters=[
  {file:'scripts/update-jta-registered.py',args:[],later:'/kankocho/content/',answer:`'<a href="/kankocho/content/1.pdf"><span>登録ホテル一覧</span></a><a href="/kankocho/content/2.pdf"><span>登録旅館一覧</span></a>'.encode()`},
  {file:'scripts/update-oita-permits.py',args:['--snapshot',snap],later:'/dataset/',answer:`json.dumps({"result":{"license_id":"cc-by-40-intl","resources":[{"format":"CSV","url":"https://data.bodik.jp/dataset/a/resource/b/download/c.csv"}]}}).encode()`},
 ];
 for(const {file,args,later,answer} of updaters){
  const run=python([load(file),'m.time.sleep=lambda s:None','out={}',
   'for mode in ("404","503","disallow","allow","later"):',
   ' calls=[]',
   ' def get(url,mode=mode,calls=calls):',
   '  calls.append(url)',
   `  if mode=="later" and len(calls)==2:return ${answer}`,
   '  if not url.endswith("/robots.txt"):raise RuntimeError("next")',
   '  if mode in ("404","503"):raise urllib.error.HTTPError(url,int(mode),"",{},None)',
   `  return ("User-agent: *"+chr(10)+"Disallow: "+{"disallow":"/","allow":"/private/","later":"${later}"}[mode]).encode()`,
   ' m.get=get',
   ` try:m.main(${JSON.stringify(args)})`,
   ' except SystemExit:out[mode]=["stopped",calls]',
   ' except RuntimeError:out[mode]=["went on",calls]',
   'print(json.dumps(out))']);
  assert.equal(run.status,0,run.stderr);
  const robots=run.out['404'][1][0],first=run.out['404'][1][1];
  assert.match(robots,/^https:[/][/][^/]+[/]robots[.]txt$/,file);
  assert.equal(new URL(first).host,new URL(robots).host,file);
  assert.deepEqual(run.out,{'404':['went on',[robots,first]],'503':['stopped',[robots]],disallow:['stopped',[robots]],allow:['went on',[robots,first]],later:['stopped',[robots,first]]},file);
 }

 // The committed list.
 const data=JSON.parse(readFileSync('data/oita-ryokan-permits.json','utf8'));
 const attribution=require(compileLib(mkdtempSync(join(temp,'a-')),'lib/oita-attribution.ts'));
 assert.equal(data.license,'CC BY 4.0');assert(!Number.isNaN(Date.parse(data.retrievedAt)));assert.match(data.asOf,/^\d{4}-\d{2}-\d{2}$/);
 assert.deepEqual(attribution.OITA_LINKS.map(l=>l.url),[data.source,data.licenseUrl],'the page credits the dataset and the license the data names');
 assert.equal(data.credit,attribution.OITA_ATTRIBUTION.replace('を加工して作成','（'+data.source+'）を加工して作成'));
 assert.equal(data.count,data.rows.length);assert(data.rows.filter(r=>r[2]==='旅館・ホテル').length>800,'about 900 hotels and ryokan');
 const ids=data.rows.map(r=>r[0]);assert.equal(new Set(ids).size,ids.length,'one row per list ID');
 // A 簡易宿所 or 下宿 row is there only because a stay of the snapshot the updater read links it.
 const linked=new Set(data.linked.rows);assert.match(data.linked.snapshot,/^[0-9a-f]{16}$/);
 assert.deepEqual(data.rows.filter(r=>r[2]!=='旅館・ホテル'&&!linked.has(r[0])).map(r=>r[0]),[],'no 簡易宿所 or 下宿 row that no stay links');
 assert(data.linked.rows.every(id=>ids.includes(id)),'every linked row is written');
 assert(Number.isInteger(data.leftOut.namedAfterPerson)&&Number.isInteger(data.leftOut.notLinkedNotHotel));
 for(const r of data.rows){
  assert.equal(r.length,6,r[0]+': ID, name, kind, address, permit number, permit date and nothing else');
  assert.match(r[0],/^KN44\d{7}$/);assert(r[1]&&r[3],r[0]);assert(['旅館・ホテル','簡易宿所','下宿'].includes(r[2]),r[0]);assert.match(r[5],/^(\d{4}-\d{2}-\d{2})?$/,r[0]);
  for(const v of r)assert.doesNotMatch(v,/0\d{1,4}-\d{1,4}-\d{4}/,r[0]+': no phone');
 }

 // The rule, on the list's own rows.
 const dir=mkdtempSync(join(temp,'r-')),{oitaCandidates,resolveOitaPermits}=require(compileLib(dir,'lib/oita-permits.ts')),{addressParts}=require(join(dir,'lib/lodging-lists.js'));
 assert.equal(data.rows.filter(r=>addressParts(r[3]).prefecture!=='pref-ooita').length,0,'every row is in Oita Prefecture');
 assert.equal(data.rows.filter(r=>addressParts(r[3]).city==='大分市').length,0,'Oita city keeps its own list');
 const stay=(prefecture,address,...names)=>({names:{ko:names[0],ja:names[0],en:names[0]},aliases:names.slice(1),prefecture,location:{address}});
 const one=(...args)=>resolveOitaPermits(new Map([['jalan-1',oitaCandidates(stay(...args))]])).get('jalan-1')?.id??null;
 // A tagline before the name, the list's 他 after the lot numbers (KN440010698).
 assert.equal(one('pref-ooita','大分県由布市湯布院町川西２１７４－１４３','湯布院　山下湖ロッジ'),'KN440010698');
 assert.equal(one('pref-ooita','大分県由布市湯布院町川西２１７５－１４３','湯布院　山下湖ロッジ'),null,'another lot');
 // The town without its district, and another name for the place with the same lot (KN440011361).
 assert.equal(one('pref-ooita','大分県玖珠郡九重町筋湯温泉739','八丁原ヴューホテル'),'KN440011361');
 assert.equal(one('pref-ooita','大分県玖珠郡玖珠町筋湯温泉739','八丁原ヴューホテル'),null,'another town');
 assert.equal(one('pref-kumamoto','大分県玖珠郡九重町筋湯温泉739','八丁原ヴューホテル'),null,'another prefecture');
 assert.equal(one('pref-ooita','大分県大分市駅前町１３－４','別府ステーションホテル'),null,'a stay in Oita city has no row');
 // What the card carries (KN440010155).
 const row=data.rows.find(r=>r[0]==='KN440010155');
 const p=resolveOitaPermits(new Map([['jalan-2',oitaCandidates(stay('pref-ooita','大分県別府市駅前町１３－４','別府ステーションホテル'))]])).get('jalan-2');
 assert.deepEqual(p,{id:'KN440010155',kind:'旅館・ホテル',permitted:row[5],asOf:data.asOf});
 console.log(JSON.stringify({passed:'Oita permit reader, guesthouse rows only when linked, robots first in both list updaters, committed list, link rule with refusals',rows:data.rows.length,asOf:data.asOf}));
}finally{rmSync(temp,{recursive:true,force:true})}
