import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-check-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/hotel-types.ts','lib/hotel-search.ts','lib/hotel-ratings.ts','lib/hotels.real.ts','lib/hotel-catalog.ts','--outDir',dir,'--module','commonjs','--target','es2020','--esModuleInterop','--skipLibCheck','--resolveJsonModule'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 const require=createRequire(join(dir,'test.cjs'));
 const root=existsSync(join(dir,'lib/hotels.real.js'))?join(dir,'lib'):dir;
 const {realHotels}=require(join(root,'hotels.real.js'));
 const {DEFAULT_FILTERS}=require(join(root,'hotel-types.js'));
 const {filterHotels}=require(join(root,'hotel-search.js'));
 const {primaryRating,meetsVerifiedCriteria}=require(join(root,'hotel-ratings.js'));
 const {catalogHotels}=require(join(root,'hotel-catalog.js'));
 const criteria={...DEFAULT_FILTERS,minRating:9,minReviews:50};
 assert.equal(realHotels.length,20);
 assert.equal(new Set(realHotels.map(h=>h.id)).size,20);
 assert.equal(filterHotels(realHotels,DEFAULT_FILTERS).length,20);
 const verified=filterHotels(realHotels,criteria);
 assert.equal(verified.length,12);
 assert(verified.some(h=>h.id==='konosumika'));
 assert(!verified.some(h=>h.id==='bourou-noboribetsu'));
 assert.equal(filterHotels(realHotels,{...DEFAULT_FILTERS,query:'札幌'}).length,5);
 assert.equal(filterHotels(realHotels,{...DEFAULT_FILTERS,query:'홋카이도'}).length,20);
 const jozankei=filterHotels(realHotels,{...DEFAULT_FILTERS,query:'Jozankei'});
 assert.equal(jozankei.length,4);
 assert(!jozankei.some(h=>h.id==='yuen-sapporo'),'Sapporo city hotels are not automatically in Jozankei');
 assert.equal(filterHotels(realHotels,{...DEFAULT_FILTERS,query:'유노카와'}).length,3);
 assert.equal(filterHotels(realHotels,{...criteria,region:'noboribetsu',features:['natural','roomOutdoor']}).length,2);
 assert.equal(filterHotels(realHotels,{...DEFAULT_FILTERS,features:['roomOutdoor'],ryokanOnly:true}).length,3);
 const privateMatches=filterHotels(realHotels,{...DEFAULT_FILTERS,features:['privateBath']});
 assert(!privateMatches.some(h=>h.id==='daiichi-takimotokan'));
 assert(!privateMatches.some(h=>h.id==='konosumika'));
 const both=filterHotels(realHotels,{...DEFAULT_FILTERS,features:['privateBath','roomOnsen']});
 assert.equal(both.length,5);
 const sorted=filterHotels(realHotels,DEFAULT_FILTERS,'reviews');
 assert(sorted.every((h,i)=>!i||primaryRating(sorted[i-1]).reviewCount>=primaryRating(h).reviewCount));
 assert(catalogHotels.length>20);
 assert.equal(new Set(catalogHotels.map(h=>h.id)).size,catalogHotels.length);
 assert(!catalogHotels.some(h=>h.id==='toya-02'));
 assert(filterHotels(catalogHotels,{...DEFAULT_FILTERS,region:'pref-tokyo'}).length>0);
 assert.equal(filterHotels(catalogHotels,{...DEFAULT_FILTERS,region:'pref-tokyo',features:['natural']}).length,0);
 const jalanMatches=filterHotels(catalogHotels,{...DEFAULT_FILTERS,ratingProvider:'jalan',minRating:4.5,minReviews:50});
 assert(jalanMatches.length>0&&jalanMatches.every(h=>h.ratings.some(r=>r.provider==='jalan'&&r.scale===5&&r.score>=4.5&&r.reviewCount>=50)));
 for(const h of catalogHotels){
  assert(h.sources.every(s=>!s.isMock&&s.url));
  assert(h.ratings.every(r=>r.score>0&&r.score<=r.scale&&r.reviewCount>=0&&r.scale===(r.provider==='trip'?10:5)));
  for(const fact of Object.values(h.features)){assert(h.sources.some(s=>s.sourceId===fact.sourceId));assert.equal(fact.verifiedAt!==null,fact.value!==null)}
 }
 // Criteria boundaries and provider isolation must survive future catalog edits.
 const fixture=structuredClone(realHotels[0]);
 fixture.ratings=[{...fixture.ratings[0],score:9,reviewCount:50}];
 assert.equal(filterHotels([fixture],criteria).length,1);
 fixture.ratings[0].reviewCount=49;
 assert.equal(filterHotels([fixture],criteria).length,0);
 fixture.ratings[0].reviewCount=50;fixture.ratings[0].score=8.9;
 assert.equal(filterHotels([fixture],criteria).length,0);
 fixture.ratings=[{...fixture.ratings[0],provider:'jalan',scale:5,score:5,reviewCount:5000}];
 assert.equal(primaryRating(fixture),undefined);
 assert.equal(meetsVerifiedCriteria(fixture),false);
 assert.equal(filterHotels([fixture],criteria).length,0);
 assert.equal(filterHotels([fixture],DEFAULT_FILTERS).length,1);
 fixture.ratings=[];
 assert.equal(filterHotels([fixture],DEFAULT_FILTERS).length,1);
 assert.equal(filterHotels([fixture],criteria).length,0);
 const credits=JSON.parse(readFileSync('public/images/credits.json','utf8'));
 for(const h of realHotels){
  assert(h.names.ko&&h.names.ja&&h.names.en);
  assert(h.sources.every(s=>!s.isMock&&s.sourceType!=='seed'&&s.verifiedAt&&s.url));
  assert.equal(primaryRating(h).scale,10);
  assert(h.ratings.every(r=>r.score>=0&&r.score<=r.scale&&r.reviewCount>=0&&!r.isMock&&r.verifiedAt));
  assert(h.ratings.every(r=>r.provider==='trip'?r.scale===10:r.scale===5));
  assert(h.location.latitude>41&&h.location.latitude<46);
  assert(h.location.longitude>139&&h.location.longitude<146);
  assert(!h.location.isApproximate&&!h.image.isRepresentative);
  assert.equal(new URL(h.image.url).protocol,'https:');
  assert.equal(h.links.length,4);
  assert(h.links.every(l=>l.url&&new URL(l.url).protocol==='https:'&&l.kind!=='search'));
  assert(h.links.find(l=>l.provider==='trip').url.includes('hotel-detail-'));
  assert(h.links.find(l=>l.provider==='jalan').url.match(/jalan\.net\/yad\d+\//));
  assert(credits.some(c=>c.hotelId===h.id&&c.imageUrl===h.image.url));
  for(const fact of Object.values(h.features)){
   assert(h.sources.some(s=>s.sourceId===fact.sourceId));
   assert.equal(fact.verifiedAt!==null,fact.value!==null);
  }
  for(const key of ['roomOnsen','roomOutdoor'])if(h.features[key].value===true)assert(['someRooms','allRooms'].includes(h.features[key].scope));
  for(const rating of h.ratings)assert(h.sources.some(s=>s.sourceId===rating.sourceId));
  assert(h.sources.some(s=>s.sourceId===h.image.sourceId));
 }
 console.log(`Catalog checks passed: ${catalogHotels.length} records, original 20 stays / ${verified.length} criteria matches; provider scales, boundary values, unknown/AND filters, multilingual search, sorting, IDs, coordinates and source references.`);
}finally{rmSync(dir,{recursive:true,force:true})}
