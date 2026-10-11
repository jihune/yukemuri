// Changing ratings/names during scrolling must not shift an existing result set.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json')),{Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-sessions-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'sessions-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'sessions-test-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
 const api=async(path,status=200,extra={})=>{
  const response=await runtime.dispatchFetch('http://localhost'+path,{headers:extra}),data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
 };
 const first=await api('/api/hotels?stable=1&sort=name');assert(first.snapshot);
 const row=await db.prepare('SELECT ids FROM hotel_result_sessions WHERE token=?').bind(first.snapshot.token).first(),ids=JSON.parse(row.ids);
 // Move the whole first page down and a later row to the top; add a new row.
 await db.prepare("UPDATE hotels SET name='zzzz moved' WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids.slice(0,40))).run();
 await db.prepare("UPDATE hotels SET name='000 moved',trip_score=10 WHERE id=?").bind(ids[95]).run();
 const seed=await db.prepare('SELECT * FROM hotels WHERE id=?').bind(ids[95]).first();
 const columns=Object.keys(seed),values=columns.map(k=>k==='id'?'new-session-fixture':k==='name'?'000 new':k==='payload'?JSON.stringify({...JSON.parse(seed.payload),id:'new-session-fixture'}):seed[k]);
 await db.prepare(`INSERT INTO hotels(${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...values).run();
 const second=await api('/api/hotels?stable=1&sort=name&page=2&snapshot='+first.snapshot.token);
 assert.deepEqual(second.hotels.map(h=>h.id),ids.slice(40,80));assert.equal(second.total,ids.length);
 const third=await api('/api/hotels?stable=1&sort=name&page=3&snapshot='+first.snapshot.token);assert.deepEqual(third.hotels.map(h=>h.id),ids.slice(80,120));
 assert.equal(new Set([...first.hotels,...second.hotels,...third.hotels].map(h=>h.id)).size,120);
 await api('/api/hotels?sort=rating&page=2&snapshot='+first.snapshot.token,409);
 await api('/api/hotels?page=999&sort=name&snapshot='+first.snapshot.token,400);
 await api('/api/hotels?snapshot=../../schema',400);
 const fresh=await api('/api/hotels?stable=1&fresh=1&sort=name');assert.equal(fresh.total,ids.length+1);assert.notEqual(fresh.snapshot.token,first.snapshot.token);
 await db.prepare('UPDATE hotel_result_sessions SET expires_at=0 WHERE token=?').bind(first.snapshot.token).run();
 await api('/api/hotels?sort=name&page=2&snapshot='+first.snapshot.token,410);
 // Same saved IDs still do not grant another browser access to its session.
 const visitor='a'.repeat(64),other='b'.repeat(64),visitorKey=createHash('sha256').update(visitor).digest('hex'),otherKey=createHash('sha256').update(other).digest('hex');
 for(const key of [visitorKey,otherKey])await db.prepare('INSERT INTO visitor_favorites(visitor_key,hotel_id) SELECT ?,value FROM json_each(?)').bind(key,JSON.stringify(ids.slice(0,80))).run();
 const saved=await api('/api/hotels?stable=1&saved=1',200,{'X-Yukemuri-Visitor':visitor});assert(saved.snapshot);
 await api('/api/hotels?saved=1&page=2&snapshot='+saved.snapshot.token,409,{'X-Yukemuri-Visitor':other});
 await api('/api/hotels?saved=1&page=2&snapshot='+saved.snapshot.token,409);
 await api('/api/hotels?saved=1&page=2&snapshot='+saved.snapshot.token,200,{'X-Yukemuri-Visitor':visitor});
 await db.prepare('DELETE FROM visitor_favorites WHERE visitor_key=? AND hotel_id=?').bind(visitorKey,ids[0]).run();
 await api('/api/hotels?saved=1&page=2&snapshot='+saved.snapshot.token,409,{'X-Yukemuri-Visitor':visitor});
 // Capacity and logical expiry have explicit bounds.
 await db.prepare("INSERT INTO hotel_result_sessions(token,query_key,ids,metadata,created_at,expires_at) SELECT 'old-'||value,'old','[]','{}',0,9999999999 FROM json_each(?)").bind(JSON.stringify(Array.from({length:270},(_,i)=>i))).run();
 await api('/api/hotels?stable=1&fresh=1');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hotel_result_sessions').first()).n,256);
 const html=await(await runtime.dispatchFetch('http://localhost/?q='+encodeURIComponent('아소 소잔쿄')+'&sort=name&view=list')).text();assert(html.includes('jalan-327522'));assert(html.includes('view-list'));assert(html.includes('아소 소잔쿄'));
 // Export is protected, allowlisted, and traverses composite keys exactly once.
 const auth={'X-Yukemuri-Crawl-Key':'sessions-test-only'};
 await api('/api/catalog-export',403);await api('/api/catalog-export?table=sqlite_master',400,auth);await api('/api/catalog-export?limit=1001',400,auth);await api('/api/catalog-export?table=hotel_names&after=%5B%22x%22%5D',400,auth);
 await db.prepare('INSERT INTO hotel_names(hotel_id,name_key,name) VALUES (?,?,?),(?,?,?)').bind(ids[0],'size-fixture-1','의'.repeat(170000),ids[0],'size-fixture-2','의'.repeat(170000)).run();
 const manifest=await api('/api/catalog-export',200,auth),migrationHash=createHash('sha256');
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())migrationHash.update(f+'\n').update(readFileSync(join('drizzle',f))).update('\n');
 const lines=[],counts={},digest=createHash('sha256');
 const add=value=>{const line=JSON.stringify(value)+'\n';lines.push(line);digest.update(line)};
 add({type:'manifest',migrationsSha256:migrationHash.digest('hex'),manifest});
 for(const table of manifest.tables){
  let after=null;const keys=new Set();counts[table.name]=0;
  do{
   const p=new URLSearchParams({table:table.name,limit:'1000'});if(after)p.set('after',JSON.stringify(after));
   const page=await api('/api/catalog-export?'+p,200,auth);assert(Buffer.byteLength(JSON.stringify(page))<901000,'Export responses stay bounded in UTF-8 bytes');
   for(const row of page.rows){const key=JSON.stringify(table.key.map(k=>row[k]));assert(!keys.has(key));keys.add(key);counts[table.name]++;add({type:'row',table:table.name,row})}
   after=page.next;
  }while(after);
  assert.equal(counts[table.name],table.count);
 }
 lines.push(JSON.stringify({type:'complete',sha256:digest.digest('hex'),counts,consistency:'non_atomic'})+'\n');
 const archive=join(temp,'checkpoint.jsonl.gz'),restored=join(temp,'restored.sqlite');writeFileSync(archive,gzipSync(lines.join('')));
 const recovery=spawnSync('python',['scripts/catalog-checkpoint.py','restore','--archive',archive,'--out',restored],{encoding:'utf8'});assert.equal(recovery.status,0,recovery.stderr);assert(JSON.parse(recovery.stdout).integrity==='ok');
 const overwrite=spawnSync('python',['scripts/catalog-checkpoint.py','restore','--archive',archive,'--out',restored],{encoding:'utf8'});assert.notEqual(overwrite.status,0);
 writeFileSync(join(temp,'corrupt.gz'),gzipSync(lines.join('').replace('non_atomic','tampered')));
 const corrupt=spawnSync('python',['scripts/catalog-checkpoint.py','restore','--archive',join(temp,'corrupt.gz'),'--out',join(temp,'bad.sqlite')],{encoding:'utf8'});assert.notEqual(corrupt.status,0);
 console.log('Session/checkpoint checks passed: 120 stable IDs despite updates/insertion; filter/saved-owner/expiry guards; capacity bound; URL SSR; protected composite-key export; fresh SQLite recovery, overwrite and corruption rejection.');
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
