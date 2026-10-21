// D08 PR 3 Oita Prefecture lodging business permits: the reader of scripts/update-oita-permits.py
// (the operator and the phone never leave it), which rows it writes (a 簡易宿所 or 下宿 row only when
// a stay links it), paced requests with no robots.txt and no redirect in both list updaters (C08), the committed list
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

 // Neither updater requests robots.txt (C08, user decision 2026-10-21), and every request after
 // the first waits 3 seconds. 'elsewhere' and 'plain': the catalog puts the CSV on another host or
 // on plain HTTP, which stops the run before the CSV (Codex and Claude reviews on PR #211).
 // The run is cut once the requests are done (the PDF reader, the CSV reader).
 const updaters=[
  {file:'scripts/update-jta-registered.py',args:[],cut:'m.subprocess.run=cut',
   answer:`'<a href="/kankocho/content/1.pdf"><span>登録ホテル一覧</span></a><a href="/kankocho/content/2.pdf"><span>登録旅館一覧</span></a>'.encode()`,
   requests:['https://www.mlit.go.jp/kankocho/seisaku_seido/kokusaikankohotel/index.html','https://www.mlit.go.jp/kankocho/content/1.pdf','https://www.mlit.go.jp/kankocho/content/2.pdf']},
  {file:'scripts/update-oita-permits.py',args:['--snapshot',snap],cut:'m.rows=cut',
   answer:`json.dumps({"result":{"license_id":"cc-by-40-intl","resources":[{"format":"CSV","url":"https://data.bodik.jp/dataset/a/resource/b/download/c.csv"}]}}).encode()`,
   elsewhere:`json.dumps({"result":{"license_id":"cc-by-40-intl","resources":[{"format":"CSV","url":"https://files.example/c.csv"}]}}).encode()`,
   plain:`json.dumps({"result":{"license_id":"cc-by-40-intl","resources":[{"format":"CSV","url":"http://data.bodik.jp/dataset/a/resource/b/download/c.csv"}]}}).encode()`,
   requests:['https://data.bodik.jp/api/3/action/package_show?id=440001_ryokan_business','https://data.bodik.jp/dataset/a/resource/b/download/c.csv']},
 ];
 for(const {file,args,cut,answer,elsewhere,plain,requests} of updaters){
  const run=python([load(file),'events=[]','m.time.sleep=lambda s:events.append(["sleep",s])',
   'def cut(*a,**k):raise RuntimeError("requests done")',cut,'out={}',
   `for mode in ("ok",${elsewhere?'"elsewhere","plain"':''}):`,
   ' events.clear()',
   ' def get(url,mode=mode):',
   '  events.append(["get",url])',
   `  if len(events)==1:return {"ok":${answer}${elsewhere?`,"elsewhere":${elsewhere},"plain":${plain}`:''}}[mode]`,
   '  return b"%PDF"',
   ' m.get=get',
   ` try:m.main(${JSON.stringify(args)})`,
   ' except SystemExit:out[mode]=["stopped",events[:]]',
   ' except RuntimeError:out[mode]=["went on",events[:]]',
   ' except Exception as e:out[mode]=[type(e).__name__,events[:]]',
   'print(json.dumps(out))']);
  assert.equal(run.status,0,run.stderr);
  const paced=requests.flatMap((url,i)=>i?[['sleep',3],['get',url]]:[['get',url]]);
  assert.deepEqual(run.out.ok,['went on',paced],file+': the pages only, no robots.txt, 3 seconds before each later request');
  assert(!JSON.stringify(run.out).includes('robots'),file+': no robots.txt');
  if(elsewhere)assert.deepEqual([run.out.elsewhere,run.out.plain],[['stopped',paced.slice(0,1)],['stopped',paced.slice(0,1)]],file);
  // No redirect is followed, not even to HTTPS on the same host: each hop would be a request with
  // no pause before it (D08 #211 last review P3).
  const hop=python([load(file),'import urllib.request','h=m.NoRedirect();r=urllib.request.Request("https://www.example.jp/a")','out=[]',
   'for to in ("https://www.example.jp/b","https://files.example/b","http://www.example.jp/b"):',' try:h.redirect_request(r,None,302,"",{},to);out.append("followed")',' except SystemExit:out.append("refused")','print(json.dumps(out))']);
  assert.equal(hop.status,0,hop.stderr);assert.deepEqual(hop.out,['refused','refused','refused'],file);
  // And every request goes through that handler (Claude review on PR #211): get() builds its opener with it.
  const via=python([load(file),'import urllib.request','handlers=[]',
   'class Response:',' read=lambda self:b"ok"',' __enter__=lambda self:self',' __exit__=lambda self,*a:None',
   'class Opener:',' open=lambda self,*a,**k:Response()',
   'def build(*h):',' handlers.extend(h);return Opener()',
   'urllib.request.build_opener=build','body=m.get("https://www.example.jp/a")','print(json.dumps([body.decode(),any(isinstance(h,m.NoRedirect) for h in handlers)]))']);
  assert.equal(via.status,0,via.stderr);assert.deepEqual(via.out,['ok',true],file+': get() opens through NoRedirect');
  // Through urllib itself: a redirecting server sees one request and the run stops.
  const served=python([load(file),'import http.server,threading','seen=[]',
   'class H(http.server.BaseHTTPRequestHandler):',
   ' def do_GET(self):seen.append(self.path);self.send_response(302);self.send_header("Location","/b");self.end_headers()',
   ' def log_message(self,*a):pass',
   's=http.server.HTTPServer(("127.0.0.1",0),H);threading.Thread(target=s.serve_forever,daemon=True).start()',
   'try:m.get("http://127.0.0.1:%d/a"%s.server_port);out="followed"','except SystemExit:out="refused"',
   's.shutdown();print(json.dumps([out,seen]))']);
  assert.equal(served.status,0,served.stderr);assert.deepEqual(served.out,['refused',['/a']],file);
 }

 // The committed list.
 const data=JSON.parse(readFileSync('data/oita-ryokan-permits.json','utf8'));
 const attribution=require(compileLib(mkdtempSync(join(temp,'a-')),'lib/oita-attribution.ts'));
 assert.equal(data.license,'CC BY 4.0');assert(!Number.isNaN(Date.parse(data.retrievedAt)));assert.match(data.uploadedAt,/^\d{4}-\d{2}-\d{2}$/);
 // The month the list is as of comes from the catalog's description, not the CSV's upload date
 // (Codex review on PR #211).
 const month=python([load('scripts/update-oita-permits.py'),'print(json.dumps([m.as_of(n) for n in json.load(sys.stdin)]))'],JSON.stringify([data.asOfNote,'令和１０年１２月時点']));
 assert.equal(month.status,0,month.stderr);assert.deepEqual(month.out,[data.asOf,'2028-12']);assert.match(data.asOf,/^\d{4}-\d{2}$/);
 assert.notEqual(python([load('scripts/update-oita-permits.py'),'m.as_of(sys.stdin.read())'],'2026年3月27日更新').status,0,'no as-of month: stop');
 assert.equal(attribution.oitaAsOf('2026-03'),'2026년 3월 시점 목록');
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
 console.log(JSON.stringify({passed:'Oita permit reader, guesthouse rows only when linked, paced requests with no robots.txt and no redirect in both list updaters, committed list, link rule with refusals',rows:data.rows.length,asOf:data.asOf}));
}finally{rmSync(temp,{recursive:true,force:true})}
