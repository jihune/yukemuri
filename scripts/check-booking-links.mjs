// U04 booking links: the dates and adults chosen on this site go into the Jalan and
// Trip.com property links, and any missing, invalid or unsupported input leaves the
// link exactly as stored. The Jalan conditions are compared with the hidden inputs of
// the checked-in Jalan plan pages, which echo the conditions they were fetched with.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-booking-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/booking-query.ts','--outDir',dir,'--module','commonjs','--target','es2020','--esModuleInterop','--skipLibCheck','--resolveJsonModule'],{encoding:'utf8'});
 assert.equal(compile.status,0,compile.stdout+compile.stderr);
 const {bookingError,datedLink,jalanPlanUrl,parseBookingQuery}=createRequire(join(dir,'test.cjs'))(join(dir,'lib/booking-query.js'));
 const today='2026-10-04';
 const jalan={provider:'jalan',url:'https://www.jalan.net/yad364904/',kind:'property',label:'자란넷 숙소 페이지'};
 const trip={provider:'trip',url:'https://www.trip.com/hotels/noboribetsu-hotel-detail-842622/dai-ichi-takimotokan/',kind:'property',label:'Trip.com 숙소 페이지'};
 const official={provider:'official',url:'https://www.takimotokan.co.jp/',kind:'property',label:'공식'};
 const maps={provider:'maps',url:'https://www.google.com/maps/search/?api=1&query=42.49,141.14',kind:'coordinates',label:'지도'};
 const hidden=(raw,name)=>[...raw.matchAll(new RegExp('<input type="hidden" name="'+name+'" value="([^"]*)"','g'))].map(m=>m[1]);
 // 1. Jalan: every condition put in the link is one the checked-in page echoes back.
 const fixtures=[['jalan-price-10.html',{checkIn:'2026-11-10',checkOut:'2026-11-11',adults:2}],['jalan-price-14.html',{checkIn:'2026-11-14',checkOut:'2026-11-15',adults:2}],['jalan-price-multi.html',{checkIn:'2026-11-10',checkOut:'2026-11-12',adults:3}]];
 for(const [file,q] of fixtures){
  const raw=readFileSync('scripts/crawler/fixtures/'+file,'utf8');
  const url=new URL(datedLink(jalan,q,today));
  assert.equal(url.origin+url.pathname,'https://www.jalan.net/yad364904/plan/',file);
  assert.equal([...url.searchParams.keys()].length,8,file);
  for(const [key,value] of url.searchParams){const echoed=hidden(raw,key);assert(echoed.length>0&&echoed.includes(value),`${file}: ${key}=${value} not echoed (${echoed})`)}
 }
 // 2. Trip.com: the existing link format; the stored path stays as it is.
 const q={checkIn:'2026-11-10',checkOut:'2026-11-12',adults:3};
 const tripUrl=new URL(datedLink(trip,q,today));
 assert.equal(tripUrl.origin+tripUrl.pathname,trip.url);
 assert.deepEqual(Object.fromEntries(tripUrl.searchParams),{checkIn:'2026-11-10',checkOut:'2026-11-12',adult:'3',crn:'1',currency:'JPY'});
 // 3. Providers without a checked format never get dates.
 assert.equal(datedLink(official,q,today),official.url);assert.equal(datedLink(maps,q,today),maps.url);
 // 4. Missing or invalid input: the link opens without dates.
 const bad=[{...q,checkIn:''},{...q,checkOut:''},{checkIn:'',checkOut:'',adults:2},{...q,checkIn:'2026-02-30'},{...q,checkIn:'2026-10-03',checkOut:'2026-10-05'},{...q,checkOut:q.checkIn},{...q,checkOut:'2026-11-09'},{...q,checkOut:'2026-11-18'},{...q,checkIn:'2027-11-10',checkOut:'2027-11-11'},{...q,adults:0},{...q,adults:7},{...q,adults:2.5},{...q,checkIn:'11/10/2026'}];
 for(const b of bad){assert(bookingError(b,today),JSON.stringify(b));for(const link of [jalan,trip])assert.equal(datedLink(link,b,today),link.url,JSON.stringify(b))}
 assert.equal(bookingError(q,today),null);
 // 5. A stored link that is not the expected property page is left alone, never thrown on.
 for(const link of [{...jalan,url:'https://www.jalan.net/130000/LRG_137100/'},{...jalan,url:'https://example.invalid/yad364904/'},{...jalan,url:'not a url'},{...trip,url:'https://example.invalid/hotels/x/'},{...trip,url:'http://www.trip.com/hotels/x/'},{...trip,url:'not a url'},{...jalan,url:null}])assert.equal(datedLink(link,q,today),link.url,String(link.url));
 assert.throws(()=>jalanPlanUrl('https://example.invalid/yad364904/',q));
 // 6. Page URL round trip: adults outside 1-6 fall back to 2, dates are kept as typed.
 assert.deepEqual(parseBookingQuery(new URLSearchParams('checkIn=2026-11-10&checkOut=2026-11-12&adults=3')),q);
 assert.deepEqual(parseBookingQuery(new URLSearchParams('adults=9')),{checkIn:'',checkOut:'',adults:2});
 assert.deepEqual(parseBookingQuery(new URLSearchParams('')),{checkIn:'',checkOut:'',adults:2});
 console.log(`Booking link checks passed: ${fixtures.length} Jalan pages echo the dated conditions, Trip.com format, ${bad.length} bad inputs and 7 unsupported links open unchanged, official/maps never dated.`);
}finally{rmSync(dir,{recursive:true,force:true})}
