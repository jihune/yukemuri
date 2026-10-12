// rollback.yml and cloudflare-rollback.mjs without an account: manual only,
// lock order, the bookmark recorded before any change, input validation, and
// an end-to-end run against a fake wrangler.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {rollback,RollbackError,BOOKMARK,CAUTION} from './cloudflare-rollback.mjs';

const text=readFileSync('.github/workflows/rollback.yml','utf8');
const on=text.match(/^on:\n((?:[ #].*\n)+)/m)[1];
assert.match(on,/^  workflow_dispatch:\n/,'manual only');
assert.equal((on.match(/^  \w+:/gm)??[]).join(),'  workflow_dispatch:','no push, schedule or pull_request trigger');
for(const input of ['action','version_id','bookmark','confirm'])assert.match(on,new RegExp(`^      ${input}:$`,'m'),'input '+input);
assert.match(on,/options:\n {10}- worker-rollback\n {10}- d1-restore\n/,'two actions');
// Lock order as deploy.yml: catalogue group at the top, account inside the job.
assert.match(text,/^concurrency:\n  group: yukemuri-catalog-updates\n  cancel-in-progress: false\n  queue: max\n/m,'catalogue lock at the top');
assert.match(text,/^ {4}concurrency:\n {6}group: cloudflare-account\n {6}cancel-in-progress: false\n {6}queue: max\n/m,'account lock in the job');
assert(text.indexOf('group: yukemuri-catalog-updates')<text.indexOf('group: cloudflare-account'),'catalogue before account');
assert.equal((text.match(/^\s*concurrency:/gm)??[]).length,2);
assert.match(text,/^permissions:\n  contents: read\n/m);
assert.equal([...new Set(text.match(/secrets\.\w+/g))].sort().join(),'secrets.CLOUDFLARE_ACCOUNT_ID,secrets.CLOUDFLARE_API_TOKEN','only the Cloudflare secrets');
assert.match(text,/CONFIRM: \$\{\{ inputs\.confirm \}\}\n {8}run: node scripts\/cloudflare-rollback\.mjs\n/,'inputs reach the script through env');
assert(!/wrangler-action|command: deploy/.test(text),'never deploys');

// The script with a recorded fake wrangler.
const deploy={workerName:'yukemuri',databaseName:'yukemuri',databaseId:'128a3c5b-8e5f-470a-a901-d899d396cae1'};
const NOW='00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683',OLD='00000080-00000200-00004c00-0123456789abcdef0123456789abcdef';
const V1='11111111-1111-4111-8111-111111111111',V2='22222222-2222-4222-8222-222222222222';
function fake({info={bookmark:NOW},restored=null,after=null}={}){
 const calls=[],lines=[];let deployed={id:'d2',versions:[{version_id:V2,percentage:100}]};
 const run=args=>{calls.push(args.join(' '));const c=args.slice(0,3).join(' ');
  if(c==='d1 time-travel info')return 'banner\n'+JSON.stringify(info);
  if(c==='d1 time-travel restore')return JSON.stringify(restored??{bookmark:args[5],previous_bookmark:NOW,message:'ok'});
  if(args[0]==='deployments')return JSON.stringify(deployed);
  if(args[0]==='rollback'){deployed=after??{id:'d3',versions:[{version_id:args[1]?.includes('-')?args[1]:V1,percentage:100}]};return 'done'}
  throw new Error('unexpected '+c)};
 return {calls,lines,run,say:l=>lines.push(l)};
}
const ok=(options,f=fake())=>{rollback({deploy,run:f.run,say:f.say,confirm:'rollback',...options});return f};
const refused=(options,message,f=fake())=>{assert.throws(()=>rollback({deploy,run:f.run,say:f.say,confirm:'rollback',...options}),e=>e instanceof RollbackError&&e.message.includes(message),message);return f};
// d1-restore: current bookmark recorded before the restore call.
let f=ok({action:'d1-restore',bookmark:OLD});
assert.deepEqual(f.calls,['d1 time-travel info yukemuri --json','d1 time-travel restore yukemuri --bookmark '+OLD+' --json']);
const summary=f.lines.join('\n');
assert(summary.indexOf('바꾸기 전 D1 bookmark: `'+NOW+'`')>=0&&summary.indexOf(NOW)<summary.indexOf('복구한 bookmark: `'+OLD),'bookmark recorded first');
for(const line of CAUTION)assert(summary.includes(line));
assert.match(summary,/Worker 되돌림만으로는 다음 수집 때 덮인다/);assert.match(summary,/autoDeploy.*수집도 멈춘다/);
// worker-rollback: bookmark, status, rollback, status.
f=ok({action:'worker-rollback'});
assert.deepEqual(f.calls.map(c=>c.split(' ').slice(0,2).join(' ')),['d1 time-travel','deployments status','rollback --name','deployments status']);
f=ok({action:'worker-rollback',versionId:V1});
assert(f.calls.includes(`rollback ${V1} --name yukemuri --message rollback.yml --yes`));
// Refusals change nothing (no call past the bookmark read).
for(const [options,message] of [
 [{action:'d1-restore',bookmark:OLD,confirm:'yes'},'confirm'],
 [{action:'drop',bookmark:OLD},'action must be'],
 [{action:'d1-restore',bookmark:''},'bookmark is required'],
 [{action:'d1-restore',bookmark:"x'; rm -rf /"},'bookmark is required'],
 [{action:'d1-restore',bookmark:OLD,versionId:V1},'version_id applies'],
 [{action:'worker-rollback',versionId:'latest'},'not a Worker version'],
 [{action:'worker-rollback',bookmark:OLD},'bookmark applies'],
]){f=refused(options,message);assert.equal(f.calls.length,0,message)}
f=refused({action:'d1-restore',bookmark:OLD},'no bookmark',fake({info:{}}));
assert.equal(f.calls.length,1,'missing current bookmark stops before the restore');
f=refused({action:'worker-rollback'},'no bookmark',fake({info:{bookmark:'not a bookmark'}}));
assert.equal(f.calls.length,1);
f=refused({action:'d1-restore',bookmark:NOW},'equals the current');assert.equal(f.calls.length,1);
refused({action:'d1-restore',bookmark:OLD},'did not report',fake({restored:{bookmark:NOW}}));
refused({action:'worker-rollback',versionId:V1},'did not change',fake({after:{id:'d3',versions:[{version_id:V2,percentage:100}]}}));
refused({action:'worker-rollback'},'did not change',fake({after:{id:'d2',versions:[{version_id:V2,percentage:100}]}}));
assert.throws(()=>rollback({deploy:{...deploy,databaseId:null},run:fake().run,say(){},confirm:'rollback',action:'d1-restore',bookmark:OLD}),/no databaseId/);
assert(BOOKMARK.test(NOW)&&BOOKMARK.test(OLD)&&!BOOKMARK.test(NOW+' ')&&!BOOKMARK.test('--bookmark'));

// End to end: env inputs, temporary config, summary file, fake wrangler binary.
const dir=mkdtempSync(join(tmpdir(),'yukemuri-rollback-check-'));
try{
 const log=join(dir,'calls.jsonl'),bin=join(dir,'wrangler.mjs'),out=join(dir,'summary.md');
 writeFileSync(bin,`import {appendFileSync,readFileSync} from 'node:fs';const a=process.argv.slice(2);const i=a.indexOf('--config');
appendFileSync(${JSON.stringify(log)},JSON.stringify({args:a,config:JSON.parse(readFileSync(a[i+1],'utf8')),token:process.env.CLOUDFLARE_API_TOKEN==='t'})+'\\n');
if(a[2]==='info')console.log(JSON.stringify({bookmark:${JSON.stringify(NOW)}}));else if(a[2]==='restore')console.log(JSON.stringify({bookmark:a[5],previous_bookmark:${JSON.stringify(NOW)}}));else process.exit(3);`);
 const run=env=>spawnSync(process.execPath,['scripts/cloudflare-rollback.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH,YUKEMURI_WRANGLER:bin,GITHUB_STEP_SUMMARY:out,CLOUDFLARE_API_TOKEN:'t',...env}});
 const real=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
 let result=run({ACTION:'d1-restore',BOOKMARK:OLD,CONFIRM:'rollback'});
 if(real.databaseId){
  assert.equal(result.status,0,result.stdout+result.stderr);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.map(c=>c.args.slice(0,3).join(' ')),['d1 time-travel info','d1 time-travel restore']);
  assert(calls.every(c=>c.token&&c.config.name==='yukemuri'&&c.config.d1_databases[0].database_id===real.databaseId),'secret via env, temporary config with the committed database_id');
  assert.match(readFileSync(out,'utf8'),/바꾸기 전 D1 bookmark/);
 }else assert.match(result.stdout,/no databaseId/);
 result=run({ACTION:'d1-restore',BOOKMARK:OLD,CONFIRM:'no'});
 assert.equal(result.status,1);assert.match(readFileSync(out,'utf8'),/\*\*실패\*\*: confirm must be/);
}finally{rmSync(dir,{recursive:true,force:true})}
console.log('Rollback workflow passed: manual only, catalogue then account lock, bookmark recorded before worker rollback and D1 restore, refusals change nothing, caution lines in the summary, end-to-end env run.');
