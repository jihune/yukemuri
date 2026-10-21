// O03 daily check, in place of the H01 step 7 daily read by Claude. For one UTC
// day (default yesterday) it fails when the account used 90% or more of a free
// daily limit (Worker requests, D1 rows read, D1 rows written), when this Worker
// answered with exceededResources (errors 1102/1027), or when a gentle collection
// of that day ran its collect job 26 minutes or more, did not succeed or has not
// finished, or took 0 pages while its budget line shows room left (C05: with an
// hourly runner a run after the day's D1 share is used takes 0 pages by design;
// a day whose runs all took 0 pages fails too). Usage or runs that cannot be read fail; they never
// read as zero. Each request stops after 30 s, so one half never blocks the other. The
// tables go to GITHUB_STEP_SUMMARY. usage.yml runs it with check: true; the runner
// repository dispatches that once a day and checks its own backups (its runs are
// private). control replaces one real value after reading, to show that the check
// fails on it. Logs carry numbers only: no token, no source address.
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {LIMITS,queryDay,report,UsageError,utcDays} from './cloudflare-usage.mjs';
import {GENTLE_TITLE,WORKFLOW} from './check-collection-freshness.mjs';

export const FAIL=0.9; // user, 10-19: the collection budget stays at 85%, leaving room for deploys
export const JOB_MINUTES=26; // timeout-minutes of the collect job in collect.yml
export const COLLECT_JOB='collect';
export const SNAPSHOT_JOB='snapshot / deploy'; // collect.yml job snapshot calling deploy.yml job deploy
export const BUDGET_STEP='##[group]Run node scripts/collection-budget.mjs';
export const COLLECTOR_STEP='Run the Python collector against the Worker';
export const CONTROLS=['none','over-90','exceeded','zero-pages','no-permission'];
export const TIMEOUT_MS=30_000; // each Cloudflare and GitHub request; a hang must not stop the other half
// no-permission sends this instead of the real token, so the real API refuses it.
export const CONTROL_TOKEN='o03-control-invalid-token';
export class CheckError extends Error {}

const ACCOUNT=/^[0-9a-f]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const num=n=>n.toLocaleString('en-US');
const share=(n,limit)=>(100*n/limit).toFixed(1)+'%';

// date: the day to check; empty means yesterday in UTC.
export function checkDate(date,now=new Date()){
 const day=(date??'').trim()||new Date(now.getTime()-86_400_000).toISOString().slice(0,10);
 return utcDays(day,1)[0];
}

export function usageFailures(day){
 const out=[];
 for(const [key,label,unit] of [['requests','Worker 요청','건'],['rowsRead','D1 읽기','행'],['rowsWritten','D1 쓰기','행']]){
  const n=day.account[key];
  if(n===null)out.push(`계정 ${label}: 기록 없음(판단할 수 없다)`);
  else if(n>=FAIL*LIMITS[key])out.push(`계정 ${label} ${num(n)}${unit} = 무료 한도의 ${share(n,LIMITS[key])}(90% 이상)`);
 }
 if(day.exceeded>=1)out.push(`exceededResources ${num(day.exceeded)}건(1102·1027)`);
 return out;
}

// One collect job log: the page budget the run gave itself and what the collector reported.
export function parseLog(text){
 const lines=text.split(/\r?\n/).map(l=>l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /,''));
 let pages=null,reason=null;
 const start=lines.findIndex(l=>l.startsWith(BUDGET_STEP));
 if(start>=0)for(const line of lines.slice(start+1)){
  if(line.startsWith('##[group]Run '))break;
  const m=/^pages=(\d+)$/.exec(line);
  if(m&&pages===null)pages=Number(m[1]);
  else if(line.startsWith('reason=')&&reason===null)reason=line.slice(7);
 }
 const counts={};
 let processed=null,pending=null,completed=null;
 for(const line of lines){
  if(!line.startsWith('{'))continue;
  let o;
  try{o=JSON.parse(line)}catch{continue}
  if(typeof o?.url==='string'&&typeof o.status==='string'&&!o.sourceDiagnostic)counts[o.status]=(counts[o.status]??0)+1;
  if(Number.isInteger(o?.processed)){processed=o.processed;if(o.coverage){pending=o.coverage.pending??null;completed=o.coverage.completedDetailPages??null}}
  // C07 plan 2: the collector no longer counts at the end of its run; the snapshot deploy stores the count (record-coverage.mjs).
  if(o?.recordedCoverage){pending=o.recordedCoverage.pending??null;completed=o.recordedCoverage.completedDetailPages??null}
 }
 return {pages,reason,processed,counts,pending,completed};
}

// The pages the run's budget allowed by writes and by reads, from its reason= line
// (collection-budget.mjs), or null when the line is missing or of another kind.
export function budgetLeft(reason){
 const m=/writes allow (-?\d+) pages, reads (-?\d+)/.exec(reason??'');
 return m?{writes:Number(m[1]),reads:Number(m[2])}:null;
}

export function runFailures(run){
 // The next day's check looks at another day, so a run still open now is never judged later (PR #131 Codex review).
 if(run.status!=='completed')return [`끝나지 않음(${run.status}): 다음 점검은 이 실행을 다시 보지 않는다`];
 const out=[];
 if(run.conclusion!=='success')out.push(`결과 ${run.conclusion}`);
 if(run.jobSeconds!==null&&run.jobSeconds>=JOB_MINUTES*60)out.push(`collect job ${Math.floor(run.jobSeconds/60)}분(${JOB_MINUTES}분 이상)`);
 if(run.pages===null)out.push('로그에서 pages= 줄을 읽지 못함');
 else if(run.pages===0){
  const left=budgetLeft(run.reason);
  if(!left)out.push('0쪽 실행인데 reason=에서 남은 예산을 읽지 못함');
  else if(left.writes>0&&left.reads>0)out.push(`0쪽 실행인데 그날 예산이 남아 있었다(writes allow ${left.writes}, reads ${left.reads})`);
 }
 return out;
}

// A day on which every gentle run took 0 pages collected nothing, whatever each run's budget said.
export function dayFailures(runs){
 return runs.length&&runs.every(r=>r.pages===0)?[`그날 gentle 실행 ${runs.length}회가 모두 0쪽이다(수집 없음)`]:[];
}

const seconds=(start,end)=>{const s=Date.parse(start),e=Date.parse(end);return Number.isFinite(s)&&Number.isFinite(e)?Math.round((e-s)/1000):null};

async function gh({fetch,token,api,timeout},path,text=false){
 const response=await fetch(api+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw new CheckError(`GitHub API ${response.status} (${path.split('?')[0]})`);
 return text?response.text():response.json();
}

// Gentle runs of collect.yml created on date (UTC), oldest first, each with its job times and log values.
export async function gentleRuns({fetch=globalThis.fetch,token,api='https://api.github.com',repo,date,timeout=TIMEOUT_MS}){
 const ctx={fetch,token,api,timeout};
 const list=await gh(ctx,`/repos/${repo}/actions/workflows/${WORKFLOW}/runs?created=${encodeURIComponent(`${date}T00:00:00Z..${date}T23:59:59Z`)}&per_page=100`);
 const all=list.workflow_runs??[];
 if((list.total_count??0)>all.length)throw new CheckError(`collect.yml runs on ${date}: ${list.total_count}, more than one page`);
 const runs=all.filter(r=>r.display_title===GENTLE_TITLE&&String(r.created_at).startsWith(date)).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
 const out=[];
 for(const r of runs){
  const jobs=(await gh(ctx,`/repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`)).jobs??[];
  const job=jobs.find(j=>j.name===COLLECT_JOB)??null,snapshot=jobs.find(j=>j.name===SNAPSHOT_JOB)??null;
  const step=job?.steps?.find(s=>s.name===COLLECTOR_STEP)??null;
  const log=job?.status==='completed'?parseLog(await gh(ctx,`/repos/${repo}/actions/jobs/${job.id}/logs`,true)):parseLog('');
  // The pages pending and done after the run: from the collector's last line before C07 plan 2, else from the snapshot deploy.
  if(log.processed!==null&&log.pending===null&&snapshot?.status==='completed'&&snapshot.conclusion!=='skipped'){
   const stored=parseLog(await gh(ctx,`/repos/${repo}/actions/jobs/${snapshot.id}/logs`,true));
   log.pending=stored.pending;log.completed=stored.completed;
  }
  out.push({id:r.id,createdAt:r.created_at,status:r.status,conclusion:r.conclusion,
   jobSeconds:seconds(job?.started_at,job?.completed_at),stepSeconds:seconds(step?.started_at,step?.completed_at),...log});
 }
 return out;
}

const clock=iso=>iso?iso.slice(11,16)+'Z':'-';
const span=s=>s===null?'-':`${Math.floor(s/60)}분 ${s%60}초`;
export function runTable(runs){
 const lines=['## gentle 수집(`collect.yml`)','',
  '| app run | 만든 시각 | 결과 | 쪽수(`pages=`) | ‘Size the run’ `reason=` | 수집 단계 | collect job | 처리 | 쪽 상태 | 끝난 뒤 대기·상세 완료 | 판정 |',
  '|---|---|---|---:|---|---:|---:|---:|---|---|---|'];
 for(const r of runs){
  const states=Object.entries(r.counts).map(([s,n])=>`${s} ${n}`).join(', ')||'-';
  const failures=runFailures(r);
  lines.push(`| ${r.id} | ${clock(r.createdAt)} | ${r.status==='completed'?r.conclusion:r.status} | ${r.pages??'-'} | ${(r.reason??'-').replace(/\|/g,'/')} | ${span(r.stepSeconds)} | ${span(r.jobSeconds)} `
   +`| ${r.processed??'-'} | ${states} | ${r.pending===null?'-':num(r.pending)}·${r.completed===null?'-':num(r.completed)} | ${failures.length?'**실패**':r.pages===0?'통과(예산 소진)':'통과'} |`);
 }
 lines.push('',`- 그날(UTC) 만든 gentle 실행 ${runs.length}회. 실패 조건: collect job ${JOB_MINUTES}분 이상, 성공하지 않은 실행, 끝나지 않은 실행(다음 점검은 다른 날을 본다), 끝난 실행에서 \`pages=\` 줄 없음, 예산이 남았는데(\`writes allow\`·\`reads\`가 모두 1 이상) 또는 남은 예산을 읽지 못했는데 0쪽인 실행, 실행이 모두 0쪽인 날. 그날 D1 몫을 다 써서 0쪽인 실행은 정상이다. 실행이 없는 날은 \`collect-watch.yml\`의 12시간 감시가 알린다.`);
 return lines;
}

export async function dailyCheck({env=process.env,fetch=globalThis.fetch,now=new Date(),config='cloudflare-deploy.json',timeout=TIMEOUT_MS}={}){
 const control=(env.CHECK_CONTROL||'none').trim();
 if(!CONTROLS.includes(control))throw new CheckError('control must be one of '+CONTROLS.join(', '));
 const date=checkDate(env.CHECK_DATE,now);
 const details=[],failures=[];
 // Cloudflare usage of that day.
 try{
  const deploy=JSON.parse(readFileSync(config,'utf8'));
  const token=control==='no-permission'?CONTROL_TOKEN:env.CLOUDFLARE_API_TOKEN??'',accountId=(env.CLOUDFLARE_ACCOUNT_ID??'').trim();
  if(!token)throw new UsageError('CLOUDFLARE_API_TOKEN is missing');
  if(!ACCOUNT.test(accountId))throw new UsageError('CLOUDFLARE_ACCOUNT_ID must be a 32-character account id');
  if(!UUID.test(deploy.databaseId??''))throw new UsageError('cloudflare-deploy.json has no databaseId');
  const day=await queryDay({fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(timeout)}),token,accountId,scriptName:deploy.workerName,databaseId:deploy.databaseId,date});
  if(control==='over-90')day.account.rowsWritten=Math.max(day.account.rowsWritten??0,FAIL*LIMITS.rowsWritten);
  if(control==='exceeded')day.exceeded=Math.max(day.exceeded,1);
  details.push(...report([day]).lines,'');
  failures.push(...usageFailures(day));
 }catch(error){
  const message=error instanceof UsageError?error.message:'Usage query failed ('+error.constructor.name+')';
  details.push('## Cloudflare 사용량','','**읽지 못함**: '+message,'');
  failures.push('Cloudflare 사용량을 읽지 못함(0으로 보지 않는다): '+message.slice(0,300));
 }
 // Gentle collections created that day.
 try{
  const repo=env.GITHUB_REPOSITORY??'',token=env.GH_TOKEN??'';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!token)throw new CheckError('GITHUB_REPOSITORY and GH_TOKEN are required');
  const runs=await gentleRuns({fetch,token,api:env.GITHUB_API_URL||'https://api.github.com',repo,date,timeout});
  if(control==='zero-pages'){
   if(runs.length)runs[0]={...runs[0],pages:0};
   else failures.push('대조 입력 zero-pages를 적용하지 못함: 그날 gentle 실행이 없다');
  }
  details.push(...runTable(runs));
  for(const r of runs)for(const f of runFailures(r))failures.push(`gentle run ${r.id}: ${f}`);
  failures.push(...dayFailures(runs));
 }catch(error){
  const message=error instanceof CheckError?error.message:'GitHub query failed ('+error.constructor.name+')';
  details.push('## gentle 수집(`collect.yml`)','','**읽지 못함**: '+message);
  failures.push('gentle 수집을 읽지 못함: '+message);
 }
 const lines=[`# 매일 점검(O03) — ${date}(UTC)`,''];
 if(control!=='none')lines.push(`> 대조 입력 \`${control}\`: 실제 값 하나를 일부러 바꿔 점검이 실패하는지 본다. 아래 표의 해당 값은 실제 값이 아니다.`,'');
 lines.push(failures.length?`**실패 ${failures.length}건**`:'**통과**: 90% 이상인 한도와 exceededResources가 없다. gentle 실행은 실패 조건(예산이 남았는데 0쪽, 그날 모두 0쪽, 26분 이상, 성공하지 않음, 끝나지 않음)에 들지 않는다.','');
 for(const f of failures)lines.push('- 실패: '+f);
 if(failures.length)lines.push('');
 lines.push(...details);
 return {date,control,failures,lines};
}

async function main(){
 const summary=process.env.GITHUB_STEP_SUMMARY;
 const say=line=>{console.log(line);if(summary)appendFileSync(summary,line+'\n')};
 try{
  const result=await dailyCheck();
  for(const line of result.lines)say(line);
  for(const f of result.failures)console.log('::error::'+f.slice(0,500));
  process.exitCode=result.failures.length?1:0;
 }catch(error){
  const message=error instanceof CheckError||error instanceof UsageError?error.message:'Daily check failed ('+error.constructor.name+')';
  say('**실패**: '+message);console.log('::error::'+message.slice(0,500));process.exitCode=1;
 }
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)await main();
