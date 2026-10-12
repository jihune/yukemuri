// Manual rollback (rollback.yml, H01): (a) move the Worker back to an earlier
// version, or (b) restore D1 to a Time Travel bookmark. The current D1 bookmark
// goes to the run summary before either change, so the rollback itself can be
// undone. Values pass through env; logs carry version ids and bookmarks only.
import {readFileSync,writeFileSync,appendFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const ACTIONS=['worker-rollback','d1-restore'];
export const CONFIRM='rollback';
// D1 bookmarks look like 00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683.
// Docs form, with lengths left open: four hex groups joined by hyphens.
export const BOOKMARK=/^[0-9a-f]{1,32}(?:-[0-9a-f]{1,64}){3}$/;
export const VERSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID=VERSION;
export const CAUTION=[
 '- 6단계 뒤에는 수집(gentle)이 끝날 때마다 `deploy.yml`이 main HEAD를 다시 배포한다. Worker 되돌림만으로는 다음 수집 때 덮인다. 결함 커밋을 되돌리는 main revert PR을 함께 병합한다.',
 '- `cloudflare-deploy.json`의 `autoDeploy`를 `false`로 바꾸면 배포와 함께 수집도 멈춘다(`collect.yml`이 요청 전에 실패한다). 수집 중지가 목적일 때만 쓴다.',
 '- D1 복구는 bookmark 뒤의 모든 쓰기(수집 관측·즐겨찾기)를 덮어쓴다. 검색 스냅숏은 복구 전 D1로 만든 것이므로, 복구 뒤 `Cloudflare deploy`를 수동 실행해 스냅숏을 다시 만든다.',
];

export class RollbackError extends Error {}

function wranglerJson(run,args){
 const out=run(args);
 try{return JSON.parse(out.slice(out.indexOf('{')))}catch{throw new RollbackError('wrangler '+args.slice(0,2).join(' ')+' returned no JSON')}
}

export function rollback({action,versionId='',bookmark='',confirm='',deploy,run,say}){
 if(confirm!==CONFIRM)throw new RollbackError(`confirm must be "${CONFIRM}"; nothing was changed`);
 if(!ACTIONS.includes(action))throw new RollbackError('action must be one of '+ACTIONS.join(', '));
 if(!UUID.test(deploy.databaseId??''))throw new RollbackError('cloudflare-deploy.json has no databaseId; nothing to roll back');
 versionId=versionId.trim();bookmark=bookmark.trim();
 if(action==='worker-rollback'&&versionId&&!VERSION.test(versionId))throw new RollbackError('version_id is not a Worker version UUID');
 if(action==='worker-rollback'&&bookmark)throw new RollbackError('bookmark applies to d1-restore only');
 if(action==='d1-restore'&&!BOOKMARK.test(bookmark))throw new RollbackError('bookmark is required for d1-restore and must look like a D1 bookmark');
 if(action==='d1-restore'&&versionId)throw new RollbackError('version_id applies to worker-rollback only');
 const db=deploy.databaseName,worker=deploy.workerName;
 say(`## 수동 롤백: ${action}`);say('');
 // Record the current bookmark first, for both actions.
 const current=wranglerJson(run,['d1','time-travel','info',db,'--json']).bookmark;
 if(typeof current!=='string'||!BOOKMARK.test(current))throw new RollbackError('d1 time-travel info returned no bookmark; nothing was changed');
 say(`- 바꾸기 전 D1 bookmark: \`${current}\`(이 롤백을 되돌릴 때 d1-restore에 넣는다)`);
 if(action==='worker-rollback'){
  const before=wranglerJson(run,['deployments','status','--name',worker,'--json']);
  const versions=d=>(d.versions??[]).map(v=>`${v.version_id} ${v.percentage}%`).join(', ');
  say(`- 되돌리기 전 배포: ${before.id??'?'}(${versions(before)})`);
  run(['rollback',...(versionId?[versionId]:[]),'--name',worker,'--message','rollback.yml','--yes']);
  const after=wranglerJson(run,['deployments','status','--name',worker,'--json']);
  say(`- 되돌린 뒤 배포: ${after.id??'?'}(${versions(after)})`);
  const active=(after.versions??[]).filter(v=>v.percentage===100).map(v=>v.version_id);
  if(after.id===before.id||active.length!==1||(versionId&&active[0]!==versionId))throw new RollbackError('the active deployment did not change to the requested version');
 }else{
  if(bookmark===current)throw new RollbackError('bookmark equals the current bookmark; nothing to restore');
  const result=wranglerJson(run,['d1','time-travel','restore',db,'--bookmark',bookmark,'--json']);
  say(`- 복구한 bookmark: \`${result.bookmark??'?'}\`, 복구 직전 bookmark(API 응답): \`${result.previous_bookmark??'?'}\``);
  if(result.bookmark!==bookmark)throw new RollbackError('d1 time-travel restore did not report the requested bookmark');
 }
 say('');for(const line of CAUTION)say(line);
}

function main(){
 const summary=process.env.GITHUB_STEP_SUMMARY;
 const say=line=>{console.log(line);if(summary)appendFileSync(summary,line+'\n')};
 const deploy=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
 const dir=mkdtempSync(join(tmpdir(),'yukemuri-rollback-'));
 const config=join(dir,'wrangler.json');
 // Only the Worker name and the D1 binding; rollback and Time Travel need nothing else.
 writeFileSync(config,JSON.stringify({name:deploy.workerName,d1_databases:[{binding:'DB',database_name:deploy.databaseName,database_id:deploy.databaseId}]}));
 const wrangler=process.env.YUKEMURI_WRANGLER||resolve('node_modules/wrangler/bin/wrangler.js');
 const run=args=>{
  const result=spawnSync(process.execPath,[wrangler,...args,'--config',config],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true',NO_COLOR:'1'},timeout:600_000});
  if(result.status!==0){
   const line=(result.stderr+result.stdout).split('\n').find(l=>/error|✘/i.test(l))??'no error line';
   throw new RollbackError('wrangler '+args.slice(0,3).join(' ')+' failed: '+line.slice(0,300));
  }
  return result.stdout;
 };
 try{
  rollback({action:process.env.ACTION??'',versionId:process.env.VERSION_ID??'',bookmark:process.env.BOOKMARK??'',confirm:process.env.CONFIRM??'',deploy,run,say});
 }catch(error){
  const message=error instanceof RollbackError?error.message:'Rollback failed ('+error.constructor.name+')';
  say('');say('**실패**: '+message);console.log('::error::'+message);process.exitCode=1;
 }finally{rmSync(dir,{recursive:true,force:true})}
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)main();
