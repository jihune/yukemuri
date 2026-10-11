// Render the home page once from the built Worker and write it to
// dist/client/index.html. Cloudflare serves a matching static asset before the
// Worker (workers/static-assets/routing/worker-script), so `/` and `/?q=...`
// never invoke the Worker. The page reads no request data and no database
// (app/page.tsx); the explorer takes the conditions from the address.
// Usage: node scripts/build-static-page.mjs   (after the build; run-framework.mjs runs it)
import {createRequire} from 'node:module';
import {realpathSync,readdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const page=resolve('dist/client/index.html');
// A page left from an earlier build would shadow the Worker's render below.
if(existsSync(page))rmSync(page);
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
// No D1 binding: rendering the page must not need the database.
const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat']});
try{
 const response=await mf.dispatchFetch('http://localhost/');
 const html=await response.text();
 if(response.status!==200||!/^text\/html/.test(response.headers.get('Content-Type')??'')||!html.includes('</html>'))throw new Error(`Static page render failed: ${response.status} ${html.slice(0,200)}`);
 writeFileSync(page,html);
 console.log(`Static page: dist/client/index.html (${(Buffer.byteLength(html)/1024).toFixed(1)}KiB)`);
}finally{await mf.dispose()}
