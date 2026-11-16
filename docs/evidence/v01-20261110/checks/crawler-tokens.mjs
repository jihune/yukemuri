// Which CRAWLER tokens of lib/edge-guard.ts does a TOOLS agent of check-edge-guard-worker.mjs need?
import {readFileSync} from 'node:fs';
const repo=process.argv[2];
const guard=readFileSync(repo+'/lib/edge-guard.ts','utf8'),check=readFileSync(repo+'/scripts/check-edge-guard-worker.mjs','utf8');
const source=guard.match(/const CRAWLER=\/(.+)\/i;/)[1];
const tools=eval(check.match(/const TOOLS=(\[[\s\S]*?\]);\nconst options/)[1]);
const BROWSER=/^(?:Mozilla|Opera)\//;
const tokens=source.split('|');
console.log('tokens',tokens.length,'tools',tools.length);
for(let i=0;i<tokens.length;i++){
 // "bot(?:[/;)-]" and "$)" are one alternative split by the inner |; rejoin
}
const alts=[];let depth=0,cur='';
let cls=false;for(const ch of source){if(ch==='[')cls=true;else if(ch===']')cls=false;if(!cls&&ch==='(')depth++;if(!cls&&ch===')')depth--;if(ch==='|'&&depth===0&&!cls){alts.push(cur);cur=''}else cur+=ch}alts.push(cur);
for(const alt of alts){
 const without=new RegExp(alts.filter(a=>a!==alt).join('|'),'i');
 const served=tools.filter(a=>!( !a||!BROWSER.test(a)||without.test(a)));
 console.log(JSON.stringify(alt),'removed ->',served.length,'of the check\'s agents would be served',served.length?JSON.stringify(served.map(s=>s.slice(0,60))):'');
}
