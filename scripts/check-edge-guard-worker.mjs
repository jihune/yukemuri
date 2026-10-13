// Built Worker public-site protection: per-IP limit on every Worker request
// (pages and API), refusal of tools and crawlers without the key before D1,
// X-Robots-Tag on every Worker response, maintenance exemption, absence of the
// limiter and of the refusal setting. Temporary D1 only.
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'yukemuri-edge-'));
const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...readdirSync('dist/server',{recursive:true}).filter(p=>p.endsWith('.js')&&p!=='index.js').map(p=>({type:'ESModule',path:resolve('dist/server',p)}))];
const KEY='edge-test-only',LIMIT=3,MESSAGE='요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.',AGENT_MESSAGE='브라우저가 아닌 자동화 도구의 요청은 받지 않습니다.';
const ROBOTS='noindex, nofollow, noarchive',VISITOR='e'.repeat(64);
const CHROME='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
// Browsers people use, and the Playwright Chromium of the repository's browser checks.
const BROWSERS=[CHROME,
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
 'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36;KAKAOTALK 2511020',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.15.1)',
 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36'];
// Tools and crawlers: no agent, tool defaults, crawlers that name themselves.
const TOOLS=['','curl/8.5.0','Wget/1.21.4','python-requests/2.32.3','Python-urllib/3.12','Go-http-client/2.0','node','undici','axios/1.12.2','Scrapy/2.13.3 (+https://scrapy.org)',
 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)','Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)','facebookexternalhit/1.1;kakaotalk-scrap/1.0;','Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'];
const options=(extra,bindings={})=>({modules,modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'edge-test'},d1Persist:join(temp,'db'),bindings:{CRAWL_ACCESS_KEY:KEY,...bindings},...extra});
// As deployed: the limiter and the refusal setting of the generated wrangler.json.
const deployed=JSON.parse(readFileSync('dist/server/wrangler.json','utf8')).vars;
assert.equal(deployed?.REJECT_AUTOMATED_AGENTS,'1','the generated config turns the refusal on');
const limited=new Miniflare(options({ratelimits:{API_RATE_LIMITER:{simple:{limit:LIMIT,period:60}}}},deployed));
let unlimited;
let ipCounter=0;const freshIp=()=>`198.51.100.${++ipCounter}`;
// A browser unless the test names another agent; every Worker response is marked noindex.
const call=async(runtime,path,headers={},init={})=>{const r=await runtime.dispatchFetch('http://localhost'+path,{...init,headers:{'User-Agent':CHROME,...headers}});assert.equal(r.headers.get('X-Robots-Tag'),ROBOTS,path+' X-Robots-Tag');return r};
try{
 const db=await limited.getD1Database('DB');
 for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync(join('drizzle',migration),'utf8').replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();

 // The limiter counts in fixed one-minute windows: a sequence that crosses a
 // minute boundary starts again from zero (CI run 38155871697 at 16:35:55-16:36:02Z).
 // Start the limited sequence early in a minute.
 if(Date.now()%60000>40000)await new Promise(r=>setTimeout(r,60500-Date.now()%60000));
 // Limit: an IP gets LIMIT API responses per window, then 429 with guidance.
 const ip=freshIp(),probe='/api/collector-release';
 for(let i=0;i<LIMIT;i++){const r=await call(limited,probe,{'CF-Connecting-IP':ip});assert.equal(r.status,403);await r.body?.cancel()}
 const blocked=await call(limited,probe,{'CF-Connecting-IP':ip});
 assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');assert.equal(blocked.headers.get('Cache-Control'),'no-store');
 assert.match(blocked.headers.get('Content-Type')??'',/^application\/json/);assert.deepEqual(await blocked.json(),{error:MESSAGE});
 // A wrong maintenance key is still limited; a valid one is exempt.
 const wrong=await call(limited,probe,{'CF-Connecting-IP':ip,'X-Yukemuri-Crawl-Key':'edge-test-onlx'});assert.equal(wrong.status,429);await wrong.body?.cancel();
 for(let i=0;i<LIMIT+2;i++){const r=await call(limited,probe,{'CF-Connecting-IP':ip,'X-Yukemuri-Crawl-Key':KEY,'User-Agent':'YukemuriBackup/1.0'});assert.equal(r.status,200,'maintenance key is exempt');await r.body?.cancel()}
 // Another IP has its own counter.
 const other=await call(limited,probe,{'CF-Connecting-IP':freshIp()});assert.equal(other.status,403);await other.body?.cancel();
 // Pages share the same counter. Deployed, the home page is a static asset (P03)
 // that never reaches the Worker; a page that does is limited all the same.
 const page=await call(limited,'/?q=x',{'CF-Connecting-IP':ip});
 assert.equal(page.status,429);assert.match(page.headers.get('Content-Type')??'',/^text\/html/);assert.equal(page.headers.get('Retry-After'),'60');assert.equal(page.headers.get('Cache-Control'),'no-store');
 assert((await page.text()).includes(MESSAGE));
 const pageIp=freshIp();
 for(let i=0;i<LIMIT;i++){const r=await call(limited,`/?q=${i}`,{'CF-Connecting-IP':pageIp});assert.equal(r.status,200,'home page under the limit');await r.body?.cancel()}
 const pageBlocked=await call(limited,'/?q=again',{'CF-Connecting-IP':pageIp});assert.equal(pageBlocked.status,429,'varying page queries cannot bypass the limit');await pageBlocked.body?.cancel();
 // An anonymous read under the limit still reaches the app unchanged.
 const search=await call(limited,'/api/favorites',{'CF-Connecting-IP':freshIp()});
 assert.equal(search.status,200);assert.equal(search.headers.get('Cache-Control'),'no-store');await search.body?.cancel();

 // Tools and crawlers without the key: 403 before the app (JSON for API, HTML for pages).
 for(const agent of TOOLS){
  const r=await call(limited,'/api/favorites',{'CF-Connecting-IP':freshIp(),'User-Agent':agent});
  assert.equal(r.status,403,`refused: ${JSON.stringify(agent)}`);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(await r.json(),{error:AGENT_MESSAGE});
 }
 const noAgent=await limited.dispatchFetch('http://localhost/api/favorites',{headers:{'CF-Connecting-IP':freshIp()}});assert.equal(noAgent.status,403,'Miniflare default agent (undici)');await noAgent.body?.cancel();
 const toolPage=await call(limited,'/?q=tool',{'CF-Connecting-IP':freshIp(),'User-Agent':'curl/8.5.0'});
 assert.equal(toolPage.status,403);assert.match(toolPage.headers.get('Content-Type')??'',/^text\/html/);assert((await toolPage.text()).includes(AGENT_MESSAGE));
 for(const agent of BROWSERS){const r=await call(limited,'/api/favorites',{'CF-Connecting-IP':freshIp(),'User-Agent':agent});assert.equal(r.status,200,`browser served: ${agent}`);await r.body?.cancel()}
 // A valid key passes with any agent (collector, backup, deploy tools); a wrong key does not.
 for(const agent of ['YukemuriCatalogUpdater/1.0 (+https://yukemuri.jihune.workers.dev)','YukemuriBackup/1.0 (+https://yukemuri.jihune.workers.dev)','node']){const r=await call(limited,probe,{'CF-Connecting-IP':freshIp(),'X-Yukemuri-Crawl-Key':KEY,'User-Agent':agent});assert.equal(r.status,200,agent);await r.body?.cancel()}
 const wrongTool=await call(limited,probe,{'CF-Connecting-IP':freshIp(),'X-Yukemuri-Crawl-Key':'edge-test-onlx','User-Agent':'node'});assert.equal(wrongTool.status,403);assert.deepEqual(await wrongTool.json(),{error:AGENT_MESSAGE});
 // A refused request reaches neither D1 nor the limiter: a favourite PUT from a
 // tool writes nothing, the same PUT from a browser writes one row (control),
 // and an IP whose tool requests were refused still has its whole limit.
 await db.prepare("INSERT INTO hotels (id,region,name,search_text,kind,payload) VALUES ('edge-hotel','hakone','Edge','edge','ryokan','{}')").run();
 const saved=async()=>(await db.prepare('SELECT COUNT(*) AS n FROM visitor_favorites').first()).n;
 const put={method:'PUT',body:JSON.stringify({hotelId:'edge-hotel',saved:true})},toolIp=freshIp();
 for(let i=0;i<LIMIT+2;i++){const r=await call(limited,'/api/favorites',{'CF-Connecting-IP':toolIp,'User-Agent':'python-requests/2.32.3','Content-Type':'application/json','X-Yukemuri-Visitor':VISITOR},put);assert.equal(r.status,403);await r.body?.cancel()}
 assert.equal(await saved(),0,'refused requests wrote nothing');
 for(let i=0;i<LIMIT;i++){const r=await call(limited,'/api/favorites',{'CF-Connecting-IP':toolIp,'Content-Type':'application/json','X-Yukemuri-Visitor':VISITOR},put);assert.equal(r.status,200,'the refused IP keeps its limit');await r.body?.cancel()}
 assert.equal(await saved(),1,'the browser request wrote its row');

 // Without the binding and the setting (local tools, the other Worker checks) nothing is limited or refused.
 await limited.dispose();
 unlimited=new Miniflare(options({}));
 const sameIp=freshIp();
 for(let i=0;i<LIMIT*3;i++){const r=await call(unlimited,probe,{'CF-Connecting-IP':sameIp});assert.equal(r.status,403);await r.body?.cancel()}
 const tool=await call(unlimited,'/api/favorites',{'CF-Connecting-IP':sameIp,'User-Agent':'curl/8.5.0'});assert.equal(tool.status,200,'no setting means no refusal');await tool.body?.cancel();
 console.log(`Edge guard passed: ${LIMIT}/IP then 429 with guidance (JSON for API, HTML for pages), wrong key limited, valid key exempt, separate IPs, home page queries counted, ${TOOLS.length} tool and crawler agents refused with 403 before D1 and the limiter, ${BROWSERS.length} browser agents served, maintenance agents with the key served, X-Robots-Tag on every Worker response, no binding or setting means no limit or refusal.`);
}finally{await limited.dispose().catch(()=>{});if(unlimited)await unlimited.dispose();rmSync(temp,{recursive:true,force:true})}
