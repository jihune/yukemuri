// D08 PR 6: a stay whose Jalan and Trip.com records are grouped shows once, in real Chromium
// (360·390px touch, 1280px mouse), on a site of its own: a temporary D1 seeded through
// crawl-prepare, with one reviewed pair (D08 PR 5) whose Trip.com record is stored too, under a
// Latin name its Jalan record lacks, saved again through the maintenance API; its snapshot is
// written to dist/client like scripts/prepare-local-site.mjs (run that again for the usual local
// site), and wrangler dev serves it with that D1.
// - the Trip.com record has no card: a search by its own name lists the Jalan card only;
// - its id saved and compared before (a favourite, the comparison in localStorage) shows as the
//   Jalan card, saved; unsaving that card unsaves both ids;
// - its shared address (#stay/<Trip.com id>) opens the Jalan card's detail with both
//   providers' ratings, the address replaced, and closing it returns to the list;
// - the data status screen's ‘세는 기준’ says how grouped records are counted, with no
//   horizontal overflow; no page error.
// Needs the build and the isolated Playwright install in docs/ui-u01-20261010.md.
// Usage: node scripts/check-d08-merged-browser.mjs [evidence.json] [screenshot dir]
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {buildSnapshot} from './build-search-snapshot.mjs';
const {chromium}=createRequire(new URL('../.sites-runtime/u01-browser/package.json',import.meta.url))('playwright');
const {Miniflare}=createRequire(realpathSync('node_modules/wrangler/package.json'))('miniflare');
const [evidence,shots]=process.argv.slice(2),PORT=8791,base=`http://127.0.0.1:${PORT}`,KEY='merged-browser-only',NAME='Merged Check Ryokan';
if(shots)mkdirSync(shots,{recursive:true});
const temp=mkdtempSync(join(tmpdir(),'yukemuri-merged-browser-')),results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
let server=null;
try{
 // The site's D1, where wrangler dev --persist-to reads it.
 const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
 const mf=new Miniflare({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:JSON.parse(readFileSync('dist/server/wrangler.json','utf8')).d1_databases[0].database_id},d1Persist:join(temp,'v3','d1'),bindings:{CRAWL_ACCESS_KEY:KEY}});
 let pair;
 try{
  const db=await mf.getD1Database('DB');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(join('drizzle',f),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
  const call=(path,init)=>mf.dispatchFetch('http://localhost'+path,{...init,headers:{'X-Yukemuri-Crawl-Key':KEY,'Content-Type':'application/json'}});
  if(!(await call('/api/crawl-prepare',{method:'POST'})).ok)throw new Error('crawl-prepare failed');
  const p=JSON.parse((await db.prepare('SELECT payload FROM hotel_source_groups WHERE hotel_id=jalan_hotel_id AND trip_hotel_id NOT IN (SELECT id FROM hotels) ORDER BY hotel_id LIMIT 1').first()).payload);
  const template=await db.prepare("SELECT * FROM hotels WHERE id GLOB 'trip-*' AND trip_score IS NOT NULL ORDER BY id LIMIT 1").first(),jalan=JSON.parse((await db.prepare('SELECT payload FROM hotels WHERE id=?').bind(p.hotelId).first()).payload);
  const h={...JSON.parse(template.payload),id:p.tripHotelId,names:{ko:p.matchedName,ja:p.matchedName,en:NAME},aliases:[],prefecture:jalan.prefecture,regionId:jalan.regionId};
  h.ratings=h.ratings.map(r=>({...r,sourceId:p.tripHotelId}));h.sources=h.sources.map((s,i)=>i?s:{...s,sourceId:p.tripHotelId});
  const row={...template,id:p.tripHotelId,region:jalan.regionId,prefecture:jalan.prefecture,name:p.matchedName,payload:JSON.stringify(h)},cols=Object.keys(row);
  await db.prepare(`INSERT INTO hotels (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run();
  const saved=await call('/api/hotel-source-groups',{method:'PUT',body:JSON.stringify({...p,checkedAt:new Date(Date.parse(p.checkedAt)+1000).toISOString()})});
  if(saved.status!==200)throw new Error('the pair was not saved: '+await saved.text());
  const {manifest}=await buildSnapshot({db,out:resolve('dist/client')});
  pair={trip:p.tripHotelId,jalan:p.hotelId,snapshot:manifest.id,mergedInto:manifest.mergedInto};
 }finally{await mf.dispose()}
 console.log(`Pair ${pair.trip} -> ${pair.jalan}, snapshot ${pair.snapshot}`);
 check('스냅숏 매니페스트가 Trip.com ID를 Jalan 카드로 보냄',pair.mergedInto?.[pair.trip]===pair.jalan,pair);

 server=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to',temp,'--ip','127.0.0.1','--port',String(PORT),'--inspector-port','0'],{stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',d=>{log+=d});server.stderr.on('data',d=>{log+=d});
 for(let i=0;;i++){
  const ok=await fetch(base+'/snapshot/manifest.json').then(r=>r.ok,()=>false);if(ok)break;
  if(i>=120||server.exitCode!==null)throw new Error('wrangler dev did not start: '+log.slice(-800));
  await new Promise(r=>setTimeout(r,500));
 }

 const browser=await chromium.launch();
 for(const w of [360,390,1280]){
  width=w;const mobile=w<900;
  const context=await browser.newContext({viewport:{width:w,height:mobile?800:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,locale:'ko-KR'});
  await context.route(url=>!url.href.startsWith(base),route=>route.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
  const tap=l=>mobile?l.tap():l.click();
  const cards=()=>page.locator('[id^="card-"]').evaluateAll(list=>list.map(e=>e.id.slice(5)));
  const favorites=()=>page.evaluate(()=>fetch('/api/favorites',{headers:{'X-Yukemuri-Visitor':localStorage.getItem('yukemuri-visitor-v1')}}).then(r=>r.json()));
  await page.goto(base+'/',{waitUntil:'networkidle'});
  // Saved and compared under the Trip.com id, as before the pair was grouped.
  const put=await page.evaluate(trip=>{localStorage.setItem('yukemuri-comparison-v1',JSON.stringify([trip]));return fetch('/api/favorites',{method:'PUT',headers:{'Content-Type':'application/json','X-Yukemuri-Visitor':localStorage.getItem('yukemuri-visitor-v1')},body:JSON.stringify({hotelId:trip,saved:true})}).then(r=>r.status)},pair.trip);

  await page.goto(base+'/?q='+encodeURIComponent(NAME),{waitUntil:'networkidle'});
  await page.locator('#card-'+pair.jalan).waitFor({timeout:10000}).catch(()=>{});
  const found=await cards();
  check(`Trip.com 기록의 이름(${NAME})으로 찾으면 Jalan 카드만 나옴`,found.includes(pair.jalan)&&!found.includes(pair.trip),{found});

  await page.goto(base+'/?saved=1',{waitUntil:'networkidle'});
  const heart=page.locator(`#card-${pair.jalan} [aria-pressed]`).first();
  await heart.waitFor({timeout:10000}).catch(()=>{});
  const savedCards=await cards(),pressed=await heart.getAttribute('aria-pressed').catch(()=>null),title=(await page.locator('.results-header h2').textContent())??'';
  const compared=await page.evaluate(()=>localStorage.getItem('yukemuri-comparison-v1'));
  check('Trip.com ID로 저장한 즐겨찾기가 Jalan 카드 하나로, 저장된 상태로 보임',put===200&&savedCards.length===1&&savedCards[0]===pair.jalan&&pressed==='true'&&/1곳/.test(title),{put,savedCards,pressed,title});
  check('Trip.com ID로 담은 비교 후보가 Jalan 카드 ID로 바뀜',compared===JSON.stringify([pair.jalan]),{compared});
  if(shots)await page.locator('#card-'+pair.jalan).screenshot({path:join(shots,`saved-${w}.png`)});
  if(await heart.count()){await tap(heart);await page.getByText('즐겨찾기에서 해제했어요.').waitFor({timeout:10000}).catch(()=>{})}
  const after=await favorites();
  check('그 카드의 저장을 풀면 두 ID가 모두 풀림',Array.isArray(after.ids)&&after.ids.length===0,after);

  await page.goto(base+'/?q=',{waitUntil:'networkidle'});
  const answered=page.waitForResponse(r=>r.url().endsWith('/api/hotels/'+pair.jalan),{timeout:15000}).then(r=>r.json(),()=>null);
  await page.goto(base+'/#stay/'+pair.trip,{waitUntil:'networkidle'});
  const detail=await answered;
  await page.waitForTimeout(300);
  const hash=await page.evaluate(()=>location.hash),providers=(detail?.ratings??[]).map(r=>r.provider).sort();
  const sheet=page.getByRole('dialog').first(),shown=await sheet.isVisible().catch(()=>false);
  check('Trip.com ID의 공유 주소가 Jalan 카드의 상세로 열리고 주소가 그 ID로 바뀜, 두 공급자 평점',hash==='#stay/'+pair.jalan&&shown&&providers.join()==='jalan,trip',{hash,shown,providers});
  if(shots)await page.screenshot({path:join(shots,`detail-${w}.png`)});
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  check('상세를 닫으면 같은 사이트의 목록으로 돌아옴',await page.evaluate(()=>location.hash==='')&&page.url().startsWith(base),{url:page.url()});

  await page.goto(base+'/#status',{waitUntil:'networkidle'});
  const defs=page.locator('.u06-defs');await defs.waitFor({timeout:10000});await defs.locator('summary').scrollIntoViewIfNeeded();await tap(defs.locator('summary'));
  const place=defs.locator('div').filter({hasText:'곳(숙소 카드)'}).first();await place.scrollIntoViewIfNeeded();
  const def=await place.evaluate(e=>{const r=e.getBoundingClientRect();return{text:e.textContent,inside:r.left>=0&&r.right<=innerWidth+0.5,overflow:document.documentElement.scrollWidth>innerWidth}});
  check('자료 현황 ‘세는 기준’: 곳은 카드, 같은 숙소로 확인해 묶은 쌍은 1곳, 화면 안, 가로 넘침 없음',def.text.includes('같은 숙소로 확인해 묶은 쌍')&&def.text.includes('1곳으로 셉니다')&&def.inside&&!def.overflow,def);
  if(shots)await place.screenshot({path:join(shots,`status-defs-${w}.png`)});
  check('페이지 오류 없음',errors.length===0,{errors});
  await context.close();
 }
 await browser.close();
}finally{
 if(server&&server.exitCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await exited}
 rmSync(temp,{recursive:true,force:true});
}
const failed=results.filter(r=>!r.pass).length;
if(evidence)writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),results},null,1)+'\n');
console.log(`${results.length-failed}/${results.length} passed -> ${failed?'FAIL':'PASS'}`);
process.exitCode=failed?1:0;
