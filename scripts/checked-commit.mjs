// Did this commit already pass the full checks on a main push? deploy.yml asks
// before a snapshot deploy that the collection workflow calls (after_collection):
// that run deploys the commit the collection was dispatched at, which a main
// push already checked with cloud-check.py --full (Cloud app checks). Then
// building is enough; otherwise, or when the API cannot tell, the full checks
// run again. Prints GitHub step outputs; never fails.
// Not the push deploy: deploy.yml ends a push it leaves to lifecycle.yml as a
// successful skip without any check (L01). Cloud app checks runs on every main
// push deploy.yml runs on (same paths-ignore, less the evidence file).
export const CHECK_WORKFLOWS=['.github/workflows/web-checks.yml'];

// runs: GitHub workflow runs for the commit (any order).
export function checkedOnMain(runs,sha){
 const run=runs.find(r=>r.head_sha===sha&&r.event==='push'&&r.head_branch==='main'&&r.status==='completed'&&r.conclusion==='success'&&CHECK_WORKFLOWS.includes(r.path));
 return run?{checked:true,reason:`${run.path} run ${run.id} passed on this commit`}:{checked:false,reason:'no successful main push check for this commit'};
}

async function main(){
 const {GITHUB_REPOSITORY:repo,GITHUB_SHA:sha,GH_TOKEN:token}=process.env,api=process.env.GITHUB_API_URL||'https://api.github.com';
 let result;
 try{
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!/^[0-9a-f]{40}$/.test(sha??'')||!token)throw new Error('GITHUB_REPOSITORY, GITHUB_SHA and GH_TOKEN are required');
  const response=await fetch(`${api}/repos/${repo}/actions/runs?head_sha=${sha}&event=push&status=success&per_page=100`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw new Error('GitHub API returned '+response.status);
  result=checkedOnMain((await response.json()).workflow_runs??[],sha);
 }catch(error){result={checked:false,reason:'could not tell ('+error.message+')'}}
 console.log(`checked=${result.checked}`);console.log(`reason=${result.reason}`);
}

if(import.meta.url===`file://${process.argv[1]}`)await main();
