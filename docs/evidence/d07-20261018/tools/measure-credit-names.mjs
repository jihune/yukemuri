// D07 PR 3 (D07-20261019.md 'D07 PR 3'): rows read by a photo-credits page (40 hotels after a cursor)
// with its Jalan list names, three ways, on Miniflare D1: the page query and localeNamesFor's json_each
// query, the page query with a LEFT JOIN, and the page query with a key range on hotel_locale_names.
// Usage: node docs/evidence/d07-20261018/tools/measure-credit-names.mjs
import {createRequire} from 'node:module';
import {readFileSync,realpathSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
const temp=mkdtempSync(join(tmpdir(),'credit-names-'));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("")}}',d1Databases:{DB:'m'},d1Persist:temp});
try{
 const db=await mf.getD1Database('DB');
 await db.prepare('CREATE TABLE hotels (id text PRIMARY KEY NOT NULL, payload text NOT NULL)').run();
 await db.prepare(readFileSync('drizzle/0015_faulty_menace.sql','utf8')).run();
 await db.prepare("INSERT INTO hotels (id,payload) SELECT 'jalan-'||(300000+value),'{}' FROM json_each(?)").bind(JSON.stringify(Array.from({length:2000},(_,i)=>i))).run();
 const after='jalan-300099',page='SELECT id,payload FROM hotels WHERE id>? ORDER BY id LIMIT 41';
 for(const stored of [0,20,40,2000]){
  await db.prepare('DELETE FROM hotel_locale_names').run();
  // Names for the first `stored` hotels of the page (2000: every hotel).
  const named=stored===2000?Array.from({length:2000},(_,i)=>i):Array.from({length:stored},(_,i)=>100+i);
  await db.prepare("INSERT INTO hotel_locale_names (hotel_id,name_en,en_url,en_checked_at) SELECT 'jalan-'||(300000+value),'Hotel','u','t' FROM json_each(?)").bind(JSON.stringify(named)).run();
  const rows=await db.prepare(page).bind(after).all(),ids=rows.results.slice(0,40).map(r=>r.id);
  const each=await db.prepare('SELECT * FROM hotel_locale_names WHERE hotel_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all();
  const join=await db.prepare('SELECT h.id,h.payload,l.name_ko,l.ko_url,l.ko_checked_at,l.name_en,l.en_url,l.en_checked_at FROM hotels h LEFT JOIN hotel_locale_names l ON l.hotel_id=h.id WHERE h.id>? ORDER BY h.id LIMIT 41').bind(after).all();
  const range=await db.prepare('SELECT * FROM hotel_locale_names WHERE hotel_id>? AND hotel_id<=?').bind(after,ids.at(-1)).all();
  console.log(JSON.stringify({stored,page:rows.meta.rows_read,jsonEach:each.meta.rows_read,pagePlusJsonEach:rows.meta.rows_read+each.meta.rows_read,leftJoin:join.meta.rows_read,range:range.meta.rows_read,pagePlusRange:rows.meta.rows_read+range.meta.rows_read,names:[each.results.length,join.results.filter(r=>r.name_en).length,range.results.length]}));
 }
}finally{await mf.dispose();rmSync(temp,{recursive:true,force:true})}
