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
// The only caller that passes secrets on: it hands them to the deploy job, which holds the environment.
const CALLEE='uses: ./.github/workflows/deploy.yml';
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
const reads=body=>GATED.some(name=>new RegExp(`secrets\\.${name}\\b`).test(body));
export const readers=text=>jobs(text).filter(([,body])=>reads(body)).map(([name])=>name);

// What is wrong with one workflow file; an empty list when it follows the rule.
export function problems(file,text){
 const out=[];
 const bare=text.split('\n').filter(l=>!/^\s*#/.test(l)).join('\n');
 for(const name of new Set(bare.match(/secrets\.\w+/g)??[])){
  if(!ALLOWED.includes(name.slice('secrets.'.length)))out.push(`${file}: reads ${name}, which is not a known secret`);
 }
 if(/secrets\[|toJSON\(secrets/.test(bare))out.push(`${file}: reads secrets by a computed name`);
 for(const [name,body] of jobs(text)){
  const count=(body.match(/^ {4}environment:/gm)??[]).length;
  if(reads(body)){
   if(count!==1||!body.includes(BLOCK))out.push(`${file}: ${name}: reads a production secret and does not carry exactly the "${ENVIRONMENT}" environment block (deployment: false)`);
  }else if(count)out.push(`${file}: ${name}: references an environment but reads no production secret`);
  if(/^ {4}secrets:/m.test(body)&&!(body.includes(CALLEE)&&/^ {4}secrets: inherit$/m.test(body)))out.push(`${file}: ${name}: passes secrets on other than "secrets: inherit" to deploy.yml`);
 }
 return out;
}

// dir: a folder of workflow files; the default is the repository's, a copy lets a control run on changed files.
export function readAll(dir='.github/workflows'){
 return Object.fromEntries(readdirSync(dir).filter(f=>f.endsWith('.yml')).sort().map(f=>[f,readFileSync(`${dir}/${f}`,'utf8')]));
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
 // A job that reads no production secret must not take the environment.
 const collect=files['collect.yml'],chain=collect.indexOf('\n  chain:\n');
 expect('chain job takes the environment','collect.yml',collect.slice(0,chain)+collect.slice(chain).replace('    steps:\n',BLOCK+'    steps:\n'),'chain:');
 // A new job that reads a production secret without the block, or another secret, or by a computed name.
 expect('new job reads the token without the block','new.yml',fresh('${{ secrets.CLOUDFLARE_API_TOKEN }}'),'go:');
 expect('new job reads the crawl key without the block','new.yml',fresh('${{ secrets.YUKEMURI_CRAWL_ACCESS_KEY }}'),'go:');
 expect('new job reads another secret','new.yml',fresh('${{ secrets.OTHER_SECRET }}'),'OTHER_SECRET');
 expect('new job reads all secrets','new.yml',fresh('${{ toJSON(secrets) }}'),'computed name');
 expect('secrets passed to another workflow','new.yml','name: x\non:\n  workflow_dispatch:\njobs:\n  go:\n    uses: ./.github/workflows/other.yml\n    secrets: inherit\n','"secrets: inherit"');
 // A comment that names a secret is not a read.
 assert.equal(problems('c.yml',fresh('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}').replace('    steps:','    # secrets.CLOUDFLARE_API_TOKEN\n    steps:')).length,0,'a comment is not a read');
 return controls;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const files=readAll(process.argv[2]),controls=assertEnvironment(files);
 console.log(`E01 environment check passed: ${EXPECTED.length} jobs carry "${ENVIRONMENT}", ${controls} controls reported`);
}
