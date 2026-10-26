// Build the static search snapshot (lib/search-snapshot.ts) from a catalogue
// database and write it under <out>/snapshot/ as Worker static assets.
// Usage:
//   node scripts/build-search-snapshot.mjs --sqlite <file> [--out dist/client] [--report file]
//   node scripts/build-search-snapshot.mjs --remote [--out dist/client] [--report file]
//   [--geocoder-db <installed jageocoder dictionary> | --geocoder-skip <reason>]
//   [--progress-day <YYYY-MM-DD>]
// --progress-day (the snapshot deploy after a collection, deploy.yml): the UTC
// day the collection finished. The build also makes the collector's former
// end-of-run count and puts it in the report as progress, for
// scripts/record-coverage.mjs to store through the Worker (C07 plan 2).
// Map positions (geo.json, D06): payload coordinates, then Wikidata, then the
// geocoder, then Overture for approximate points (scripts/snapshot-geo.mjs).
// Without the geocoder the snapshot is still built, without those points; the
// reason is printed.
// --remote reads the D1 named in cloudflare-deploy.json through the Cloudflare
// API (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Every source is read-only:
// a statement that does not start with SELECT/WITH, or holds a write word
// anywhere outside literals, is refused before it is sent.
// SNAPSHOT_TRACE=1 prints rows read per query on stderr.
// The lib/ code runs compiled for Node, so the cards, search columns, coverage
// and collection status are made by the same functions the Worker used.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync,readdirSync,symlinkSync,statSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {renderStaticPage} from './build-static-page.mjs';
import {addGeo,loadWikidata,loadOverture,dictionaryGeocoder,geoSummary,WIKIDATA_FILE,OVERTURE_FILE,GEOCODER_DIR} from './snapshot-geo.mjs';
import {usageToday} from './cloudflare-usage.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const HEADERS_RULE='/snapshot/v/*\n  Cache-Control: public, max-age=31536000, immutable\n';
const READ_ONLY=/^\s*(?:SELECT|WITH)\b/i;
// Words that make or end a write in SQLite. A CTE can lead a write
// (WITH x AS (...) DELETE ...), so every word of the statement is checked,
// outside string literals and comments. replace() is refused with REPLACE.
const WRITES=/\b(?:INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|RETURNING)\b/i;
// The statement without strings, quoted names and comments, read in one pass
// from the left as SQLite reads it: a quote inside a comment starts nothing, a
// comment marker inside a string is text. Strings become '', quoted names ""
// and comments a space; an unterminated one runs to the end.
const code=sql=>{
 let out='',i=0;
 const quoted=(q,from)=>{for(let j=from;;){const k=sql.indexOf(q,j);if(k<0)return sql.length;if(sql[k+1]===q){j=k+2;continue}return k+1}};
 const until=(close,from)=>{const end=sql.indexOf(close,from);return end<0?sql.length:end+close.length};
 while(i<sql.length){
  const c=sql[i],next=sql[i+1];
  if(c==="'"){i=quoted("'",i+1);out+="''"}
  else if(c==='"'||c==='`'){i=quoted(c,i+1);out+='""'}
  else if(c==='['){i=until(']',i+1);out+='""'}
  else if(c==='-'&&next==='-'){i=until('\n',i+2);out+=' '}
  else if(c==='/'&&next==='*'){i=until('*/',i+2);out+=' '}
  else{out+=c;i++}
 }
 return out;
};

// A D1 binding that only reads: every statement is checked before it runs.
// rowsRead adds up meta.rows_read where the source reports it (D1, Miniflare).
export function readOnly(db){
 const stats={rowsRead:0,queries:0};
 const check=sql=>{const bare=code(sql);if(!READ_ONLY.test(bare)||WRITES.test(bare)||/;\s*\S/.test(bare.trim().replace(/;$/,'')))throw new Error('Snapshot sources are read-only: '+sql.slice(0,60))};
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
// The wait before retry n (0-based): Retry-After (seconds or an HTTP date) when
// the API sends one, never less than the 2/4/8 s backoff. A wait longer than
// MAX_RETRY_WAIT fails the build at once instead of retrying too early.
export const MAX_RETRY_WAIT=300000;
export function retryWait(response,attempt,now=Date.now()){
 const backoff=2000*2**attempt,header=response?.headers.get('Retry-After')?.trim();
 if(!header)return backoff;
 const asked=/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-now;
 return Number.isFinite(asked)?Math.max(backoff,asked):backoff;
}
export function remoteSource({token,account,database,fetchImpl=fetch,base='https://api.cloudflare.com/client/v4',sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!token||!account||!/^[0-9a-f-]{36}$/.test(database??''))throw new Error('Remote snapshot needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and a D1 databaseId');
 const url=`${base}/accounts/${encodeURIComponent(account)}/d1/database/${database}/query`;
 const query=async(sql,args)=>{
  if(args.some(a=>a===null||a===undefined||typeof a==='object'))throw new Error('Remote snapshot parameters must be strings or numbers');
  for(let attempt=0;;attempt++){
   let response;
   try{response=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params:args.map(String)}),signal:AbortSignal.timeout(60000)})}
   catch(error){if(attempt<3){await sleep(retryWait(null,attempt));continue}throw new Error('D1 query request failed: '+error.name)}
   if((response.status===429||response.status>=500)&&attempt<3){
    const wait=retryWait(response,attempt);
    if(wait>MAX_RETRY_WAIT)throw new Error(`D1 query HTTP ${response.status}: the API asks to wait ${Math.round(wait/1000)}s`);
    await sleep(wait);continue;
   }
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
const TSC=['--rootDir',ROOT,'--module','commonjs','--target','es2022','--esModuleInterop','--skipLibCheck','--resolveJsonModule','--moduleResolution','node','--noCheck'];
export function compileLib(temp,entry='lib/search-snapshot-build.ts',more=[]){
 symlinkSync(join(ROOT,'node_modules'),join(temp,'node_modules'));
 const r=spawnSync(process.execPath,[join(ROOT,'node_modules/typescript/bin/tsc'),...[entry,...more].map(f=>join(ROOT,f)),'--outDir',temp,...TSC],{encoding:'utf8'});
 const compiled=join(temp,entry.replace(/\.ts$/,'.js'));
 if(!existsSync(compiled))throw new Error('Snapshot compile failed\n'+r.stdout+r.stderr);
 for(const f of readdirSync(join(temp,'lib'),{recursive:true}).filter(f=>f.endsWith('.js'))){const p=join(temp,'lib',f),s=readFileSync(p,'utf8');if(s.includes('require("cloudflare:workers")'))writeFileSync(p,s.replaceAll('require("cloudflare:workers")','({get env(){return globalThis.__SNAPSHOT_ENV}})'))}
 return compiled;
}
// C07 plan 3: the files a snapshot is made from, and their hash, which the
// manifest carries (inputs) so a push deploy can tell whether the snapshot the
// site serves is still this commit's. Taken from the build, not a list kept by
// hand: what tsc compiles for the builder (lib/ and the JSON it imports), the
// scripts this one imports, the files snapshot-geo.mjs reads and the geocoder
// folder, the migrations (a deploy that applies one builds afresh) and the
// lockfile. check-search-snapshot-worker.mjs fails when a build reads a
// repository file outside them.
export function snapshotInputs(){
 const r=spawnSync(process.execPath,[join(ROOT,'node_modules/typescript/bin/tsc'),join(ROOT,'lib/search-snapshot-build.ts'),'--listFilesOnly',...TSC],{encoding:'utf8'});
 if(r.status!==0)throw new Error('Snapshot inputs: tsc --listFilesOnly failed\n'+r.stdout+r.stderr);
 const files=new Set(r.stdout.split('\n').map(f=>f.trim()).filter(f=>f.startsWith(ROOT+'/')&&!f.includes('/node_modules/')));
 const scripts=[fileURLToPath(import.meta.url)];
 for(const script of scripts)for(const m of readFileSync(script,'utf8').matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)){const p=resolve(dirname(script),m[1]??m[2]);if(!scripts.includes(p))scripts.push(p)}
 const folder=dir=>readdirSync(dir,{recursive:true}).map(f=>join(dir,f)).filter(f=>!f.includes('__pycache__')&&statSync(f).isFile());
 for(const f of [...scripts,WIKIDATA_FILE,OVERTURE_FILE,...folder(GEOCODER_DIR),...folder(join(ROOT,'drizzle')),join(ROOT,'pnpm-lock.yaml')])files.add(f);
 const list=[...files].map(f=>relative(ROOT,f)).sort(),hash=createHash('sha256');
 for(const f of list)hash.update(f+'\t'+createHash('sha256').update(readFileSync(join(ROOT,f))).digest('hex')+'\n');
 return{hash:hash.digest('hex'),files:list};
}
// The snapshot the site serves (public GETs only), when it is this commit's:
// the same format and inputs, and files that hash to its id. Throws the reason.
const SNAPSHOT_FILES=['core','cards','text','status','geo'],AGENT='Mozilla/5.0 (compatible; YukemuriSnapshot/1.0; +https://github.com/jihune/yukemuri)';
export async function publishedSnapshot({origin,fetchImpl,format,inputs}){
 const get=async path=>{const r=await fetchImpl(origin+path,{headers:{'User-Agent':AGENT},redirect:'manual',signal:AbortSignal.timeout(60000)});if(r.status!==200)throw new Error(path+' HTTP '+r.status);return r.text()};
 const manifest=JSON.parse(await get('/snapshot/manifest.json'));
 if(manifest.format!==format||!/^[0-9a-f]{16}$/.test(manifest.id??''))throw new Error(`the site's snapshot is format ${manifest.format}, this commit writes ${format}`);
 if(manifest.inputs!==inputs)throw new Error(manifest.inputs?'snapshot inputs changed':'the site\'s snapshot has no inputs hash (an older builder, or map points missing)');
 const files={};
 for(const name of SNAPSHOT_FILES)files[name]=await get(`/snapshot/v/${manifest.id}/${name}.json`);
 if(createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16)!==manifest.id)throw new Error('the served files do not hash to '+manifest.id);
 return{manifest,files};
}
// builder: the compiled lib/search-snapshot-build module, to build more than
// once without compiling again (tests); compiled here when absent.
// geocode: inputs => [lat,lng,grade]|null per input (dictionaryGeocoder), or
// null with skipReason. wikidata: Trip id -> point (loadWikidata by default).
// overture: hotel id -> point (loadOverture by default).
// usage: today's Cloudflare usage for the data status screen (usageToday), when given.
// progressDay: as --progress-day.
// reuse: the site's origin (--reuse, a push deploy): its snapshot is published
// again, unread from D1 but for the preparation keys, when it is this commit's
// (publishedSnapshot) and the catalogue is prepared; otherwise the build runs
// and reuseSkipped says why. fetchImpl: fetch for that. inputs: the hash of
// snapshotInputs(), computed when needed if not given.
export async function buildSnapshot({db,out,now=new Date(),builder,geocode=null,skipReason,wikidata,overture,usage,progressDay,reuse,fetchImpl=fetch,inputs}){
 if(reuse&&progressDay!==undefined)throw new Error('--reuse with --progress-day: a collection\'s count needs a fresh build');
 const temp=mkdtempSync(join(tmpdir(),'yukemuri-snapshot-'));
 try{
  const guarded=readOnly(db);
  globalThis.__SNAPSHOT_ENV={DB:guarded.db};
  const started=performance.now();
  const {buildSearchSnapshot,addFillGeo,firstPage,catalogPreparation,SNAPSHOT_FORMAT}=builder??createRequire(import.meta.url)(compileLib(temp));
  if(!Number.isInteger(SNAPSHOT_FORMAT))throw new Error('The snapshot builder exports no SNAPSHOT_FORMAT');
  if(progressDay!==undefined&&!/^\d{4}-\d\d-\d\d$/.test(progressDay))throw new Error('--progress-day must be YYYY-MM-DD');
  let published=null,reuseSkipped=null;
  if(reuse)try{
   const found=await publishedSnapshot({origin:reuse,fetchImpl,format:SNAPSHOT_FORMAT,inputs:inputs??=snapshotInputs().hash});
   if((await catalogPreparation()).length)reuseSkipped='the catalogue is not prepared for this release';else published=found;
  }catch(error){reuseSkipped=String(error.message).slice(0,200)}
  let data=null,geo=null,files,first;
  if(published){files=published.files;first=firstPage(JSON.parse(files.core),JSON.parse(files.cards),published.manifest.coverage)}
  else{
   data=await buildSearchSnapshot(now,progressDay);
   let points=wikidata,wikidataError=null;
   if(!points)try{points=loadWikidata()}catch(error){points=new Map();wikidataError=String(error.message).slice(0,200)}
   let places=overture,overtureError=null;
   if(!places)try{places=loadOverture()}catch(error){places=new Map();overtureError=String(error.message).slice(0,200)}
   geo={...await addGeo({ids:data.core.ids,geo:data.geo,inputs:data.geocodeInputs,wikidata:points,geocode,skipReason,overture:places}),wikidataError,overtureError};
   // The data status counts map precision as published, after geocoding (U06).
   addFillGeo(data.status.fill,data.core.ids,data.geo.grade);
   if(usage)data.status.fill.usage=usage;
   files={core:JSON.stringify(data.core),cards:JSON.stringify(data.cards),text:JSON.stringify(data.text),status:JSON.stringify(data.status),geo:JSON.stringify(data.geo)};
   first=data.first;
  }
  const id=published?published.manifest.id:createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,16);
  const folder=join(out,'snapshot'),dir=join(folder,'v',id);
  // Only the current version is published; older ones leave the asset set.
  rmSync(join(folder,'v'),{recursive:true,force:true});mkdirSync(dir,{recursive:true});
  const sizes={},paths={};
  for(const [name,body] of Object.entries(files)){
   const buffer=Buffer.from(body);writeFileSync(join(dir,name+'.json'),buffer);paths[name]=`/snapshot/v/${id}/${name}.json`;
   sizes[name]={raw:buffer.length,gzip:gzipSync(buffer,{level:9}).length,brotli:brotliCompressSync(buffer,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length};
  }
  // inputs: null when map points are missing (geocoder skipped, a geo file
  // unreadable), so that snapshot is never published again as it is.
  const manifest=published?.manifest??{format:SNAPSHOT_FORMAT,id,generatedAt:now.toISOString(),hotels:data.core.ids.length,coverage:data.coverage,mergedInto:data.mergedInto,files:paths,bytes:Object.fromEntries(Object.entries(sizes).map(([k,v])=>[k,v.raw])),inputs:geo.status==='ok'&&!geo.wikidataError&&!geo.overtureError?inputs??=snapshotInputs().hash:null};
  writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest));
  // The static page, rendered again with this snapshot's default first page.
  if(existsSync(join(out,'index.html'))){
   const text=JSON.stringify(first);
   sizes.first={raw:Buffer.byteLength(text),gzip:gzipSync(text,{level:9}).length,brotli:brotliCompressSync(text).length};
   const html=await renderStaticPage({out,firstPage:{snapshot:id,manifest,response:first}}),page=readFileSync(join(out,'index.html'));
   sizes.page={raw:html,gzip:gzipSync(page,{level:9}).length,brotli:brotliCompressSync(page).length};
  }
  const headers=join(out,'_headers'),current=existsSync(headers)?readFileSync(headers,'utf8'):'';
  if(!current.includes(HEADERS_RULE))writeFileSync(headers,current+(current&&!current.endsWith('\n')?'\n':'')+HEADERS_RULE);
  return{manifest,sizes,data,geo,unprepared:data?.unprepared??[],progress:data?.progress??null,reused:published?id:null,reuseSkipped,rowsRead:guarded.stats.rowsRead,queries:guarded.stats.queries,ms:Math.round(performance.now()-started)};
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
 else throw new Error('Usage: build-search-snapshot.mjs --sqlite <file> | --remote [--out dir] [--report file] [--require-prepared] [--geocoder-db dir | --geocoder-skip reason] [--progress-day YYYY-MM-DD | --reuse origin]');
 try{
  const dbDir=arg('--geocoder-db'),installed=dbDir&&existsSync(join(resolve(dbDir),'README.md'));
  const geocode=installed?dictionaryGeocoder({dbDir:resolve(dbDir),python:process.env.GEOCODER_PYTHON||'python3'}):null;
  const skipReason=dbDir&&!installed?'no installed dictionary in '+dbDir:arg('--geocoder-skip')||'no --geocoder-db given';
  // Read with the token --remote uses; a --sqlite build never asks Cloudflare and says so on the screen.
  const usage=await usageToday({env:argv.includes('--remote')?process.env:{},config:join(ROOT,'cloudflare-deploy.json')});
  const reuse=arg('--reuse');
  if(reuse!==null&&!/^https?:[/][/][^/\s]+$/.test(reuse))throw new Error('--reuse takes the site origin, like https://yukemuri.example.workers.dev');
  const result=await buildSnapshot({db,out,geocode,skipReason,usage,progressDay:arg('--progress-day')??undefined,reuse:reuse??undefined});
  const kb=n=>(n/1024).toFixed(1)+'KiB';
  console.log(`Search snapshot ${result.manifest.id}: ${result.manifest.hotels} hotels, ${result.reused?`published again from ${reuse} (same inputs), `:''}${result.queries} queries, ${result.rowsRead||'unreported'} rows read, ${result.ms}ms`);
  if(result.reuseSkipped)console.log(`  built afresh, not published again: ${result.reuseSkipped}`);
  for(const [name,s] of Object.entries(result.sizes))console.log(`  ${name}: ${kb(s.raw)} raw, ${kb(s.gzip)} gzip, ${kb(s.brotli)} brotli`);
  if(result.reused)console.log(`  map points, counts and Cloudflare usage as the site's snapshot of ${result.manifest.generatedAt}`);
  else console.log(`  Cloudflare usage today: ${usage.account?'read':'not read (the screen says so)'}\n`+geoSummary(result.geo)+(result.geo.wikidataError?'\n  Wikidata points not used: '+result.geo.wikidataError:'')+(result.geo.overtureError?'\n  Overture points not used: '+result.geo.overtureError:''));
  if(result.progress)console.log(`  collection count for ${result.progress.day}: ${result.progress.counts.records} records (record-coverage.mjs stores it)`);
  console.log(result.unprepared.length?`  catalogue not prepared for this release: ${result.unprepared.join(', ')}`:'  catalogue prepared for this release');
  // Refuse before writing the report: a report is what deploy.yml reads the
  // snapshot id from, and an unprepared snapshot must not get one.
  if(report)rmSync(report,{force:true});
  if(argv.includes('--require-prepared')&&result.unprepared.length)throw new Error('Catalogue still not prepared: '+result.unprepared.join(', '));
  if(report)writeFileSync(report,JSON.stringify({...result,data:undefined,manifest:{...result.manifest,coverage:undefined}},null,1)+'\n');
 }finally{close()}
}
