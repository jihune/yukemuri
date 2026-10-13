// D05: puts three Jalan detail observations with features.viewBath=true into the
// local D1 of `pnpm start` (.wrangler/state, never production) through PUT /api/crawl,
// then rebuilds the search snapshot, for check-view-bath-card.mjs.
// - jalan-345284, jalan-321273: real fixtures as the collector parser reads them.
// - jalan-999171: the real sozankyo fixture (yad327522) with one phrase added (展望風呂あり in
//   風呂利用条件), the card with the most bath tags among the fixtures (7 with viewBath).
//   Its own id is a verified hotel (lib/hotels.verified.json), whose curated features a
//   Jalan PUT keeps, so the variant gets a new id.
// Run from the repo root after the build and node scripts/prepare-local-site.mjs,
// with the dev server stopped: node docs/evidence/d05-20261013/prepare-view-bath-site.mjs
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,rmSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildSnapshot} from '../../../scripts/build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='local-prepare-only';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:JSON.parse(readFileSync('dist/server/wrangler.json','utf8')).d1_databases[0].database_id},d1Persist:resolve('.wrangler/state/v3/d1'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const parse=(fixture,ident,prefecture,edits=[])=>JSON.parse(execFileSync('python3',['-c',`
import json,sys
sys.path.insert(0,'scripts/crawler')
from collect import parse_source_page
raw=open('scripts/crawler/fixtures/'+sys.argv[1],encoding='utf-8').read()
for old,new in json.loads(sys.argv[4]):
    assert old in raw
    raw=raw.replace(old,new)
print(json.dumps(parse_source_page(raw,'jalan','https://www.jalan.net/yad'+sys.argv[2]+'/',sys.argv[5],sys.argv[3],'detail')[0][0],ensure_ascii=False))`,fixture,ident,prefecture,JSON.stringify(edits),new Date().toISOString()],{encoding:'utf8'}));
const hotels=[
 ['jalan-rooms-greenplaza.html','345284','pref-kanagawa'],
 ['jalan-rooms-hanayu.html','321273','pref-oita'],
 ['jalan-sozankyo-baths.html','999171','pref-kumamoto',[['327522','999171'],['※貸切風呂は2箇所ございます。','※貸切風呂は2箇所ございます。展望風呂あり。']]],
].map(args=>({prefecture:args[2],hotel:parse(...args)}));
try{
 const db=await mf.getD1Database('DB');
 assert(await db.prepare("SELECT name FROM sqlite_master WHERE name='hotels'").first(),'Run node scripts/prepare-local-site.mjs first');
 for(const {prefecture,hotel:h} of hotels){
  assert.equal(h.features.viewBath?.value,true,h.id);
  const url=h.sources[0].url;
  await db.prepare("INSERT INTO crawl_jobs (url,provider,kind,prefecture,status,attempts,next_at) VALUES (?,'jalan','detail',?,'pending',0,0) ON CONFLICT(url) DO UPDATE SET status='pending',lease_token=NULL,lease_until=0,last_token=NULL").bind(url,prefecture).run();
  const r=await mf.dispatchFetch('http://localhost/api/crawl',{method:'PUT',headers:{'Content-Type':'application/json','X-Yukemuri-Crawl-Key':KEY},body:JSON.stringify({url,status:'done',observations:[h],links:[]})});
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body).slice(0,300));assert.equal(body.accepted,1);
 }
 const {manifest}=await buildSnapshot({db,out:resolve('dist/client')});
 rmSync('public/snapshot',{recursive:true,force:true});cpSync('dist/client/snapshot','public/snapshot',{recursive:true});
 console.log(`Local snapshot ${manifest.id} (${manifest.hotels} hotels) with viewBath on ${hotels.map(h=>h.hotel.id).join(', ')}`);
}finally{await mf.dispose()}
