// Build the static search snapshot (lib/search-snapshot.ts) from a catalogue
// database and write it under <out>/snapshot/ as Worker static assets.
// Usage:
//   node scripts/build-search-snapshot.mjs --sqlite <file> [--out dist/client] [--report file]
//   node scripts/build-search-snapshot.mjs --remote [--out dist/client] [--report file]
// --remote reads the D1 named in cloudflare-deploy.json through the Cloudflare
// API (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Every source is read-only:
// a statement other than SELECT/WITH is refused before it is sent.
// SNAPSHOT_TRACE=1 prints rows read per query on stderr.
// The lib/ code runs compiled for Node, so the cards, search columns, coverage
// and collection status are made by the same functions the Worker used.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,readdirSync,symlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const HEADERS_RULE='/snapshot/v/*\n  Cache-Control: public, max-age=31536000, immutable\n';
const READ_ONLY=/^\s*(?:SELECT|WITH)\b/i;

// A D1 binding that only reads: every statement is checked before it runs.
// rowsRead adds up meta.rows_read where the source reports it (D1, Miniflare).
export function readOnly(db){
 const stats={rowsRead:0,queries:0};
 const check=sql=>{if(!READ_ONLY.test(sql)||/;\s*\S/.test(sql.trim().replace(/;$/,'')))throw new Error('Snapshot sources are read-only: '+sql.slice(0,60))};
 const count=r=>{stats.queries++;stats.rowsRead+=Number(r?.meta?.rows_read??0);if(process.env.SNAPSHOT_TRACE)console.error('rows',r?.meta?.rows_read,r?.__sql);return r};
 const wrap=(stmt,sql)=>({bind:(...a)=>wrap(stmt.bind(...a),sql),all:async()=>count(Object.assign(await stmt.all(),{__sql:sql.replace(/\s+/g,' ').slice(0,90)})),first:async c=>{const r=count(await stmt.all()),row=r.results[0]??null;return c===undefined?row:row?row[c]??null:null},run:async()=>{throw new Error('Snapshot sources are read-only')},raw:async()=>{throw new Error('raw() is not used')},__inner:stmt});
 return{stats,db:{prepare:sql=>{check(sql);return wrap(db.prepare(sql),sql)},batch:async list=>{const out=[];for(const s of list)out.push(await s.all());return out},exec:async()=>{throw new Error('Snapshot sources are read-only')}}};
}
// node:sqlite on a database file, opened read-only.
export async function sqliteSource(file){
 const {DatabaseSync}=await import('node:sqlite');
 const sqlite=new DatabaseSync(file,{readOnly:true});
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),all:async()=>({results:sqlite.prepare(sql).all(...args),meta:{}})});
 return{prepare:sql=>statement(sql),close:()=>sqlite.close()};
}
// The D1 query endpoint (POST /accounts/{account}/d1/database/{id}/query,
// cloudflare/api-schemas d1_batch-query: params are strings).
export function remoteSource({token,account,database,fetchImpl=fetch,base='https://api.cloudflare.com/client/v4'}){
 if(!token||!account||!/^[0-9a-f-]{36}$/.test(database??''))throw new Error('Remote snapshot needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and a D1 databaseId');
 const url=`${base}/accounts/${encodeURIComponent(account)}/d1/database/${database}/query`;
 const query=async(sql,args)=>{
  if(args.some(a=>a===null||a===undefined||typeof a==='object'))throw new Error('Remote snapshot parameters must be strings or numbers');
  for(let attempt=0;;attempt++){
   let response;
   try{response=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params:args.map(String)}),signal:AbortSignal.timeout(60000)})}
   catch(error){if(attempt<3){await new Promise(r=>setTimeout(r,2000*2**attempt));continue}throw new Error('D1 query request failed: '+error.name)}
   if((response.status===429||response.status>=500)&&attempt<3){await new Promise(r=>setTimeout(r,2000*2**attempt));continue}
   let body;try{body=await response.json()}catch{throw new Error('D1 query returned HTTP '+response.status+' without JSON')}
   // Error messages only: the token and account never appear in them.
   if(!response.ok||!body.success||!Array.isArray(body.result)||!body.result[0]?.success)throw new Error('D1 query failed: HTTP '+response.status+' '+JSON.stringify(body.errors??[]).slice(0,300));
   return{results:body.result[0].results??[],meta:body.result[0].meta??{}};
  }
 };
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),all:()=>query(sql,args)});
 return{prepare:sql=>statement(sql)};
}
// lib/ compiled to CommonJS in a temporary folder; cloudflare:workers becomes
// the env given to build().
function compile(temp){
 symlinkSync(join(ROOT,'node_modules'),join(temp,'node_modules'));
 const r=spawnSync(process.execPath,[join(ROOT,'node_modules/typescript/bin/tsc'),join(ROOT,'lib/search-snapshot-build.ts'),'--outDir',temp,'--rootDir',ROOT,'--module','commonjs','--target','es2022','--esModuleInterop','--skipLibCheck','--resolveJsonModule','--moduleResolution','node','--noCheck'],{encoding:'utf8'});
 const entry=join(temp,'lib/search-snapshot-build.js');
 if(!existsSync(entry))throw new Error('Snapshot compile failed\n'+r.stdout+r.stderr);
 for(const f of readdirSync(join(temp,'lib'),{recursive:true}).filter(f=>f.endsWith('.js'))){const p=join(temp,'lib',f),s=readFileSync(p,'utf8');if(s.includes('require("cloudflare:workers")'))writeFileSync(p,s.replaceAll('require("cloudflare:workers")','({env:globalThis.__SNAPSHOT_ENV})'))}
 return entry;
}
export async function buildSnapshot({db,out,now=new Date()}){
 const temp=mkdtempSync(join(tmpdir(),'yukemuri-snapshot-'));
 try{
  const guarded=readOnly(db);
  globalThis.__SNAPSHOT_ENV={DB:guarded.db};
  const started=performance.now();
  const {buildSearchSnapshot}=createRequire(import.meta.url)(compile(temp));
  const data=await buildSearchSnapshot(now);
  const files={core:JSON.stringify(data.core),cards:JSON.stringify(data.cards),text:JSON.stringify(data.text),status:JSON.stringify(data.status)};
  const id=createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16);
  const folder=join(out,'snapshot'),dir=join(folder,'v',id);
  // Only the current version is published; older ones leave the asset set.
  rmSync(join(folder,'v'),{recursive:true,force:true});mkdirSync(dir,{recursive:true});
  const sizes={},paths={};
  for(const [name,body] of Object.entries(files)){
   const buffer=Buffer.from(body);writeFileSync(join(dir,name+'.json'),buffer);paths[name]=`/snapshot/v/${id}/${name}.json`;
   sizes[name]={raw:buffer.length,gzip:gzipSync(buffer,{level:9}).length,brotli:brotliCompressSync(buffer,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length};
  }
  const manifest={format:1,id,generatedAt:now.toISOString(),hotels:data.core.ids.length,coverage:data.coverage,files:paths,bytes:Object.fromEntries(Object.entries(sizes).map(([k,v])=>[k,v.raw]))};
  writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest));
  const headers=join(out,'_headers'),current=existsSync(headers)?readFileSync(headers,'utf8'):'';
  if(!current.includes(HEADERS_RULE))writeFileSync(headers,current+(current&&!current.endsWith('\n')?'\n':'')+HEADERS_RULE);
  return{manifest,sizes,rowsRead:guarded.stats.rowsRead,queries:guarded.stats.queries,ms:Math.round(performance.now()-started)};
 }finally{delete globalThis.__SNAPSHOT_ENV;rmSync(temp,{recursive:true,force:true})}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:null;
 const out=resolve(arg('--out')??join(ROOT,'dist/client')),report=arg('--report');
 let db,close=()=>{};
 if(argv.includes('--remote')){
  const config=JSON.parse(readFileSync(join(ROOT,'cloudflare-deploy.json'),'utf8'));
  db=remoteSource({token:process.env.CLOUDFLARE_API_TOKEN,account:process.env.CLOUDFLARE_ACCOUNT_ID,database:config.databaseId});
 }else if(arg('--sqlite')){const s=await sqliteSource(resolve(arg('--sqlite')));db=s;close=s.close}
 else throw new Error('Usage: build-search-snapshot.mjs --sqlite <file> | --remote [--out dir] [--report file]');
 try{
  const result=await buildSnapshot({db,out});
  const kb=n=>(n/1024).toFixed(1)+'KiB';
  console.log(`Search snapshot ${result.manifest.id}: ${result.manifest.hotels} hotels, ${result.queries} queries, ${result.rowsRead||'unreported'} rows read, ${result.ms}ms`);
  for(const [name,s] of Object.entries(result.sizes))console.log(`  ${name}: ${kb(s.raw)} raw, ${kb(s.gzip)} gzip, ${kb(s.brotli)} brotli`);
  if(report)writeFileSync(report,JSON.stringify({...result,manifest:{...result.manifest,coverage:undefined}},null,1)+'\n');
 }finally{close()}
}
