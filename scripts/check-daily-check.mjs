// daily-check.mjs and usage.yml (check: true) without an account: the 90%
// boundary of each free limit, exceededResources, gentle runs read from a local
// stand-in for the GitHub API (runs, jobs, a log behind a 302 like the real
// endpoint), the four control inputs, and failures to read that never pass.
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {ENDPOINT,LIMITS} from './cloudflare-usage.mjs';
import {GENTLE_TITLE} from './check-collection-freshness.mjs';
import {FAIL,JOB_MINUTES,COLLECT_JOB,SNAPSHOT_JOB,BUDGET_STEP,COLLECTOR_STEP,CONTROLS,CONTROL_TOKEN,TIMEOUT_MS,checkDate,usageFailures,parseLog,budgetLeft,runFailures,dayFailures,dailyCheck,CheckError} from './daily-check.mjs';

// usage.yml: the check is a second step behind the boolean input, with the workflow token for Actions reads.
const usage=readFileSync('.github/workflows/usage.yml','utf8');
assert(!/^\s+schedule:/m.test(usage),'no cron in this public repository: the runner dispatches the check');
assert.match(usage,/^permissions:\n  contents: read\n  actions: read\n(?! )/m,'read-only token; actions: read for the collect.yml runs');
assert.match(usage,/\n      check:\n        description: .+\n        type: boolean\n        required: false\n        default: false\n/);
const options=usage.match(/\n      control:\n(?:        .+\n)+?        options:\n((?:          - .+\n)+)/)?.[1].trim().split(/\n\s+- /).map(s=>s.replace(/^- /,''));
assert.deepEqual(options,CONTROLS,'control options match the script');
assert.match(usage,/\n      control:\n        description: .+\n        type: choice\n        required: false\n        default: none\n/);
assert.match(usage,/\n      - if: \$\{\{ !inputs\.check \}\}\n {8}env:\n(?: {10}.+\n)+ {8}run: node scripts\/cloudflare-usage\.mjs\n/,'the usage table stays the default');
assert(usage.endsWith([
 '      - if: inputs.check','        env:','          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}','          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
 '          GH_TOKEN: ${{ github.token }}','          CHECK_DATE: ${{ inputs.date }}','          CHECK_CONTROL: ${{ inputs.control }}','        run: node scripts/daily-check.mjs',''].join('\n')),'check step');
assert.match(usage,/^run-name: Cloudflare usage\$\{\{ inputs\.check && format\(' \(daily check\{0\}\)'/m,'check runs carry their own name');
// What the check reads from collect.yml and its log must still be there.
const collect=readFileSync('.github/workflows/collect.yml','utf8');
assert.match(collect,new RegExp(`\\n  ${COLLECT_JOB}:\\n    runs-on: .+\\n(?:    #.*\\n)*    timeout-minutes: ${JOB_MINUTES}\\n`),'collect job and its timeout');
assert(collect.includes('        run: node scripts/collection-budget.mjs | tee -a "$GITHUB_OUTPUT"\n')&&BUDGET_STEP==='##[group]Run node scripts/collection-budget.mjs','the budget step the log parser looks for');
assert(collect.includes(`      - name: ${COLLECTOR_STEP}\n`),'the collector step whose time is reported');
const budget=readFileSync('scripts/collection-budget.mjs','utf8');
assert(budget.includes("console.log('pages='+pages);")&&budget.includes("console.log('reason='+"),'budget prints pages= and reason=');
assert(budget.includes('writes allow ${byWrites} pages, reads ${byReads}'),'the reason line carries the pages each share allows (the 0-page rule reads them)');
const site=readFileSync('scripts/crawler/update-site.py','utf8');
assert(site.includes("print(json.dumps(dict(url=url,status=payload['status']")&&site.includes('print(json.dumps(dict(processed=completed,readbackId=first_written)),'),'collector prints page states and the pages it processed');
// C07 plan 2: the count after the run comes from the snapshot deploy the collect job calls.
assert(/\n  snapshot:\n    needs: collect\n(?:    .+\n)*    uses: \.\/\.github\/workflows\/deploy\.yml\n/.test(collect)&&readFileSync('.github/workflows/deploy.yml','utf8').includes('\njobs:\n  deploy:\n')&&SNAPSHOT_JOB==='snapshot / deploy','the snapshot job name the check reads');
assert(readFileSync('scripts/record-coverage.mjs','utf8').includes('console.log(JSON.stringify({recordedCoverage:{day:progress.day,records:c.records,pending:c.pending,completedDetailPages:c.completedDetailPages}}));'),'the snapshot deploy prints the stored count');

// Day: empty is yesterday in UTC; impossible dates fail.
assert.equal(checkDate('',new Date('2026-10-18T01:30:00Z')),'2026-10-17');
assert.equal(checkDate(' 2026-10-01 '),'2026-10-01');
assert.equal(checkDate('',new Date('2026-03-01T00:10:00Z')),'2026-02-28');
assert.throws(()=>checkDate('2026-02-30'));

// 90% of each free limit fails; just under passes, and so does 85% (the
// collection budget's line, user 10-19). exceededResources 1 fails.
assert.equal(FAIL,0.9);
const acc=(o={})=>({account:{requests:1000,rowsRead:1000,rowsWritten:1000,...o},exceeded:0});
assert.deepEqual(usageFailures(acc()),[]);
for(const key of ['requests','rowsRead','rowsWritten']){
 assert.deepEqual(usageFailures(acc({[key]:0.85*LIMITS[key]})),[],key+' at 85% passes');
 assert.deepEqual(usageFailures(acc({[key]:FAIL*LIMITS[key]-1})),[],key+' just under 90%');
 assert.equal(usageFailures(acc({[key]:FAIL*LIMITS[key]})).length,1,key+' at 90%');
 assert.match(usageFailures(acc({[key]:FAIL*LIMITS[key]}))[0],/90\.0%\(90% 이상\)$/);
 assert.match(usageFailures(acc({[key]:null}))[0],/기록 없음/,key+': no record cannot pass');
}
assert.deepEqual(usageFailures({...acc(),exceeded:1}),['exceededResources 1건(1102·1027)']);

// Log: the budget lines of the budget step only, page states without diagnostics, the final coverage.
const stamp=s=>s.split('\n').map((l,i)=>`2026-10-17T05:0${Math.min(i,9)}:00.000000${i%10}Z ${l}`).join('\n');
// stored: the collector's last line after C07 plan 2 (no coverage; the snapshot deploy has it).
const logText=(pages,{collected=pages,states={done:pages},allow=pages,stored=false}={})=>stamp([
 '##[group]Run python3 scripts/runner/check_collection.py','pages=999','##[endgroup]',
 BUDGET_STEP+' | tee -a "$GITHUB_OUTPUT"','\u001b[36;1mnode scripts/collection-budget.mjs | tee -a "$GITHUB_OUTPUT"\u001b[0m','env:','  CLOUDFLARE_API_TOKEN: ***','##[endgroup]',
 `pages=${pages}`,`reason=today 120 rows written, 3000 read; writes allow ${allow} pages, reads 400, cap 120`,
 '##[group]Run python3 scripts/runner/run-collection.py --mode "$MODE" --pages "${PAGES:-16}"','##[endgroup]',
 pages?JSON.stringify({mode:'gentle',target:'https://example.invalid',pages}):JSON.stringify({mode:'gentle',state:'skipped',pages:0}),
 ...Object.entries(states).flatMap(([s,n])=>Array.from({length:n},(_,i)=>JSON.stringify({url:`https://example.invalid/${s}/${i}`,status:s,reason:null,accepted:1,records:10}))),
 JSON.stringify({sourceDiagnostic:true,url:'https://example.invalid/d',status:'done'}),
 ...(pages?[JSON.stringify({processed:collected,readbackId:'x',...(stored?{}:{coverage:{pending:20947,completedDetailPages:2962}})}),'{"state": "finished"}']:[]),
 'pages=555'].join('\n'));
const snapshotLog=(pending,done)=>stamp(['##[group]Run node scripts/record-coverage.mjs "$ORIGIN" snapshot-report.json | tee -a "$GITHUB_STEP_SUMMARY"','##[endgroup]',
 JSON.stringify({recordedCoverage:{day:'2026-10-17',records:25225,pending,completedDetailPages:done}})].join('\n'));
assert.deepEqual(parseLog(logText(79)),{pages:79,reason:'today 120 rows written, 3000 read; writes allow 79 pages, reads 400, cap 120',processed:79,counts:{done:79},pending:20947,completed:2962},'pages= of the budget step, not of other steps');
assert.deepEqual(parseLog(logText(3,{states:{done:1,retry:1,failed:1}})).counts,{done:1,retry:1,failed:1});
assert.deepEqual(parseLog(logText(0)),{pages:0,reason:'today 120 rows written, 3000 read; writes allow 0 pages, reads 400, cap 120',processed:null,counts:{},pending:null,completed:null});
assert.equal(parseLog('').pages,null);assert.equal(parseLog(stamp('pages=120')).pages,null,'pages= outside the budget step does not count');
assert.equal(parseLog(logText(120).replace(/\n/g,'\r\n')).pages,120,'CRLF logs');
assert.deepEqual(parseLog(logText(79,{stored:true})),{pages:79,reason:'today 120 rows written, 3000 read; writes allow 79 pages, reads 400, cap 120',processed:79,counts:{done:79},pending:null,completed:null},'C07 plan 2: processed without coverage');
assert.deepEqual([parseLog(snapshotLog(20900,3010)).pending,parseLog(snapshotLog(20900,3010)).completed],[20900,3010],'the count the snapshot deploy stored');

// Runs: 0 pages, 26 minutes, not success, pages unreadable fail; so does a run not finished yet,
// because the next day's check looks at another day (PR #131 Codex review).
const done={status:'completed',conclusion:'success',jobSeconds:20*60,pages:120};
assert.deepEqual(runFailures(done),[]);
assert.deepEqual(runFailures({...done,jobSeconds:JOB_MINUTES*60-1}),[]);
assert.deepEqual(runFailures({...done,jobSeconds:JOB_MINUTES*60,conclusion:'cancelled'}),['결과 cancelled','collect job 26분(26분 이상)']);
// 0 pages (C05, hourly runner): normal once the day's D1 share is used, a failure while the budget line shows room or cannot be read.
const spent=(w,r)=>`today 85500 rows written, 3000 read; writes allow ${w} pages, reads ${r}, cap 120`;
assert.deepEqual(budgetLeft(spent(-3,400)),{writes:-3,reads:400});assert.equal(budgetLeft('usage unavailable: fallback to 16 pages'),null);assert.equal(budgetLeft(undefined),null);
for(const [w,r] of [[0,400],[-3,400],[30,0],[30,-12]])assert.deepEqual(runFailures({...done,pages:0,reason:spent(w,r)}),[],`writes ${w}, reads ${r}: the share is used`);
assert.deepEqual(runFailures({...done,pages:0,reason:spent(30,400)}),['0쪽 실행인데 그날 예산이 남아 있었다(writes allow 30, reads 400)']);
for(const reason of [undefined,null,'usage unavailable: fallback to 16 pages'])assert.deepEqual(runFailures({...done,pages:0,reason}),['0쪽 실행인데 reason=에서 남은 예산을 읽지 못함'],String(reason));
assert.deepEqual(runFailures({...done,pages:120,reason:spent(0,400)}),[],'pages taken: the budget line is not judged');
assert.deepEqual(dayFailures([]),[]);assert.deepEqual(dayFailures([{...done,pages:0},{...done,pages:3}]),[]);
assert.deepEqual(dayFailures([{...done,pages:0},{...done,pages:0}]),['그날 gentle 실행 2회가 모두 0쪽이다(수집 없음)']);
assert.deepEqual(runFailures({...done,pages:null}),['로그에서 pages= 줄을 읽지 못함']);
assert.deepEqual(runFailures({...done,conclusion:'failure',jobSeconds:null,pages:null}),['결과 failure','로그에서 pages= 줄을 읽지 못함']);
for(const status of ['in_progress','queued'])
 assert.deepEqual(runFailures({...done,status,conclusion:null,pages:null}),[`끝나지 않음(${status}): 다음 점검은 이 실행을 다시 보지 않는다`]);

// The whole check: fake GraphQL behind the fetch it is given, GitHub through a local server.
const CF_TOKEN='daily-cf-token',GH_TOKEN='daily-gh-token',ACCOUNT='0123456789abcdef0123456789abcdef',DB='128a3c5b-8e5f-470a-a901-d899d396cae1';
const folder=mkdtempSync(join(tmpdir(),'daily-check-'));
const config=join(folder,'cloudflare-deploy.json');
writeFileSync(config,JSON.stringify({workerName:'yukemuri',databaseId:DB}));
const dayData=({rowsWritten=73_066,rowsRead=2_848_742,requests=1_887,exceeded=0}={})=>({total:[{sum:{requests,errors:0,subrequests:0},quantiles:{cpuTimeP50:5780,cpuTimeP99:56990},dimensions:{scriptName:'yukemuri'}}],
 byStatus:[{sum:{requests:requests-exceeded},dimensions:{status:'success'}},...(exceeded?[{sum:{requests:exceeded},dimensions:{status:'exceededResources'}}]:[])],
 d1:[{sum:{rowsRead,rowsWritten,readQueries:1,writeQueries:1},dimensions:{date:'2026-10-17',databaseId:DB}}],
 accountWorkers:[{sum:{requests}}],accountD1:[{sum:{rowsRead,rowsWritten},dimensions:{date:'2026-10-17'}}]});
let cf={status:200,body:{data:{viewer:{accounts:[dayData()]}},errors:null}},cfCalls=[];
let runs=[],jobs={},logs={},ghCalls=[],ghFail=null;
const server=createServer((req,res)=>{
 ghCalls.push({url:req.url,auth:req.headers.authorization});
 const path=req.url.split('?')[0];
 if(ghFail&&path.includes(ghFail.path)){if(ghFail.status==='hang')return;res.statusCode=ghFail.status;res.end('{}');return}
 let m;
 if(/\/actions\/workflows\/collect\.yml\/runs$/.test(path)){res.setHeader('content-type','application/json');res.end(JSON.stringify({total_count:runs.length,workflow_runs:runs}));return}
 if((m=/\/actions\/runs\/(\d+)\/jobs$/.exec(path))){res.setHeader('content-type','application/json');res.end(JSON.stringify({jobs:jobs[m[1]]??[]}));return}
 if((m=/\/actions\/jobs\/(\d+)\/logs$/.exec(path))){res.statusCode=302;res.setHeader('location',`/blob/${m[1]}.txt`);res.end();return}
 if((m=/^\/blob\/(\d+)\.txt$/.exec(path))&&logs[m[1]]!==undefined){res.setHeader('content-type','text/plain');res.end(logs[m[1]]);return}
 res.statusCode=404;res.end('{}');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const api=`http://127.0.0.1:${server.address().port}`;
const fetch=async(url,init)=>{
 if(url!==ENDPOINT)return globalThis.fetch(url,init);
 cfCalls.push({auth:init.headers.Authorization,variables:JSON.parse(init.body).variables});
 if(init.headers.Authorization!=='Bearer '+CF_TOKEN)return new Response(JSON.stringify({data:null,errors:[{message:'Authentication error'}]}),{status:403});
 return new Response(JSON.stringify(cf.body),{status:cf.status});
};
const env={CLOUDFLARE_API_TOKEN:CF_TOKEN,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,GH_TOKEN,GITHUB_REPOSITORY:'jihune/yukemuri',GITHUB_API_URL:api,CHECK_DATE:'2026-10-17'};
const now=new Date('2026-10-18T01:30:00Z');
const check=(extra={})=>dailyCheck({env:{...env,...extra},fetch,now,config});
let id=0;
function addRun(pages,{created='2026-10-17T05:05:17Z',title=GENTLE_TITLE,conclusion='success',status='completed',jobMinutes=18,stepMinutes=16,states,log=true,allow=pages,stored=false,snapshot='success'}={}){
 const run=++id,job=1000+run;
 runs.push({id:run,display_title:title,created_at:created,run_started_at:created,status,conclusion});
 const at=m=>new Date(Date.parse(created)+m*60000).toISOString().replace('.000','');
 jobs[run]=[{id:job,name:COLLECT_JOB,status,conclusion,started_at:at(0),completed_at:status==='completed'?at(jobMinutes):null,
  steps:[{name:'Size the run within the free D1 limits',started_at:at(0),completed_at:at(0)},{name:COLLECTOR_STEP,started_at:at(0),completed_at:at(stepMinutes)}]},{id:job+500,name:SNAPSHOT_JOB,status,conclusion:snapshot}];
 if(log)logs[job]=logText(pages,{states,allow,stored});
 if(log&&stored&&snapshot!=='skipped')logs[job+500]=snapshotLog(20900,3010+run);
 return run;
}
try{
 // A normal day (the 10-16 values of H01 step 7 day 4): passes, with the usage table and one row per gentle run.
 addRun(120,{created:'2026-10-17T21:47:22Z',states:{done:118,retry:2}});addRun(120);
 addRun(120,{title:'Yukemuri collection (check-access)'});
 addRun(120,{created:'2026-10-16T23:59:22Z'}); // the day before, returned by a lenient filter
 let result=await check();
 assert.deepEqual(result.failures,[],result.lines.join('\n'));
 assert.equal(result.date,'2026-10-17');assert.match(result.lines[0],/^# 매일 점검\(O03\) — 2026-10-17\(UTC\)$/);assert.match(result.lines.join('\n'),/\*\*통과\*\*/);
 assert.deepEqual(cfCalls.at(-1).variables.date,'2026-10-17');
 const text=result.lines.join('\n');
 assert.match(text,/\| 2026-10-17 \| 1,887 \(1\.9%\) \|/,'the usage table of cloudflare-usage.mjs');
 const rows=text.split('\n').filter(l=>/^\| \d+ \| \d\d:\d\dZ \|/.test(l));
 assert.equal(rows.length,2,'gentle runs of that day only');
 assert.match(rows[0],/^\| 2 \| 05:05Z \| success \| 120 \| today 120 rows written.*\| 16분 0초 \| 18분 0초 \| 120 \| done 120 \| 20,947·2,962 \| 통과 \|$/,'oldest first');
 assert.match(rows[1],/\| done 118, retry 2 \|/);
 assert.match(ghCalls.find(c=>c.url.includes('/workflows/'))?.url??'',/\/repos\/jihune\/yukemuri\/actions\/workflows\/collect\.yml\/runs\?created=2026-10-17T00%3A00%3A00Z\.\.2026-10-17T23%3A59%3A59Z&per_page=100$/);
 assert(ghCalls.filter(c=>!c.url.startsWith('/blob/')).every(c=>c.auth==='Bearer '+GH_TOKEN),'workflow token on API calls');
 assert(!text.includes(CF_TOKEN)&&!text.includes(GH_TOKEN)&&!text.includes('example.invalid'),'no token and no source address in the report');
 // C07 plan 2: a collector line without a count reads it from the run's snapshot deploy; a skipped one has no log to read.
 const stored=addRun(120,{created:'2026-10-17T08:00:00Z',stored:true}),unstored=addRun(120,{created:'2026-10-17T09:00:00Z',stored:true,snapshot:'skipped'});
 result=await check();assert.deepEqual(result.failures,[],result.lines.join('\n'));
 assert.match(result.lines.join('\n'),new RegExp(`^\\| ${stored} \\| 08:00Z \\| success \\| 120 \\|.*\\| 120 \\| done 120 \\| 20,900·${(3010+stored).toLocaleString('en-US')} \\| 통과 \\|$`,'m'));
 assert.match(result.lines.join('\n'),new RegExp(`^\\| ${unstored} \\| 09:00Z \\| success \\| 120 \\|.*\\| 120 \\| done 120 \\| -·- \\| 통과 \\|$`,'m'));
 assert(!ghCalls.some(c=>c.url.includes(`/jobs/${1500+unstored}/logs`)),'no log read for a skipped snapshot job');
 runs=runs.filter(r=>![stored,unstored].includes(r.id));

 // Each control fails the same normal day.
 for(const [control,pattern] of [['over-90',/계정 D1 쓰기 90,000행 = 무료 한도의 90\.0%/],['exceeded',/exceededResources 1건/],['zero-pages',/gentle run 2: 0쪽 실행인데 그날 예산이 남아 있었다\(writes allow 120, reads 400\)/],['no-permission',/Cloudflare 사용량을 읽지 못함\(0으로 보지 않는다\): API 토큰에 Account > Account Analytics > Read 권한이 없다/]]){
  result=await check({CHECK_CONTROL:control});
  assert.equal(result.failures.length,1,control+': '+result.failures.join(' / '));assert.match(result.failures[0],pattern,control);
  assert.match(result.lines.join('\n'),new RegExp(`> 대조 입력 \`${control}\``),control+' is labelled');
 }
 assert.equal(cfCalls.at(-1).auth,'Bearer '+CONTROL_TOKEN,'no-permission sends the invalid token');
 await assert.rejects(check({CHECK_CONTROL:'over-85'}),CheckError);

 // Real failures on the usage side.
 for(const [data,pattern] of [[{rowsWritten:92_000},/D1 쓰기 92,000행 = 무료 한도의 92\.0%/],[{rowsRead:4_500_000},/D1 읽기 4,500,000행/],[{requests:90_000},/Worker 요청 90,000건/],[{exceeded:2},/exceededResources 2건/]]){
  cf={status:200,body:{data:{viewer:{accounts:[dayData(data)]}},errors:null}};
  result=await check();
  assert.equal(result.failures.length,1);assert.match(result.failures[0],pattern);
 }
 cf={status:200,body:{data:{viewer:{accounts:[{total:[],byStatus:[],d1:[],accountWorkers:[],accountD1:[]}]}},errors:null}};
 assert.equal((await check()).failures.filter(f=>/기록 없음/.test(f)).length,3,'a day without records cannot pass');
 for(const body of [{data:{viewer:{accounts:[]}},errors:null},{data:null,errors:[{message:'not authorized for that account'}]}]){
  cf={status:200,body};
  result=await check();
  assert.equal(result.failures.length,1);assert.match(result.failures[0],/읽지 못함\(0으로 보지 않는다\)/);
  assert.match(result.lines.join('\n'),/## gentle 수집/,'the collection table stays when usage cannot be read');
 }
 assert.match((await check({CLOUDFLARE_API_TOKEN:''})).failures[0],/CLOUDFLARE_API_TOKEN is missing/);
 cf={status:200,body:{data:{viewer:{accounts:[dayData()]}},errors:null}};
 const networkDown=async(url,init)=>{if(url===ENDPOINT)throw new TypeError('fetch failed');return fetch(url,init)};
 assert.match((await dailyCheck({env,fetch:networkDown,now,config})).failures[0],/Usage query failed \(TypeError\)/);

 // Real failures on the collection side.
 const zero=addRun(0,{created:'2026-10-17T19:35:00Z',jobMinutes:1,stepMinutes:0}); // the share used: normal
 const roomy=addRun(0,{created:'2026-10-17T20:10:00Z',jobMinutes:1,stepMinutes:0,allow:30}); // room left: a failure
 const slow=addRun(120,{created:'2026-10-17T12:30:00Z',jobMinutes:26,stepMinutes:25,conclusion:'cancelled'});
 const failed=addRun(120,{created:'2026-10-17T15:00:00Z',conclusion:'failure',log:false});
 jobs[failed]=[]; // failed before the collect job had a log
 const running=addRun(120,{created:'2026-10-17T23:58:00Z',status:'in_progress',conclusion:null,log:false});
 result=await check();
 assert.deepEqual(result.failures,[`gentle run ${slow}: 결과 cancelled`,`gentle run ${slow}: collect job 26분(26분 이상)`,`gentle run ${failed}: 결과 failure`,`gentle run ${failed}: 로그에서 pages= 줄을 읽지 못함`,`gentle run ${roomy}: 0쪽 실행인데 그날 예산이 남아 있었다(writes allow 30, reads 400)`,`gentle run ${running}: 끝나지 않음(in_progress): 다음 점검은 이 실행을 다시 보지 않는다`]);
 assert.match(result.lines.join('\n'),new RegExp(`\\| ${running} \\| 23:58Z \\| in_progress \\|.*\\| \\*\\*실패\\*\\* \\|$`,'m'));
 assert.match(result.lines.join('\n'),new RegExp(`\\| ${zero} \\| 19:35Z \\| success \\| 0 \\|.*\\| 통과\\(예산 소진\\) \\|$`,'m'),'a 0-page run after the share is used passes');
 runs=runs.filter(r=>![roomy,slow,failed,running].includes(r.id));
 result=await check();assert.deepEqual(result.failures,[]);
 assert.ok(result.lines.includes('**통과**: 90% 이상인 한도와 exceededResources가 없다. gentle 실행은 실패 조건(예산이 남았는데 0쪽, 그날 모두 0쪽, 26분 이상, 성공하지 않음, 끝나지 않음)에 들지 않는다.'),'the pass line does not deny a budget-spent 0-page run');
 runs=runs.filter(r=>r.id!==zero);
 // GitHub errors and missing settings fail; the usage table stays.
 for(const [fail,pattern] of [[{path:'/workflows/',status:403},/GitHub API 403 \(\/repos\/jihune\/yukemuri\/actions\/workflows\/collect\.yml\/runs\)/],[{path:'/logs',status:410},/GitHub API 410/],[{path:'/blob/',status:404},/GitHub API 404/]]){
  ghFail=fail;result=await check();ghFail=null;
  assert.equal(result.failures.length,1);assert.match(result.failures[0],pattern);
  assert.match(result.lines.join('\n'),/## Cloudflare 사용량\(UTC 날짜별\)/);
 }
 assert.match((await check({GH_TOKEN:''})).failures[0],/GITHUB_REPOSITORY and GH_TOKEN are required/);
 // A request that never answers is cut off, and the other half still reports (PR #131 Codex review).
 assert.equal(TIMEOUT_MS,30_000);
 // within(): without the cut-off the check would wait forever; fail in 5 s instead of hanging CI.
 const within=(promise,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' was not cut off')),5000).unref())]);
 const hang=async(url,init)=>url===ENDPOINT?new Promise((_,reject)=>init.signal?.addEventListener('abort',()=>reject(init.signal.reason))):fetch(url,init);
 result=await within(dailyCheck({env,fetch:hang,now,config,timeout:300}),'Cloudflare hang');
 assert.deepEqual(result.failures,['Cloudflare 사용량을 읽지 못함(0으로 보지 않는다): Usage query failed (DOMException)']);
 assert.match(result.lines.join('\n'),/\| 2 \| 05:05Z \| success \|/,'gentle runs still reported');
 ghFail={path:'/logs',status:'hang'};
 result=await within(dailyCheck({env,fetch,now,config,timeout:300}),'GitHub hang');ghFail=null;
 assert.deepEqual(result.failures,['gentle 수집을 읽지 못함: GitHub query failed (DOMException)']);
 assert.match(result.lines.join('\n'),/## Cloudflare 사용량\(UTC 날짜별\)/,'usage still reported');
 // No gentle run that day: listed as 0 runs, not a failure here (collect-watch.yml alerts); zero-pages cannot apply.
 const saved=runs;runs=[];
 result=await check();assert.deepEqual(result.failures,[]);assert.match(result.lines.join('\n'),/gentle 실행 0회/);
 assert.match((await check({CHECK_CONTROL:'zero-pages'})).failures[0],/zero-pages를 적용하지 못함/);
 // Every run of the day took 0 pages: nothing was collected, even with each share used.
 addRun(0,{created:'2026-10-17T06:00:00Z',jobMinutes:1,stepMinutes:0});addRun(0,{created:'2026-10-17T07:00:00Z',jobMinutes:1,stepMinutes:0});
 result=await check();assert.deepEqual(result.failures,['그날 gentle 실행 2회가 모두 0쪽이다(수집 없음)']);
 runs=saved;

 // The script: exit code, summary file and ::error:: lines (usage unreadable without a token, so no network).
 const summary=join(folder,'summary.md');
 const exec=extra=>new Promise(done=>{const child=spawn(process.execPath,[resolve('scripts/daily-check.mjs')],{cwd:resolve('.'),env:{PATH:process.env.PATH,GITHUB_STEP_SUMMARY:summary,...env,CLOUDFLARE_API_TOKEN:'',...extra}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>done({code,out}))});
 let ran=await exec({});
 assert.equal(ran.code,1,ran.out);assert.match(ran.out,/::error::Cloudflare 사용량을 읽지 못함\(0으로 보지 않는다\): CLOUDFLARE_API_TOKEN is missing/);
 assert.match(readFileSync(summary,'utf8'),/^# 매일 점검\(O03\) — 2026-10-17\(UTC\)\n\n\*\*실패 1건\*\*/);
 assert.match(readFileSync(summary,'utf8'),/\| 통과 \|/,'the gentle table is in the summary');
 ran=await exec({CHECK_CONTROL:'nope'});
 assert.equal(ran.code,1);assert.match(ran.out,/::error::control must be one of none, over-90, exceeded, zero-pages, no-permission/);
 assert(!ran.out.includes(GH_TOKEN),'token never printed');
}finally{server.closeAllConnections();server.close();rmSync(folder,{recursive:true,force:true})}
console.log(`Daily check passed: usage.yml check step (no cron, actions: read, 5 controls), the collect.yml job, budget step and collector lines it reads, 90% of each free limit (just under and 85% pass), exceededResources, days without records, unreadable usage (permission, network, missing token), gentle runs from a local GitHub stand-in (0 pages with budget left or an unreadable budget line, a day of only 0-page runs, 0 pages after the share is used passing, ${JOB_MINUTES} minutes, not success, no pages= line, not finished, other days and check-access left out), GitHub errors, requests that hang cut off without stopping the other half, and the four controls each failing a normal day.`);
