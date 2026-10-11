// Cloudflare deployment configuration without an account: the deploy gate, the
// generated Wrangler config, and the workflow rules for a public repository.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {deployGate} from './cloudflare-deploy-gate.mjs';
import {ensureSubdomain} from './cloudflare-workers-subdomain.mjs';

const base={workerName:'yukemuri',databaseName:'yukemuri',databaseId:null,publicOrigin:null,autoDeploy:false};
const id='0123abcd-4567-89ab-cdef-0123456789ab',origin='https://yukemuri.example-account.workers.dev';
// Gate: skip until both the database id and the autoDeploy flag are set.
assert.equal(deployGate(base).enabled,false);
assert.equal(deployGate({...base,autoDeploy:true,publicOrigin:origin}).enabled,false);
assert.equal(deployGate({...base,databaseId:id,publicOrigin:origin}).enabled,false);
assert.deepEqual(deployGate({...base,databaseId:id,publicOrigin:origin,autoDeploy:true}),{enabled:true,reason:'enabled',databaseName:'yukemuri',databaseId:id,publicOrigin:origin});
for(const bad of [{...base,databaseId:id,autoDeploy:true},{...base,databaseId:'not-a-uuid'},{...base,publicOrigin:'https://evil.example'},{...base,publicOrigin:origin+'/'},
 {...base,autoDeploy:'true'},{...base,workerName:'other'},{...base,extra:1},(({autoDeploy,...rest})=>rest)(base)])assert.throws(()=>deployGate(bad),JSON.stringify(bad));

// workers.dev subdomain: read it, register only when missing, never overwrite.
const TOKEN='subdomain-test-token',ACCOUNT='0123456789abcdef0123456789abcdef';
const fakeApi=(get,put)=>{const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,method:init.method,body:init.body,auth:init.headers.Authorization});const [status,body]=init.method==='GET'?get:put;return new Response(JSON.stringify(body),{status})}}};
const none=[404,{success:false,errors:[{code:10007}],result:null}],has=sub=>[200,{success:true,result:{subdomain:sub}}];
let api=fakeApi(has('existing'));
assert.deepEqual(await ensureSubdomain({fetch:api.fetch,token:TOKEN,accountId:ACCOUNT,requested:''}),{subdomain:'existing',registered:false,ignoredInput:false});
api=fakeApi(has('existing'));
assert.deepEqual(await ensureSubdomain({fetch:api.fetch,token:TOKEN,accountId:ACCOUNT,requested:'other'}),{subdomain:'existing',registered:false,ignoredInput:true});
assert.deepEqual(api.calls.map(c=>c.method),['GET'],'an existing subdomain is never overwritten');
assert.equal(api.calls[0].url,`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/subdomain`);assert.equal(api.calls[0].auth,'Bearer '+TOKEN);
api=fakeApi(none);
assert.deepEqual(await ensureSubdomain({fetch:api.fetch,token:TOKEN,accountId:ACCOUNT,requested:''}),{subdomain:null,registered:false,ignoredInput:false});
assert.deepEqual(api.calls.map(c=>c.method),['GET']);
api=fakeApi(none,has('new-sub'));
assert.deepEqual(await ensureSubdomain({fetch:api.fetch,token:TOKEN,accountId:ACCOUNT,requested:'new-sub'}),{subdomain:'new-sub',registered:true,ignoredInput:false});
assert.deepEqual(api.calls.map(c=>[c.method,c.body]),[['GET',undefined],['PUT','{"subdomain":"new-sub"}']]);
assert.equal(deployGate({...base,databaseId:id,autoDeploy:true,publicOrigin:'https://yukemuri.new-sub.workers.dev'}).enabled,true,'a registered subdomain gives an accepted publicOrigin');
for(const bad of ['-bad','bad-','Upper','a_b','a.b','x'.repeat(64)]){api=fakeApi(none,has(bad));await assert.rejects(ensureSubdomain({fetch:api.fetch,token:TOKEN,accountId:ACCOUNT,requested:bad}),/workers_subdomain/);assert.equal(api.calls.length,0,bad)}
assert.equal((await ensureSubdomain({fetch:fakeApi(none,has('x'.repeat(63))).fetch,token:TOKEN,accountId:ACCOUNT,requested:'x'.repeat(63)})).registered,true);
for(const [get,put] of [[[403,{success:false,errors:[{code:10000}]}]],[none,[409,{success:false,errors:[{code:10036}]}]],[none,has('different')]]){
 await assert.rejects(ensureSubdomain({fetch:fakeApi(get,put).fetch,token:TOKEN,accountId:ACCOUNT,requested:'new-sub'}),error=>!error.message.includes(TOKEN)&&!error.message.includes(ACCOUNT));
}
await assert.rejects(ensureSubdomain({fetch:fakeApi(none).fetch,token:TOKEN,accountId:'not-an-id',requested:''}),/32-character/);
const committed=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
const gate=deployGate(committed);

// Generated config: what every wrangler command reads.
const wrangler=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
assert.equal(wrangler.name,committed.workerName);
assert.equal(wrangler.workers_dev,true);assert.equal(wrangler.preview_urls,false);
assert.equal(wrangler.observability?.enabled,true);
// The whole limiter, not only its name: 120 requests per 60 s per IP, namespace 1001.
assert.deepEqual(wrangler.ratelimits,[{name:'API_RATE_LIMITER',namespace_id:'1001',simple:{limit:120,period:60}}]);
assert.deepEqual(wrangler.placement,{mode:'smart'});
assert.equal(wrangler.d1_databases.length,1);
const [d1]=wrangler.d1_databases;
assert.equal(d1.binding,'DB');assert.equal(d1.database_name,committed.databaseName);
assert.equal(d1.database_id,committed.databaseId??'00000000-0000-4000-8000-000000000000');
const migrations=resolve(dirname(resolve('dist/server/wrangler.json')),d1.migrations_dir);
assert.equal(migrations,resolve('drizzle'),'migrations_dir must resolve to drizzle/ from the generated config');
assert.deepEqual(readdirSync(migrations).filter(f=>f.endsWith('.sql')),readdirSync('drizzle').filter(f=>f.endsWith('.sql')));

// Workflows: no pull_request_target anywhere; secrets only on push/manual runs;
// read-only token; every wrangler d1 command names the database and the config.
const workflows=readdirSync('.github/workflows').filter(f=>/\.ya?ml$/.test(f));
for(const file of workflows){
 const text=readFileSync('.github/workflows/'+file,'utf8');
 assert(!/pull_request_target/.test(text),file+' must not use pull_request_target');
 assert.match(text,/^permissions:\n  contents: read\n/m,file+' must keep a read-only token');
 if(/secrets\./.test(text)){
  const triggers=text.match(/^on:\n((?:[ #].*\n)+)/m)?.[1]??'';
  assert(triggers,file+' has no on: block');
  assert(!/pull_request|issue_comment|workflow_run/.test(triggers),file+' exposes secrets to '+triggers.trim());
 }
}
for(const file of workflows){
 const runs=[...readFileSync('.github/workflows/'+file,'utf8').matchAll(/^( *)(?:- )?run: (?:\|\n((?:\1  .*\n)+)|(.*))/gm)].map(m=>m[2]??m[3]);
 assert(runs.every(run=>!run.includes('${{')),file+': pass values to run scripts through env, not ${{ }}');
}
for(const file of ['.github/workflows/deploy.yml','.github/workflows/d1-setup.yml','scripts/cloudflare-d1-setup.mjs']){
 assert(existsSync(file),file);
 const text=readFileSync(file,'utf8');
 const commands=[...text.matchAll(/\bd1 (?:time-travel info|migrations (?:apply|list)|execute|export|create)\b[^\n]*/g)].map(m=>m[0]);
 for(const command of commands){assert.match(command,/ yukemuri\b/,file+': '+command);assert.match(command,/--config dist\/server\/wrangler\.json/,file+': '+command)}
 if(file.endsWith('.mjs'))assert.match(text,/\['d1','create',NAME,'--location','apac','--config',CONFIG\]/);
}
const deploy=readFileSync('.github/workflows/deploy.yml','utf8');
const steps=['cloudflare-deploy-gate.mjs','d1 time-travel info yukemuri','d1 migrations apply yukemuri --remote','build-search-snapshot.mjs --remote','command: deploy --config','cloudflare-smoke.mjs'].map(s=>deploy.indexOf(s));
assert(steps.every((v,i)=>v>0&&(i===0||v>steps[i-1])),'deploy order: gate, time travel, migrations, search snapshot, deploy, smoke');
assert.match(deploy.match(/^on:\n((?:[ #].*\n)+)/m)[1],/^  workflow_call:$/m,'the collection workflow refreshes the snapshot through workflow_call');
// The deploy job (and its snapshot) waits for a collection run (P03, Codex review on PR #43).
// Lock order: catalogue group at the top, account inside the job, so a push
// deploy and the collection's call never hold one each while waiting on the other.
assert.match(deploy,/^concurrency:\n  group: \$\{\{ inputs\.after_collection && 'yukemuri-snapshot-after-collection' \|\| 'yukemuri-catalog-updates' \}\}\n  cancel-in-progress: false\n/m,'deploy serialized with catalogue writes at the top');
assert.match(deploy,/^ {4}concurrency:\n {6}group: cloudflare-account\n {6}cancel-in-progress: false\n/m,'deploy job holds the account inside the catalogue group');
assert.equal((deploy.match(/^\s*concurrency:/gm)??[]).length,2,'exactly the two deploy locks');
assert.match(readFileSync('.github/workflows/d1-setup.yml','utf8'),/^concurrency:\n  group: cloudflare-account\n/m,'D1 setup shares the account lock');
assert.equal((deploy.match(/^ {6}- (?:if|uses|id|run|env)/gm)??[]).length-(deploy.match(/^ {6}- if: steps\.gate\.outputs\.enabled == 'true'/gm)??[]).length,3,'only checkout, gate and the skip notice run when the gate is off');
const setup=readFileSync('.github/workflows/d1-setup.yml','utf8').replace(/^\s*#.*$/gm,'');
assert(/wrangler\.js d1 migrations apply/.test(setup)&&!/(?:wrangler(?:\.js)?|command:)\s+(?:deploy|versions\s+(?:upload|deploy)|secret)\b|wrangler-action/.test(setup),'D1 setup applies migrations and never deploys the Worker');
console.log(`Deploy config passed: gate skips without database_id/autoDeploy (committed: ${gate.enabled?'enabled':'skipped — '+gate.reason}), generated wrangler.json targets ${d1.database_name} with migrations from drizzle/, ${workflows.length} workflows read-only without pull_request_target, d1 commands name the database and config.`);
