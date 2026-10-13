import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-source-policy-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/source-policy.ts','lib/google-places.ts','--outDir',dir,'--module','commonjs','--target','es2020','--esModuleInterop','--skipLibCheck','--resolveJsonModule'],{encoding:'utf8'});assert.equal(compile.status,0,compile.stdout+compile.stderr);
 const require=createRequire(join(dir,'test.cjs')),root=existsSync(join(dir,'lib/source-policy.js'))?join(dir,'lib'):dir;
 const {composePreferredHotel}=require(join(root,'source-policy.js')),{readGooglePlace,GOOGLE_FIELDS}=require(join(root,'google-places.js'));
 const template=JSON.parse(readFileSync('lib/hotels.crawled.json','utf8'))[0];
 const make=(provider)=>{const h=structuredClone(template);h.id=provider+'-999001';h.sources=[{sourceId:h.id,sourceType:'web',label:(provider==='trip'?'Trip.com':'Jalan')+' 숙소 상세',url:provider==='trip'?'https://www.trip.com/hotels/test-hotel-detail-999001/source-policy/':'https://www.jalan.net/yad999001/',retrievedAt:'2026-10-05T12:00:00Z',verifiedAt:'2026-10-05',isMock:false}];h.image={...h.image,sourceId:h.id,url:provider==='trip'?'https://ak-d.tripcdn.com/images/test.jpg':'https://cdn.jalan.jp/jalan/images/test.jpg'};h.features=Object.fromEntries(Object.keys(h.features).map(k=>[k,{value:null,sourceId:h.id,verifiedAt:null}]));h.ratings=[{sourceId:h.id,provider,scale:provider==='trip'?10:5,score:provider==='trip'?9.1:4.8,reviewCount:123,summary:'',highlights:[],verifiedAt:'2026-10-05',isMock:false}];return h};
 const trip=make('trip'),jalan=make('jalan');trip.features.natural={value:true,sourceId:trip.id,verifiedAt:'2026-10-05'};jalan.features.natural={value:false,sourceId:jalan.id,verifiedAt:'2026-10-05'};jalan.features.roomOnsen={value:true,sourceId:jalan.id,verifiedAt:'2026-10-05',scope:'someRooms'};jalan.description='Jalan property-specific room description';
 const result=composePreferredHotel(trip,[jalan]);assert.equal(result.id,trip.id);assert.equal(result.features.natural.value,false);assert.equal(result.features.natural.sourceId,jalan.id);assert.equal(result.features.roomOnsen.scope,'someRooms');assert.equal(result.image.url,trip.image.url);assert.deepEqual(result.ratings.map(r=>[r.provider,r.scale,r.score]),[['trip',10,9.1],['jalan',5,4.8]]);assert.equal(result.description,jalan.description);assert.equal(trip.features.natural.value,true,'Raw input is untouched');
 assert.equal(composePreferredHotel(jalan,[trip]).image.sourceId,trip.id);
 const curated=structuredClone(trip);curated.id='existing-curated';assert.equal(composePreferredHotel(curated,[jalan]).features.natural.value,false,'Jalan priority also applies to curated records while the original payload is preserved');
 const newerTrip=structuredClone(trip);newerTrip.sources[0].retrievedAt='2026-10-05T13:00:00Z';newerTrip.ratings[0].score=9.3;assert.equal(composePreferredHotel(trip,[newerTrip]).ratings[0].score,9.3,'Fresh ratings win within their own provider');
 // D05: a stated room count follows the facility order (Jalan, then Trip.com), then the newer observation.
 const counted=(h,total,day)=>({...structuredClone(h),rooms:{total,sourceId:h.id,verifiedAt:day,note:'test'}});
 // Newness is the source's retrievedAt, so the Trip.com observation is made newer there.
 const laterTrip=counted(trip,120,'2026-10-06');laterTrip.sources[0].retrievedAt='2026-10-06T12:00:00Z';
 assert.equal(composePreferredHotel(laterTrip,[counted(jalan,118,'2026-10-05')]).rooms.total,118,'Jalan room count wins over a newer Trip.com one');
 assert.equal(composePreferredHotel(counted(trip,120,'2026-10-06'),[jalan]).rooms.total,120,'Trip.com room count fills a missing Jalan one');
 const newerCount=counted(jalan,121,'2026-10-07');newerCount.sources[0].retrievedAt='2026-10-07T12:00:00Z';
 assert.equal(composePreferredHotel(counted(jalan,118,'2026-10-05'),[newerCount]).rooms.total,121,'Within one provider the newer room count wins');
 assert.equal('rooms' in composePreferredHotel(trip,[jalan]),false,'No room count stays unknown');
 // Room photos of every linked source, Trip.com first (the photo order).
 const shown=(h,name)=>({...structuredClone(h),roomTypes:[{sourceId:h.id,verifiedAt:'2026-10-05',items:[{name,photos:[]}]}]});
 const laterJalan=shown(jalan,null);laterJalan.roomTypes[0].verifiedAt='2026-10-06';
 assert.deepEqual(composePreferredHotel(laterJalan,[shown(trip,'트윈룸')]).roomTypes.map(s=>s.sourceId),[trip.id,jalan.id],'Room photos keep both sources, Trip.com first even when the Jalan set is newer');
 assert.equal('roomTypes' in composePreferredHotel(trip,[jalan]),false,'No room photos stay absent');
 const self=shown(jalan,null);assert.equal(composePreferredHotel(self,[self]).roomTypes.length,1,'A group listing the base hotel again keeps one set per source');
 const mixed=structuredClone(jalan);mixed.image.alternatives=[trip.image.url];mixed.sources.push(...trip.sources);assert.equal(composePreferredHotel(mixed,[]).image.url,trip.image.url,'Historical Trip alternatives outrank the main Jalan image');
 const placeId='ChIJSourcePolicyOnly123',key='test-key-not-real';let calls=[];
 const detail={id:placeId,rating:4.6,userRatingCount:321,googleMapsUri:'https://maps.google.com/?cid=123',photos:[{name:'places/'+placeId+'/photos/MockPhoto123',googleMapsUri:'https://www.google.com/maps/photo?x=1',authorAttributions:[{displayName:'Test Author',uri:'https://www.google.com/maps/contrib/123',photoUri:'https://lh3.googleusercontent.com/avatar'}]}]};
 const fetcher=async(url,options)=>{calls.push([String(url),options]);return new Response(JSON.stringify(String(url).includes('/media?')?{photoUri:'https://lh3.googleusercontent.com/example-photo'}:detail),{status:200})};
 const google=await readGooglePlace(placeId,key,true,async()=>true,fetcher);assert.equal(google.scale,5);assert.equal(google.score,4.6);assert.equal(google.photo.authors[0].name,'Test Author');assert.equal(calls[0][1].headers['X-Goog-FieldMask'],GOOGLE_FIELDS);assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].cache,'no-store');assert(!JSON.stringify(google).includes(key));assert(!JSON.stringify(google).includes('places/'+placeId+'/photos/'));
 calls=[];await assert.rejects(()=>readGooglePlace(placeId,key,false,async()=>false,fetcher),e=>e.code==='budget');assert.equal(calls.length,0);
 let reservations=0;const limited=await readGooglePlace(placeId,key,true,async()=>++reservations===1,fetcher);assert.equal(limited.score,4.6);assert.equal(limited.photo,undefined);
 await assert.rejects(()=>readGooglePlace(placeId,key,false,async()=>true,async()=>new Response(JSON.stringify({...detail,id:'DifferentPlace123'}))),e=>e.code==='identity');
 const photoFailure=await readGooglePlace(placeId,key,true,async()=>true,async(url,options)=>{if(String(url).includes('/media?'))throw new Error('Network failure');return fetcher(url,options)});assert.equal(photoFailure.score,4.6);assert.equal(photoFailure.photo,undefined);
 console.log('Source policy passed: Trip/Jalan scales, source-specific facility/room priority, Trip photos, unchanged observations, Google identity/attribution/secret handling/no-store/budget and photo-error fallback.');
}finally{rmSync(dir,{recursive:true,force:true})}
