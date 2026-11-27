// E01: the Cloudflare API token and the crawl key are kept in the GitHub
// environment `production` (deployment branches limited to main, set by the
// repository owner in Settings), not in repository secrets. A job gets an
// environment's secrets only when it references the environment, so every job
// in .github/workflows that reads one of them must carry the environment block
// below, and no other job may (docs/ENV-20261124.md). The branch limit lives in
// Settings, outside any branch's copy of these files; this check keeps the files
// from drifting away from it. It does not read Settings.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

export const ENVIRONMENT='production';
// Read only through the environment.
export const GATED=['CLOUDFLARE_API_TOKEN','YUKEMURI_CRAWL_ACCESS_KEY'];
// Every secret name a workflow may read; CLOUDFLARE_ACCOUNT_ID stays a repository secret.
const ALLOWED=['CLOUDFLARE_ACCOUNT_ID',...GATED];
// deployment: false keeps each run from writing a deployment record (a collection runs about hourly).
export const BLOCK=`    environment:\n      name: ${ENVIRONMENT}\n      deployment: false\n`;
// The only callee that gets secrets: the deploy job holds the environment. Its callers pass the three secrets by
// name, the form the docs show for a secret that lives only in the environment (not secrets: inherit), and deploy.yml
// declares them required, so a caller that leaves one out fails instead of running with an empty value.
const CALLEE='uses: ./.github/workflows/deploy.yml';
const PASS='    secrets:\n'+ALLOWED.map(n=>`      ${n}: \${{ secrets.${n} }}\n`).join('');
const DECLARE='    secrets:\n'+ALLOWED.map(n=>`      ${n}:\n        required: true\n`).join('');
// The jobs that read a production secret today. A new one must carry the block and be added here.
const EXPECTED=['collect-chain.yml:wait','collect.yml:collect','d1-setup.yml:d1','deploy.yml:deploy','lifecycle.yml:apply','rollback.yml:rollback','usage.yml:usage'];

// Jobs of a workflow file: [name, body] with whole-line comments dropped, so a comment that names a secret is not a read.
export function jobs(text){
 const out=[];
 let inJobs=false,current=null;
 for(const line of text.split('\n')){
  if(/^\S/.test(line)&&!line.startsWith('#'))inJobs=line.startsWith('jobs:');
  if(!inJobs||/^\s*#/.test(line))continue;
  const header=line.match(/^ {2}([\w-]+):[ \t]*(#.*)?$/);
  if(header){current=[header[1],''];out.push(current);continue}
  if(current)current[1]+=line+'\n';
 }
 return out;
}
// The workflow's own keys (on:, env:, defaults: ...) wherever they sit relative to jobs:, whole-line comments dropped.
function outsideJobs(text){
 let inJobs=false;
 return text.split('\n').filter(line=>{
  if(/^\S/.test(line)&&!line.startsWith('#'))inJobs=line.startsWith('jobs:');
  return !inJobs&&!/^\s*#/.test(line);
 }).join('\n');
}
// The job list must be in the two-space form jobs() reads; another form (quoted or anchored job key, other
// indentation, CRLF) is reported instead of being skipped, since a job read wrongly would escape the rule.
export function shape(text){
 const out=[];
 if(text.includes('\r'))out.push('has CRLF line ends, which this check does not read');
 let inJobs=false,first=true;
 for(const line of text.split('\n')){
  if(/^\S/.test(line)&&!line.startsWith('#'))inJobs=line.startsWith('jobs:');
  if(!inJobs||/^\s*(#.*)?$/.test(line)||line.startsWith('jobs:'))continue;
  const indent=line.length-line.trimStart().length;
  if(/^ {2}[\w-]+:[ \t]*(#.*)?$/.test(line))first=false;
  else if(first||indent<=2){out.push(`has a jobs line in a form this check does not read: "${line.trim()}"`);first=false}
 }
 return out;
}
const isCall=body=>/^ {4}uses:/m.test(body);
const mentions=body=>GATED.some(name=>new RegExp(`secrets\\.${name}\\b`).test(body));
const reads=body=>!isCall(body)&&mentions(body);
export const readers=text=>jobs(text).filter(([,body])=>reads(body)).map(([name])=>name);

// What is wrong with one workflow file; an empty list when it follows the rule.
export function problems(file,text){
 const out=[];
 const bare=text.split('\n').filter(l=>!/^\s*#/.test(l)).join('\n');
 for(const name of new Set(bare.match(/secrets\.\w+/g)??[])){
  if(!ALLOWED.includes(name.slice('secrets.'.length)))out.push(`${file}: reads ${name}, which is not a known secret`);
 }
 if(/secrets\s*\[|toJson\s*\(\s*secrets/i.test(bare))out.push(`${file}: reads secrets by a computed name`);
 out.push(...shape(text).map(m=>`${file}: ${m}`));
 // Outside every job (workflow-level env:) a read has no job to carry the environment.
 if(mentions(outsideJobs(text)))out.push(`${file}: reads a production secret outside a job (workflow-level env)`);
 const head=outsideJobs(text);
 if(readers(text).length&&/^ {2}workflow_call:/m.test(head)&&!head.includes(DECLARE))out.push(`${file}: reads production secrets under workflow_call but does not declare the three secrets as required`);
 for(const [name,body] of jobs(text)){
  const count=(body.match(/^ {4}environment:/gm)??[]).length;
  if(reads(body)){
   if(count!==1||!body.includes(BLOCK))out.push(`${file}: ${name}: reads a production secret and does not carry exactly the "${ENVIRONMENT}" environment block (deployment: false)`);
  }else if(count)out.push(`${file}: ${name}: references an environment but reads no production secret`);
  const passed=body.match(/^ {4}secrets:.*\n(?: {6}.*\n)*/m)?.[0];
  if(body.includes(CALLEE)){if(passed!==PASS)out.push(`${file}: ${name}: calls deploy.yml without passing exactly the three secrets by name (no "secrets: inherit")`)}
  else if(passed!==undefined)out.push(`${file}: ${name}: passes secrets on to something other than deploy.yml`);
 }
 return out;
}

// dir: a folder of workflow files; the default is the repository's, a copy lets a control run on changed files.
export function readAll(dir='.github/workflows'){
 return Object.fromEntries(readdirSync(dir).filter(f=>/\.ya?ml$/.test(f)).sort().map(f=>[f,readFileSync(`${dir}/${f}`,'utf8')]));
}

// Where the environment block of a job sits in the file text.
function blockAt(text,job){
 const start=text.indexOf(`\n  ${job}:\n`);
 const at=start<0?-1:text.indexOf(BLOCK,start);
 assert(at>=0,`the block of ${job} is in the file`);
 return at;
}
const fresh=use=>`name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n        env:\n          V: ${use}\n`;

// The files pass, the jobs found are the ones this check was written for, and a copy of the
// files fails for each way of drifting (a copy that is not reported is a check that would not notice).
// Returns how many controls were reported.
export function assertEnvironment(files){
 const bad=Object.entries(files).flatMap(([file,text])=>problems(file,text));
 assert.equal(bad.length,0,`E01 environment: ${bad.join('; ')}`);
 const found=Object.entries(files).flatMap(([file,text])=>readers(text).map(job=>`${file}:${job}`));
 assert.equal(found.join(),EXPECTED.join(),`E01: the jobs that read a production secret changed (new: ${found.filter(j=>!EXPECTED.includes(j)).join()||'none'}; gone: ${EXPECTED.filter(j=>!found.includes(j)).join()||'none'}); a new one carries the environment block and is listed in EXPECTED`);

 let controls=0;
 const expect=(label,file,copy,needle)=>{
  assert.notEqual(copy,files[file]??'',`control ${label} changed nothing`);
  assert(problems(file,copy).some(p=>p.includes(needle)),`E01 control: ${file} "${label}" is not reported`);controls++;
 };
 for(const [file,text] of Object.entries(files)){
  for(const job of readers(text)){
   const at=blockAt(text,job),mutate=block=>text.slice(0,at)+block+text.slice(at+BLOCK.length);
   expect(`${job}: block cut out`,file,mutate(''),`${job}:`);
   expect(`${job}: another environment`,file,mutate(BLOCK.replace(ENVIRONMENT,'staging')),`${job}:`);
   expect(`${job}: deployment record kept`,file,mutate(BLOCK.replace('      deployment: false\n','')),`${job}:`);
   expect(`${job}: environment twice`,file,mutate(BLOCK+BLOCK),`${job}:`);
  }
 }
 // The call to deploy.yml passes the three secrets by name, and deploy.yml declares them required.
 for(const [file,text] of Object.entries(files)){
  if(text.includes(CALLEE)){
   expect(`${file}: caller passes secrets: inherit`,file,text.replace(PASS,'    secrets: inherit\n'),'calls deploy.yml');
   expect(`${file}: caller leaves the crawl key out`,file,text.replace(PASS,PASS.split('\n').slice(0,-2).join('\n')+'\n'),'calls deploy.yml');
  }
  if(/^ {2}workflow_call:/m.test(text)&&readers(text).length){
   for(const name of ALLOWED){
    const entry=`      ${name}:\n        required: true\n`;
    expect(`${file}: ${name} not declared`,file,text.replace(entry,''),'declare');
    expect(`${file}: ${name} not required`,file,text.replace(entry,entry.replace('true','false')),'declare');
   }
  }
 }
 // A job that reads no production secret must not take the environment.
 const collect=files['collect.yml'],chain=collect.indexOf('\n  chain:\n');
 expect('chain job takes the environment','collect.yml',collect.slice(0,chain)+collect.slice(chain).replace('    steps:\n',BLOCK+'    steps:\n'),'chain:');
 // A new job that reads a production secret without the block, or another secret, or by a computed name.
 expect('new job reads the token without the block','new.yml',fresh('${{ secrets.CLOUDFLARE_API_TOKEN }}'),'go:');
 expect('new job reads the crawl key without the block','new.yml',fresh('${{ secrets.YUKEMURI_CRAWL_ACCESS_KEY }}'),'go:');
 expect('new job reads another secret','new.yml',fresh('${{ secrets.OTHER_SECRET }}'),'OTHER_SECRET');
 expect('new job reads all secrets','new.yml',fresh('${{ toJSON(secrets) }}'),'computed name');
// Forms a line reader could skip: workflow-level env, a quoted or anchored job key, other indentation, CRLF, any-case function names.
 const TOKEN='${{ secrets.CLOUDFLARE_API_TOKEN }}';
 const wf=(top,key,use)=>`name: x\non:\n  workflow_dispatch:\n${top}jobs:\n${key}\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n        env:\n          V: ${use}\n`;
 expect('workflow-level env reads the token','new.yml',wf(`env:\n  V: ${TOKEN}\n`,'  go:','x'),'outside a job');
 expect('workflow-level env after jobs reads the token','new.yml',`name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\nenv:\n  V: ${TOKEN}\n`,'outside a job');
 expect('quoted job key','new.yml',wf('',"  'go':",TOKEN),'does not read');
 expect('anchored job key','new.yml',wf('','  go: &x',TOKEN),'does not read');
 expect('four-space jobs','new.yml',`name: x\non:\n  workflow_dispatch:\njobs:\n    go:\n        runs-on: ubuntu-latest\n        steps:\n          - run: echo\n            env:\n              V: ${TOKEN}\n`,'does not read');
 expect('CRLF line ends','new.yml',wf('','  go:',TOKEN).replace(/\n/g,'\r\n'),'CRLF');
 expect('toJson in another case','new.yml',fresh('${{ toJson(secrets) }}'),'computed name');
 expect('spaces inside toJSON','new.yml',fresh('${{ toJSON( secrets ) }}'),'computed name');
  expect('secrets passed to another workflow','new.yml','name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    uses: ./.github/workflows/other.yml\n    secrets: inherit\n','passes secrets on');
 // A comment that names a secret is not a read.
 assert.equal(problems('c.yml',fresh('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}').replace('    steps:','    # secrets.CLOUDFLARE_API_TOKEN\n    steps:')).length,0,'a comment is not a read');
 return controls;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const files=readAll(process.argv[2]),controls=assertEnvironment(files);
 console.log(`E01 environment check passed: ${EXPECTED.length} jobs carry "${ENVIRONMENT}", ${controls} controls reported`);
}
