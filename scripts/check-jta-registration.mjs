// D08 PR 1 Japan Tourism Agency registrations: the parser of scripts/update-jta-registered.py on
// the PDFs' awkward rows, the committed lists (data/jta-registered.json), and the link rule
// (lib/jta-registration.ts) on stays shaped like ours against real rows of the lists. Every
// link it must make sits beside the nearest stay it must refuse.
// Usage: node scripts/check-jta-registration.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {compileLib} from './build-search-snapshot.mjs';

const require=createRequire(import.meta.url),temp=mkdtempSync(join(tmpdir(),'yukemuri-jta-'));
const NL=String.fromCharCode(10),FF=String.fromCharCode(12);
try{
 // The parser, on rows as pdftotext -layout printed them on 2026-10-19.
 const page=[
  '国際観光ホテル整備法 登録ホテル一覧                            登録数      9件                        令和8年10月1日',
  '登録番号    施設名称                        住所                              電話番号             法人番号',
  'H0001   帝国ホテル                       東京都千代田区内幸町１丁目１番１号               03-3504-1111',
  'H0017   川奈ホテル                       静岡県伊東市川奈１４５９番地                  0557-45-1111     2080101013544',
  'H0170   リーガロイヤルホテル大阪 ヴィニェット コレクション 大阪府大阪市北区中之島５丁目３番６８号          06-6448-1121',
  'H0297   フレックステイイン鹿島セントラル/アートホテル鹿島 茨城県神栖市大野原4-7-11        0229-95-5511',
  '        セントラル',
  FF+'登録番号    施設名称                     住所                             電話番号           法人番号',
  'H0370   南の美ら花ホテルミヤヒラ             沖縄県石垣市美崎町４番地の９             09808-2-6111   3600-01-013186',
  'H1656   OMO関西空港 by 星野リゾート              大阪府泉佐野市りんくう往来北1番８３３     -               --',
  "H1663   箱根ホテル小涌園                       神奈川県足柄下郡箱根町二ノ平１２９７      0460-82-4111    '0100-01-",
  '                                                                               100247',
  'H1675   京急ＥＸホテルみなとみらい横浜                         神奈川県横浜市西区みなとみらい五丁目１番２号 横浜シンフォステージ 045-228-7512        9010401070244',
  '                                                 ウエストタワー26階～30階',
  'Ｒ2771   那須塩原 一萬亭               栃木県那須塩原市塩原６３０－１           ０２８７－４８－６９９５ 1000-01-021467',
 ].join(NL);
 const py="import importlib.util as u,json,sys;s=u.spec_from_file_location('m','scripts/update-jta-registered.py');m=u.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.parse(sys.stdin.read(),'hotel'),ensure_ascii=False))";
 const run=spawnSync('python3',['-c',py],{input:page,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const [rows,count,asOf]=JSON.parse(run.stdout);
 assert.deepEqual([count,asOf],[9,'2026-10-01'],'the header: count and 令和8年 as 2026');
 assert.deepEqual(rows,[
  ['H0001','帝国ホテル','東京都千代田区内幸町1丁目1番1号','03-3504-1111'],
  ['H0017','川奈ホテル','静岡県伊東市川奈1459番地','0557-45-1111'],
  ['H0170','リーガロイヤルホテル大阪 ヴィニェット コレクション','大阪府大阪市北区中之島5丁目3番68号','06-6448-1121'],
  ['H0297','フレックステイイン鹿島セントラル/アートホテル鹿島セントラル','茨城県神栖市大野原4-7-11','0229-95-5511'],
  ['H0370','南の美ら花ホテルミヤヒラ','沖縄県石垣市美崎町4番地の9','09808-2-6111'],
  ['H1656','OMO関西空港 by 星野リゾート','大阪府泉佐野市りんくう往来北1番833',''],
  ['H1663','箱根ホテル小涌園','神奈川県足柄下郡箱根町二ノ平1297','0460-82-4111'],
  ['H1675','京急EXホテルみなとみらい横浜','神奈川県横浜市西区みなとみらい五丁目1番2号 横浜シンフォステージウエストタワー26階~30階','045-228-7512'],
  ['R2771','那須塩原 一萬亭','栃木県那須塩原市塩原630-1','0287-48-6995'],
 ],'one space before the address, a wrapped name and address, corporate numbers dropped, no phone, a phone inside the address column, NFKC');

 // The committed lists.
 const data=JSON.parse(readFileSync('data/jta-registered.json','utf8'));
 const attribution=require(compileLib(mkdtempSync(join(temp,'a-')),'lib/jta-attribution.ts'));
 assert.equal(data.license,'PDL1.0');assert(!Number.isNaN(Date.parse(data.retrievedAt)));
 assert.deepEqual(attribution.JTA_LINKS.map(l=>l.url),[data.source,data.licenseUrl],'the page credits the list page and the license the data names');
 const numbers=data.rows.map(r=>r[0]);
 assert.equal(new Set(numbers).size,numbers.length,'one row per registration number');
 assert.equal(numbers.filter(n=>n.startsWith('H')).length,data.hotel.count,'every hotel the list header counts');
 assert.equal(numbers.filter(n=>n.startsWith('R')).length,data.ryokan.count,'every ryokan the list header counts');
 assert(data.hotel.count>800&&data.ryokan.count>1200,'about 900 hotels and 1,300 ryokan');
 for(const [n,name,address,phone] of data.rows){assert.match(n,/^[HR]\d{4}$/);assert(name&&address,n);assert.match(phone,/^(\d{2,5}-\d{1,4}-\d{3,5})?$/,n)}

 // The rule, on the lists' own rows.
 const {jtaCandidates,resolveJtaLinks,addressParts}=require(compileLib(mkdtempSync(join(temp,'r-')),'lib/jta-registration.ts'));
 assert.equal(data.rows.filter(r=>!addressParts(r[2]).prefecture).length,0,'every row has a prefecture: 岡山市北区駅元町1番5 is Okayama');
 const stay=(prefecture,address,...names)=>({names:{ko:names[0],ja:names[0],en:names[0]},aliases:names.slice(1),prefecture,location:{address}});
 const link=(...stays)=>{const found=new Map(stays.map((s,i)=>[s.id??'jalan-'+i,jtaCandidates(s)]));const links=resolveJtaLinks(found);return stays.map((s,i)=>links.get(s.id??'jalan-'+i)?.number??null)};
 const one=(...args)=>link(stay(...args))[0];
 // The same name and address, written the collected way: 南十条 is 南１０条 (H0161).
 assert.equal(one('pref-hokkaido','北海道札幌市中央区南１０条西３丁目１－１','札幌パークホテル'),'H0161');
 assert.equal(one('pref-hokkaido','北海道札幌市中央区南１１条西３丁目１－１','札幌パークホテル'),null,'another block');
 assert.equal(one('pref-hokkaido','北海道函館市南１０条西３丁目１－１','札幌パークホテル'),null,'another city');
 assert.equal(one('pref-aomori','北海道札幌市中央区南１０条西３丁目１－１','札幌パークホテル'),null,'another prefecture');
 assert.equal(one('pref-hokkaido','北海道札幌市中央区南１０条西３丁目１－１','札幌パーク'),null,'a shorter name is another name');
 // Lot numbers as far as both go: 北一条西4丁目2番地 against 北1条西4丁目 (H0044).
 assert.equal(one('pref-hokkaido','北海道札幌市中央区北1条西4丁目','札幌グランドホテル'),'H0044');
 // A capital without its prefecture in the list (H1079 岡山市北区駅元町1番5).
 assert.equal(one('pref-okayama','岡山県岡山市北区駅元町１－５','ホテルグランヴィア岡山'),'H1079');
 // A merged town: the list's 河口湖町 is 富士河口湖町 now (H1322).
 assert.equal(one('pref-yamanashi','山梨県南都留郡富士河口湖町浅川５５','富ノ湖ホテル'),'H1322');
 // The name's parts: an area or a tagline before it, never inside a word (H0149, H0673).
 assert.equal(one('pref-gifu','岐阜県岐阜市長良648','長良川温泉　岐阜グランドホテル'),'H0149');
 assert.equal(one('pref-gifu','岐阜県岐阜市長良649','長良川温泉　岐阜グランドホテル'),null,'parts need the same lot number');
 assert.equal(one('pref-gifu','岐阜県岐阜市長良','長良川温泉　岐阜グランドホテル'),null,'parts need a lot number');
 assert.equal(one('pref-oosaka','大阪府大阪市淀川区新北野１－９－１５','ホテルプラザオーサカ'),null,'プラザオーサカ inside ホテルプラザオーサカ');
 assert.equal(one('pref-oosaka','大阪府大阪市淀川区新北野１－９－１５','ホテル　プラザオーサカ'),'H0673','the same words as parts');
 // A stay's address with no lot number: the exact name in the municipality (H0512).
 assert.equal(one('pref-hokkaido','北海道川上郡弟子屈町屈斜路温泉','屈斜路プリンスホテル'),'H0512');
 assert.equal(one('pref-hokkaido','北海道川上郡弟子屈町美留和','屈斜路プリンスホテル'),'H0512');
 assert.equal(one('pref-hokkaido','北海道川上郡標茶町屈斜路温泉','屈斜路プリンスホテル'),null,'another town');
 // An address in Latin letters (Trip.com): every lot number of the row, the postal code left out (H0365, H0754).
 const trip=(id,address,ja)=>({...stay('pref-chiba',address,ja),id});
 assert.equal(link({...stay('pref-hokkaido','2-9, Kita 3-jo Nishi 1-chome, 주오구, 060-0003 삿포로시','ANA Crowne Plaza Sapporo','ANAクラウンプラザホテル札幌'),id:'trip-1'})[0],'H0365');
 assert.equal(link({...stay('pref-hokkaido','2-8, Kita 3-jo Nishi 1-chome, 주오구, 060-0003 삿포로시','ANAクラウンプラザホテル札幌'),id:'trip-1'})[0],null,'a lot number missing');
 assert.equal(link(trip('trip-2','Horinouchi 68, 286-0107 Narita','ANAクラウンプラザホテル成田'))[0],'H0754');
 assert.equal(link(trip('trip-2','Tokko, 286-0106 Narita','ホテル日航成田'))[0],null,'取香500 (H0459) needs 500');
 assert.equal(link(trip('trip-2','Tokko, 500-0106 Narita','ホテル日航成田'))[0],null,'a postal code is not a lot number');
 assert.equal(link(trip('trip-2','Horinouchi 68, 286-0107 Narita','空港　ANAクラウンプラザホテル成田'))[0],null,'parts need a Japanese address');
 // A row two stays could take, decided across them. An annex beside the exact name, on the same source.
 assert.deepEqual(link(stay('pref-niigata','新潟県新発田市月岡温泉134','白玉の湯　華鳳'),stay('pref-niigata','新潟県新発田市月岡温泉134','白玉の湯　華鳳　別邸　越の里')),['R2549',null]);
 assert.deepEqual(link(stay('pref-niigata','新潟県新発田市月岡温泉134','白玉の湯　華鳳　別邸　越の里')),['R2549'],'alone, the parts link');
 assert.deepEqual(link(stay('pref-gifu','岐阜県岐阜市長良648','長良川温泉　岐阜グランドホテル'),stay('pref-gifu','岐阜県岐阜市長良648','岐阜グランドホテル　本館')),[null,null],'two stays by parts: neither');
 // The Jalan record keeps its parts link when the row's exact name is the Trip.com record's.
 assert.deepEqual(link(stay('pref-chiba','千葉県成田市堀之内６８','ANAクラウンプラザホテル成田 by IHG'),trip('trip-3','Horinouchi 68, 286-0107 Narita','ANAクラウンプラザホテル成田')),['H0754','H0754']);
 // Registered twice by building (H0354, H0463): the lower number; a ryokan row is a ryokan.
 assert.equal(one('pref-niigata','新潟県南魚沼郡湯沢町三国２０２','苗場プリンスホテル'),'H0354');
 const r=resolveJtaLinks(new Map([['jalan-9',jtaCandidates(stay('pref-niigata','新潟県新発田市月岡温泉134','白玉の湯　華鳳'))]])).get('jalan-9');
 assert.deepEqual(r,{kind:'ryokan',number:'R2549',name:'白玉の湯 華鳳'});
 assert.equal(one(null,'新潟県新発田市月岡温泉134','白玉の湯　華鳳'),null,'no prefecture, no rows');
 assert.equal(one('pref-niigata','','白玉の湯　華鳳'),null,'no address');
 console.log(JSON.stringify({passed:'JTA list parser, committed lists, link rule with refusals',rows:data.rows.length,asOf:data.hotel.asOf}));
}finally{rmSync(temp,{recursive:true,force:true})}
