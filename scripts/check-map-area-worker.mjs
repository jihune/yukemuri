// U02 map-bounds search against the built Worker and a temporary D1: bounds edges,
// the point cap and its grid answer, and the same conditions as /api/hotels.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-map-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'map-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'map-test-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 const call=async(path,expected=200)=>{const r=await runtime.dispatchFetch('http://localhost'+path,{headers:{'X-Yukemuri-Visitor':'b'.repeat(64)}});const body=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(body).slice(0,300));return body};
 const map=(query,bbox)=>call('/api/hotels/map?'+new URLSearchParams({...query,bbox:bbox.join(',')}));
 const list=async query=>{const ids=[];let page=await call('/api/hotels?'+new URLSearchParams({...query,stable:'1'}));ids.push(...page.hotels);for(let n=2;page.snapshot&&ids.length<page.total;n++){page=await call('/api/hotels?'+new URLSearchParams({...query,stable:'1',page:String(n),snapshot:page.snapshot.token}));ids.push(...page.hotels)}return ids};
 const located=h=>Number.isFinite(h.location?.latitude)&&Number.isFinite(h.location?.longitude);
 await call('/api/hotels');

 // Bad input.
 for(const bbox of ['','130,33,131','130,34,131,33','131,33,130,34','130,-91,131,34','-181,33,131,34','130,33,131,x'])await call('/api/hotels/map?'+new URLSearchParams({bbox}),400);
 await call('/api/hotels/map?'+new URLSearchParams({bbox:'130,33,131,34',features:'not-a-feature'}),400);

 const base=await db.prepare("SELECT * FROM hotels WHERE id='takinoya'").first(),cols=Object.keys(base),basePayload=JSON.parse(base.payload);
 const naturalBit=1<<Object.keys(basePayload.features).indexOf('natural');
 const insert=(id,word,location,natural=true)=>{const payload={...basePayload,id,names:{ko:'지도 대조 '+id,ja:id,en:id},aliases:[],location:{label:'대조',address:'',isApproximate:false,...location}};const row={...base,id,name:payload.names.ko,search_text:word,bath_features:natural?naturalBit:0,bath_known:naturalBit,payload:JSON.stringify(payload)};return db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(k=>row[k]))};

 // Edges: both corners are inside; a hair past an edge is outside. A string or a
 // missing value is not a coordinate, as on the client.
 await db.batch([
  insert('qa-map-sw','qamapzz',{latitude:33,longitude:130}),
  insert('qa-map-ne','qamapzz',{latitude:34,longitude:131},false),
  insert('qa-map-east','qamapzz',{latitude:33.5,longitude:131.00001}),
  insert('qa-map-south','qamapzz',{latitude:32.99999,longitude:130.5}),
  insert('qa-map-none','qamapzz',{latitude:null,longitude:null}),
  insert('qa-map-text','qamapzz',{latitude:'33.5',longitude:'130.5'}),
 ]);
 const edge=await map({q:'qamapzz'},[130,33,131,34]);
 assert.deepEqual({total:edge.total,inBounds:edge.inBounds,outOfBounds:edge.outOfBounds,withoutCoordinates:edge.withoutCoordinates},{total:6,inBounds:2,outOfBounds:2,withoutCoordinates:2});
 assert.deepEqual(edge.points.map(p=>p.id),['qa-map-ne','qa-map-sw']);
 assert.deepEqual(edge.cells,[]);
 const sw=edge.points.find(p=>p.id==='qa-map-sw');assert.equal(sw.lat,33);assert.equal(sw.lng,130);assert.equal(sw.name,'지도 대조 qa-map-sw');

 // The same conditions as the list: a facility filter drops the same records.
 const natural=await map({q:'qamapzz',features:'natural'},[130,33,131,34]);
 const naturalList=await list({q:'qamapzz',features:'natural'});
 assert.equal(natural.total,naturalList.length);
 assert.deepEqual(natural.points.map(p=>p.id),['qa-map-sw']);
 // Catalogue-wide: every listed record with coordinates is a point, and no other.
 for(const query of [{rating:'8'},{region:'pref-hokkaido'},{features:'natural',provider:'jalan',rating:'4'}]){
  const listed=await list(query),area=await map(query,[-180,-90,180,90]);
  assert.equal(area.total,listed.length,JSON.stringify(query));
  assert.equal(area.withoutCoordinates,listed.filter(h=>!located(h)).length,JSON.stringify(query));
  assert.deepEqual(area.points.map(p=>p.id).sort(),listed.filter(located).map(h=>h.id).sort(),JSON.stringify(query));
 }

 // The cap: 500 points fit in one answer; 520 become grid counts that add up.
 // One record sits exactly on the north-east corner, the last row and column.
 const grid=[];for(let i=0;i<520;i++)grid.push(insert('qa-grid-'+String(i).padStart(3,'0'),'qagridzz',i<500?{latitude:35+(i%25)*0.02,longitude:140+Math.floor(i/25)*0.04}:i===519?{latitude:36,longitude:141}:{latitude:35.7+(i-500)*0.01,longitude:140.5}));
 for(let i=0;i<grid.length;i+=100)await db.batch(grid.slice(i,i+100));
 const capped=await map({q:'qagridzz'},[140,35,141,35.55]);
 assert.equal(capped.inBounds,500);assert.equal(capped.points.length,500);assert.equal(capped.limit,500);assert.deepEqual(capped.cells,[]);
 const over=await map({q:'qagridzz'},[140,35,141,36]);
 assert.equal(over.inBounds,520);assert.equal(over.points.length,0);assert(over.cells.length>1);
 assert.equal(over.cells.reduce((a,c)=>a+c.count,0),520);
 for(const c of over.cells){
  assert(c.south>=35-1e-9&&c.north<=36+1e-9&&c.west>=140-1e-9&&c.east<=141+1e-9,JSON.stringify(c));
  assert(c.lat>=c.south-1e-9&&c.lat<=c.north+1e-9&&c.lng>=c.west-1e-9&&c.lng<=c.east+1e-9,JSON.stringify(c));
 }
 // The existing list answer keeps its shape: no map fields are added to it.
 const page=await call('/api/hotels?q=qagridzz');assert.equal(page.total,520);assert(!('points' in page)&&!('cells' in page));
 console.log(`Map area passed: bad bounds and conditions rejected, inclusive edges, non-numeric coordinates counted as missing, list conditions matched for ${3} catalogue queries, ${capped.points.length} points at the cap and ${over.cells.length} grid cells summing to ${over.inBounds} above it.`);
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
