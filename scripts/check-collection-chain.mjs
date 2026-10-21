// C06 collection chain without an account: the chain job at the end of
// collect.yml, the wait in collect-chain.yml, and the rules of
// collection-chain.mjs against fixture runs and a stand-in GitHub API. Every
// rule and every condition of the chain job has a control: a copy with it
// removed must fail here.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {CHAIN,chainAfter,collecting,nextRun,overlapNow,waitMs} from './collection-chain.mjs';
import {BUDGET,pagesFor} from './collection-budget.mjs';
import {GENTLE_TITLE} from './check-collection-freshness.mjs';

const read=file=>readFileSync('.github/workflows/'+file,'utf8');
const collect=read('collect.yml'),wait=read('collect-chain.yml');

// collect.yml: the chain job is the last job and dispatches only after a gentle
// run on main collected (pages not 0) and deployed its snapshot.
const CONDITIONS=["inputs.mode == 'gentle'","github.ref == 'refs/heads/main'","needs.collect.result == 'success'","needs.collect.outputs.pages != '0'","needs.snapshot.result == 'success'"];
function chainProblems(text){
 const job=text.slice(text.indexOf('\n  chain:\n')+1),out=[];
 if(!text.includes('\n  chain:\n'))return ['no chain job'];
 if(/\n  \w[\w-]*:\n/.test(job.slice(9)))out.push('the chain job is not the last job');
 const cond=job.match(/^    if: (.*)$/m)?.[1]??'';
 if(/\|\||!(?!=)|always\(|failure\(|cancelled\(/.test(cond))out.push('the condition has an or, a negation or a status function: '+cond);
 const parts=cond.split(' && ');
 for(const c of CONDITIONS)if(!parts.includes(c))out.push('the chain job runs without '+c);
 if(!/^    needs: \[collect, snapshot\]$/m.test(job))out.push('the chain job does not wait for collect and snapshot');
 if(!/^    continue-on-error: true$/m.test(job))out.push('a failed dispatch would fail the collection run');
 if(!/^    permissions:\n      contents: read\n      actions: write\n    steps:\n/m.test(job))out.push('the chain job needs its own actions: write, and only that');
 if(job.trimEnd()!==job.slice(0,job.indexOf('    steps:\n'))+['    steps:','      - env:','          GH_TOKEN: ${{ github.token }}','          RUN_ID: ${{ github.run_id }}','        run: gh workflow run collect-chain.yml --repo "$GITHUB_REPOSITORY" --ref main -f after_run="$RUN_ID"'].join('\n'))
  out.push('the chain step is not the one dispatch of collect-chain.yml on main with this run id');
 if((text.match(/actions: write/g)??[]).length!==1)out.push('actions: write outside the chain job');
 return out;
}
assert.deepEqual(chainProblems(collect),[],'collect.yml chain job');
assert.match(collect,/^permissions:\n  contents: read\n  actions: read\n(?! )/m,'the rest of the run keeps the read-only token');

// collect-chain.yml: dispatch only, outside the catalogue lock, one wait for each run before.
assert.equal(wait.match(/^on:\n((?:[ #].*\n)+)/m)[1],['  workflow_dispatch:','    inputs:','      after_run:','        description: The collect.yml run to follow','        type: string','        required: true',''].join('\n'),'dispatch only, with the run to follow');
assert.match(wait,/^run-name: Yukemuri collection chain \(after run \$\{\{ inputs\.after_run \}\}\)$/m);
// A group shared by all waits let an older run's wait cancel a newer run's (#190 Codex review 3 P2).
const OWN_GROUP=/^permissions:\n  contents: read\nconcurrency:\n  group: yukemuri-collection-chain-\$\{\{ inputs\.after_run \}\}\n  cancel-in-progress: true\n/m;
assert.match(wait,OWN_GROUP,'a group for each run before: the wait never holds the catalogue lock and cannot cancel another run\'s wait');
assert(!/yukemuri-catalog-updates|cloudflare-account/.test(wait.replace(/^\s*#.*$/gm,'')),'no catalogue or account lock');
assert.match(wait,/^    timeout-minutes: (\d+)$/m);
assert(Number(wait.match(/^    timeout-minutes: (\d+)$/m)[1])>CHAIN.intervalMinutes+5,'the job outlives the wait');
assert.match(wait,/^    permissions:\n      contents: read\n      actions: write\n    steps:\n/m);
assert(wait.endsWith(['      - env:','          GH_TOKEN: ${{ github.token }}','          AFTER_RUN: ${{ inputs.after_run }}','          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}','          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}','        run: node scripts/collection-chain.mjs',''].join('\n')),'the wait step');
assert.deepEqual([...new Set(wait.match(/secrets\.\w+/g))].sort(),['secrets.CLOUDFLARE_ACCOUNT_ID','secrets.CLOUDFLARE_API_TOKEN'],'the analytics token only; the crawl key never reaches the wait');

// The rules.
assert.deepEqual({...CHAIN},{intervalMinutes:60,maxRunsPerDay:24,minPages:BUDGET.fallbackPages});
const now=Date.parse('2026-10-21T12:40:00Z'),at=m=>new Date(now-m*60_000).toISOString().replace(/\.000Z$/,'Z');
const run=(id,minutesAgo,extra={})=>({id,display_title:GENTLE_TITLE,path:'.github/workflows/collect.yml',head_branch:'main',status:'completed',conclusion:'success',created_at:at(minutesAgo),...extra});
// Budgets as collection-budget.mjs words them: a reading, and both fallbacks.
const after=run(100,62),budget=pagesFor({rowsRead:1_500_000,rowsWritten:20_000});
assert.deepEqual(budget,{pages:120,reason:'today 20000 rows written, 1500000 read; writes allow 351 pages, reads 538, cap 120'});
const base={after,runs:[run(90,120),after],budget,now};
const CASES={
 'not-gentle-main':[{after:{...after,head_branch:'feature'}},{after:{...after,display_title:'Yukemuri collection (check-access)'}},{after:{...after,path:'.github/workflows/deploy.yml'}}],
 'newer-run':[{runs:[after,run(101,30)]},{runs:[after,run(101,30,{status:'completed',conclusion:'failure'})]},{runs:[after,run(101,5,{status:'queued',conclusion:null})]},{runs:[after,{...after,id:101}]}],
 'day-limit':[{runs:[after,...Array.from({length:23},(_,i)=>run(200+i,63+i))]},{runs:[after,...Array.from({length:23},(_,i)=>run(200+i,63+i,{head_branch:'feature'}))]}],
 'usage-unreadable':[{budget:pagesFor(null)},{budget:pagesFor({rowsRead:'x',rowsWritten:0})}],
 'small-budget':[{budget:pagesFor({rowsRead:3_960_000,rowsWritten:0})},{budget:pagesFor({rowsRead:5_000_000,rowsWritten:0})}]
};
const check=(decide,label)=>{
 assert.deepEqual(decide(base),{dispatch:true,rule:'dispatch',reason:'the next run gets 120 pages ('+budget.reason+')'},label+': a gentle run on main, nothing newer, budget left');
 assert.equal(decide({...base,budget:{...budget,pages:16}}).dispatch,true,label+': exactly minPages');
 assert.equal(decide({...base,after:{...after,path:'.github/workflows/collect.yml@main'}}).dispatch,true,label+': a path with a ref (#190 Codex review P1)');
 for(const status of ['completed','in_progress'])
  assert.equal(decide({...base,runs:[after,run(101,30,{head_branch:'feature',status})]}).dispatch,true,label+': a newer '+status+' gentle run off main cannot carry the chain (#190 Codex review 2 P2)');
 assert.equal(decide({...base,runs:[after,...Array.from({length:22},(_,i)=>run(200+i,63+i))]}).dispatch,true,label+': the 24th run of the day');
 assert.equal(decide({...base,runs:[after,run(101,30,{display_title:'Yukemuri collection (check-access)',status:'in_progress'})]}).dispatch,true,label+': a newer check-access run does not stop the chain');
 assert.equal(decide({...base,runs:[{...after,id:99},after]}).dispatch,true,label+': a run made in the same second with a lower id is the older one');
 assert.equal(decide({...base,runs:[run(102,24*60+30),after]}).dispatch,true,label+': yesterday\'s runs do not count');
 // Runs that waited together may end in either order (queue: max, cloudflare-deploy.md): only the
 // newer run's wait dispatches (#190 Codex review 3 P2).
 const older=run(99,70);
 for(const status of ['queued','in_progress'])
  assert.equal(decide({...base,runs:[{...older,status,conclusion:null},after]}).dispatch,true,label+': the newer run ended first and the older is '+status);
 assert.equal(decide({...base,after:older,runs:[older,after]}).rule,'newer-run',label+': then the older run\'s wait stops on the newer one');
 // C06 (user 2026-10-21): a run made while the one before was queued or running repeats it and
 // takes 0 pages, so the chain goes on as if it were not there; a run made after it ended carries it.
 const ended={...after,updated_at:at(32)},repeat=run(101,50),later=run(102,20);
 assert.equal(decide({...base,after:ended,runs:[ended,repeat]}).dispatch,true,label+': a run made while the one before was running repeats it');
 assert.equal(decide({...base,after:ended,runs:[ended,later]}).rule,'newer-run',label+': a run made after the one before ended carries the chain, as before');
 assert.equal(decide({...base,after:ended,runs:[ended,{...repeat,status:'in_progress',conclusion:null},later]}).rule,'newer-run',label+': a repeating run still going does not hold up the run after it');
 for(const [rule,cases] of Object.entries(CASES))for(const c of cases){
  const d=decide({...base,...c});
  assert.equal(d.dispatch,false,`${label}: ${rule} ${JSON.stringify(c).slice(0,120)}`);
  assert.equal(d.rule,rule,`${label}: ${JSON.stringify(c).slice(0,120)} stops on ${d.rule}, not ${rule}`);
 }
};
check(nextRun,'nextRun');
// Overlapping runs: one collects whichever ends first; runs that do not overlap all collect.
{
 const a={...run(1,90),updated_at:at(60)},b=run(2,80),c=run(3,30);
 assert.deepEqual(collecting([c,b,a]).map(r=>r.id),[1,3],'b was made while a ran');
 assert.deepEqual(collecting([{...a,status:'queued',conclusion:null},b]).map(r=>r.id),[1],'a still waits behind b: b repeats a');
 assert.deepEqual(collecting([a,{...b,created_at:at(59)},c]).map(r=>r.id),[1,2,3],'made after a ended');
}
// An hour after the run before was created; never negative.
assert.equal(waitMs(run(1,0),now),3_600_000);assert.equal(waitMs(run(1,45),now),900_000);assert.equal(waitMs(run(1,90),now),0);

// chainAfter with a stand-in API (in process): what it reads, waits, decides and posts.
const TOKEN='chain-test-token';
const stand=({after:a=after,runs=base.runs,total,status={}}={})=>{
 const calls=[];
 return {calls,fetch:async(url,init={})=>{
  const u=new URL(url);calls.push({path:u.pathname+u.search,method:init.method??'GET',body:init.body??null,auth:init.headers.Authorization});
  const fail=Object.entries(status).find(([p])=>u.pathname.endsWith(p));
  if(fail)return new Response('{}',{status:fail[1]});
  if(u.pathname.endsWith('/dispatches'))return new Response(null,{status:204});
  if(u.pathname.endsWith('/runs/'+a.id))return Response.json(a);
  return Response.json({total_count:total??runs.length,workflow_runs:runs});
 }};
};
const env={GITHUB_REPOSITORY:'jihune/yukemuri',GH_TOKEN:TOKEN,AFTER_RUN:'100',GITHUB_API_URL:'https://api.example.test'};
{
 const api=stand(),slept=[],lines=[];
 let clock=now-62*60_000+5*60_000; // five minutes after the run before was created
 const d=await chainAfter({env,fetch:api.fetch,sleep:async ms=>{slept.push(ms);clock+=ms},clock:()=>clock,budget:async({now:n})=>{assert.equal(n.getTime(),clock);return budget},log:l=>lines.push(l)});
 assert.equal(d.dispatch,true);assert.deepEqual(slept,[55*60_000],'waits until an hour after the run before');
 assert.deepEqual(api.calls.map(c=>c.method+' '+c.path),['GET /repos/jihune/yukemuri/actions/runs/100',
  'GET /repos/jihune/yukemuri/actions/workflows/collect.yml/runs?created=%3E%3D2026-10-21T00%3A00%3A00Z&per_page=100',
  'POST /repos/jihune/yukemuri/actions/workflows/collect.yml/dispatches'],'the run, the runs since the start of its day, one dispatch');
 assert.deepEqual(JSON.parse(api.calls[2].body),{ref:'main',inputs:{mode:'gentle'}},'a gentle run on main');
 assert(api.calls.every(c=>c.auth==='Bearer '+TOKEN));
 assert(!lines.join('\n').includes(TOKEN),'token never printed');
}
{
 // Just after midnight the list reaches back to the run before, which does not count toward the new day.
 const late={...after,created_at:'2026-10-20T23:40:00Z'},api=stand({after:late,runs:[late,...Array.from({length:23},(_,i)=>({...run(300+i,0),created_at:`2026-10-20T${String(i).padStart(2,'0')}:05:00Z`}))]});
 const d=await chainAfter({env,fetch:api.fetch,sleep:async()=>{},clock:()=>Date.parse('2026-10-21T00:40:00Z'),budget:async()=>budget,log:()=>{}});
 assert.equal(d.dispatch,true,d.reason);assert.match(api.calls[1].path,/created=%3E%3D2026-10-20T23%3A40%3A00Z&/);
}
{
 // The chain job that started the wait may still be running: wait for that run to end before deciding (C06 overlap).
 let reads=0;const api=stand(),slept=[];
 const fetch=async(url,init)=>new URL(url).pathname.endsWith('/runs/100')&&reads++<2?Response.json({...after,status:'in_progress',conclusion:null}):api.fetch(url,init);
 const d=await chainAfter({env,fetch,sleep:async ms=>{slept.push(ms)},clock:()=>now,budget:async()=>budget,log:()=>{}});
 assert.equal(d.dispatch,true);assert.deepEqual(slept,[15_000,15_000,0],'two polls while the run before ends, then no wait (made over an hour ago)');
}
for(const [label,opts,reason] of [['newer run',{runs:[after,run(101,30)]},'newer-run'],['small budget',{},'small-budget']]){
 const api=stand(opts);
 const d=await chainAfter({env,fetch:api.fetch,sleep:async()=>{},clock:()=>now,budget:async()=>({...budget,pages:label==='small budget'?3:120}),log:()=>{}});
 assert.equal(d.rule,reason,label);assert(!api.calls.some(c=>c.method==='POST'),label+': no dispatch');
}
for(const [label,opts,pattern] of [['more than one page',{total:101},/more than one page/],['run unreadable',{status:{'/runs/100':404}},/returned 404/],['dispatch refused',{status:{'/dispatches':403}},/POST \/actions\/workflows\/collect\.yml\/dispatches returned 403/]])
 await assert.rejects(chainAfter({env,fetch:stand(opts).fetch,sleep:async()=>{},clock:()=>now,budget:async()=>budget,log:()=>{}}),pattern,label);
for(const bad of [{AFTER_RUN:''},{AFTER_RUN:'12; rm -rf /'},{GH_TOKEN:''},{GITHUB_REPOSITORY:'x'}])
 await assert.rejects(chainAfter({env:{...env,...bad},fetch:stand().fetch,sleep:async()=>{},clock:()=>now,budget:async()=>budget}),/required|run id/,JSON.stringify(bad));

// collect.yml's overlap step (overlapNow) against a stand-in API.
{
 const ended={...after,updated_at:at(32)},self=run(101,50,{status:'in_progress',conclusion:null}),urls=[];
 const api=(me,runs)=>async url=>{urls.push(url);return Response.json(new URL(url).pathname.endsWith('/runs/'+me.id)?me:{total_count:runs.length,workflow_runs:runs})};
 const env2={GITHUB_REPOSITORY:'jihune/yukemuri',GH_TOKEN:TOKEN,GITHUB_RUN_ID:'101',GITHUB_API_URL:'https://api.example.test'};
 assert.equal(await overlapNow({env:env2,fetch:api(self,[ended,self])}),'run 100 (completed) was queued or running when run 101 was made and carries the chain');
 assert.match(urls[1],/\/actions\/workflows\/collect\.yml\/runs\?created=%3E%3D2026-10-21T05%3A50%3A00Z&per_page=100$/,'runs from six hours before this one');
 for(const [label,me] of [['made after the run before ended',{...self,created_at:at(20)}],['a run off main',{...self,head_branch:'feature'}],['a check-access run',{...self,display_title:'Yukemuri collection (check-access)'}]])
  assert.equal(await overlapNow({env:env2,fetch:api(me,[ended,me])}),'',label);
 await assert.rejects(overlapNow({env:{...env2,GITHUB_RUN_ID:''},fetch:api(self,[])}),/run id/);
}

// The script as the workflow runs it, against a local API: no Cloudflare token
// means an unreadable budget, so it reads, decides and dispatches nothing.
const script=resolve('scripts/collection-chain.mjs');
let requests=[];
const ago=m=>new Date(Date.now()-m*60_000).toISOString().replace(/\.\d{3}Z$/,'Z');
const old=run(100,90,{created_at:ago(90)}),repeating=run(101,80,{created_at:ago(80),status:'in_progress',conclusion:null});
let listing=[old];
const server=createServer((req,res)=>{
 requests.push(req.method+' '+req.url);res.setHeader('content-type','application/json');
 if(req.url.includes('/runs/404')){res.statusCode=404;res.end('{}');return}
 res.end(JSON.stringify(req.url.includes('/runs/100')?old:req.url.includes('/runs/101')?repeating:{total_count:listing.length,workflow_runs:listing}));
});
const spawnScript=(file,args,extra)=>new Promise(done=>{const child=spawn(process.execPath,[file,...args],{env:{PATH:process.env.PATH,...extra}});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('close',code=>done({code,out,err}))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const folder=mkdtempSync(join(tmpdir(),'collection-chain-'));
try{
 writeFileSync(join(folder,'summary.md'),'');
 const result=await new Promise(done=>{const child=spawn(process.execPath,[script],{env:{PATH:process.env.PATH,...env,GITHUB_API_URL:`http://127.0.0.1:${server.address().port}`,GITHUB_STEP_SUMMARY:join(folder,'summary.md')}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('close',code=>done({code,out}))});
 assert.equal(result.code,0,result.out);
 assert.match(result.out,/waiting 0 minutes[\s\S]*Not dispatching \(usage-unreadable\)/);
 assert.deepEqual(requests.map(r=>r.split('?')[0]),['GET /repos/jihune/yukemuri/actions/runs/100','GET /repos/jihune/yukemuri/actions/workflows/collect.yml/runs']);
 assert.match(readFileSync(join(folder,'summary.md'),'utf8'),/^- 이어 부르기\(run 100 뒤\): 부르지 않았다\(usage-unreadable\)/);
 assert(!result.out.includes(TOKEN));
 // --overlap as collect.yml runs it: overlap=<why> for the budget step, nothing when the run collects,
 // and a failed check collects as usual (exit 0, no overlap=).
 const local={GITHUB_REPOSITORY:'jihune/yukemuri',GH_TOKEN:TOKEN,GITHUB_API_URL:`http://127.0.0.1:${server.address().port}`};
 listing=[{...old,updated_at:ago(60)},repeating];
 let o=await spawnScript(script,['--overlap'],{...local,GITHUB_RUN_ID:'101'});
 assert.equal(o.code,0,o.err);assert.equal(o.out,'overlap=run 100 (completed) was queued or running when run 101 was made and carries the chain\n');
 listing=[{...old,updated_at:ago(85)},repeating];
 o=await spawnScript(script,['--overlap'],{...local,GITHUB_RUN_ID:'101'});
 assert.equal(o.code,0,o.err);assert.equal(o.out,'','run 100 ended before run 101 was made');
 o=await spawnScript(script,['--overlap'],{...local,GITHUB_RUN_ID:'404'});
 assert.equal(o.code,0);assert.equal(o.out,'');assert.match(o.err,/^Overlap check failed, collecting as usual: GitHub API GET \/actions\/runs\/404 returned 404/);
 // collection-budget.mjs then prints 0 pages with the reason the daily check passes (daily-check.mjs OVERLAP),
 // and without it sizes the run as before (16 pages here: no Cloudflare token).
 const budgetScript=resolve('scripts/collection-budget.mjs');
 o=await spawnScript(budgetScript,[],{OVERLAP:'run 100 (completed) was queued or running when run 101 was made and carries the chain'});
 assert.equal(o.out,'pages=0\nreason=overlap: run 100 (completed) was queued or running when run 101 was made and carries the chain\n');
 o=await spawnScript(budgetScript,[],{OVERLAP:''});
 assert.equal(o.out,'pages=16\nreason=usage unavailable: fallback to 16 pages\n');
}finally{server.close();rmSync(folder,{recursive:true,force:true})}

// Controls: each rule removed from a copy of collection-chain.mjs, and each
// condition removed from a copy of collect.yml, must fail the checks above.
const source=readFileSync('scripts/collection-chain.mjs','utf8').replace(/from '\.\/([\w-]+\.mjs)'/g,(_,f)=>`from '${pathToFileURL(resolve('scripts',f)).href}'`);
const controls=mkdtempSync(join(tmpdir(),'collection-chain-controls-'));
let failed=0;
try{
 for(const rule of Object.keys(CASES)){
  const lines=source.split('\n'),i=lines.findIndex(l=>l.includes(`return no('${rule}'`));
  assert(i>=0,'no line for '+rule);
  const file=join(controls,rule+'.mjs');writeFileSync(file,[...lines.slice(0,i),...lines.slice(i+1)].join('\n'));
  const copy=await import(pathToFileURL(file).href);
  try{check(copy.nextRun,'control '+rule)}catch{failed++;continue}
  assert.fail('control without '+rule+' still passed');
 }
 // The clause #190 Codex review 3 found: an older run still queued or running stopped the newer run's wait.
 // And a run made in the same second as the one before (#190 Claude review 1 P3): ordered by id.
 // And the overlap rule (C06, user 2026-10-21): without it, or with runs that only repeat another
// holding up the runs after them.
 for(const [name,from,to] of [['older-running','r.id!==after.id&&order(after,r)<0)',"r.id!==after.id&&(order(after,r)<0||r.status!=='completed'))"],['same-second','||a.id-b.id',''],
  ['no-overlap-rule','if(!out.some(q=>inFlightAt(q,created(r))))out.push(r);','out.push(r);'],
  ['repeats-block',"if(!out.some(q=>","if(!runs.filter(q=>gentle(q)&&q.head_branch==='main'&&order(q,r)<0).some(q=>"]]){
  const copySource=source.replace(from,to);
  assert.notEqual(copySource,source,name);
  const file=join(controls,name+'.mjs');writeFileSync(file,copySource);
  const copy=await import(pathToFileURL(file).href);
  assert.throws(()=>check(copy.nextRun,'control '+name),undefined,'control '+name+' still passed');failed++;
 }
}finally{rmSync(controls,{recursive:true,force:true})}
const shared=wait.replace('yukemuri-collection-chain-${{ inputs.after_run }}','yukemuri-collection-chain');
assert.notEqual(shared,wait);
assert(!OWN_GROUP.test(shared),'control with one group for all waits still passed');failed++;
// The chain job's own text only: the snapshot job shares two of the conditions.
const k=collect.indexOf('\n  chain:\n'),inChain=edit=>collect.slice(0,k)+edit(collect.slice(k));
for(const c of CONDITIONS){
 const copy=inChain(job=>job.replace(' && '+c,'').replace(c+' && ',''));
 assert.notEqual(copy,collect);
 assert(chainProblems(copy).some(p=>p.includes(c)),'control without '+c+' still passed');failed++;
}
for(const [label,copy] of [['continue-on-error',inChain(job=>job.replace('    continue-on-error: true\n',''))],['last job',collect+'  later:\n    runs-on: ubuntu-24.04\n'],['or',inChain(job=>job.replace(" && github.ref == 'refs/heads/main'"," || github.ref == 'refs/heads/main'"))],['write elsewhere',collect.replace('permissions:\n  contents: read\n  actions: read\n','permissions:\n  contents: read\n  actions: write\n')]]){
 assert.notEqual(copy,collect,label);
 assert(chainProblems(copy).length>0,'control '+label+' still passed');failed++;
}
const total=Object.keys(CASES).length+5+CONDITIONS.length+4;
assert.equal(failed,total);
console.log(`Collection chain passed: collect.yml dispatches collect-chain.yml after a gentle run on main that collected and deployed; the wait runs outside the catalogue lock for an hour from the run before and dispatches unless a newer gentle run exists, ${CHAIN.maxRunsPerDay} runs are already on the day, usage is unreadable or the budget is under ${CHAIN.minPages} pages. Controls: ${failed} of ${total} fail.`);
