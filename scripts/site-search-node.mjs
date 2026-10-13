// Expected values for browser checks: the snapshot the running site serves,
// searched with the page's own code (lib/static-search.ts) compiled for Node.
// Usage: const search=await siteSearch(base); search.list('rating=8') returns
// the page-1 response for those address parameters; search.map(query, bbox).
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
export async function siteSearch(base){
 const temp=mkdtempSync(join(tmpdir(),'yukemuri-site-search-')),require=createRequire(import.meta.url);
 try{
  require(compileLib(temp,'lib/static-search.ts',['lib/hotel-query.ts']));
  const search=require(join(temp,'lib/static-search.js')),{parseHotelQuery}=require(join(temp,'lib/hotel-query.js'));
  const get=async path=>{const r=await fetch(base+path);if(!r.ok)throw new Error(path+' '+r.status);return r.json()};
  const manifest=await get('/snapshot/manifest.json');
  const s=search.openSnapshot(manifest,await get(manifest.files.core),await get(manifest.files.cards));
  search.addSnapshotText(s,await get(manifest.files.text));
  const query=params=>{const q=parseHotelQuery(new URLSearchParams(params));if(!q)throw new Error('Bad query '+params);return q};
  return{
   snapshot:s,
   list(params,saved=[]){const q=query(params);return search.resultPage(s,search.searchSnapshot(s,q.filters,q.sort,q.savedOnly,saved),q.page)},
   map(params,bounds,saved=[]){const q=query(params);return search.mapArea(s,q.filters,bounds,q.savedOnly,saved)},
   // The whole result in list order (the U05 map shows all of it).
   order(params,saved=[]){const q=query(params);return search.searchSnapshot(s,q.filters,q.sort,q.savedOnly,saved).order},
   geo:manifest.files.geo?await get(manifest.files.geo):null,
  };
 }finally{rmSync(temp,{recursive:true,force:true})}
}
