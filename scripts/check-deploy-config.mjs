// Cloudflare deployment configuration without an account: the deploy gate, the
// generated Wrangler config, and the workflow rules for a public repository.
import {readFileSync,readdirSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {deployGate,deployMode} from './cloudflare-deploy-gate.mjs';
import {checkedOnMain} from './checked-commit.mjs';
import {prepareEstimate,metaRows,maintenanceBehind,PRIORITY_VERSION,EVIDENCE} from './preflight-report.mjs';
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
// The whole limiters, not only their names: 120 requests per 60 s per IP (namespace 1001),
// and 30 per 60 s per IP for details and comparisons (namespace 1002, H02).
assert.deepEqual(wrangler.ratelimits,[{name:'API_RATE_LIMITER',namespace_id:'1001',simple:{limit:120,period:60}},{name:'DETAIL_RATE_LIMITER',namespace_id:'1002',simple:{limit:30,period:60}}]);
// Tools and crawlers without the maintenance key are refused (lib/edge-guard.ts, H02).
assert.deepEqual(wrangler.vars,{REJECT_AUTOMATED_AGENTS:'1'});
// Static assets: noindex on every file, and vinext's cache rule for hashed files,
// which vinext writes only when public/ has no _headers (docs/H02-20261013.md).
const staticHeaders=readFileSync('dist/client/_headers','utf8');
assert.match(staticHeaders,/^\/\*\n  X-Robots-Tag: noindex, nofollow, noarchive$/m,'_headers marks every static asset noindex');
assert.match(staticHeaders,/^\/_next\/static\/\*\n  Cache-Control: public, max-age=31536000, immutable$/m,'_headers keeps the immutable cache for hashed assets');
assert.match(readFileSync('dist/client/robots.txt','utf8'),/^User-agent: \*\nAllow: \/\$\nDisallow: \/$/m,'robots.txt opens only the home page');
assert.match(readFileSync('dist/client/index.html','utf8'),/<meta name="robots" content="noindex, nofollow, noarchive"\/?>/,'the static page carries the robots meta tag');
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
// Steps as blocks with their condition and body (comments dropped).
const stepBlocks=deploy.slice(deploy.indexOf('    steps:\n')).split(/\n(?= {6}- )/).slice(1).map(text=>({text:text.replace(/^\s*#.*$/gm,''),cond:text.match(/^ {6}- if: (.*)$/m)?.[1]??text.match(/^ {8}if: (.*)$/m)?.[1]??null}));
const stepOf=needle=>{const i=stepBlocks.findIndex(b=>b.text.includes(needle));assert(i>=0,'deploy.yml has no step with '+needle);return i};
const WRITES=[/migrations apply/,/cloudflare-deploy-worker\.sh(?! --dry-run)/,/cloudflare-prepare\.mjs/,/cloudflare-smoke\.mjs/,/record-coverage\.mjs/,/\bsecret\b(?!s\.)/,/d1 execute(?![^\n]*--command "SELECT )/];
// Order of a deploy: gate, time travel, migrations, snapshot, deploy, smoke.
const order=['cloudflare-deploy-gate.mjs','d1 time-travel info yukemuri','d1 migrations apply yukemuri --remote','build-search-snapshot.mjs --remote --report','bash scripts/cloudflare-deploy-worker.sh |','cloudflare-smoke.mjs'].map(stepOf);
assert(order.every((v,i)=>i===0||v>order[i-1]),'deploy order: gate, time travel, migrations, search snapshot, deploy, smoke');
// Every write (migrations, secret, upload, prepare, the keyed smoke) runs only
// in deploy mode; nothing but checkout, the gate and the read-only question
// the gate asks on a push (lifecycle-push.mjs, L01) runs without a mode.
for(const b of stepBlocks){
 if(WRITES.some(w=>w.test(b.text)))assert.match(b.cond??'',/^steps\.gate\.outputs\.mode == 'deploy'/,'a write outside deploy mode: '+b.text.split('\n').find(l=>/run:/.test(l)));
 if(!/actions\/checkout@|id: gate|id: lifecycle\n/.test(b.text))assert.match(b.cond??'',/steps\.gate\.outputs\.mode|steps\.checked\.outputs\.checked == 'true'/,'a step without a mode: '+b.text.slice(0,120));
}
// Preflight (B5): time travel, pending migrations listed, snapshot, catalog_meta
// read with the write estimate, and deploy --dry-run. Reads only.
const preflight=stepBlocks.filter(b=>/mode == 'preflight'|mode != 'skip'/.test(b.cond??''));
for(const needle of ['d1 time-travel info yukemuri','d1 migrations list yukemuri --remote','build-search-snapshot.mjs --remote --report','SELECT key, value FROM catalog_meta','preflight-report.mjs','cloudflare-deploy-worker.sh --dry-run'])assert(preflight.some(b=>b.text.includes(needle)),'preflight lacks '+needle);
for(const b of preflight)assert(!WRITES.some(w=>w.test(b.text)),'preflight writes: '+b.text.slice(0,160));
assert.match(deploy.match(/^on:\n((?:[ #].*\n)+)/m)[1],/^  workflow_dispatch:\n    inputs:\n      preflight:\n        description: .*\n        type: boolean\n        default: false\n/m,'manual preflight input, off by default');
assert.match(deploy,/PREFLIGHT: \$\{\{ inputs\.preflight == true \}\}\n {10}DEFERRED: \$\{\{ steps\.lifecycle\.outputs\.deferred == 'true' \}\}\n {8}run: node scripts\/cloudflare-deploy-gate\.mjs/,'the gate reads the preflight input and whether lifecycle.yml deploys this push');
// A failing command piped into tee fails its step; wrangler runs from node_modules
// with an explicit --config (no wrangler-action: its secret upload has no --config).
// Every workflow: an explicit shell, so GitHub runs bash -eo pipefail and a
// failure piped into tee fails the step (the default bash -e does not).
for(const file of workflows)assert.match(readFileSync('.github/workflows/'+file,'utf8'),/^defaults:\n  run:\n    shell: bash\njobs:/m,file+': defaults.run.shell bash (pipefail)');
assert(!/^\s+shell:/m.test(deploy.replace(/^defaults:\n  run:\n    shell: bash\n/m,'')),'no step overrides the shell');
// A snapshot step with no id in its report fails instead of deploying without one.
for(const b of stepBlocks.filter(b=>/build-search-snapshot\.mjs --remote/.test(b.text)))assert.match(b.text,/\[\[ "\$id" =~ \^\[0-9a-f\]\{16\}\$ \]\] \|\| \{ echo "No snapshot id in the report"; exit 1; \}\n {10}echo "id=\$id" >> "\$GITHUB_OUTPUT"/,'snapshot id checked before it is output');
for(const b of stepBlocks.filter(b=>/cloudflare-smoke\.mjs/.test(b.text)))assert.match(b.text,/SNAPSHOT_ID: \$\{\{ steps\.(?:prepared_)?snapshot\.outputs\.id \}\}/,'smoke gets the snapshot id of its build');
{
 // What pipefail changes, on this machine's bash: a failing producer piped into tee.
 const run=flags=>spawnSync('bash',[...flags,'-c','node -e "process.exit(3)" | tee /dev/null'],{encoding:'utf8'}).status;
 assert.equal(run(['-e']),0,'bash -e hides the failure (the default without shell:)');
 assert.notEqual(run(['--noprofile','--norc','-eo','pipefail']),0,'shell: bash (-eo pipefail) fails');
}
for(const file of workflows)assert(!/cloudflare\/wrangler-action/.test(readFileSync('.github/workflows/'+file,'utf8').replace(/^\s*#.*$/gm,'')),file+' uses wrangler-action');
assert(!/^\s+secrets:\s*\|/m.test(deploy),'no secrets input');
for(const m of deploy.matchAll(/node "\$WRANGLER" (\w+)/g))assert(['d1','deploy'].includes(m[1]),'wrangler '+m[1]);
assert.match(deploy,/^ {6}WRANGLER: node_modules\/wrangler\/bin\/wrangler\.js$/m);
// Unprepared catalogue (seed changed; public reads no longer seed, P03): after
// the first smoke the new Worker prepares it, then snapshot, deploy and smoke again.
const prepared=['cloudflare-prepare.mjs','build-search-snapshot.mjs --remote --require-prepared'].map(stepOf),firstSmoke=stepOf('cloudflare-smoke.mjs');
const after=stepBlocks.slice(prepared[1]+1);
assert(firstSmoke<prepared[0]&&prepared[0]<prepared[1]&&after.findIndex(b=>b.text.includes('bash scripts/cloudflare-deploy-worker.sh |'))===0&&after.findIndex(b=>b.text.includes('cloudflare-smoke.mjs'))===1,'unprepared catalogue: prepare, snapshot, deploy, smoke after the first smoke');
assert.equal(stepBlocks.filter(b=>b.cond==="steps.gate.outputs.mode == 'deploy' && steps.snapshot.outputs.prepared != 'true'").length,4,'the four preparation steps run only for an unprepared catalogue');
assert.match(deploy,/echo "prepared=.*unprepared\.length===0/,'the snapshot step reports whether the catalogue is prepared');
// D06: the geocoder never blocks a deploy. The dictionary cache is keyed by the
// pinned hash, preparing it may fail (continue-on-error), and both snapshot
// steps build with the geocoder when it is ready and without it otherwise.
{
 const pins=JSON.parse(readFileSync('scripts/geo/pins.json','utf8')).dictionary;
 const cache=stepBlocks[stepOf('actions/cache@')],prepare=stepBlocks[stepOf('scripts/geo/prepare.sh')];
 assert(cache.text.includes(`path: \${{ runner.temp }}/jageocoder/${pins.file}\n`)&&cache.text.split('\n').includes(`          key: jageocoder-${pins.file.replace(/\.zip$/,'')}-${pins.sha256}`),'dictionary cache keyed by the pinned file and SHA-256');
 assert.match(prepare.text,/^ {8}id: geo\n {8}continue-on-error: true\n/m,'a failed geocoder preparation does not fail the deploy');
 assert.match(cache.text,/^ {8}uses: actions\/cache@v\d+\n {8}continue-on-error: true\n/m,'a failed dictionary cache restore does not fail the deploy');
 assert(stepBlocks.filter(b=>/scripts\/geo\/|jageocoder/.test(b.text)&&!/build-search-snapshot/.test(b.text)).every(b=>/^ {8}continue-on-error: true$/m.test(b.text)),'every geocoder step is optional');
 assert(stepOf('actions/cache@')<stepOf('scripts/geo/prepare.sh')&&stepOf('scripts/geo/prepare.sh')<stepOf('build-search-snapshot.mjs --remote --report'),'cache, prepare, then the snapshot');
 for(const b of stepBlocks.filter(b=>/build-search-snapshot\.mjs --remote/.test(b.text))){
  assert(b.text.includes('GEO_DB: ${{ steps.geo.outputs.db }}')&&b.text.includes('if [[ -n "$GEO_DB" ]]; then geo=(--geocoder-db "$GEO_DB"); else geo=(--geocoder-skip "$GEO_REASON"); fi')&&b.text.includes('"${geo[@]}" "${progress[@]}" | tee -a "$GITHUB_STEP_SUMMARY"'),'snapshot step passes the geocoder or the reason it is missing');
 }
 const installs=readFileSync('scripts/geo/prepare.sh','utf8').split('\n').filter(l=>/\bpip"? install\b/.test(l)&&!/^\s*(#|step=)/.test(l));
 assert(installs.length===1&&installs.every(l=>/--require-hashes --only-binary=:all: --no-deps -r scripts\/geo\/requirements\.txt$/.test(l)),'Python packages only hash-pinned wheels');
}
assert.match(deploy.match(/^on:\n((?:[ #].*\n)+)/m)[1],/^  workflow_call:$/m,'the collection workflow refreshes the snapshot through workflow_call');
// C3: a snapshot deploy after a collection builds without the full checks only
// when this commit passed them on a main push (checked-commit.mjs).
assert.equal(stepBlocks[stepOf('checked-commit.mjs')].cond,"steps.gate.outputs.mode == 'deploy' && inputs.after_collection");
// C07 plan 2: only the deploy a collection calls builds with the day the collection finished, and
// its last step stores that build's count through the new Worker; a push, manual or lifecycle
// deploy never does. lifecycle.yml also calls with after_collection (the lock, checked-commit.mjs)
// but without a day, so the day itself decides (Claude review on PR #246).
assert.match(deploy.match(/^on:\n((?:[ #].*\n)+)/m)[1],/^      collected_on:\n        description: .+\n        type: string\n        default: ''\n/m,'the collection day is a workflow_call input');
const callers=Object.fromEntries(workflows.map(f=>[f,readFileSync('.github/workflows/'+f,'utf8')]).filter(([,t])=>t.includes('uses: ./.github/workflows/deploy.yml')).map(([f,t])=>[f,t.match(/uses: \.\/\.github\/workflows\/deploy\.yml\n {4}with:\n((?: {6}.+\n)+)/)?.[1]??null]));
assert.deepEqual(callers,{'collect.yml':'      after_collection: true\n      collected_on: ${{ needs.collect.outputs.collected_on }}\n','lifecycle.yml':'      after_collection: true\n'},'every caller of deploy.yml and its inputs: only the collection passes a day');
const builds=stepBlocks.filter(b=>/build-search-snapshot\.mjs --remote/.test(b.text));
assert.equal(builds.length,2);
for(const b of builds)assert(b.text.includes('COLLECTED_ON: ${{ inputs.collected_on }}\n')&&!b.text.includes('AFTER_COLLECTION')&&b.text.includes(`progress=(); if [[ -n "$COLLECTED_ON" ]]; then progress=(--progress-day "$COLLECTED_ON"); fi`),'the collection day reaches the build only from the collection');
// The line as the step runs it: no day (lifecycle, push, manual), no argument.
const progressLine=builds[0].text.match(/^ +(progress=\(\); if .+; fi)$/m)[1];
for(const [day,shown] of [['','0'],['2026-10-26','2 --progress-day 2026-10-26']]){
 const r=spawnSync('bash',['-c',progressLine+'; echo ${#progress[@]} "${progress[@]}"'],{env:{...process.env,COLLECTED_ON:day},encoding:'utf8'});
 assert.equal(r.stdout.trim(),shown,`COLLECTED_ON='${day}'`);
}
assert.equal(stepOf('record-coverage.mjs'),stepBlocks.length-1,'the count is stored last, after every deploy and smoke');
assert.equal(stepBlocks.at(-1).cond,"steps.gate.outputs.mode == 'deploy' && inputs.collected_on != ''");
assert(stepBlocks.at(-1).text.includes('YUKEMURI_CRAWL_ACCESS_KEY: ${{ secrets.YUKEMURI_CRAWL_ACCESS_KEY }}\n          ORIGIN: ${{ steps.gate.outputs.public_origin }}\n        run: node scripts/record-coverage.mjs "$ORIGIN" snapshot-report.json | tee -a "$GITHUB_STEP_SUMMARY"'),'the record step reads the last build\'s report');
assert.equal(stepBlocks[stepOf('cloud-check.py --full')].cond,"steps.gate.outputs.mode == 'deploy' && steps.checked.outputs.checked != 'true'");
assert.equal(stepBlocks[stepOf('run-framework.mjs build')].cond,"steps.gate.outputs.mode == 'preflight' || steps.checked.outputs.checked == 'true'");
assert(stepOf('run-framework.mjs build')<stepOf('d1 time-travel info'),'built before any wrangler command');
assert.match(deploy,/^permissions:\n  contents: read\n  actions: read\n(?! )/m,'actions: read for checked-commit.mjs only');
const sha='0123456789abcdef0123456789abcdef01234567',ok={head_sha:sha,event:'push',head_branch:'main',status:'completed',conclusion:'success',path:'.github/workflows/web-checks.yml',id:1};
assert.equal(checkedOnMain([ok],sha).checked,true);
// A push deploy can succeed by skipping (deferred to lifecycle.yml) without any check.
for(const bad of [{head_sha:'f'.repeat(40)},{event:'workflow_dispatch'},{head_branch:'feature'},{conclusion:'failure'},{status:'in_progress'},{path:'.github/workflows/collect.yml'},{path:'.github/workflows/deploy.yml'}])assert.equal(checkedOnMain([{...ok,...bad}],sha).checked,false,JSON.stringify(bad));
// The deploy job (and its snapshot) waits for a collection run (P03, Codex review on PR #43).
// Lock order: catalogue group at the top, account inside the job, so a push
// deploy and the collection's call never hold one each while waiting on the other.
assert.match(deploy,/^concurrency:\n  group: \$\{\{ inputs\.after_collection && 'yukemuri-snapshot-after-collection' \|\| 'yukemuri-catalog-updates' \}\}\n  cancel-in-progress: false\n  queue: max\n/m,'deploy serialized with catalogue writes at the top, every waiting run kept');
assert.match(deploy,/^ {4}concurrency:\n {6}group: cloudflare-account\n {6}cancel-in-progress: false\n {6}queue: max\n/m,'deploy job holds the account inside the catalogue group, every waiting job kept');
assert.equal((deploy.match(/^\s*concurrency:/gm)??[]).length,2,'exactly the two deploy locks');
assert.match(readFileSync('.github/workflows/d1-setup.yml','utf8'),/^concurrency:\n  group: cloudflare-account\n  cancel-in-progress: false\n  queue: max\n/m,'D1 setup shares the account lock without cancelling a waiting deploy');
// Gate modes: preflight needs only the database id and never deploys.
assert.equal(deployMode(base).mode,'skip');
assert.equal(deployMode({...base,databaseId:id}).mode,'skip');
assert.deepEqual(deployMode({...base,databaseId:id},{preflight:true}),{mode:'preflight',reason:'read-only preflight',databaseName:'yukemuri',databaseId:id,publicOrigin:null});
assert.equal(deployMode({...base,databaseId:id,publicOrigin:origin,autoDeploy:true},{preflight:true}).mode,'preflight','preflight never deploys');
assert.equal(deployMode({...base,databaseId:id,publicOrigin:origin,autoDeploy:true}).mode,'deploy');
assert.throws(()=>deployMode(base,{preflight:true}),/database_id/);
// L01: a push that changes data/lifecycle-official.json is deployed by lifecycle.yml; a manual preflight still runs.
assert.deepEqual(deployMode({...base,databaseId:id,publicOrigin:origin,autoDeploy:true},{deferred:true}),{mode:'skip',reason:'lifecycle.yml deploys this push after storing data/lifecycle-official.json'});
assert.equal(deployMode({...base,databaseId:id,publicOrigin:origin,autoDeploy:true},{deferred:false}).mode,'deploy');
assert.equal(deployMode({...base,databaseId:id},{preflight:true,deferred:true}).mode,'preflight');
// The deploy script: key only in a 0600 file passed by --secrets-file, removed after.
{
 const temp=mkdtempSync(join(tmpdir(),'deploy-worker-')),stub=join(temp,'wrangler.js'),log=join(temp,'calls.json'),count=join(temp,'count'),KEY='deploy-check-key-0123456789';
 // STUB_API_FAILS: how many calls fail on a Cloudflare API request first (the 10-23 and 10-25 snapshot deploys).
 writeFileSync(stub,`const fs=require('fs');const a=process.argv.slice(2);const f=a[a.indexOf('--secrets-file')+1];fs.writeFileSync(${JSON.stringify(log)},JSON.stringify({args:a,file:f,mode:(fs.statSync(f).mode&0o777).toString(8),content:JSON.parse(fs.readFileSync(f,'utf8'))}));const c=${JSON.stringify(count)},k=fs.existsSync(c)?Number(fs.readFileSync(c,'utf8')):0;fs.writeFileSync(c,String(k+1));if(k<Number(process.env.STUB_API_FAILS||0)){console.error('[ERROR] A request to the Cloudflare API (/accounts/x/workers/scripts/yukemuri/assets-upload-session) failed. [code: 10013]');process.exit(1)}console.log('Current Version ID: 0123abcd-0000-4000-8000-000000000000');if(process.env.STUB_FAIL)process.exit(3)`);
 const run=(args,env)=>{rmSync(count,{force:true});return spawnSync('bash',['scripts/cloudflare-deploy-worker.sh',...args],{env:{PATH:process.env.PATH,RUNNER_TEMP:temp,WRANGLER_JS:stub,WRANGLER_RETRY_SECONDS:'0',...env},encoding:'utf8'})};
 const calls=()=>Number(readFileSync(count,'utf8'));
 let r=run([],{CRAWL_ACCESS_KEY:KEY,GITHUB_SHA:'abc'});
 let seen=JSON.parse(readFileSync(log,'utf8'));
 assert.equal(r.status,0,r.stderr);assert.deepEqual(seen.args.filter(a=>a!==seen.file),['deploy','--config','dist/server/wrangler.json','--secrets-file']);
 assert.equal(seen.mode,'600');assert.deepEqual(seen.content,{CRAWL_ACCESS_KEY:KEY});
 assert(!existsSync(seen.file),'secrets file removed');assert(!(r.stdout+r.stderr).includes(KEY),'key never printed');
 assert.match(r.stdout,/Deployed Worker version: `0123abcd-0000-4000-8000-000000000000` from abc/);
 r=run(['--dry-run'],{CRAWL_ACCESS_KEY:KEY});seen=JSON.parse(readFileSync(log,'utf8'));
 assert.equal(r.status,0);assert.deepEqual(seen.args.slice(0,2),['deploy','--dry-run']);assert.notEqual(seen.content.CRAWL_ACCESS_KEY,KEY,'a dry run never sees the key');assert(!existsSync(seen.file));
 r=run([],{CRAWL_ACCESS_KEY:KEY,STUB_FAIL:'1'});seen=JSON.parse(readFileSync(log,'utf8'));
 assert.notEqual(r.status,0,'a failed deploy fails the script');assert(!existsSync(seen.file),'removed after a failure too');
 assert.equal(calls(),1,'a failure that is not a Cloudflare API request is not tried again');
 // One failed Cloudflare API request deploys once more with the same secrets file; a second failure ends it.
 r=run([],{CRAWL_ACCESS_KEY:KEY,GITHUB_SHA:'abc',STUB_API_FAILS:'1'});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(calls(),2);
 assert.match(r.stdout,/A Cloudflare API request failed; deploying once more in 0 s\.\n[\s\S]*Deployed Worker version: `0123abcd-0000-4000-8000-000000000000` from abc/);
 assert(!(r.stdout+r.stderr).includes(KEY),'key never printed');
 r=run([],{CRAWL_ACCESS_KEY:KEY,STUB_API_FAILS:'2'});seen=JSON.parse(readFileSync(log,'utf8'));
 assert.notEqual(r.status,0,'two failed requests fail the deploy');assert.equal(calls(),2,'tried once more only');assert(!existsSync(seen.file));
 rmSync(count,{force:true});
 r=run([],{});assert.notEqual(r.status,0,'no key, no deploy');
 assert.deepEqual(readdirSync(temp).sort(),['calls.json','wrangler.js'],'no temporary file left');
 rmSync(temp,{recursive:true,force:true});
}
// Preflight report: the write estimate from measured steps.
{
 const prepare={none:{rowsWritten:10},snapshot:{rowsWritten:110},'multilingual-index-v1':{rowsWritten:1010},all:{rowsWritten:1500}};
 assert.deepEqual(prepareEstimate([],prepare),{rowsWritten:0,basis:'catalogue prepared: deploy runs no crawl-prepare'});
 assert.equal(prepareEstimate(['snapshot'],prepare).rowsWritten,110);
 assert.equal(prepareEstimate(['snapshot','multilingual-index-v1'],{...prepare,all:undefined}).rowsWritten,1110);
 assert.equal(prepareEstimate(['snapshot','multilingual-index-v1'],prepare).rowsWritten,1500,'every measured step undone uses the measured total');
 assert.equal(prepareEstimate(['other'],prepare).rowsWritten,null);
 assert.equal(prepareEstimate(['snapshot','multilingual-index-v1'],{...prepare,all:{rowsWritten:500}}).rowsWritten,1110,'the larger of the sum and the measured total');
 assert.deepEqual(metaRows([{results:[{key:'snapshot',value:'v'}],success:true}]).map(r=>r.key),['snapshot']);
 assert.throws(()=>metaRows([{results:[{value:'x'}]}]));
 const current='collection-priority:'+PRIORITY_VERSION;
 assert.equal(PRIORITY_VERSION,JSON.parse(readFileSync('data/collection-priorities.json','utf8')).version);
 assert.match(readFileSync('lib/collection-priorities.ts','utf8'),/key='collection-priority:'\+plan\.version/,'the app keys priorities by the plan version');
 assert.deepEqual(maintenanceBehind([{key:'onsen-place-search-v1',value:'done'},{key:'external-bath-scope-v1',value:'hotel-9'},{key:current,value:'done'}]),['external-bath-scope-v1']);
 assert.deepEqual(maintenanceBehind([{key:'onsen-place-search-v1',value:'done'},{key:'external-bath-scope-v1',value:'done'},{key:'collection-priority:older-plan',value:'done'}]),[current],'an older plan version done does not count');
 assert.deepEqual(maintenanceBehind([]),['onsen-place-search-v1','external-bath-scope-v1',current],'a missing cursor is behind');
 const evidence=JSON.parse(readFileSync(EVIDENCE,'utf8'));
 for(const k of ['settle','none','snapshot','multilingual-index-v1','bath-facts-backfill-v1','korean-names-20261004','verified-source-groups-v1','all'])assert(Number.isInteger(evidence.prepareSteps[k]?.rowsWritten),'evidence lacks '+k);
}
const setup=readFileSync('.github/workflows/d1-setup.yml','utf8').replace(/^\s*#.*$/gm,'');
assert(/wrangler\.js d1 migrations apply/.test(setup)&&!/(?:wrangler(?:\.js)?|command:)\s+(?:deploy|versions\s+(?:upload|deploy)|secret)\b|wrangler-action/.test(setup),'D1 setup applies migrations and never deploys the Worker');
console.log(`Deploy config passed: gate skips without database_id/autoDeploy (committed: ${gate.enabled?'enabled':'skipped — '+gate.reason}), generated wrangler.json targets ${d1.database_name} with migrations from drizzle/, ${workflows.length} workflows read-only without pull_request_target, d1 commands name the database and config, writes only in deploy mode, read-only preflight, wrangler from node_modules with the key in a removed 0600 secrets file.`);
