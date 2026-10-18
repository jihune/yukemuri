// D07 PR 3 control (D07-20261019.md 'results (PR 3)'): makes the local D1 that
// scripts/prepare-local-site.mjs and `pnpm start` use (.wrangler/state/v3/d1, the
// database id in dist/server/wrangler.json) hold the migrations up to and including
// the one named, as a local site prepared before the later migrations were added.
// Usage: node docs/evidence/d07-20261018/tools/local-d1-at-migration.mjs 0014   (after the build; dev server stopped)
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const last=process.argv[2];
const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().filter(f=>f.slice(0,4)<=last);
if(!files.length||!files.at(-1).startsWith(last))throw new Error('No migration '+last);
rmSync(resolve('.wrangler/state/v3/d1'),{recursive:true,force:true});
const id=JSON.parse(readFileSync('dist/server/wrangler.json','utf8')).d1_databases[0].database_id;
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("")}}',d1Databases:{DB:id},d1Persist:resolve('.wrangler/state/v3/d1')});
try{
 const db=await mf.getD1Database('DB');
 for(const f of files)for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(r=>r.name);
 console.log(`Local D1 at ${files.at(-1)} (${files.length} migrations): ${tables.length} tables, hotel_locale_names ${tables.includes('hotel_locale_names')?'present':'absent'}`);
}finally{await mf.dispose()}
