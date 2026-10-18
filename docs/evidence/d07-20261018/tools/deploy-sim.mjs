// Scratch: the public cards as a deploy of this commit would show them (Wikidata names applied,
// with the card marker lib/search-snapshot-build.ts writes).
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';import {createRequire} from 'node:module';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
const [src,dst,root]=process.argv.slice(2);
const {compileLib}=await import(resolve(root,'scripts/build-search-snapshot.mjs'));
const {withWikidataNames}=createRequire(import.meta.url)(compileLib(mkdtempSync(join(tmpdir(),'wd-')),'lib/wikidata-names.ts'));
const cards=JSON.parse(readFileSync(join(src,'cards.json'),'utf8')).map(c=>{
 const before={...c,aliases:[],sources:[]},h=withWikidataNames(before);if(h===before)return c;
 const item=h.sources.find(s=>s.sourceId==='wikidata-name:'+h.id).url.split('/').pop();
 return {...c,names:h.names,wikidataNames:{item,was:Object.fromEntries(['ko','en'].filter(k=>h.names[k]!==c.names[k]).map(k=>[k,c.names[k]]))}};
});
writeFileSync(join(dst,'cards.json'),JSON.stringify(cards));console.log('cards',cards.length,'marked',cards.filter(c=>c.wikidataNames).length);
