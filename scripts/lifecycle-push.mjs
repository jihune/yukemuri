// Did this main push change data/lifecycle-official.json? deploy.yml asks on a
// push and then leaves the deploy to lifecycle.yml, which stores the evidence
// first and calls deploy.yml once after it (L01): one snapshot per merge, built
// after the evidence. A push that changes only the evidence file never starts
// deploy.yml (paths-ignore); this covers a push that also changes other files.
// When the API cannot tell, deploy.yml deploys as before (a second snapshot
// costs reads; a skipped deploy would leave code undeployed). Prints GitHub step
// outputs; never fails.
export const EVIDENCE='data/lifecycle-official.json';

// files: the compare API's changed files.
export function changesEvidence(files){
 return files.some(f=>f.filename===EVIDENCE||f.previous_filename===EVIDENCE);
}

async function main(){
 const {GITHUB_REPOSITORY:repo,GITHUB_SHA:sha,BEFORE:before,GH_TOKEN:token}=process.env,api=process.env.GITHUB_API_URL||'https://api.github.com';
 let deferred=false,reason;
 try{
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo??'')||!/^[0-9a-f]{40}$/.test(sha??'')||!/^[0-9a-f]{40}$/.test(before??'')||/^0+$/.test(before)||!token)throw new Error('GITHUB_REPOSITORY, GITHUB_SHA, BEFORE and GH_TOKEN are required');
  const response=await fetch(`${api}/repos/${repo}/compare/${before}...${sha}`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok)throw new Error('GitHub API returned '+response.status);
  const files=(await response.json()).files;
  if(!Array.isArray(files))throw new Error('no file list');
  deferred=changesEvidence(files);
  reason=deferred?'this push changes '+EVIDENCE+'; lifecycle.yml deploys it after storing the evidence':'this push does not change '+EVIDENCE;
 }catch(error){reason='could not tell ('+error.message+'); deploying here'}
 console.log(`deferred=${deferred}`);console.log(`reason=${reason.replace(/[\r\n]/g,' ')}`);
}

if(import.meta.url===`file://${process.argv[1]}`)await main();
