// Cloudflare usage per UTC day (H01 steps 5 and 7): Worker CPU time (p50, p99),
// invocation statuses (exceededResources = errors 1102/1027) and D1 rows read and
// written, from the GraphQL Analytics API. Read only. The API token needs the
// Account > Account Analytics > Read permission; without it the API answers with
// an authorization error, which this script reports as a failure and never as zero.
import {readFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const ENDPOINT='https://api.cloudflare.com/client/v4/graphql';
export const LIMITS={rowsRead:5_000_000,rowsWritten:100_000,requests:100_000}; // Workers Free + D1 Free, per UTC day
export const WARN=0.7; // step 5 pass condition: under 70% of the daily limit
export const PERMISSION_HELP='API 토큰에 Account > Account Analytics > Read 권한이 없다(또는 토큰·계정이 맞지 않는다). '
 +'사용자 조치: Cloudflare 대시보드 → My Profile → API Tokens → 앱 레포 Secret CLOUDFLARE_API_TOKEN의 토큰 → Edit → '
 +'Permissions에 Account / Account Analytics / Read를 더하고 저장한다(토큰 값은 바뀌지 않는다). 이 오류는 사용량 0이 아니다.';
export class UsageError extends Error {}

export const QUERY=`query YukemuriUsage($accountTag: string!, $scriptName: string!, $databaseId: string!, $start: string!, $end: string!, $date: Date!) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      total: workersInvocationsAdaptive(limit: 10, filter: {scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end}) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
        dimensions { scriptName }
      }
      byStatus: workersInvocationsAdaptive(limit: 100, filter: {scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end}) {
        sum { requests }
        dimensions { status }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 10, filter: {databaseId: $databaseId, date_geq: $date, date_leq: $date}) {
        sum { rowsRead rowsWritten readQueries writeQueries }
        dimensions { date databaseId }
      }
    }
  }
}`;

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACCOUNT=/^[0-9a-f]{32}$/;

export function utcDays(end,count){
 if(!DATE.test(end)||Number.isNaN(Date.parse(end+'T00:00:00Z')))throw new UsageError('date must be YYYY-MM-DD (UTC)');
 if(!Number.isInteger(count)||count<1||count>31)throw new UsageError('days must be 1-31 (analytics keep 31 days)');
 const last=Date.parse(end+'T00:00:00Z');
 return Array.from({length:count},(_,i)=>new Date(last-(count-1-i)*86_400_000).toISOString().slice(0,10));
}

function authError(text){return /unauthori[sz]ed|not authorized|does not have access|permission|forbidden|authentication/i.test(text)}

export async function queryDay({fetch,token,accountId,scriptName,databaseId,date}){
 const response=await fetch(ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({query:QUERY,variables:{accountTag:accountId,scriptName,databaseId,date,start:date+'T00:00:00Z',end:date+'T23:59:59Z'}})});
 let body=null;
 try{body=await response.json()}catch{body=null}
 const messages=(body?.errors??[]).map(e=>String(e?.message??'')).filter(Boolean);
 if(response.status===401||response.status===403||messages.some(authError))throw new UsageError(PERMISSION_HELP+` (HTTP ${response.status})`);
 if(!response.ok||messages.length)throw new UsageError(`GraphQL ${response.status}: ${(messages[0]??'no error message').slice(0,200)}`);
 const accounts=body?.data?.viewer?.accounts;
 // An account the token cannot see comes back as an empty list, not as zero usage.
 if(!Array.isArray(accounts)||accounts.length!==1)throw new UsageError(PERMISSION_HELP+' (accounts 결과가 비어 있음)');
 const [a]=accounts;
 for(const key of ['total','byStatus','d1'])if(!Array.isArray(a[key]))throw new UsageError('GraphQL response lacks '+key);
 const total=a.total[0]??null,d1=a.d1[0]??null;
 const statuses={};
 for(const row of a.byStatus)statuses[row.dimensions?.status??'unknown']=(statuses[row.dimensions?.status??'unknown']??0)+(row.sum?.requests??0);
 return {date,
  worker:total?{requests:total.sum.requests,errors:total.sum.errors,subrequests:total.sum.subrequests,
   cpuP50Ms:total.quantiles.cpuTimeP50/1000,cpuP99Ms:total.quantiles.cpuTimeP99/1000}:null,
  statuses,exceeded:Object.entries(statuses).filter(([s])=>/^exceeded/i.test(s)).reduce((n,[,v])=>n+v,0),
  d1:d1?{...d1.sum}:null};
}

const num=n=>n.toLocaleString('en-US');
const pct=(n,limit)=>`${num(n)} (${(100*n/limit).toFixed(1)}%)`;
export function report(days){
 const lines=['## Cloudflare 사용량(UTC 날짜별)','',
  '| UTC 날짜 | Worker 요청 | 오류 | CPU p50 ms | CPU p99 ms | exceededResources(1102·1027) | 그 밖의 상태 | D1 rowsRead | D1 rowsWritten | 70% 초과 |',
  '|---|---:|---:|---:|---:|---:|---|---:|---:|---|'];
 const warnings=[];
 for(const d of days){
  const w=d.worker,db=d.d1;
  const others=Object.entries(d.statuses).filter(([s])=>s!=='success'&&!/^exceeded/i.test(s)).map(([s,n])=>`${s} ${n}`).join(', ')||'-';
  const over=[];
  if(w&&w.requests>=WARN*LIMITS.requests)over.push('요청');
  if(db&&db.rowsRead>=WARN*LIMITS.rowsRead)over.push('읽기');
  if(db&&db.rowsWritten>=WARN*LIMITS.rowsWritten)over.push('쓰기');
  if(over.length)warnings.push(`${d.date}: ${over.join('·')}가 무료 한도의 70% 이상`);
  if(d.exceeded)warnings.push(`${d.date}: exceededResources ${d.exceeded}건(1102·1027, CPU 초과가 가장 흔한 원인)`);
  lines.push(`| ${d.date} | ${w?pct(w.requests,LIMITS.requests):'기록 없음'} | ${w?num(w.errors):'-'} | ${w?w.cpuP50Ms.toFixed(2):'-'} | ${w?w.cpuP99Ms.toFixed(2):'-'} `
   +`| ${w?num(d.exceeded):'-'} | ${others} | ${db?pct(db.rowsRead,LIMITS.rowsRead):'기록 없음'} | ${db?pct(db.rowsWritten,LIMITS.rowsWritten):'기록 없음'} | ${over.join('·')||'-'} |`);
 }
 lines.push('','- 한도: Workers Free 요청 10만/일, D1 Free 읽기 500만 행·쓰기 10만 행/일(00:00 UTC 초기화). ‘기록 없음’은 권한이 있는 조회에서 그날 행이 없다는 뜻이다. 권한이 없으면 이 표를 쓰지 않고 실패한다.',
  '- CPU 분위수는 GraphQL `workersInvocationsAdaptive`의 표본(reservoir sampling) 값이고 마이크로초를 ms로 바꿨다. 오늘 날짜는 진행 중인 값이다.');
 for(const w of warnings)lines.push('- 주의: '+w);
 return {lines,warnings};
}

async function main(){
 const summary=process.env.GITHUB_STEP_SUMMARY;
 const say=line=>{console.log(line);if(summary)appendFileSync(summary,line+'\n')};
 try{
  const deploy=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
  const token=process.env.CLOUDFLARE_API_TOKEN??'',accountId=(process.env.CLOUDFLARE_ACCOUNT_ID??'').trim();
  if(!token)throw new UsageError('CLOUDFLARE_API_TOKEN is missing');
  if(!ACCOUNT.test(accountId))throw new UsageError('CLOUDFLARE_ACCOUNT_ID must be a 32-character account id');
  if(!UUID.test(deploy.databaseId??''))throw new UsageError('cloudflare-deploy.json has no databaseId');
  const end=(process.env.USAGE_DATE||new Date().toISOString().slice(0,10)).trim();
  const days=utcDays(end,Number(process.env.USAGE_DAYS||'2'));
  const results=[];
  for(const date of days)results.push(await queryDay({fetch:globalThis.fetch,token,accountId,scriptName:deploy.workerName,databaseId:deploy.databaseId,date}));
  for(const line of report(results).lines)say(line);
 }catch(error){
  const message=error instanceof UsageError?error.message:'Usage query failed ('+error.constructor.name+')';
  say('**실패**: '+message);console.log('::error::'+message.slice(0,500));process.exitCode=1;
 }
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)await main();
