// Run the public API integration suite against the built Worker and isolated D1.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';

const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-public-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:8787,d1Databases:{DB:'public-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'local-runtime-maintenance-test'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 await db.prepare("INSERT INTO favorites(hotel_id) VALUES ('toya-02')").run();
 await runtime.ready;
 await new Promise((resolve,reject)=>{
  const test=spawn('python',['scripts/check-public-access.py'],{stdio:'inherit'});
  const timer=setTimeout(()=>{test.kill();reject(new Error('Public Worker checks timed out'))},180000);
  test.once('error',error=>{clearTimeout(timer);reject(error)});
  test.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Public Worker checks failed (${code})`))});
 });
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
