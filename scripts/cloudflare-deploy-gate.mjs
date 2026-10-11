// Decide whether the Cloudflare deploy workflow may touch the account.
// Prints GitHub step outputs (key=value lines). Exits 1 on an inconsistent config.
import {readFileSync} from 'node:fs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const workersOrigin=/^https:\/\/yukemuri\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/;

export function deployGate(config){
 const keys=['workerName','databaseName','databaseId','publicOrigin','autoDeploy'];
 if(!config||typeof config!=='object'||JSON.stringify(Object.keys(config).sort())!==JSON.stringify([...keys].sort()))throw new Error('cloudflare-deploy.json must have exactly: '+keys.join(', '));
 if(config.workerName!=='yukemuri'||config.databaseName!=='yukemuri')throw new Error('Worker and D1 database are both named yukemuri');
 if(config.databaseId!==null&&!uuid.test(config.databaseId))throw new Error('databaseId must be null or a D1 UUID');
 if(config.publicOrigin!==null&&!workersOrigin.test(config.publicOrigin))throw new Error('publicOrigin must be null or https://yukemuri.<subdomain>.workers.dev');
 if(typeof config.autoDeploy!=='boolean')throw new Error('autoDeploy must be true or false');
 if(!config.databaseId)return {enabled:false,reason:'D1 database_id is not recorded yet'};
 if(!config.autoDeploy)return {enabled:false,reason:'autoDeploy is off until the data load is complete'};
 if(!config.publicOrigin)throw new Error('autoDeploy needs publicOrigin for the post-deploy checks');
 return {enabled:true,reason:'enabled',databaseName:config.databaseName,databaseId:config.databaseId,publicOrigin:config.publicOrigin};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const gate=deployGate(JSON.parse(readFileSync(process.argv[2]??'cloudflare-deploy.json','utf8')));
 console.log(`enabled=${gate.enabled}`);console.log(`reason=${gate.reason}`);
 if(gate.enabled){console.log(`database_name=${gate.databaseName}`);console.log(`public_origin=${gate.publicOrigin}`)}
}
