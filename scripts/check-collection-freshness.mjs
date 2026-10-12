// H01 step 6 watch: fail when the last successful gentle collection is older
// than 12 hours. Reads this repository's collect.yml runs with the workflow's
// read-only token. Passes before the switch (publicOrigin null) and while no
// collection has succeeded yet. Logs times and counts only.
import {readFileSync} from 'node:fs';

export const WORKFLOW='collect.yml';
export const GENTLE_TITLE='Yukemuri collection (gentle)';
export const LIMIT_HOURS=12;

// runs: GitHub workflow runs (newest first or any order). A run counts only
// when it concluded success and was a gentle run (run-name carries the mode),
// so a check-access run or a cancelled, failed or still queued run never hides
// a stale catalogue.
export function freshness(runs,now,limitHours=LIMIT_HOURS){
 const done=runs.filter(r=>r.conclusion==='success'&&r.status==='completed'&&r.display_title===GENTLE_TITLE)
  .map(r=>Date.parse(r.updated_at)).filter(Number.isFinite).sort((a,b)=>b-a);
 if(!done.length)return {state:'none',ok:true};
 const ageHours=(now-done[0])/3600000;
 return {state:ageHours>limitHours?'stale':'fresh',ok:ageHours<=limitHours,lastSuccess:new Date(done[0]).toISOString(),ageHours:Math.round(ageHours*10)/10};
}

async function main(){
 const config=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
 if(config.publicOrigin===null){console.log('Skipped: publicOrigin is null, collection has not moved to this repository yet.');return 0}
 const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!token)throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
 const api=process.env.GITHUB_API_URL||'https://api.github.com';
 const response=await fetch(`${api}/repos/${repo}/actions/workflows/${WORKFLOW}/runs?status=success&per_page=100`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
 if(!response.ok)throw new Error('GitHub API returned '+response.status);
 const result=freshness((await response.json()).workflow_runs??[],Date.now());
 console.log(JSON.stringify(result));
 if(result.state==='none')console.log('No successful gentle collection yet; passing until the first one.');
 if(!result.ok)console.log(`::error::Last successful collection is ${result.ageHours} hours old (limit ${LIMIT_HOURS}). Check the runner schedule (YUKEMURI_ENABLED) and recent collect.yml runs.`);
 return result.ok?0:1;
}

if(import.meta.url===`file://${process.argv[1]}`)process.exitCode=await main().catch(error=>{console.error('Freshness check failed: '+error.message);return 1});
