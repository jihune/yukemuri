// Scratch: D1 rows the 0015 migration writes on a database with 0000-0014 applied (Miniflare).
import {readFileSync,readdirSync,mkdtempSync,realpathSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));const {Miniflare}=require('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("")}}',d1Databases:{DB:'m'},d1Persist:mkdtempSync(join(tmpdir(),'mig-'))});
const db=await mf.getD1Database('DB');let target=null;
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)){
 const r=await db.prepare(s).run();if(f.startsWith('0015'))target={file:f,rowsWritten:r.meta.rows_written,rowsRead:r.meta.rows_read,changes:r.meta.changes};
}
console.log(JSON.stringify({measuredAt:new Date().toISOString(),...target}));await mf.dispose();
