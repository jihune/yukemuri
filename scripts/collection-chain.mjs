// C06 (user 2026-10-19): GitHub drops most of the runner's hourly dispatches
// (C05), so a gentle run carries the collection on itself. collect.yml starts
// collect-chain.yml after a gentle run on main that collected and refreshed its
// snapshot; this script runs there, outside the catalogue lock, waits until an
// hour after that run was created and dispatches the next gentle run with the
// workflow token, unless one of the rules in nextRun says not to. A broken
// chain is picked up again by the runner's next dispatch. With --overlap it is
// collect.yml's first gentle step instead: a run made while another was queued
// or running prints overlap=<why> and takes 0 pages (collecting). Logs ids,
// times and counts only.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {budgetToday} from './collection-budget.mjs';
import {GENTLE_TITLE,WORKFLOW} from './check-collection-freshness.mjs';

export const CHAIN=Object.freeze({
 intervalMinutes:60, // C05: hourly, counted from the creation of the run before
 maxRunsPerDay:24,   // C05: at most one gentle run an hour in a UTC day, the runner's own included
 minPages:16         // 2026-10-19: the run size before C03 (fallbackPages). A run reads about 220,000
                     // rows whatever its size (its last queue read about 89,000, its snapshot about
                     // 132,000) and a page 1,900-2,500 on 10-19 (4,467 in one 10-18 interval), so
                     // below 16 pages at least three quarters of a run's reads are those fixed reads.
                     // Skipping such a run itself is the C04 follow-up, not this.
});

const no=(rule,reason)=>({dispatch:false,rule,reason});
const gentle=r=>r.display_title===GENTLE_TITLE;
const created=r=>Date.parse(r.created_at);
// created_at has whole seconds, so the run id orders two runs made in the same second.
const order=(a,b)=>created(a)-created(b)||a.id-b.id;
// A completed run's updated_at is when it ended (10-19 runs: the end of their last job).
const inFlightAt=(q,t)=>q.status!=='completed'||Date.parse(q.updated_at)>t;

// C06 (user 2026-10-21): the gentle runs on main that collect, in order of
// creation. A run made while an earlier collecting run was queued or running
// (the runner's dispatch next to the chain's) only repeats it: it takes 0 pages
// (collect.yml's overlap step) and that run carries the chain.
export function collecting(runs){
 const out=[];
 for(const r of runs.filter(r=>gentle(r)&&r.head_branch==='main').sort(order))
  if(!out.some(q=>inFlightAt(q,created(r))))out.push(r);
 return out;
}

// after: the collect.yml run this one follows; runs: collect.yml runs created
// since the earlier of that run and the start of today (UTC); budget: what
// budgetToday() gives now; now: epoch ms.
export function nextRun({after,runs,budget,now},chain=CHAIN){
 // The REST path may carry a ref (`.github/workflows/collect.yml@main` in GitHub's example; 10-19 runs had none).
 if(!gentle(after)||String(after.path).split('@')[0]!=='.github/workflows/'+WORKFLOW||after.head_branch!=='main')return no('not-gentle-main',`run ${after.id} is not a gentle ${WORKFLOW} run on main`);
 // Only a collecting run on main made later carries the chain (collect.yml's chain job): an older
 // one still queued or running finds this run newer when its own wait decides, as runs that waited
 // together may end in either order (#190 Codex review 3 P2). Any gentle run counts toward the day.
 const newer=collecting(runs).find(r=>r.id!==after.id&&order(after,r)<0);
 if(newer)return no('newer-run',`gentle run ${newer.id} (${newer.status}) came after run ${after.id} and carries the chain`);
 const day=new Date(now).toISOString().slice(0,10),today=runs.filter(r=>gentle(r)&&String(r.created_at).startsWith(day)).length;
 if(today>=chain.maxRunsPerDay)return no('day-limit',`${today} gentle runs on ${day}, the limit is ${chain.maxRunsPerDay}`);
 if(!/^today /.test(budget.reason))return no('usage-unreadable',`usage unreadable (${budget.reason}): a run would not be sized by the budget`);
 if(budget.pages<chain.minPages)return no('small-budget',`the next run would get ${budget.pages} pages, under ${chain.minPages} (${budget.reason})`);
 return {dispatch:true,rule:'dispatch',reason:`the next run gets ${budget.pages} pages (${budget.reason})`};
}

// How long to wait before deciding: until intervalMinutes after the run before was created.
export const waitMs=(after,now,chain=CHAIN)=>Math.max(0,Date.parse(after.created_at)+chain.intervalMinutes*60_000-now);

function github(env,fetch){
 const repo=env.GITHUB_REPOSITORY,token=env.GH_TOKEN;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!token)throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
 const api=env.GITHUB_API_URL||'https://api.github.com';
 return async(path,init={})=>{
  const response=await fetch(api+'/repos/'+repo+path,{...init,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...init.headers}});
  if(!response.ok)throw new Error(`GitHub API ${init.method??'GET'} ${path.split('?')[0]} returned ${response.status}`);
  return response.status===204?null:response.json();
 };
}

async function runsSince(gh,time){
 const since=new Date(time).toISOString().replace(/\.\d{3}Z$/,'Z');
 const list=await gh(`/actions/workflows/${WORKFLOW}/runs?created=${encodeURIComponent('>='+since)}&per_page=100`);
 const runs=list.workflow_runs??[];
 if((list.total_count??0)>runs.length)throw new Error(`${list.total_count} ${WORKFLOW} runs since ${since}, more than one page`);
 return runs;
}

// collect.yml's overlap step: why this run (GITHUB_RUN_ID) repeats a gentle run
// that was queued or running when it was made, or '' when it collects.
export async function overlapNow({env=process.env,fetch=globalThis.fetch}={}){
 const gh=github(env,fetch),id=env.GITHUB_RUN_ID;
 if(!/^\d+$/.test(id??''))throw new Error('GITHUB_RUN_ID must be a run id');
 const self=await gh('/actions/runs/'+id);
 // A run waits behind a few others at most; six hours reaches any still in flight when this one was made.
 const runs=await runsSince(gh,created(self)-6*3_600_000),all=runs.some(r=>r.id===self.id)?runs:[...runs,self];
 const ran=collecting(all);
 if(!gentle(self)||self.head_branch!=='main'||ran.some(r=>r.id===self.id))return '';
 const by=ran.filter(q=>order(q,self)<0&&inFlightAt(q,created(self))).at(-1);
 return `run ${by.id} (${by.status}) was queued or running when run ${self.id} was made and carries the chain`;
}

export async function chainAfter({env=process.env,fetch=globalThis.fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>Date.now(),budget=budgetToday,log=console.log}={}){
 const gh=github(env,fetch),id=env.AFTER_RUN;
 if(!/^\d+$/.test(id??''))throw new Error('AFTER_RUN must be a run id');
 let after=await gh('/actions/runs/'+id);
 // The run before ends with the chain job that started this wait. A run dispatched before it ends
 // would find it in flight and take 0 pages (collecting), so wait for it to end first.
 while(after.status!=='completed'){await sleep(15_000);after=await gh('/actions/runs/'+id)}
 const wait=waitMs(after,clock());
 log(`Run ${after.id} was created at ${after.created_at}; waiting ${Math.round(wait/60_000)} minutes.`);
 await sleep(wait);
 const now=clock(),runs=await runsSince(gh,Math.min(created(after),Date.parse(new Date(now).toISOString().slice(0,10))));
 const decision=nextRun({after,runs,budget:await budget({env,now:new Date(now)}),now});
 if(decision.dispatch)await gh(`/actions/workflows/${WORKFLOW}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{mode:'gentle'}})});
 log((decision.dispatch?'Dispatched the next gentle run: ':'Not dispatching ('+decision.rule+'): ')+decision.reason);
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,`- 이어 부르기(run ${after.id} 뒤): ${decision.dispatch?'다음 gentle 실행을 불렀다':'부르지 않았다('+decision.rule+')'} — ${decision.reason}\n`);
 return decision;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='--overlap')
  // Fails open: a run that cannot read the runs collects as runs did before the overlap rule.
  process.exitCode=await overlapNow().then(why=>{if(why)console.log('overlap='+why);return 0},error=>{console.error('Overlap check failed, collecting as usual: '+error.message);return 0});
 else process.exitCode=await chainAfter().then(()=>0,error=>{console.error('Collection chain failed: '+error.message);return 1});
}
