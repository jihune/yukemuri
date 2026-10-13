// L01 official evidence without an account: every entry of
// data/lifecycle-official.json against the Worker's own contract
// (lib/lifecycle-contract.ts, compiled here), plus the rules the contract does
// not hold (one entry per record, no booking site as the source, no future
// check date), with broken copies that must fail; and lifecycle.yml, the only
// workflow that applies the file: main push of this file or a manual run, the
// crawl key in the apply step only, the catalogue lock, and one snapshot after
// the evidence is stored (deploy.yml ignores pushes of this file alone).
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {pushDeployPending,DEPLOY} from './pending-push-deploy.mjs';

const FILE='data/lifecycle-official.json';
// Booking sites and aggregators: a listing shows the source exists, never the
// operating state (docs/onsen-first-plan-20261005.md).
const BOOKING=/(?:^|\.)(?:jalan\.net|trip\.com|ctrip\.com|booking\.com|rakuten\.co\.jp|ikyu\.com|expedia\.[a-z.]+|agoda\.com|hotels\.com|tripadvisor\.[a-z.]+|google\.[a-z.]+|yahoo\.co\.jp|jtb\.co\.jp|nta\.co\.jp|knt\.co\.jp|relux\.jp)$/;
const temp=mkdtempSync(join(tmpdir(),'yukemuri-lifecycle-'));
try{
 symlinkSync(resolve('node_modules'),join(temp,'node_modules'));
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/lifecycle-contract.ts','--outDir',temp,'--module','commonjs','--target','es2022','--esModuleInterop','--skipLibCheck','--moduleResolution','node'],{encoding:'utf8'});
 const compiled=[join(temp,'lifecycle-contract.js'),join(temp,'lib/lifecycle-contract.js')].find(existsSync);
 assert(compile.status===0&&compiled,compile.stdout+compile.stderr);
 const {lifecyclePatch}=createRequire(join(temp,'check.cjs'))(compiled);

 const problems=data=>{
  const out=[];
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join()!=='patches,version'||data.version!==1||!Array.isArray(data.patches))return['expected {"version":1,"patches":[...]}'];
  const seen=new Set();
  data.patches.forEach((p,i)=>{
   const at=`patches[${i}]${p?.id?' '+p.id:''}`,parsed=lifecyclePatch.safeParse(p);
   if(!parsed.success)out.push(at+': '+parsed.error.issues.map(e=>e.path.join('.')+' '+e.message).join('; '));
   if(seen.has(p?.id))out.push(at+': a second entry for the same record');seen.add(p?.id);
   let host='';try{host=new URL(p?.sourceUrl).hostname}catch{}
   if(BOOKING.test(host))out.push(at+': a booking site is not an official source ('+host+')');
   if(Date.parse(p?.checkedAt)>Date.now())out.push(at+': checkedAt is in the future');
  });
  return out;
 };

 const data=JSON.parse(readFileSync(FILE,'utf8'));
 const found=problems(data);
 assert.deepEqual(found,[],FILE+':\n'+found.join('\n'));
 // Broken copies the rules above must refuse (each would otherwise reach the Worker).
 const first=data.patches[0],tomorrow=new Date(Date.now()+864e5).toISOString().slice(0,10);
 const broken={
  'future effective date':{...first,effectiveDate:tomorrow},
  'future check date':{...first,checkedAt:new Date(Date.now()+3600e3).toISOString()},
  'booking site source':{...first,sourceUrl:'https://www.jalan.net/yad348699/'},
  'booking subdomain source':{...first,sourceUrl:'https://kr.trip.com/hotels/x-hotel-detail-1/y/'},
  'unknown field':{...first,note:'x'},
  'no identity evidence':(({identityEvidence,...rest})=>rest)(first),
  'OTA source kind':{...first,sourceKind:'ota'},
  'opening date on a closure':{...first,state:'closed',openedAt:'2020-01-01'},
 };
 for(const [name,entry] of Object.entries(broken))assert(problems({version:1,patches:[entry]}).length>0,'not refused: '+name);
 assert(problems({version:1,patches:[first,{...first}]}).some(p=>p.includes('second entry')),'not refused: duplicate record');
 for(const bad of [[],{patches:[]},{version:2,patches:[]},{version:1,patches:{}},{version:1,patches:[],extra:1}])assert.deepEqual(problems(bad),['expected {"version":1,"patches":[...]}'],JSON.stringify(bad));
 assert.deepEqual(problems({version:1,patches:[]}),[]);

 // lifecycle.yml: the only path from this file to the production Worker.
 const read=f=>readFileSync('.github/workflows/'+f,'utf8');
 const block=(text,key)=>text.match(new RegExp(`^${key}:\\n((?:[ #].*\\n)+)`,'m'))?.[1]??'';
 const life=read('lifecycle.yml'),deploy=read('deploy.yml'),checks=read('web-checks.yml');
 assert.equal(block(life,'on'),["  push:","    branches: [main]","    paths: ['data/lifecycle-official.json']","  workflow_dispatch:",""].join('\n'),'lifecycle.yml: main push of the evidence file and manual runs only');
 assert(!/pull_request|workflow_run|issue_comment|schedule|repository_dispatch/.test(life.replace(/^\s*#.*$/gm,'')),'lifecycle.yml: no pull request, schedule or other trigger');
 assert.match(life,/^permissions:\n  contents: read\n  actions: read\n(?! )/m,'read-only token; actions: read only for the called deploy (checked-commit.mjs)');
 assert.match(life,/^concurrency:\n  group: yukemuri-catalog-updates\n  cancel-in-progress: false\n  queue: max\n/m,'the catalogue lock for the whole run, as collect.yml');
 assert.equal((life.match(/^\s*concurrency:/gm)??[]).length,1,'no job-level lock: the account lock is taken only inside the called deploy');
 assert.deepEqual(life.match(/secrets\.\w+/g),['secrets.YUKEMURI_CRAWL_ACCESS_KEY'],'the crawl key is the only secret named, once');
 const jobs=life.slice(life.indexOf('\njobs:\n')),apply=jobs.slice(jobs.indexOf('  apply:\n'),jobs.indexOf('  snapshot:\n'));
 const steps=apply.split(/\n(?=      - )/),keyed=steps.filter(s=>/YUKEMURI_CRAWL_ACCESS_KEY/.test(s));
 assert.equal(keyed.length,1,'the key reaches one step');
 assert.match(keyed[0],/^      - name: Apply the official evidence to the Worker\n {8}id: apply\n {8}env:\n {10}YUKEMURI_CRAWL_ACCESS_KEY: \$\{\{ secrets\.YUKEMURI_CRAWL_ACCESS_KEY \}\}\n {8}run: python3 scripts\/runner\/apply-lifecycle\.py\n?$/,'the key is in that step\'s env only; the launcher passes it on stdin (check_lifecycle.py)');
 assert.match(apply,/^  apply:\n(?:    #.*\n)*    if: github\.ref == 'refs\/heads\/main'\n/,'only main is applied, also by hand');
 const order=['check_lifecycle.py','cloud-setup.sh','node scripts/check-lifecycle-official.mjs','apply-lifecycle.py','pending-push-deploy.mjs'].map(s=>apply.indexOf(s));
 assert(order.every((at,i)=>at>0&&(i===0||at>order[i-1])),'offline checks, then the whole file against the Worker contract, then the key, then the pending deploy');
 assert.match(apply,/name: Leave the snapshot to a push deploy of this commit still waiting\n {8}id: pending\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: node scripts\/pending-push-deploy\.mjs \| tee -a "\$GITHUB_OUTPUT"\n/);
 assert.match(apply,/outputs:\n      saved: \$\{\{ steps\.apply\.outputs\.saved \}\}\n      failed: \$\{\{ steps\.apply\.outputs\.failed \}\}\n      deploy_pending: \$\{\{ steps\.pending\.outputs\.deploy_pending \}\}\n/);
 assert.equal(jobs.slice(jobs.indexOf('  snapshot:\n'),jobs.indexOf('  # Refused')),[
  '  snapshot:','    needs: apply',"    if: needs.apply.outputs.saved != '0' && needs.apply.outputs.deploy_pending != 'true'",'    uses: ./.github/workflows/deploy.yml','    with:','      after_collection: true','    secrets: inherit',''].join('\n'),
  'one snapshot through deploy.yml after the evidence is stored, when something was saved and no push deploy of this commit is waiting to build it');
 // A push deploy of the same commit that has not completed runs after this run
 // (catalogue lock) and builds the snapshot; one that completed ran before it.
 const sha='0123456789abcdef0123456789abcdef01234567',run={id:1,head_sha:sha,event:'push',head_branch:'main',path:DEPLOY,status:'queued'};
 for(const status of ['queued','waiting','pending','requested','in_progress'])assert.equal(pushDeployPending([{...run,status}],sha).pending,true,status);
 for(const other of [{status:'completed'},{head_sha:'f'.repeat(40)},{event:'workflow_dispatch'},{event:'workflow_call'},{head_branch:'feature'},{path:'.github/workflows/web-checks.yml'}])assert.equal(pushDeployPending([{...run,...other}],sha).pending,false,JSON.stringify(other));
 assert.equal(pushDeployPending([],sha).pending,false,'a push of the evidence file alone has no push deploy');
 const unreachable=spawnSync(process.execPath,['scripts/pending-push-deploy.mjs'],{encoding:'utf8',env:{...process.env,GITHUB_API_URL:'http://127.0.0.1:9',GITHUB_REPOSITORY:'jihune/yukemuri',GITHUB_SHA:sha,GH_TOKEN:'test-only'}});
 assert.equal(unreachable.status,0);assert.match(unreachable.stdout,/^deploy_pending=false\nreason=could not tell/,'when the API cannot tell, lifecycle.yml builds the snapshot itself');
 assert.match(jobs,/  verdict:\n    needs: \[apply, snapshot\]\n    if: \$\{\{ !cancelled\(\) \}\}\n/,'refused evidence fails the run after the snapshot');
 assert.match(jobs,/test "\$APPLY" = success && test "\$FAILED" = 0 && \{ test "\$SNAPSHOT" = success \|\| test "\$SNAPSHOT" = skipped; \}/);
 // One snapshot per merge of this file alone: the push deploy skips it.
 const ignored=f=>block(f,'on').match(/^    paths-ignore: \[(.*)\]$/gm)??[];
 assert.deepEqual(ignored(deploy),["    paths-ignore: ['**/*.md', 'docs/**', 'archives/**', 'data/lifecycle-official.json']"],'deploy.yml push skips a merge that changes only the evidence file');
 for(const line of ignored(checks))assert(!line.includes('lifecycle-official'),'web-checks.yml still checks the evidence file on pull requests and main pushes');
 // No other workflow applies the file or names the lifecycle launcher.
 for(const f of ['collect.yml','collect-watch.yml','deploy.yml','d1-setup.yml','rollback.yml','usage.yml','web-checks.yml'])assert(!/apply-lifecycle|update-lifecycle|hotel-lifecycle/.test(read(f)),f+' must not apply lifecycle evidence');
 console.log(`Lifecycle evidence passed: ${data.patches.length} entries match the Worker contract, ${Object.keys(broken).length+1} broken copies refused; lifecycle.yml applies them on main only (a push of ${FILE} or by hand), after the whole file passed, with the crawl key in one step, then one snapshot when something was saved: its own, or a waiting push deploy's (deploy.yml skips a push of the file alone).`);
}finally{rmSync(temp,{recursive:true,force:true})}
