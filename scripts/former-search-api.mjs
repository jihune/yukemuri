// The list, map, suggestion and name-index endpoints the Worker had until P03
// (/api/hotels, /api/hotels/map, /api/hotels/suggestions,
// /api/hotels/search-index), answered for tests by the browser's code
// (lib/static-search.ts) over a snapshot built from a test D1. Responses keep
// the former shape, with snapshot cards in place of full hotels. The snapshot
// is rebuilt when the catalogue tables change. Tests only; never deployed.
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {buildSnapshot,compileLib} from './build-search-snapshot.mjs';
export const FORMER_PATHS=/^\/api\/hotels(?:\/(?:map|suggestions|search-index))?$/;
// db: the test D1 binding. favorites(visitor): the visitor's saved ids, read
// through the Worker's /api/favorites as the browser does.
export async function formerSearchApi({db,favorites}){
 const temp=mkdtempSync(join(tmpdir(),'yukemuri-former-api-')),require=createRequire(import.meta.url);
 const builder=require(compileLib(temp,'lib/search-snapshot-build.ts',['lib/static-search.ts','lib/hotel-query.ts']));
 const search=require(join(temp,'lib/static-search.js')),{parseHotelQuery}=require(join(temp,'lib/hotel-query.js'));
 const out=join(temp,'out');let snapshot=null,fingerprint='';
 // Every column the snapshot reads, hashed: any write to them rebuilds it.
 const tables=['SELECT * FROM hotels ORDER BY id','SELECT * FROM hotel_names ORDER BY hotel_id,name_key','SELECT * FROM hotel_lifecycle ORDER BY hotel_id','SELECT * FROM hotel_source_groups ORDER BY hotel_id','SELECT * FROM hotel_source_observations ORDER BY id','SELECT * FROM hotel_description_translations ORDER BY hotel_id'];
 async function current(){
  const hash=createHash('sha256');for(const sql of tables)hash.update(JSON.stringify((await db.prepare(sql).all()).results));
  const next=hash.digest('hex');
  if(!snapshot||next!==fingerprint){
   const {data,manifest}=await buildSnapshot({db,out,builder,now:new Date('2026-01-01T00:00:00Z')});
   snapshot=search.openSnapshot(manifest,data.core,data.cards);search.addSnapshotText(snapshot,data.text);fingerprint=next;
  }
  return snapshot;
 }
 const json=(status,body)=>({status,body});
 async function request(path,{visitor}={}){
  const url=new URL(path,'http://localhost'),p=url.searchParams;
  if(!FORMER_PATHS.test(url.pathname))throw new Error('Not a former search path: '+url.pathname);
  const query=parseHotelQuery(p);
  if(!query)return json(400,{error:'검색 조건을 확인하세요.'});
  const s=await current(),saved=query.savedOnly?await favorites(visitor):[];
  if(url.pathname==='/api/hotels/search-index'){
   const hotels=[];for(let i=0;i<s.size;i++){const names=s.text.names[i];if(names)hotels.push({id:s.core.ids[i],names,location:s.text.location[i],context:s.text.context[i],region:s.core.region[i],prefecture:s.core.prefecture[i],kind:s.core.kind[i],features:s.core.features[i]??0,knownFeatures:s.core.known[i]??0,tripScore:s.core.tripScore[i],tripReviews:s.core.tripReviews[i],jalanScore:s.core.jalanScore[i],jalanReviews:s.core.jalanReviews[i]})}
   return json(200,{hotels});
  }
  if(url.pathname==='/api/hotels/suggestions')return json(200,{suggestions:search.suggestions(s,query.filters,query.savedOnly,saved)});
  if(url.pathname==='/api/hotels/map'){
   const parts=(p.get('bbox')??'').split(','),box=parts.every(v=>/^-?\d+(?:\.\d+)?$/.test(v))?parts.map(Number):[];
   const [west,south,east,north]=box;
   if(box.length!==4||!box.every(Number.isFinite)||south<-90||north>90||west<-180||east>180||south>=north||west>=east)return json(400,{error:'지도 범위를 확인하세요.'});
   return json(200,search.mapArea(s,query.filters,{west,south,east,north},query.savedOnly,saved));
  }
  return json(200,search.resultPage(s,search.searchSnapshot(s,query.filters,query.sort,query.savedOnly,saved),query.page));
 }
 return{request,current,close:()=>rmSync(temp,{recursive:true,force:true})};
}
// For a Worker check on Miniflare: on first use seeds the catalogue as the
// first list request did (and prepares it if still empty), then answers
// the former endpoints with the visitor's favorites from the Worker.
export function formerSearchFor(runtime,key){
 let api=null;
 const favorites=async visitor=>(await (await runtime.dispatchFetch('http://localhost/api/favorites',{headers:visitor?{'X-Yukemuri-Visitor':visitor}:{}})).json()).ids;
 return{
  async request(path,visitor){
   if(!api){
    const db=await runtime.getD1Database('DB');
    // A detail read seeds the catalogue (ensureCatalog) the way the first list
    // read did before P03, also when a check inserted rows of its own first.
    const seeded=await runtime.dispatchFetch('http://localhost/api/hotels/former-search-seed');
    if(seeded.status!==404)throw new Error('Catalogue seeding read failed: '+seeded.status);
    if(!(await db.prepare('SELECT COUNT(*) AS n FROM hotels').first()).n){
     const prepared=await runtime.dispatchFetch('http://localhost/api/crawl-prepare',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':key}});
     if(!prepared.ok)throw new Error('Catalogue preparation failed: '+prepared.status);
    }
    api=await formerSearchApi({db,favorites});
   }
   return api.request(path,{visitor});
  },
  close(){api?.close()},
 };
}
