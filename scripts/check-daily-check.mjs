// daily-check.mjs and usage.yml (check: true) without an account: the 85%
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
import {FAIL,JOB_MINUTES,COLLECT_JOB,BUDGET_STEP,COLLECTOR_STEP,CONTROLS,CONTROL_TOKEN,checkDate,usageFailures,parseLog,runFailures,dailyCheck,CheckError} from './daily-check.mjs';

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
const site=readFileSync('scripts/crawler/update-site.py','utf8');
assert(site.includes("print(json.dumps(dict(url=url,status=payload['status']")&&site.includes('print(json.dumps(dict(processed=completed,readbackId=first_written,coverage=final))'),'collector prints page states and the final coverage');

// Day: empty is yesterday in UTC; impossible dates fail.
assert.equal(checkDate('',new Date('2026-10-18T01:30:00Z')),'2026-10-17');
assert.equal(checkDate(' 2026-10-01 '),'2026-10-01');
assert.equal(checkDate('',new Date('2026-03-01T00:10:00Z')),'2026-02-28');
assert.throws(()=>checkDate('2026-02-30'));

// 85% of each free limit fails; just under passes. exceededResources 1 fails.
assert.equal(FAIL,0.85);
const acc=(o={})=>({account:{requests:1000,rowsRead:1000,rowsWritten:1000,...o},exceeded:0});
assert.deepEqual(usageFailures(acc()),[]);
for(const key of ['requests','rowsRead','rowsWritten']){
 assert.deepEqual(usageFailures(acc({[key]:FAIL*LIMITS[key]-1})),[],key+' just under 85%');
 assert.equal(usageFailures(acc({[key]:FAIL*LIMITS[key]})).length,1,key+' at 85%');
 assert.match(usageFailures(acc({[key]:FAIL*LIMITS[key]}))[0],/85\.0%\(85% 이상\)$/);
 assert.match(usageFailures(acc({[key]:null}))[0],/기록 없음/,key+': no record cannot pass');
}
assert.deepEqual(usageFailures({...acc(),exceeded:1}),['exceededResources 1건(1102·1027)']);

// Log: the budget lines of the budget step only, page states without diagnostics, the final coverage.
const stamp=s=>s.split('\n').map((l,i)=>`2026-10-17T05:0${Math.min(i,9)}:00.000000${i%10}Z ${l}`).join('\n');
const logText=(pages,{collected=pages,states={done:pages}}={})=>stamp([
 '##[group]Run python3 scripts/runner/check_collection.py','pages=999','##[endgroup]',
 BUDGET_STEP+' | tee -a "$GITHUB_OUTPUT"','\u001b[36;1mnode scripts/collection-budget.mjs | tee -a "$GITHUB_OUTPUT"\u001b[0m','env:','  CLOUDFLARE_API_TOKEN: ***','##[endgroup]',
 `pages=${pages}`,`reason=today 120 rows written, 3000 read; writes allow ${pages} pages, reads 400, cap 120`,
 '##[group]Run python3 scripts/runner/run-collection.py --mode "$MODE" --pages "${PAGES:-16}"','##[endgroup]',
 pages?JSON.stringify({mode:'gentle',target:'https://example.invalid',pages}):JSON.stringify({mode:'gentle',state:'skipped',pages:0}),
 ...Object.entries(states).flatMap(([s,n])=>Array.from({length:n},(_,i)=>JSON.stringify({url:`https://example.invalid/${s}/${i}`,status:s,reason:null,accepted:1,records:10}))),
 JSON.stringify({sourceDiagnostic:true,url:'https://example.invalid/d',status:'done'}),
 ...(pages?[JSON.stringify({processed:collected,readbackId:'x',coverage:{pending:20947,completedDetailPages:2962}}),'{"state": "finished"}']:[]),
 'pages=555'].join('\n'));
assert.deepEqual(parseLog(logText(79)),{pages:79,reason:'today 120 rows written, 3000 read; writes allow 79 pages, reads 400, cap 120',processed:79,counts:{done:79},pending:20947,completed:2962},'pages= of the budget step, not of other steps');
assert.deepEqual(parseLog(logText(3,{states:{done:1,retry:1,failed:1}})).counts,{done:1,retry:1,failed:1});
assert.deepEqual(parseLog(logText(0)),{pages:0,reason:'today 120 rows written, 3000 read; writes allow 0 pages, reads 400, cap 120',processed:null,counts:{},pending:null,completed:null});
assert.equal(parseLog('').pages,null);assert.equal(parseLog(stamp('pages=120')).pages,null,'pages= outside the budget step does not count');
assert.equal(parseLog(logText(120).replace(/\n/g,'\r\n')).pages,120,'CRLF logs');

// Runs: 0 pages, 26 minutes, not success, pages unreadable fail; in progress is not judged.
const done={status:'completed',conclusion:'success',jobSeconds:20*60,pages:120};
assert.deepEqual(runFailures(done),[]);
assert.deepEqual(runFailures({...done,jobSeconds:JOB_MINUTES*60-1}),[]);
assert.deepEqual(runFailures({...done,jobSeconds:JOB_MINUTES*60,conclusion:'cancelled'}),['결과 cancelled','collect job 26분(26분 이상)']);
assert.deepEqual(runFailures({...done,pages:0}),['0쪽 실행']);
assert.deepEqual(runFailures({...done,pages:null}),['로그에서 pages= 줄을 읽지 못함']);
assert.deepEqual(runFailures({...done,conclusion:'failure',jobSeconds:null,pages:null}),['결과 failure','로그에서 pages= 줄을 읽지 못함']);
assert.deepEqual(runFailures({...done,status:'in_progress',conclusion:null,pages:null}),[]);

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
 if(ghFail&&path.includes(ghFail.path)){res.statusCode=ghFail.status;res.end('{}');return}
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
function addRun(pages,{created='2026-10-17T05:05:17Z',title=GENTLE_TITLE,conclusion='success',status='completed',jobMinutes=18,stepMinutes=16,states,log=true}={}){
 const run=++id,job=1000+run;
 runs.push({id:run,display_title:title,created_at:created,run_started_at:created,status,conclusion});
 const at=m=>new Date(Date.parse(created)+m*60000).toISOString().replace('.000','');
 jobs[run]=[{id:job,name:COLLECT_JOB,status,conclusion,started_at:at(0),completed_at:status==='completed'?at(jobMinutes):null,
  steps:[{name:'Size the run within the free D1 limits',started_at:at(0),completed_at:at(0)},{name:COLLECTOR_STEP,started_at:at(0),completed_at:at(stepMinutes)}]},{id:job+500,name:'snapshot / deploy',status,conclusion}];
 if(log)logs[job]=logText(pages,{states});
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

 // Each control fails the same normal day.
 for(const [control,pattern] of [['over-85',/계정 D1 쓰기 85,000행 = 무료 한도의 85\.0%/],['exceeded',/exceededResources 1건/],['zero-pages',/gentle run 2: 0쪽 실행/],['no-permission',/Cloudflare 사용량을 읽지 못함\(0으로 보지 않는다\): API 토큰에 Account > Account Analytics > Read 권한이 없다/]]){
  result=await check({CHECK_CONTROL:control});
  assert.equal(result.failures.length,1,control+': '+result.failures.join(' / '));assert.match(result.failures[0],pattern,control);
  assert.match(result.lines.join('\n'),new RegExp(`> 대조 입력 \`${control}\``),control+' is labelled');
 }
 assert.equal(cfCalls.at(-1).auth,'Bearer '+CONTROL_TOKEN,'no-permission sends the invalid token');
 await assert.rejects(check({CHECK_CONTROL:'over-90'}),CheckError);

 // Real failures on the usage side.
 for(const [data,pattern] of [[{rowsWritten:87_000},/D1 쓰기 87,000행 = 무료 한도의 87\.0%/],[{rowsRead:4_250_000},/D1 읽기 4,250,000행/],[{requests:85_000},/Worker 요청 85,000건/],[{exceeded:2},/exceededResources 2건/]]){
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
 const zero=addRun(0,{created:'2026-10-17T19:35:00Z',jobMinutes:1,stepMinutes:0});
 const slow=addRun(120,{created:'2026-10-17T12:30:00Z',jobMinutes:26,stepMinutes:25,conclusion:'cancelled'});
 const failed=addRun(120,{created:'2026-10-17T15:00:00Z',conclusion:'failure',log:false});
 jobs[failed]=[]; // failed before the collect job had a log
 const running=addRun(120,{created:'2026-10-17T23:58:00Z',status:'in_progress',conclusion:null,log:false});
 result=await check();
 assert.deepEqual(result.failures,[`gentle run ${slow}: 결과 cancelled`,`gentle run ${slow}: collect job 26분(26분 이상)`,`gentle run ${failed}: 결과 failure`,`gentle run ${failed}: 로그에서 pages= 줄을 읽지 못함`,`gentle run ${zero}: 0쪽 실행`]);
 assert.match(result.lines.join('\n'),new RegExp(`\\| ${running} \\| 23:58Z \\| in_progress \\|.*\\| 진행 중\\(판정 안 함\\) \\|$`,'m'));
 runs=runs.filter(r=>![zero,slow,failed,running].includes(r.id));
 // GitHub errors and missing settings fail; the usage table stays.
 for(const [fail,pattern] of [[{path:'/workflows/',status:403},/GitHub API 403 \(\/repos\/jihune\/yukemuri\/actions\/workflows\/collect\.yml\/runs\)/],[{path:'/logs',status:410},/GitHub API 410/],[{path:'/blob/',status:404},/GitHub API 404/]]){
  ghFail=fail;result=await check();ghFail=null;
  assert.equal(result.failures.length,1);assert.match(result.failures[0],pattern);
  assert.match(result.lines.join('\n'),/## Cloudflare 사용량\(UTC 날짜별\)/);
 }
 assert.match((await check({GH_TOKEN:''})).failures[0],/GITHUB_REPOSITORY and GH_TOKEN are required/);
 // No gentle run that day: listed as 0 runs, not a failure here (collect-watch.yml alerts); zero-pages cannot apply.
 const saved=runs;runs=[];
 result=await check();assert.deepEqual(result.failures,[]);assert.match(result.lines.join('\n'),/gentle 실행 0회/);
 assert.match((await check({CHECK_CONTROL:'zero-pages'})).failures[0],/zero-pages를 적용하지 못함/);
 runs=saved;

 // The script: exit code, summary file and ::error:: lines (usage unreadable without a token, so no network).
 const summary=join(folder,'summary.md');
 const exec=extra=>new Promise(done=>{const child=spawn(process.execPath,[resolve('scripts/daily-check.mjs')],{cwd:resolve('.'),env:{PATH:process.env.PATH,GITHUB_STEP_SUMMARY:summary,...env,CLOUDFLARE_API_TOKEN:'',...extra}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>done({code,out}))});
 let ran=await exec({});
 assert.equal(ran.code,1,ran.out);assert.match(ran.out,/::error::Cloudflare 사용량을 읽지 못함\(0으로 보지 않는다\): CLOUDFLARE_API_TOKEN is missing/);
 assert.match(readFileSync(summary,'utf8'),/^# 매일 점검\(O03\) — 2026-10-17\(UTC\)\n\n\*\*실패 1건\*\*/);
 assert.match(readFileSync(summary,'utf8'),/\| 통과 \|/,'the gentle table is in the summary');
 ran=await exec({CHECK_CONTROL:'nope'});
 assert.equal(ran.code,1);assert.match(ran.out,/::error::control must be one of none, over-85, exceeded, zero-pages, no-permission/);
 assert(!ran.out.includes(GH_TOKEN),'token never printed');
}finally{server.close();rmSync(folder,{recursive:true,force:true})}
console.log(`Daily check passed: usage.yml check step (no cron, actions: read, 5 controls), the collect.yml job, budget step and collector lines it reads, 85% of each free limit (just under passes), exceededResources, days without records, unreadable usage (permission, network, missing token), gentle runs from a local GitHub stand-in (0 pages, ${JOB_MINUTES} minutes, not success, no pages= line, in progress not judged, other days and check-access left out), GitHub errors, and the four controls each failing a normal day.`);
