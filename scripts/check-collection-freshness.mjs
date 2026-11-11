// H01 step 6 watch: fail when the last successful gentle collection is older
// than 12 hours, or when the last daily check run (usage.yml, dispatched by the
// runner's daily check, O03) is older than 30 hours (V02-10). Reads this
// repository's collect.yml and usage.yml runs with the workflow's read-only
// token. Passes before the switch (publicOrigin null) and while no such run
// exists yet. Logs times and counts only.
import {readFileSync} from 'node:fs';

export const WORKFLOW='collect.yml';
export const GENTLE_TITLE='Yukemuri collection (gentle)';
export const LIMIT_HOURS=12;
export const CHECK_WORKFLOW='usage.yml';
export const CHECK_TITLE='Cloudflare usage (daily check)';
// The runner calls the daily check at 01:41 UTC (outside scheduler) and its
// schedule spare comes 5-7.5 hours late on a day the outside call is missed, so
// a healthy gap is 24 hours, at most about 31.5 (O04 record). The watch's own
// cron is late too: 11-01..11-10 it started 1 hour late at the median, up to
// 6, two or three times a day. A stopped runner is then caught some 35-45
// hours after its last check; a watch run that starts between 07:41 UTC and a
// late spare on a missed day fails early, which is worth knowing anyway (V02-19).
export const CHECK_LIMIT_HOURS=30;

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

// runs: usage.yml runs. Any run of the daily check counts, whatever its result:
// a failed check mails on its own, this only catches a check that never ran
// (the runner's private Actions stopped). Control runs carry another title.
export function checkFreshness(runs,now,limitHours=CHECK_LIMIT_HOURS){
 const made=runs.filter(r=>r.display_title===CHECK_TITLE).map(r=>Date.parse(r.created_at)).filter(Number.isFinite).sort((a,b)=>b-a);
 if(!made.length)return {state:'none',ok:true};
 const ageHours=(now-made[0])/3600000;
 return {state:ageHours>limitHours?'stale':'fresh',ok:ageHours<=limitHours,lastRun:new Date(made[0]).toISOString(),ageHours:Math.round(ageHours*10)/10};
}

async function main(){
 const config=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
 if(config.publicOrigin===null){console.log('Skipped: publicOrigin is null, collection has not moved to this repository yet.');return 0}
 const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!token)throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
 const api=process.env.GITHUB_API_URL||'https://api.github.com';
 const get=async query=>{
  const response=await fetch(`${api}/repos/${repo}/actions/workflows/${query}`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw new Error('GitHub API returned '+response.status);
  return (await response.json()).workflow_runs??[];
 };
 const result=freshness(await get(`${WORKFLOW}/runs?status=success&per_page=100`),Date.now());
 console.log(JSON.stringify(result));
 if(result.state==='none')console.log('No successful gentle collection yet; passing until the first one.');
 if(!result.ok)console.log(`::error::Last successful collection is ${result.ageHours} hours old (limit ${LIMIT_HOURS}). Check the runner schedule (YUKEMURI_ENABLED) and recent collect.yml runs.`);
 const check=checkFreshness(await get(`${CHECK_WORKFLOW}/runs?per_page=100`),Date.now());
 console.log(JSON.stringify({dailyCheck:check}));
 if(check.state==='none')console.log('No daily check run yet; passing until the first one.');
 if(!check.ok)console.log(`::error::Last daily check run (${CHECK_WORKFLOW}) was made at ${check.lastRun}, ${check.ageHours} hours ago (limit ${CHECK_LIMIT_HOURS}). The runner's daily check and backups may have stopped: check the runner's Actions runs and minutes.`);
 return result.ok&&check.ok?0:1;
}

if(import.meta.url===`file://${process.argv[1]}`)process.exitCode=await main().catch(error=>{console.error('Freshness check failed: '+error.message);return 1});
