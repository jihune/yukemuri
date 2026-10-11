// Run the public API integration suite against the built Worker and isolated D1
// (list and search through the browser's code over a snapshot, P03).
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['scripts/serve-former-worker.mjs','scripts/check-public-access.py'],{stdio:'inherit'});
process.exit(result.status??1);
