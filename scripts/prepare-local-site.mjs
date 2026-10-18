// Prepare the local site for browser checks: the local D1 that `pnpm start`
// (wrangler dev --persist-to .wrangler/state) and `pnpm dev` use gets the
// migrations and the checked-in catalogue (through the maintenance
// preparation, as the collector does), then a search snapshot of it is written
// to dist/client (pnpm start) and public/ (pnpm dev, ignored by Git).
// Usage: node scripts/prepare-local-site.mjs   (after the build; dev server stopped)
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,rmSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildSnapshot} from './build-search-snapshot.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const KEY='local-prepare-only';
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:JSON.parse(readFileSync('dist/server/wrangler.json','utf8')).d1_databases[0].database_id},d1Persist:resolve('.wrangler/state/v3/d1'),bindings:{CRAWL_ACCESS_KEY:KEY}});
try{
 const db=await mf.getD1Database('DB');
 // The migrations this D1 lacks (D07): its schema is compared with the schema after each prefix of
 // drizzle/, built in a scratch D1 in memory, and the rest is applied. A fresh D1 matches the empty
 // prefix; one made before 0015 matches 0000-0014. A D1 that stopped inside a migration, or whose
 // schema two prefixes share, matches no single prefix and stops here.
 const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort(),migrations=files.map(f=>readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean));
 const schema=async d=>JSON.stringify((await d.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY type,name").all()).results);
 const scratch=new Miniflare({modules:true,script:'export default {fetch(){return new Response("")}}',d1Databases:{DB:'migrations'}}),matches=[];
 try{
  const s=await scratch.getD1Database('DB'),local=await schema(db);
  for(let i=-1;i<migrations.length;i++){if(i>=0)for(const q of migrations[i])await s.prepare(q).run();if(await schema(s)===local)matches.push(i)}
 }finally{await scratch.dispose()}
 if(matches.length!==1)throw new Error(`The local D1 (.wrangler/state/v3/d1) matches ${matches.length} migration prefixes of drizzle/, not one: remove it and run again`);
 const applied=matches[0];
 for(const s of migrations.slice(applied+1).flat())await db.prepare(s).run();
 if(applied+1<files.length)console.log('Local migrations applied: '+files.slice(applied+1).join(', '));
 const prepared=await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});
 if(!prepared.ok)throw new Error('Local catalogue preparation failed: '+prepared.status);
 const {manifest}=await buildSnapshot({db,out:resolve('dist/client')});
 rmSync('public/snapshot',{recursive:true,force:true});cpSync('dist/client/snapshot','public/snapshot',{recursive:true});
 console.log(`Local snapshot ${manifest.id} (${manifest.hotels} hotels) in dist/client/snapshot and public/snapshot`);
}finally{await mf.dispose()}
