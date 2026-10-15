// cloudflare-usage.mjs and usage.yml against fake GraphQL responses: the query
// asks for the right Worker and D1, values become a per-day report, and a missing
// Analytics permission (HTTP 403, GraphQL authorization errors, an empty account
// list) fails instead of reading as zero usage.
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {queryDay,report,utcDays,usageToday,UsageError,PERMISSION_HELP,ENDPOINT,QUERY} from './cloudflare-usage.mjs';

const text=readFileSync('.github/workflows/usage.yml','utf8');
assert.equal((text.match(/^on:\n((?:[ #].*\n)+)/m)[1].match(/^  \w+:/gm)??[]).join(),'  workflow_dispatch:','manual only');
assert.match(text,/^permissions:\n  contents: read\n/m);
assert.equal([...new Set(text.match(/secrets\.\w+/g))].sort().join(),'secrets.CLOUDFLARE_ACCOUNT_ID,secrets.CLOUDFLARE_API_TOKEN');
assert.match(text,/USAGE_DAYS: \$\{\{ inputs\.days \}\}\n {8}run: node scripts\/cloudflare-usage\.mjs\n/);

const TOKEN='usage-test-token',ACCOUNT='0123456789abcdef0123456789abcdef',DB='128a3c5b-8e5f-470a-a901-d899d396cae1';
const base={token:TOKEN,accountId:ACCOUNT,scriptName:'yukemuri',databaseId:DB,date:'2026-10-12'};
const ok=(account)=>[200,{data:{viewer:{accounts:[account]}},errors:null}];
const day={total:[{sum:{requests:72000,errors:3,subrequests:10},quantiles:{cpuTimeP50:4210,cpuTimeP99:9876.5},dimensions:{scriptName:'yukemuri'}}],
 byStatus:[{sum:{requests:71990},dimensions:{status:'success'}},{sum:{requests:7},dimensions:{status:'exceededResources'}},{sum:{requests:3},dimensions:{status:'scriptThrewException'}}],
 d1:[{sum:{rowsRead:3_600_000,rowsWritten:12_345,readQueries:900,writeQueries:40},dimensions:{date:'2026-10-12',databaseId:DB}}],
 // Another Worker and another D1 in the same account push the account totals over 70%.
 accountWorkers:[{sum:{requests:65000}},{sum:{requests:10000}}],
 accountD1:[{sum:{rowsRead:3_000_000,rowsWritten:60_000},dimensions:{date:'2026-10-12'}},{sum:{rowsRead:600_000,rowsWritten:12_345},dimensions:{date:'2026-10-12'}}]};
function fake([status,body],raw){
 const calls=[];
 return {calls,fetch:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return new Response(raw??JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}};
}
// Request: endpoint, bearer token, variables for the Worker, the D1 database and the UTC day.
let api=fake(ok(day));
const result=await queryDay({...base,fetch:api.fetch});
assert.equal(api.calls.length,1);assert.equal(api.calls[0].url,ENDPOINT);assert.equal(api.calls[0].init.method,'POST');
assert.equal(api.calls[0].init.headers.Authorization,'Bearer '+TOKEN);
assert.deepEqual(api.calls[0].body.variables,{accountTag:ACCOUNT,scriptName:'yukemuri',databaseId:DB,date:'2026-10-12',start:'2026-10-12T00:00:00Z',end:'2026-10-12T23:59:59Z'});
assert.equal(api.calls[0].body.query,QUERY);
assert.match(QUERY,/accountWorkers: workersInvocationsAdaptive\(limit: 10, filter: \{datetime_geq: \$start, datetime_leq: \$end\}\)/,'account Worker totals have no scriptName filter');
assert.match(QUERY,/accountD1: d1AnalyticsAdaptiveGroups\(limit: 10, filter: \{date_geq: \$date, date_leq: \$date\}\)/,'account D1 totals have no databaseId filter');
for(const field of ['workersInvocationsAdaptive','cpuTimeP50','cpuTimeP99','status','d1AnalyticsAdaptiveGroups','rowsRead','rowsWritten','scriptName: $scriptName','databaseId: $databaseId','date_geq: $date','date_leq: $date','datetime_geq: $start','datetime_leq: $end'])
 assert(QUERY.includes(field),field);
// Values: microseconds to ms, statuses, exceededResources, D1 sums.
assert.deepEqual(result,{date:'2026-10-12',worker:{requests:72000,errors:3,subrequests:10,cpuP50Ms:4.21,cpuP99Ms:9.8765},
 statuses:{success:71990,exceededResources:7,scriptThrewException:3},exceeded:7,d1:{rowsRead:3_600_000,rowsWritten:12_345,readQueries:900,writeQueries:40},
 account:{requests:75000,rowsRead:3_600_000,rowsWritten:72_345}});
let out=report([result]);
const row=out.lines.find(l=>l.startsWith('| 2026-10-12 |'));
assert.equal(row,'| 2026-10-12 | 75,000 (75.0%) | 72,000 | 3 | 4.21 | 9.88 | 7 | scriptThrewException 3 | 3,600,000 (72.0%) | 72,345 (72.3%) | 3,600,000 | 12,345 | 요청·읽기·쓰기 |');
assert(out.warnings.some(w=>/exceededResources 7건/.test(w))&&out.warnings.some(w=>/계정 요청·읽기·쓰기가 무료 한도의 70% 이상/.test(w)));
// This app alone is under 70% of writes; the account total decides the warning.
const quiet=report([{...result,account:{requests:100,rowsRead:100,rowsWritten:100}}]);
assert.equal(quiet.warnings.filter(w=>/70%/.test(w)).length,0,'percentages follow the account totals, not this app');
// A permitted query without rows says so; it is not printed as 0.
api=fake(ok({total:[],byStatus:[],d1:[],accountWorkers:[],accountD1:[]}));
const empty=await queryDay({...base,fetch:api.fetch});
assert.deepEqual(empty,{date:'2026-10-12',worker:null,statuses:{},exceeded:0,d1:null,account:{requests:null,rowsRead:null,rowsWritten:null}});
assert.equal(report([empty]).lines.find(l=>l.startsWith('| 2026-10-12 |')),'| 2026-10-12 | 기록 없음 | 기록 없음 | - | - | - | - | - | 기록 없음 | 기록 없음 | 기록 없음 | 기록 없음 | - |');
// Missing permission or wrong account: failures, never zeros.
const denied=[
 [[403,{data:null,errors:[{message:'not authorized for that account'}]}],'403'],
 [[401,{data:null,errors:[{message:'Unauthorized'}]}],'401'],
 [[200,{data:{viewer:{accounts:[]}},errors:[{message:'does not have access to the path'}]}],'200 with error'],
 [[200,{data:{viewer:{accounts:[]}},errors:null}],'empty account list'],
 [[200,{data:{viewer:{accounts:null}},errors:null}],'null account list'],
];
for(const [response,label] of denied){
 await assert.rejects(queryDay({...base,fetch:fake(response).fetch}),e=>e instanceof UsageError&&e.message.startsWith(PERMISSION_HELP),label);
}
assert.match(PERMISSION_HELP,/Account Analytics \/ Read/);assert.match(PERMISSION_HELP,/사용량 0이 아니다/);
// Other failures are errors too, without the permission advice.
for(const [response,raw,label,pattern] of [
 [[429,{data:null,errors:[{message:'rate limiter budget depleted, try again after 5 minutes'}]}],null,'rate limit',/GraphQL 429: rate limiter/],
 [[200,{data:null,errors:[{message:'unknown field "cpuTimeP50"'}]}],null,'schema error',/GraphQL 200: unknown field/],
 [[502,null],'<html>bad gateway</html>','not JSON',/GraphQL 502/],
 [[200,{data:{viewer:{accounts:[{total:[],d1:[]}]}},errors:null}],null,'missing dataset',/lacks byStatus/],
 [[200,{data:{viewer:{accounts:[{total:[],byStatus:[],d1:[]}]}},errors:null}],null,'missing account totals',/lacks accountWorkers/],
]){
 await assert.rejects(queryDay({...base,fetch:fake(response,raw).fetch}),e=>e instanceof UsageError&&pattern.test(e.message)&&!e.message.startsWith(PERMISSION_HELP),label);
}
// UTC days.
assert.deepEqual(utcDays('2026-10-01',3),['2026-09-29','2026-09-30','2026-10-01']);
assert.deepEqual(utcDays('2028-02-29',2),['2028-02-28','2028-02-29'],'leap day accepted');
for(const [date,count] of [['2026-02-31',1],['2026-02-29',1],['2026-04-31',1],['2026-02-30',1],['2026-13-01',1],['12-10-2026',1],['2026-10-12',0],['2026-10-12',32],['2026-10-12',1.5]])assert.throws(()=>utcDays(date,count),UsageError);
// The data status screen's read (usageToday, U06): today's account totals, or account null
// without the token, the ids or the config, on any API failure and on a request that fails;
// the error itself stays out, and nothing is asked when the token or ids are missing.
{
 const dir=mkdtempSync(join(tmpdir(),'usage-')),config=join(dir,'cloudflare-deploy.json');
 writeFileSync(config,JSON.stringify({workerName:'yukemuri',databaseId:DB}));
 const env={CLOUDFLARE_API_TOKEN:TOKEN,CLOUDFLARE_ACCOUNT_ID:ACCOUNT},now=new Date('2026-10-12T05:00:00Z');
 const at={measuredAt:'2026-10-12T05:00:00.000Z',date:'2026-10-12',limits:{rowsRead:5_000_000,rowsWritten:100_000,requests:100_000}};
 api=fake(ok(day));
 assert.deepEqual(await usageToday({fetch:api.fetch,env,config,now}),{...at,account:{requests:75000,rowsRead:3_600_000,rowsWritten:72_345}});
 assert.equal(api.calls[0].body.variables.date,'2026-10-12');assert(api.calls[0].init.signal instanceof AbortSignal,'a request that hangs is cut off');
 for(const [label,options] of [['no token',{env:{CLOUDFLARE_ACCOUNT_ID:ACCOUNT}}],['no account id',{env:{CLOUDFLARE_API_TOKEN:TOKEN}}],['no config',{env,config:join(dir,'missing.json')}]]){
  const asked=fake(ok(day));
  assert.deepEqual(await usageToday({fetch:asked.fetch,config,now,...options}),{...at,account:null},label);
  assert.equal(asked.calls.length,0,label+': nothing is asked');
 }
 for(const [label,fetch] of [['permission',fake(denied[0][0]).fetch],['rate limit',fake([429,{data:null,errors:[{message:'rate limited'}]}]).fetch],['network',async()=>{throw new TypeError('fetch failed')}]])
  assert.deepEqual(await usageToday({fetch,env,config,now}),{...at,account:null},label);
 rmSync(dir,{recursive:true,force:true});
}
// The token never reaches the report.
assert(!report([result,empty]).lines.join('\n').includes(TOKEN));
console.log('Usage checks passed: manual read-only workflow, the data status read (totals, or none without token, ids, config or on API and network failures), query variables, CPU and D1 values per UTC day, 70% warnings, empty days shown as no record, account totals (not this app alone) decide the percentages and 70% warnings, 5 permission failures and 5 other failures never read as zero.');
