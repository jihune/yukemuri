// O02: one UTC day of gentle runs made by the public spare (collect-spare.yml), the chain
// (collect.yml's chain job + collect-chain.yml, the real nextRun) and the runner's own hourly dispatch
// (the cron that collect-spare.yml replaces). Every run asks the real overlapNow, as collect.yml's
// first gentle step does, against a stand-in GitHub API. A run lasts 25 minutes.
// Run: node docs/evidence/o02-20261109/day-sim.mjs   (scripts/check-collection-chain.mjs holds the
// same simulation as a check; this prints the counts the check only asserts on.)
import {nextRun,overlapNow} from '../../../scripts/collection-chain.mjs';
import {pagesFor} from '../../../scripts/collection-budget.mjs';
import {GENTLE_TITLE} from '../../../scripts/check-collection-freshness.mjs';

const MIN=60_000,day=Date.parse('2026-10-21T00:00:00Z'),iso=t=>new Date(t).toISOString().replace(/\.000Z$/,'Z');
const budget=pagesFor({rowsRead:1_500_000,rowsWritten:20_000});
const orders=a=>a.length<2?[a]:a.flatMap((x,i)=>orders([...a.slice(0,i),...a.slice(i+1)]).map(p=>[x,...p]));

async function simulate(order,late){
 const runs=[],events=[];let nextId=1000;
 const view=t=>runs.filter(r=>r.created<=t).map(r=>({id:r.id,display_title:GENTLE_TITLE,path:'.github/workflows/collect.yml',head_branch:'main',created_at:iso(r.created),status:r.end>t?'in_progress':'completed',conclusion:r.end>t?null:'success',updated_at:iso(r.end>t?t:r.end)}));
 for(let h=0;h<24;h++)for(const kind of order.filter(k=>k!=='chain'))events.push({t:day+(h*60+37+(late[kind]?.(h)??0))*MIN,kind});
 const make=async(t,by)=>{
  const r={id:nextId++,created:t,end:t+25*MIN,by};runs.push(r);
  const me=view(t).find(q=>q.id===r.id),env={GITHUB_REPOSITORY:'jihune/yukemuri',GH_TOKEN:'t',GITHUB_RUN_ID:String(r.id),GITHUB_API_URL:'https://api.example.test'};
  const fetch=async url=>Response.json(new URL(url).pathname.endsWith('/runs/'+r.id)?me:{total_count:view(t).length,workflow_runs:view(t)});
  r.collects=(await overlapNow({env,fetch}))==='';
  if(r.collects)events.push({t:t+60*MIN,kind:'chain',after:r.id});
 };
 for(;;){
  const todo=events.filter(e=>!e.done&&e.t<day+24*60*MIN).sort((a,b)=>a.t-b.t||order.indexOf(a.kind)-order.indexOf(b.kind));
  if(!todo.length)return runs;
  const e=todo[0];e.done=true;
  if(e.kind!=='chain'){await make(e.t,e.kind);continue}
  const v=view(e.t);
  if(nextRun({after:v.find(q=>q.id===e.after),runs:v,budget,now:e.t}).dispatch)await make(e.t,'chain');
 }
}

const configs={'before O02 (runner + chain)':['runner','chain'],'O02 (spare + chain)':['spare','chain'],'both crons (spare + runner + chain)':['spare','runner','chain']};
// Same lateness for the spare and the runner, so the first two rows compare like with like.
const days={'same minute':{},'late 0-28 minutes, uneven':{spare:h=>(h*11)%29,runner:h=>(h*11)%29}};
console.log(['day','dispatchers','tie order at the same minute','runs','collect','repeat (0 pages)','two collect at once','shortest gap between collecting runs (min)'].join('\t'));
let overlaps=0;
for(const [when,late] of Object.entries(days))for(const [name,members] of Object.entries(configs))for(const order of orders(members)){
 const runs=await simulate(order,late),c=runs.filter(r=>r.collects).sort((a,b)=>a.created-b.created);
 let two=0,gap=Infinity;
 for(let i=1;i<c.length;i++){if(c[i].created<c[i-1].end)two++;gap=Math.min(gap,(c[i].created-c[i-1].created)/MIN)}
 overlaps+=two;
 console.log([when,name,order.join(' > '),runs.length,c.length,runs.length-c.length,two,gap].join('\t'));
}
console.log(overlaps===0?'VERDICT PASS: no two runs collected at once in any case':`VERDICT FAIL: ${overlaps} overlaps`);
process.exitCode=overlaps===0?0:1;
