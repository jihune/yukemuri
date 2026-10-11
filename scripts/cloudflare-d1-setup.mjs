// Find or create the yukemuri D1 database (stage 3). Reads CLOUDFLARE_API_TOKEN
// and CLOUDFLARE_ACCOUNT_ID from the environment through wrangler; prints only
// the database name, id and whether it was created. Writes the id into the
// runner's working copy of cloudflare-deploy.json so the build targets it.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';

const NAME='yukemuri',CONFIG='dist/server/wrangler.json';
const wrangler=args=>{
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(result.status!==0)throw new Error(`wrangler ${args.slice(0,2).join(' ')} failed (exit ${result.status}):\n${result.stderr.slice(-2000)}`);
 return result.stdout;
};
const listed=()=>JSON.parse(wrangler(['d1','list','--json','--config',CONFIG])).filter(db=>db.name===NAME);

let matches=listed(),created=false;
if(matches.length===0){
 wrangler(['d1','create',NAME,'--location','apac','--config',CONFIG]);
 created=true;matches=listed();
}
if(matches.length!==1)throw new Error(`Expected one D1 database named ${NAME}, found ${matches.length}`);
const id=matches[0].uuid;
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id??''))throw new Error('wrangler d1 list did not return a D1 uuid for '+NAME);
const deploy=JSON.parse(readFileSync('cloudflare-deploy.json','utf8'));
if(deploy.databaseId&&deploy.databaseId!==id)throw new Error('cloudflare-deploy.json records a different databaseId; stop and compare before applying migrations');
writeFileSync('cloudflare-deploy.json',JSON.stringify({...deploy,databaseId:id},null,2)+'\n');
console.log(`database_name=${NAME}`);console.log(`database_id=${id}`);console.log(`created=${created}`);
