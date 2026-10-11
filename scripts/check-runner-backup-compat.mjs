// The private runner (jihune/yukemuri-script-runner) backs up production with
// its own copy of migrations 0000-0012. Export a disposable D1 with this
// checkout's migrations through /api/catalog-export, write the runner's archive
// format, and run the runner's restore and schema check on it.
// Usage: node scripts/check-runner-backup-compat.mjs <runner checkout>
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const runner=process.argv[2];if(!runner)throw new Error('Usage: check-runner-backup-compat.mjs <runner checkout>');
const backup=join(runner,'maintenance/catalog-backup');
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-runner-compat-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'compat'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'compat-only'}});
try{
 const db=await mf.getD1Database('DB');
 const applied=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const f of applied)for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async path=>{const r=await mf.dispatchFetch('http://localhost'+path,{headers:{'X-Yukemuri-Crawl-Key':'compat-only'}});assert.equal(r.status,200,path);return r.json()};
 await api('/api/hotels?fresh=1');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotel_search_chunks').first()).n,64,'the snapshot exists in the exported DB');
 const digest=execFileSync('python3',['-c',`import importlib.util,sys;s=importlib.util.spec_from_file_location('c',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.migration_digest())`,join(backup,'scripts/catalog-checkpoint.py')],{encoding:'utf8'}).trim();
 const manifest=await api('/api/catalog-export');
 const lines=[JSON.stringify({type:'manifest',source:'compat.chatgpt.site',migrationsSha256:digest,manifest})];const counts={};
 for(const t of manifest.tables){
  let after=null,n=0;
  for(;;){const page=await api(`/api/catalog-export?table=${t.name}&limit=1000`+(after?'&after='+encodeURIComponent(JSON.stringify(after)):''));for(const row of page.rows){lines.push(JSON.stringify({type:'row',table:t.name,row}));n++}if(!page.next)break;after=page.next}
  counts[t.name]=n;
 }
 const hash=createHash('sha256');for(const l of lines)hash.update(l+'\n');
 lines.push(JSON.stringify({type:'complete',sha256:hash.digest('hex'),counts,countsBefore:counts,countsAfter:counts,finishedAt:new Date().toISOString(),consistency:'non_atomic'}));
 writeFileSync(join(temp,'checkpoint.jsonl.gz'),gzipSync(lines.join('\n')+'\n'));
 const schema=JSON.parse(readFileSync(join(backup,'schema.json'),'utf8'));
 assert.equal(manifest.schema,schema.schema,'run-backup.py compares manifest.schema with schema.json');
 assert.deepEqual(manifest.tables.map(t=>t.name).sort(),[...schema.tables].sort(),'exported tables are the runner table set');
 const restored=JSON.parse(execFileSync('python3',[join(backup,'scripts/catalog-checkpoint.py'),'restore','--archive',join(temp,'checkpoint.jsonl.gz'),'--out',join(temp,'restored.sqlite')],{encoding:'utf8'}));
 assert.equal(restored.integrity,'ok');assert.deepEqual(restored.rows,counts);
 console.log(`Runner backup compatibility passed: a D1 with migrations up to ${applied.at(-1)} exported ${Object.keys(counts).length} tables (${counts.hotels} hotels); manifest schema ${manifest.schema} matches the runner's schema.json and the runner's restore (its own 0000-0012) passed integrity and counts.`);
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
