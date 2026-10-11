// Render the home page from the built Worker and write it to
// <out>/index.html (dist/client by default). Cloudflare serves a matching static
// asset before the Worker (workers/static-assets/routing/worker-script), so `/`
// and `/?q=...` never invoke the Worker. The page reads no request data and no
// database (app/page.tsx); the explorer takes the conditions from the address.
// The search snapshot step (build-search-snapshot.mjs) renders it again with the
// default view's first page as the FIRST_PAGE binding.
// Usage: node scripts/build-static-page.mjs   (after the build; run-framework.mjs runs it)
import {createRequire} from 'node:module';
import {realpathSync,readdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function renderStaticPage({out=join(ROOT,'dist/client'),firstPage=null}={}){
 const require=createRequire(realpathSync(join(ROOT,'node_modules/wrangler/package.json')));
 const {Miniflare}=require('miniflare');
 const page=join(out,'index.html'),server=join(ROOT,'dist/server');
 // A page left from an earlier build would shadow the Worker's render below.
 if(existsSync(page))rmSync(page);
 const modules=[{type:'ESModule',path:join(server,'index.js')},...readdirSync(server,{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:join(server,p)}))];
 // No D1 binding: rendering the page must not need the database.
 const mf=new Miniflare({modules,modulesRoot:server,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:firstPage?{FIRST_PAGE:JSON.stringify(firstPage)}:{}});
 try{
  const response=await mf.dispatchFetch('http://localhost/');
  const html=await response.text();
  if(response.status!==200||!/^text\/html/.test(response.headers.get('Content-Type')??'')||!html.includes('</html>'))throw new Error(`Static page render failed: ${response.status} ${html.slice(0,200)}`);
  if(firstPage&&!html.includes(`data-first-page="${firstPage.snapshot}"`))throw new Error('Static page render did not take the first page');
  writeFileSync(page,html);
  return Buffer.byteLength(html);
 }finally{await mf.dispose()}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const bytes=await renderStaticPage();
 console.log(`Static page: dist/client/index.html (${(bytes/1024).toFixed(1)}KiB)`);
}
