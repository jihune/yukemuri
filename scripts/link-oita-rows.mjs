// D08 PR 3: the rows of Oita Prefecture's permit list that lib/lodging-lists.ts links to a stay,
// for scripts/update-oita-permits.py (which writes the 簡易宿所 and 下宿 rows only when linked).
// Usage: node scripts/link-oita-rows.mjs < {rows:[[id,name,kind,address,...]],stays:[{id,names,aliases,prefecture,location:{address}}]}
//   prints the linked row IDs as a JSON array.
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-oita-link-'));
try{
 const {lodgingList}=createRequire(import.meta.url)(compileLib(temp,'lib/lodging-lists.ts'));
 const {rows,stays}=JSON.parse(readFileSync(0,'utf8'));
 const list=lodgingList(rows.map(([id,name,,address])=>({id,name,address})));
 const found=new Map(stays.flatMap(s=>{const c=list.candidates(s);return c.length?[[s.id,c]]:[]}));
 process.stdout.write(JSON.stringify([...new Set(list.resolve(found).values())].sort()));
}finally{rmSync(temp,{recursive:true,force:true})}
