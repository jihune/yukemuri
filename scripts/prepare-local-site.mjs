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
 // The migrations this D1 lacks: all of them on a fresh D1; on one made before a migration was added
 // (0015 after a D1 made at 0014, D07), those after the newest whose last statement shows in the
 // schema. Every migration so far is DDL, so its last statement shows as an object or column.
 const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort(),migrations=files.map(f=>readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean));
 const object=name=>db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').bind(name).first();
 const shows=async s=>{let m;
  if((m=/^CREATE (?:UNIQUE )?(?:TABLE|INDEX) `(\w+)`/.exec(s)))return!!await object(m[1]);
  if((m=/^DROP INDEX `(\w+)`/.exec(s)))return!await object(m[1]);
  if((m=/^ALTER TABLE `(\w+)` ADD `(\w+)`/.exec(s)))return!!await db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name=?').bind(m[1],m[2]).first();
  throw new Error('Cannot tell whether a local migration is applied: '+s.slice(0,80))};
 let applied=-1;
 if(await object('hotels'))for(let i=migrations.length-1;i>=0&&applied<0;i--)if(await shows(migrations[i].at(-1)))applied=i;
 for(const s of migrations.slice(applied+1).flat())await db.prepare(s).run();
 if(applied+1<files.length)console.log('Local migrations applied: '+files.slice(applied+1).join(', '));
 const prepared=await mf.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':KEY}});
 if(!prepared.ok)throw new Error('Local catalogue preparation failed: '+prepared.status);
 const {manifest}=await buildSnapshot({db,out:resolve('dist/client')});
 rmSync('public/snapshot',{recursive:true,force:true});cpSync('dist/client/snapshot','public/snapshot',{recursive:true});
 console.log(`Local snapshot ${manifest.id} (${manifest.hotels} hotels) in dist/client/snapshot and public/snapshot`);
}finally{await mf.dispose()}
