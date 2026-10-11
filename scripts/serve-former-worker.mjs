// Run a Python HTTP check against the built Worker on 127.0.0.1:8787 with an
// isolated D1. The list, map, suggestion and name-index paths the Worker
// served until P03 are answered by scripts/former-search-api.mjs (the
// browser's code over a snapshot of the same D1); every other request goes to
// the Worker. Usage: node scripts/serve-former-worker.mjs <check.py>
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {formerSearchFor,FORMER_PATHS} from './former-search-api.mjs';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const [check]=process.argv.slice(2);if(!check)throw new Error('Usage: serve-former-worker.mjs <check.py>');
const KEY='local-runtime-maintenance-test';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-former-worker-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'former-worker'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY}});
const former=formerSearchFor(runtime,KEY);
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8787'),chunks=[];for await(const c of req)chunks.push(c);
  if(FORMER_PATHS.test(url.pathname)&&req.method==='GET'){const r=await former.request(url.pathname+url.search,req.headers['x-yukemuri-visitor']);res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify(r.body));return}
  const headers=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length'].includes(k)).map(([k,v])=>[k,String(v)]));
  const r=await runtime.dispatchFetch(url.href,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(error)}))}
});
try{
 const db=await runtime.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 await db.prepare("INSERT INTO favorites(hotel_id) VALUES ('toya-02')").run();
 await new Promise(r=>server.listen(8787,'127.0.0.1',r));
 await new Promise((resolve,reject)=>{
  const test=spawn('python',[check],{stdio:'inherit'});
  const timer=setTimeout(()=>{test.kill();reject(new Error(check+' timed out'))},300000);
  test.once('error',error=>{clearTimeout(timer);reject(error)});
  test.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`${check} failed (${code})`))});
 });
}finally{server.close();former.close();await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
