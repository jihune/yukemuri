// Scratch (D07 PR 2): snapshot build rows read with and without hotel_locale_names rows, on a
// temporary Miniflare D1 seeded by /api/crawl-prepare. Usage: node <this> <repo root>
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(process.argv[2]);process.chdir(root);
const {buildSnapshot}=await import(join(root,'scripts/build-search-snapshot.mjs'));
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-locale-reads-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'r'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'k'}});
try{
 const db=await mf.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':'k'}});
 const out=join(temp,'out');mkdirSync(out,{recursive:true});writeFileSync(join(out,'index.html'),'<!DOCTYPE html><html><body></body></html>');
 const run=async()=>(await buildSnapshot({db,out,now:new Date('2026-10-18T00:00:00Z')})).rowsRead;
 const before=await run();
 const ids=(await db.prepare("SELECT id FROM hotels WHERE id GLOB 'jalan-*' ORDER BY id").all()).results.map(r=>r.id);
 await db.prepare("INSERT INTO hotel_locale_names (hotel_id,name_ko,ko_url,ko_checked_at,name_en,en_url,en_checked_at) SELECT value,'측정 '||value,'https://www.jalan.net/kr/x/','2026-10-18T00:00:00Z','Measure '||value,'https://www.jalan.net/en/x/','2026-10-18T00:00:00Z' FROM json_each(?)").bind(JSON.stringify(ids)).run();
 const after=await run();
 console.log(JSON.stringify({hotels:(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n,localeRows:ids.length,rowsReadBefore:before,rowsReadAfter:after,difference:after-before}));
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
