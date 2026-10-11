// Time /api/hotels/map on a temporary D1 grown to about the production record count.
// Local Miniflare SQLite only: this is not a measurement of production D1 latency.
// Usage: node scripts/measure-map-area.mjs [evidence.json]
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const [evidence]=process.argv.slice(2);
const TARGET=12155,LOCATED_SHARE=1276/12155; // roadmap.md 'C01 종료 집계', 2026-10-08T16:25Z
const temp=mkdtempSync(join(tmpdir(),'yukemuri-map-measure-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const runtime=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'map-measure'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:'map-measure-only'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 const call=async path=>{const t=performance.now();const r=await runtime.dispatchFetch('http://localhost'+path,{headers:{'X-Yukemuri-Visitor':'c'.repeat(64)}});const body=await r.json();if(r.status!==200)throw new Error(path+' '+r.status);return{ms:performance.now()-t,server:Number((r.headers.get('Server-Timing')??'').match(/dur=([\d.]+)/)?.[1]),body}};
 await call('/api/hotels');
 const seed=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;
 const cols=Object.keys(await db.prepare('SELECT * FROM hotels LIMIT 1').first()).filter(c=>c!=='id'&&c!=='payload');
 // Copies of the checked-in rows with new ids and no coordinates; then an exact share
 // of the copies gets a random point in Japan, so the located share matches production.
 for(let n=1;;n++){
  const have=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;if(have>=TARGET)break;
  await db.prepare(`INSERT INTO hotels (id,${cols.join(',')},payload) SELECT id||'-copy${n}',${cols.join(',')},json_set(payload,'$.id',id||'-copy${n}','$.location.latitude',NULL,'$.location.longitude',NULL) FROM hotels WHERE id NOT LIKE '%-copy%' LIMIT ?`).bind(TARGET-have).run();
 }
 const locatedNow=(await db.prepare("SELECT COUNT(*) AS n FROM hotels WHERE json_type(payload,'$.location.latitude') IN ('integer','real')").first()).n;
 await db.prepare("UPDATE hotels SET payload=json_set(payload,'$.location.latitude',31+abs(random())%1400/100.0,'$.location.longitude',129+abs(random())%1600/100.0) WHERE id IN (SELECT id FROM hotels WHERE id LIKE '%-copy%' ORDER BY random() LIMIT ?)").bind(Math.max(0,Math.round(LOCATED_SHARE*TARGET)-locatedNow)).run();
 const records=(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n;
 const located=(await db.prepare("SELECT COUNT(*) AS n FROM hotels WHERE json_type(payload,'$.location.latitude') IN ('integer','real') AND json_type(payload,'$.location.longitude') IN ('integer','real')").first()).n;
 const scenarios=[
  ['일본 전체, 조건 없음','/api/hotels/map?bbox=122,24,146,46'],
  ['홋카이도 범위, 조건 없음','/api/hotels/map?bbox=139,41,146,46'],
  ['규슈 범위, 천연온천','/api/hotels/map?bbox=129,31,132.5,34.5&features=natural'],
  ['일본 전체, Trip.com 9.0+','/api/hotels/map?bbox=122,24,146,46&rating=9'],
  ['비교: 목록 첫 쪽(fresh)','/api/hotels?stable=1&fresh=1'],
 ];
 const runs=7,results=[];
 for(const [name,path] of scenarios){
  await call(path);
  const times=[],server=[];let last;
  for(let i=0;i<runs;i++){const r=await call(path);times.push(r.ms);server.push(r.server);last=r.body}
  const sorted=[...times].sort((a,b)=>a-b),serverSorted=[...server].sort((a,b)=>a-b);
  const row={name,path,runs,medianMs:+sorted[runs>>1].toFixed(1),maxMs:+sorted.at(-1).toFixed(1),serverMedianMs:+serverSorted[runs>>1].toFixed(1),total:last.total,inBounds:last.inBounds,points:last.points?.length,cells:last.cells?.length};
  results.push(row);console.log(JSON.stringify(row));
 }
 const out={measuredAt:new Date().toISOString(),environment:'Miniflare local SQLite in the Claude Code cloud container (not production D1)',seedRecords:seed,records,located,runsPerScenario:runs,results};
 if(evidence)writeFileSync(evidence,JSON.stringify(out,null,1)+'\n');
 console.log(`records=${records} located=${located} scenarios=${results.length}`);
}finally{await runtime.dispose();rmSync(temp,{recursive:true,force:true})}
