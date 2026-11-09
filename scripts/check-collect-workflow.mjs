// H01 step 6 collection workflows without an account: collect.yml (dispatch
// only, catalogue lock, snapshot deploy at the end), collect-watch.yml
// (12-hour freshness) and collect-spare.yml (O02: the hourly dispatch of
// collect.yml, with controls), plus the freshness rule against fixture runs and
// a local stand-in for the GitHub API.
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {freshness,GENTLE_TITLE,LIMIT_HOURS,WORKFLOW} from './check-collection-freshness.mjs';

const read=file=>readFileSync('.github/workflows/'+file,'utf8');
const block=(text,key)=>text.match(new RegExp(`^${key}:\\n((?:[ #].*\\n)+)`,'m'))?.[1]??'';
const collect=read('collect.yml');
assert.equal(WORKFLOW,'collect.yml');

// Dispatch only: the runner repository keeps the cron (hosting review, 2차 검토).
assert.equal(block(collect,'on'),[
 '  workflow_dispatch:','    inputs:','      mode:','        description: Operation','        type: choice','        required: true',
 '        default: check-access','        options:','          - check-access','          - gentle',''].join('\n'),'collect.yml: workflow_dispatch with mode check-access|gentle only, no schedule');
assert.match(collect,/^run-name: Yukemuri collection \(\$\{\{ inputs\.mode \}\}\)$/m,'run-name carries the mode the freshness checks filter on');
assert.equal(GENTLE_TITLE,'Yukemuri collection (gentle)');
// One lock at the top for the whole run (collection and the called deploy).
assert.match(collect,/^concurrency:\n  group: yukemuri-catalog-updates\n  cancel-in-progress: false\n  queue: max\n/m,'collection holds the catalogue group without cancelling a running or waiting run');
// Every run that enters these groups keeps the others waiting (PR #48 Codex review):
// with the default queue a newer waiting run cancels the older one.
for(const file of readdirSync('.github/workflows').filter(f=>/\.ya?ml$/.test(f))){
 const text=read(file);
 for(const m of text.matchAll(/^( *)concurrency:\n((?:\1  .*\n)+)/gm)){
  if(!/group: .*(?:yukemuri-catalog-updates|yukemuri-snapshot-after-collection|cloudflare-account)/.test(m[2]))continue;
  assert.match(m[2],/^ *queue: max$/m,file+': a catalogue or account group without queue: max');
  assert.match(m[2],/^ *cancel-in-progress: false$/m,file+': queue: max needs cancel-in-progress false');
 }
}
assert.equal((collect.match(/^\s*concurrency:/gm)??[]).length,1,'no job-level lock: the account lock is taken only inside the called deploy');
assert(!/cloudflare-account/.test(collect),'collection never takes the account lock first');
const deploy=read('deploy.yml');
const called=deploy.match(/^  group: \$\{\{ inputs\.after_collection && '([\w-]+)' \|\| '([\w-]+)' \}\}$/m);
assert(called&&called[1]!=='yukemuri-catalog-updates'&&called[2]==='yukemuri-catalog-updates','the called deploy uses its own top group (the catalogue group would wait on its caller)');
// Budget and pacing come from the launcher (check_collection.py compares them with the runner).
const job=collect.slice(collect.indexOf('  collect:\n'),collect.indexOf('  snapshot:\n'));
// C03 (2026-10-13): up to 120 pages a run (run-collection.py allows 1,380 s for them).
assert.match(job,/^    runs-on: ubuntu-24\.04\n(?:    #.*\n)*    timeout-minutes: 26\n    outputs:\n      pages: \$\{\{ steps\.budget\.outputs\.pages \}\}\n      collected_on: \$\{\{ steps\.collected\.outputs\.day \}\}\n/m,'26-minute job for a 120-page run; the page budget and the day it finished are job outputs');
assert.match(job,/run: python3 scripts\/runner\/check_collection\.py\n/);
assert.match(job,/env:\n {10}YUKEMURI_CRAWL_ACCESS_KEY: \$\{\{ secrets\.YUKEMURI_CRAWL_ACCESS_KEY \}\}\n {10}MODE: \$\{\{ inputs\.mode \}\}\n {10}PAGES: \$\{\{ steps\.budget\.outputs\.pages \}\}\n {8}run: python3 scripts\/runner\/run-collection\.py --mode "\$MODE" --pages "\$\{PAGES:-16\}"\n/,'crawl key and the page budget through env to the launcher (16 when there is no budget)');
// The budget step reads today's usage with the Cloudflare token (Account Analytics, as usage.yml); the
// crawl key and the Cloudflare token never share a step.
const steps=job.split(/\n(?=      - )/);
const budgetStep=steps.find(t=>/id: budget\n/.test(t))??'';
const collectorStep=steps.find(t=>/run-collection\.py --mode/.test(t))??'';
// C07 plan 2: the UTC day the collector finished, taken right after it, for the count the snapshot deploy stores.
assert((steps[steps.indexOf(collectorStep)+1]??'').startsWith(['      - name: Note the day the collection finished','        id: collected',"        if: inputs.mode == 'gentle'",'        run: echo "day=$(date -u +%F)" >> "$GITHUB_OUTPUT"\n'].join('\n')),'the collection day follows the collector');
assert.match(budgetStep,/name: Size the run within the free D1 limits\n {8}id: budget\n {8}if: inputs\.mode == 'gentle'\n {8}env:\n {10}CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}\n {10}CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}\n {10}OVERLAP: \$\{\{ steps\.overlap\.outputs\.overlap \}\}\n {8}run: node scripts\/collection-budget\.mjs \| tee -a "\$GITHUB_OUTPUT"\n?$/,'gentle runs size themselves with collection-budget.mjs, 0 pages when the run repeats another (C06)');
// C06 overlap step (collection-chain.mjs --overlap, check-collection-chain.mjs): the workflow token only, before the budget.
const overlapStep=steps.find(t=>/id: overlap\n/.test(t))??'';
assert.match(overlapStep,/name: Check for a gentle run in flight\n {8}id: overlap\n {8}if: inputs\.mode == 'gentle'\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/collection-chain\.mjs --overlap \| tee -a "\$GITHUB_OUTPUT"(?:\n {6}#.*)*\n?$/,'a gentle run first checks for another in flight');
assert(steps.indexOf(overlapStep)+1===steps.indexOf(budgetStep),'the overlap check comes just before the budget');
assert(!/YUKEMURI_CRAWL_ACCESS_KEY/.test(budgetStep)&&!/CLOUDFLARE_/.test(collectorStep),'the crawl key and the Cloudflare token stay in separate steps');
assert.deepEqual([...new Set(collect.match(/secrets\.\w+/g)??[])].sort(),['secrets.CLOUDFLARE_ACCOUNT_ID','secrets.CLOUDFLARE_API_TOKEN','secrets.YUKEMURI_CRAWL_ACCESS_KEY'],'no other secret is named');
assert(collect.indexOf('check_collection.py')<collect.indexOf('collection-budget.mjs')&&collect.indexOf('collection-budget.mjs')<collect.indexOf('run-collection.py --mode'),'offline checks, then the budget, then the key is used');
// The snapshot job, then the C06 chain job (check-collection-chain.mjs) as the last one.
assert.equal(collect.slice(collect.indexOf('  snapshot:\n'),collect.indexOf('  # C06: ')),[
 '  snapshot:','    needs: collect',"    if: inputs.mode == 'gentle' && needs.collect.outputs.pages != '0'",'    uses: ./.github/workflows/deploy.yml','    with:','      after_collection: true','      collected_on: ${{ needs.collect.outputs.collected_on }}','    secrets: inherit',''].join('\n'),
 'a successful gentle run that collected refreshes the snapshot through deploy.yml at the same commit');
assert.match(collect,/^permissions:\n  contents: read\n  actions: read\n(?! )/m,'read-only token; actions: read for the called deploy');

// Watch: every 6 hours, read-only Actions access, the freshness script.
const watch=read('collect-watch.yml');
assert.equal(block(watch,'on'),"  schedule:\n    - cron: '41 */6 * * *'\n  workflow_dispatch:\n",'watch runs every 6 hours');
assert.match(watch,/^permissions:\n  contents: read\n  actions: read\n(?! )/m,'watch token reads Actions runs only');
assert(!/secrets\./.test(watch),'watch uses the workflow token only');
assert.match(watch,/GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/check-collection-freshness\.mjs\n/);
// O02 (user 2026-11-03): the hourly spare that restarts a broken chain is this public repository's
// schedule, not the private runner's. It starts nothing but collect.yml in mode gentle, with the
// workflow token, so the run it makes goes through collect.yml's overlap and budget steps (C06, C03;
// check-collection-chain.mjs): it adds no second collector. Every part is checked, and a copy without
// it must fail for that part (controls below, in the form of check-collection-chain.mjs).
const spare=read('collect-spare.yml');
const SPARE_STEP=['      - env:','          GH_TOKEN: ${{ github.token }}','        run: gh workflow run collect.yml --repo "$GITHUB_REPOSITORY" --ref main -f mode=gentle',''].join('\n');
const SPARE_JOB=['jobs:','  dispatch:','    runs-on: ubuntu-24.04','    timeout-minutes: 3','    permissions:','      contents: read','      actions: write','    steps:',''].join('\n')+SPARE_STEP;
function spareProblems(text){
 const out=[],body=text.replace(/^[ \t]*#.*\n/gm,''),job=body.slice(body.indexOf('\njobs:\n')+1);
 if(block(body,'on')!=="  schedule:\n    - cron: '37 * * * *'\n  workflow_dispatch:\n")out.push('on: is not the hourly cron \'37 * * * *\' plus workflow_dispatch without inputs');
 if(!/^permissions:\n  contents: read\n(?! )/m.test(body))out.push('the top-level token is not read-only (contents: read)');
 if(!/^jobs:\n  dispatch:\n/m.test(body)||/\n  \w[\w-]*:\n/.test(job.slice(job.indexOf('  dispatch:\n')+12)))out.push('the one job is not named dispatch');
 if(!/^    runs-on: ubuntu-24\.04\n    timeout-minutes: 3\n/m.test(job))out.push('the job is not a 3-minute ubuntu-24.04 job');
 if(!/^    permissions:\n      contents: read\n      actions: write\n    steps:\n/m.test(job))out.push('the job needs actions: write, and only that, to dispatch');
 if((body.match(/actions: write/g)??[]).length!==1)out.push('actions: write outside the job');
 if(!job.endsWith('    steps:\n'+SPARE_STEP))out.push('the step is not the one dispatch of collect.yml on main with mode gentle and the workflow token');
 if(/\buses:|secrets\.|vars\./.test(body))out.push('a checkout, an action, a secret or a variable: the spare needs none');
 // PR #291 review P2-1: the lines above look for a line anywhere, so a job-level if:, strategy: or needs: slipped
 // through. The job as a whole is the text below and nothing else.
 if(job!==SPARE_JOB)out.push('the job is not exactly the dispatch job (runs-on, timeout-minutes, permissions and the one step, nothing else): an if:, strategy:, needs: or container: would change whether or how often it dispatches');
 return out;
}
assert.equal(spareProblems(spare).length,0,'collect-spare.yml: '+spareProblems(spare).join('; '));
// collect.yml, the workflow the spare dispatches, has no schedule of its own (the 60-day rule above).
const hasSchedule=text=>/^\s+schedule:/m.test(text);
assert(!hasSchedule(collect),'collect.yml has no schedule of its own');
// Only the watch and the spare have a cron in this public repository (they turn off after 60 days without repository
// activity, comments in both; the outer scheduler's daily first run starts the chain again).
for(const file of readdirSync('.github/workflows').filter(f=>/\.ya?ml$/.test(f)))
 assert.equal(hasSchedule(read(file)),['collect-watch.yml','collect-spare.yml'].includes(file),file+': only the watch and the spare have a schedule');
let spareControls=0;
for(const [label,edit,problem] of [
 ['no cron',t=>t.replace("    - cron: '37 * * * *'\n",''),'hourly cron'],
 ['no schedule',t=>t.replace("  schedule:\n    - cron: '37 * * * *'\n",''),'hourly cron'],
 ['another minute',t=>t.replace("'37 * * * *'","'0 * * * *'"),'hourly cron'],
 ['every 15 minutes',t=>t.replace("'37 * * * *'","'*/15 * * * *'"),'hourly cron'],
 ['a second cron',t=>t.replace("    - cron: '37 * * * *'\n","    - cron: '37 * * * *'\n    - cron: '7 */6 * * *'\n"),'hourly cron'],
 ['no manual start',t=>t.replace('  workflow_dispatch:\n',''),'hourly cron'],
 ['an input',t=>t.replace('  workflow_dispatch:\n','  workflow_dispatch:\n    inputs:\n      mode:\n        type: string\n'),'hourly cron'],
 ['no actions: write',t=>t.replace('      actions: write\n',''),'actions: write'],
 ['actions: write at the top',t=>t.replace('permissions:\n  contents: read\n# bash','permissions:\n  contents: read\n  actions: write\n# bash'),'outside the job'],
 ['write-all',t=>t.replace('      contents: read\n      actions: write\n','      contents: write\n      actions: write\n'),'actions: write, and only that'],
 ['calls the chain',t=>t.replace('gh workflow run collect.yml','gh workflow run collect-chain.yml'),'one dispatch'],
 ['calls the deploy',t=>t.replace('gh workflow run collect.yml','gh workflow run deploy.yml'),'one dispatch'],
 ['mode check-access',t=>t.replace('mode=gentle','mode=check-access'),'one dispatch'],
 ['no mode',t=>t.replace(' -f mode=gentle',''),'one dispatch'],
 ['another ref',t=>t.replace('--ref main','--ref feature'),'one dispatch'],
 ['no ref',t=>t.replace(' --ref main',''),'one dispatch'],
 ['another token',t=>t.replace('${{ github.token }}','${{ secrets.YUKEMURI_SPARE_TOKEN }}'),'one dispatch'],
 ['a checkout',t=>t.replace('    steps:\n','    steps:\n      - uses: actions/checkout@v7\n'),'checkout'],
 ['a variable',t=>t.replace('ubuntu-24.04\n','ubuntu-24.04\n    if: vars.YUKEMURI_SPARE != \'off\'\n'),'variable'],
 ['a second job',t=>t+'  later:\n    runs-on: ubuntu-24.04\n','one job'],
 ['a 30-minute job',t=>t.replace('timeout-minutes: 3','timeout-minutes: 30'),'3-minute'],
 ['write at the top for the whole run',t=>t.replace('permissions:\n  contents: read\n# bash','permissions:\n  contents: write\n# bash'),'read-only'],
 // PR #291 review P2-1: the four copies that passed the first version of this check.
 ['job if: false (never dispatches)',t=>t.replace('    runs-on: ubuntu-24.04\n','    if: false\n    runs-on: ubuntu-24.04\n'),'exactly the dispatch job'],
 ['job if: manual start only',t=>t.replace('    runs-on: ubuntu-24.04\n',"    if: github.event_name == 'workflow_dispatch'\n    runs-on: ubuntu-24.04\n"),'exactly the dispatch job'],
 ['job strategy matrix (dispatches twice)',t=>t.replace('    runs-on: ubuntu-24.04\n','    strategy:\n      matrix:\n        n: [1, 2]\n    runs-on: ubuntu-24.04\n'),'exactly the dispatch job'],
 ['job if: false after timeout-minutes',t=>t.replace('    timeout-minutes: 3\n','    timeout-minutes: 3\n    if: false\n'),'exactly the dispatch job']
]){
 const copy=edit(spare);
 assert.notEqual(copy,spare,'control '+label+' changed nothing');
 assert(spareProblems(copy).some(p=>p.includes(problem)),`control "${label}" is not reported as ${problem}: ${JSON.stringify(spareProblems(copy))}`);spareControls++;
}
// A schedule added to collect.yml, or a cron in any other workflow, is what the two checks above report.
assert(hasSchedule(collect.replace('on:\n','on:\n  schedule:\n    - cron: \'37 * * * *\'\n')),'control: a schedule in collect.yml is seen');spareControls++;
assert(hasSchedule(read('deploy.yml').replace('on:\n','on:\n  schedule:\n    - cron: \'37 * * * *\'\n')),'control: a schedule in deploy.yml is seen');spareControls++;

// Freshness rule: successful gentle runs only; none passes; over 12 hours fails.
const now=Date.parse('2026-10-12T12:00:00Z'),at=h=>new Date(now-h*3600000).toISOString();
const run=(h,extra={})=>({status:'completed',conclusion:'success',display_title:GENTLE_TITLE,updated_at:at(h),...extra});
assert.equal(LIMIT_HOURS,12);
assert.deepEqual(freshness([],now),{state:'none',ok:true});
assert.deepEqual(freshness([run(3),run(9)],now),{state:'fresh',ok:true,lastSuccess:at(3),ageHours:3});
assert.equal(freshness([run(12)],now).ok,true,'exactly 12 hours is still within the limit');
assert.deepEqual(freshness([run(12.5)],now),{state:'stale',ok:false,lastSuccess:at(12.5),ageHours:12.5});
// A cancelled pending run (a push deploy queued behind it) or a check-access run never counts.
for(const other of [{conclusion:'cancelled'},{conclusion:'failure'},{status:'in_progress',conclusion:null},{display_title:'Yukemuri collection (check-access)'}])
 assert.equal(freshness([run(1,other),run(13)],now).state,'stale',JSON.stringify(other));
assert.deepEqual(freshness([run(1,{conclusion:'cancelled'})],now),{state:'none',ok:true});
// The runner cron fires hourly (C05) and GitHub delays or drops scheduled runs: any gap up to 12 hours passes, a longer one fails.
assert.equal(freshness([run(12)],now).ok,true);assert.equal(freshness([run(15)],now).ok,false);

// The script itself: skip before the switch, then the GitHub API through a local stand-in.
const script=resolve('scripts/check-collection-freshness.mjs');
const exec=(cwd,env)=>new Promise(done=>{const child=spawn(process.execPath,[script],{cwd,env:{PATH:process.env.PATH,...env}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>done({code,out}))});
const folder=mkdtempSync(join(tmpdir(),'collect-watch-'));
let requests=[],runs=[];
const server=createServer((req,res)=>{requests.push({url:req.url,auth:req.headers.authorization});res.setHeader('content-type','application/json');res.end(JSON.stringify({workflow_runs:runs}))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const TOKEN='watch-test-token';
const env={GITHUB_REPOSITORY:'jihune/yukemuri',GH_TOKEN:TOKEN,GITHUB_API_URL:`http://127.0.0.1:${server.address().port}`};
try{
 const config={workerName:'yukemuri',databaseName:'yukemuri',databaseId:'0123abcd-4567-89ab-cdef-0123456789ab',publicOrigin:null,autoDeploy:false};
 writeFileSync(join(folder,'cloudflare-deploy.json'),JSON.stringify(config));
 let result=await exec(folder,env);
 assert.equal(result.code,0);assert.match(result.out,/Skipped: publicOrigin is null/);assert.equal(requests.length,0,'no API call before the switch');
 writeFileSync(join(folder,'cloudflare-deploy.json'),JSON.stringify({...config,publicOrigin:'https://yukemuri.example-sub.workers.dev',autoDeploy:true}));
 result=await exec(folder,env);
 assert.equal(result.code,0,result.out);assert.match(result.out,/No successful gentle collection yet/);
 assert.deepEqual(requests.at(-1),{url:'/repos/jihune/yukemuri/actions/workflows/collect.yml/runs?status=success&per_page=100',auth:'Bearer '+TOKEN});
 runs=[{...run(0),updated_at:new Date(Date.now()-3600000).toISOString()}];
 assert.equal((await exec(folder,env)).code,0);
 runs=[{...run(0),updated_at:new Date(Date.now()-13*3600000).toISOString()}];
 result=await exec(folder,env);
 assert.equal(result.code,1);assert.match(result.out,/::error::Last successful collection is 13 hours old/);
 assert.equal((await exec(folder,{...env,GH_TOKEN:''})).code,1,'missing token fails instead of passing');
 for(const r of [result])assert(!r.out.includes(TOKEN),'token never printed');
}finally{server.close();rmSync(folder,{recursive:true,force:true})}

const committed=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
console.log(`Collection workflows passed: collect.yml dispatch-only (check-access|gentle) under yukemuri-catalog-updates with the snapshot deploy at the end, watch every 6 h with a ${LIMIT_HOURS}-hour limit on successful gentle runs, spare at minute 37 of every hour dispatching only collect.yml on main in mode gentle (controls: ${spareControls} of ${spareControls} fail) (committed publicOrigin: ${committed.publicOrigin??'null, watch skips'}).`);
