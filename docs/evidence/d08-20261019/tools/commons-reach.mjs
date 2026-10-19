// D08 PR 2: how many hotels of a public snapshot the Commons photo rule (lib/commons-photos.ts)
// reaches, and how many photos their cards show. Public GETs only; run from the repository root.
// Usage: node docs/evidence/d08-20261019/tools/commons-reach.mjs [saved-snapshot-dir]
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from '../../../../scripts/build-search-snapshot.mjs';

const dir=process.argv[2],base='https://yukemuri.jihune.workers.dev';
const get=async path=>{
 if(dir)return JSON.parse(readFileSync(join(dir,path.split('/').pop()),'utf8'));
 const r=await fetch(base+path,{headers:{'User-Agent':'YukemuriCatalogUpdater/1.0 (+https://github.com/jihune/yukemuri)'}});
 if(!r.ok)throw new Error(path+' HTTP '+r.status);return r.json();
};
const temp=mkdtempSync(join(tmpdir(),'yukemuri-commons-reach-'));
try{
 const {withCommonsPhoto}=createRequire(import.meta.url)(compileLib(temp,'lib/commons-photos.ts'));
 const manifest=await get('/snapshot/manifest.json'),cards=await get(manifest.files.cards);
 const data=JSON.parse(readFileSync('data/commons-trip-photos.json','utf8')),extract=new Set(data.hotels.map(r=>'trip-'+r[0]));
 const tried=cards.filter(c=>extract.has(c.id)),reached=tried.filter(c=>withCommonsPhoto({...c,sources:[]}).commonsPhoto);
 // Files the refresh left out, for hotels of this snapshot, by reason.
 const ids=new Set(cards.map(c=>c.id)),leftOut=data.dropped.filter(([trip])=>ids.has('trip-'+trip)).reduce((a,[,reason])=>({...a,[reason]:(a[reason]??0)+1}),{});
 const photos=c=>(c.photoCandidates??[c.image.url,...(c.image.alternatives??[])]).filter(Boolean).length;
 const byCount=reached.reduce((a,c)=>({...a,[photos(c)]:(a[photos(c)]??0)+1}),{});
 console.log(JSON.stringify({snapshot:manifest.id,generatedAt:manifest.generatedAt,hotels:cards.length,inExtract:tried.length,reached:reached.length,refusedByNames:tried.filter(c=>!reached.includes(c)).map(c=>c.id),leftOut,cardPhotos:byCount,ids:reached.map(c=>c.id)}));
}finally{rmSync(temp,{recursive:true,force:true})}
