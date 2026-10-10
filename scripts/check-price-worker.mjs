// Retired quote endpoint must not request original prices, including for old
// valid date links. Count calls at Miniflare's outbound boundary.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-price-worker-'));
const main=resolve('dist/server/price-test-entry.js');
let requests=0;
const encoded=spawnSync('python',['-c',"from pathlib import Path;import sys;sys.stdout.buffer.write(Path('scripts/crawler/fixtures/jalan-price-10.html').read_text().encode('cp932',errors='replace'))"],{maxBuffer:3000000});
if(encoded.status)throw new Error(encoded.stderr.toString());
writeFileSync(main,'import app from "./index.js"; const NativeDate=Date,start=Date.now(),anchor=Date.parse("2026-10-04T00:00:00Z");globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[anchor+NativeDate.now()-start]))}static now(){return anchor+NativeDate.now()-start}};export default app;');
const modules=[{type:'ESModule',path:main},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&!p.includes('price-test-entry')).map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'price-test'},d1Persist:join(temp,'db'),outboundService:{node:(req,res)=>{requests++;res.writeHead(200,{'Content-Type':'text/html; charset=windows-31j'});res.end(encoded.stdout)}}});
try{
 const db=await runtime.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
  const sql=readFileSync(join('drizzle',migration),'utf8').replace(/--> statement-breakpoint/g,'');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 const query='hotelId=daiichi-takimotokan&checkIn=2026-11-10&checkOut=2026-11-11&adults=2';
 const call=()=>runtime.dispatchFetch('http://localhost/api/prices?'+query);
 const r=await call(),result=await r.json();assert.equal(r.status,410,JSON.stringify(result));assert.equal(requests,0,'Retired quotes must never request a volatile source');
 const again=await call();assert.equal(again.status,410);assert.equal(requests,0);
 const invalid=await runtime.dispatchFetch('http://localhost/api/prices?'+query.replace('adults=2','adults=0'));assert.equal(invalid.status,410);assert.equal(requests,0);
 console.log('Retired-price checks passed: explicit 410 for old clients and zero outbound price requests.');
}finally{await runtime.dispose();rmSync(main,{force:true});rmSync(temp,{recursive:true,force:true})}
