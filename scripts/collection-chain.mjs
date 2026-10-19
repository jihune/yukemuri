// C06 (user 2026-10-19): GitHub drops most of the runner's hourly dispatches
// (C05), so a gentle run carries the collection on itself. collect.yml starts
// collect-chain.yml after a gentle run on main that collected and refreshed its
// snapshot; this script runs there, outside the catalogue lock, waits until an
// hour after that run was created and dispatches the next gentle run with the
// workflow token, unless one of the rules in nextRun says not to. A broken
// chain is picked up again by the runner's next dispatch. Logs ids, times and
// counts only.
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

// after: the collect.yml run this one follows; runs: collect.yml runs created
// since the earlier of that run and the start of today (UTC); budget: what
// budgetToday() gives now; now: epoch ms.
export function nextRun({after,runs,budget,now},chain=CHAIN){
 const gentle=r=>r.display_title===GENTLE_TITLE;
 if(!gentle(after)||after.path!=='.github/workflows/'+WORKFLOW||after.head_branch!=='main')return no('not-gentle-main',`run ${after.id} is not a gentle ${WORKFLOW} run on main`);
 const newer=runs.find(r=>gentle(r)&&r.id!==after.id&&(Date.parse(r.created_at)>Date.parse(after.created_at)||r.status!=='completed'));
 if(newer)return no('newer-run',`gentle run ${newer.id} (${newer.status}) came after run ${after.id} and carries the chain`);
 const day=new Date(now).toISOString().slice(0,10),today=runs.filter(r=>gentle(r)&&String(r.created_at).startsWith(day)).length;
 if(today>=chain.maxRunsPerDay)return no('day-limit',`${today} gentle runs on ${day}, the limit is ${chain.maxRunsPerDay}`);
 if(!/^today /.test(budget.reason))return no('usage-unreadable',`usage unreadable (${budget.reason}): a run would not be sized by the budget`);
 if(budget.pages<chain.minPages)return no('small-budget',`the next run would get ${budget.pages} pages, under ${chain.minPages} (${budget.reason})`);
 return {dispatch:true,rule:'dispatch',reason:`the next run gets ${budget.pages} pages (${budget.reason})`};
}

// How long to wait before deciding: until intervalMinutes after the run before was created.
export const waitMs=(after,now,chain=CHAIN)=>Math.max(0,Date.parse(after.created_at)+chain.intervalMinutes*60_000-now);

export async function chainAfter({env=process.env,fetch=globalThis.fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>Date.now(),budget=budgetToday,log=console.log}={}){
 const repo=env.GITHUB_REPOSITORY,token=env.GH_TOKEN,id=env.AFTER_RUN;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!token)throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
 if(!/^\d+$/.test(id??''))throw new Error('AFTER_RUN must be a run id');
 const api=env.GITHUB_API_URL||'https://api.github.com';
 const gh=async(path,init={})=>{
  const response=await fetch(api+'/repos/'+repo+path,{...init,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...init.headers}});
  if(!response.ok)throw new Error(`GitHub API ${init.method??'GET'} ${path.split('?')[0]} returned ${response.status}`);
  return response.status===204?null:response.json();
 };
 const after=await gh('/actions/runs/'+id);
 const wait=waitMs(after,clock());
 log(`Run ${after.id} was created at ${after.created_at}; waiting ${Math.round(wait/60_000)} minutes.`);
 await sleep(wait);
 const now=clock(),since=new Date(Math.min(Date.parse(after.created_at),Date.parse(new Date(now).toISOString().slice(0,10)))).toISOString().replace(/\.\d{3}Z$/,'Z');
 const list=await gh(`/actions/workflows/${WORKFLOW}/runs?created=${encodeURIComponent('>='+since)}&per_page=100`);
 const runs=list.workflow_runs??[];
 if((list.total_count??0)>runs.length)throw new Error(`${list.total_count} ${WORKFLOW} runs since ${since}, more than one page`);
 const decision=nextRun({after,runs,budget:await budget({env,now:new Date(now)}),now});
 if(decision.dispatch)await gh(`/actions/workflows/${WORKFLOW}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{mode:'gentle'}})});
 log((decision.dispatch?'Dispatched the next gentle run: ':'Not dispatching ('+decision.rule+'): ')+decision.reason);
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,`- 이어 부르기(run ${after.id} 뒤): ${decision.dispatch?'다음 gentle 실행을 불렀다':'부르지 않았다('+decision.rule+')'} — ${decision.reason}\n`);
 return decision;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await chainAfter().then(()=>0,error=>{console.error('Collection chain failed: '+error.message);return 1});
