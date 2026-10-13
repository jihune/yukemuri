// Is a push deploy of this commit still waiting? lifecycle.yml asks after it has
// stored evidence and before it rebuilds the snapshot (L01). It holds the
// catalogue lock for its whole run, so a push deploy of the same commit that has
// not completed can only start after it, and that deploy's snapshot carries the
// evidence: then lifecycle.yml leaves the snapshot to it. One that completed ran
// before the evidence, and a push that changed only the evidence file has none
// (deploy.yml paths-ignore): then lifecycle.yml builds it. When the API cannot
// tell, it builds (a second snapshot costs reads; a missing one shows stale
// state until the next collection). Prints GitHub step outputs; never fails.
export const DEPLOY='.github/workflows/deploy.yml';

// runs: GitHub workflow runs (any order).
export function pushDeployPending(runs,sha){
 const run=runs.find(r=>r.head_sha===sha&&r.event==='push'&&r.head_branch==='main'&&r.path===DEPLOY&&r.status!=='completed');
 return run?{pending:true,reason:`push deploy run ${run.id} of this commit is ${run.status}; it builds the snapshot after this run`}:{pending:false,reason:'no push deploy of this commit is waiting'};
}

async function main(){
 const {GITHUB_REPOSITORY:repo,GITHUB_SHA:sha,GH_TOKEN:token}=process.env,api=process.env.GITHUB_API_URL||'https://api.github.com';
 let result;
 try{
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!/^[0-9a-f]{40}$/.test(sha??'')||!token)throw new Error('GITHUB_REPOSITORY, GITHUB_SHA and GH_TOKEN are required');
  const response=await fetch(`${api}/repos/${repo}/actions/workflows/deploy.yml/runs?head_sha=${sha}&event=push&per_page=100`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw new Error('GitHub API returned '+response.status);
  result=pushDeployPending((await response.json()).workflow_runs??[],sha);
 }catch(error){result={pending:false,reason:'could not tell ('+error.message+'); building the snapshot here'}}
 console.log(`deploy_pending=${result.pending}`);console.log(`reason=${result.reason.replace(/[\r\n]/g,' ')}`);
}

if(import.meta.url===`file://${process.argv[1]}`)await main();
