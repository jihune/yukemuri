// V01-4 helper: lib/crawl-contract.ts publicUrl and crawlJobUrl on a list of addresses (called by v01-4-url-rules.py).
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {compileLib} from '../../../scripts/build-search-snapshot.mjs';
const [asked,answered,folder]=process.argv.slice(2),temp=mkdtempSync(join(folder,'tsc-'));
try{
 const {publicUrl,crawlJobUrl}=createRequire(import.meta.url)(compileLib(temp,'lib/crawl-contract.ts'));
 writeFileSync(answered,JSON.stringify(Object.fromEntries(JSON.parse(readFileSync(asked,'utf8')).map(u=>[u,{publicUrl:publicUrl.safeParse(u).success,crawlJobUrl:crawlJobUrl.safeParse(u).success}]))));
}finally{rmSync(temp,{recursive:true,force:true})}
