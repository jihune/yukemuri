// V01-5: a manual run (workflow_dispatch) can pick any branch, so the jobs that
// hold the Cloudflare token, the crawl key or the D1 migrations check the ref
// themselves and run only on main, the reviewed code. This reads those job
// conditions out of a workflow file for the checks of deploy.yml, d1-setup.yml,
// rollback.yml and collect.yml.
import assert from 'node:assert/strict';

export const MAIN_ONLY="github.ref == 'refs/heads/main'";
const PREFIX='V01-5 main-only guard';

// [start,end) of one job in the file text: from its key under jobs: to the next job.
function jobRange(text,job){
 const jobs=text.indexOf('\njobs:\n');
 const start=jobs<0?-1:text.indexOf(`\n  ${job}:\n`,jobs);
 if(start<0)return null;
 const next=text.slice(start+1).search(/\n  [\w-]+:\n/);
 return [start+1,next<0?text.length:start+1+next+1];
}
// What is wrong with the job-level if: of each job; an empty list when every job runs on main only.
export function mainOnlyProblems(text,jobs){
 const out=[];
 for(const job of jobs){
  const range=jobRange(text,job);
  if(!range){out.push(`${job}: no such job`);continue}
  const condition=text.slice(...range).match(/^    if: (.+)$/m)?.[1];
  if(condition===undefined)out.push(`${job}: no job-level if`);
  else if(condition.includes('||')||!condition.split(' && ').includes(MAIN_ONLY))out.push(`${job}: the if is not ${MAIN_ONLY} AND the other conditions (${condition})`);
 }
 return out;
}
// The real file passes, and a copy of it fails for each job once the guard is cut out, pointed at another
// branch, or OR-ed with something else (a copy that is not reported is a check that would not notice).
export function assertMainOnly(file,text,jobs){
 const problems=mainOnlyProblems(text,jobs);
 assert.equal(problems.length,0,`${PREFIX}: ${file}: ${problems.join('; ')}`);
 let controls=0;
 for(const job of jobs){
  const [start,end]=jobRange(text,job),body=text.slice(start,end),line=body.match(/^    if: (.+)\n/m)[0];
  const alone=`    if: ${MAIN_ONLY}\n`;
  for(const [label,changed] of [
   ['cut out',line===alone?'':line.replace(`${MAIN_ONLY} && `,'').replace(` && ${MAIN_ONLY}`,'')],
   ['another branch',line.replace('refs/heads/main','refs/heads/dev')],
   ['or true',line.replace(/\n$/,' || true\n')]]){
   const copy=text.slice(0,start)+body.replace(line,changed)+text.slice(end);
   assert.notEqual(copy,text,`control ${label} on ${job} changed nothing`);
   assert(mainOnlyProblems(copy,[job]).some(p=>p.startsWith(job+':')),`${PREFIX} control: ${file} ${job} "${label}" is not reported`);controls++;
  }
 }
 return controls;
}
