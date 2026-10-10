// The maintenance release contains only the stdlib collector and its region data.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const paths=['data/prefectures.json','scripts/crawler/collect.py','scripts/crawler/retry_policy.py','scripts/crawler/source_safety.py','scripts/crawler/update-site.py'];
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const payload={schemaVersion:1,siteOrigin:'https://yukemuri.jihun7891.chatgpt.site',entrypoint:'scripts/crawler/update-site.py',limits:{maxPages:16,maxSeconds:240,intervalSeconds:8,jitterSeconds:4},files:paths.map(path=>{const content=readFileSync(new URL(path,root),'utf8');return {path,sha256:sha(content),content}})};
const release={...payload,release:sha(JSON.stringify(sorted(payload)))};
writeFileSync(fileURLToPath(new URL('data/collector-release.generated.json',root)),JSON.stringify(release,null,2)+'\n');
console.log('Collector release '+release.release+' ('+paths.length+' approved files)');
