import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const temp=mkdtempSync(join(tmpdir(),'yukemuri-url-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/hotel-query.ts','lib/booking-query.ts','--outDir',temp,'--module','commonjs','--target','es2022','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--skipLibCheck'],{encoding:'utf8'});assert.equal(compile.status,0,compile.stdout+compile.stderr);
 const require=createRequire(join(temp,'test.cjs')),{parseHotelQuery,listingUrl}=require(join(temp,'lib/hotel-query.js')),{nextBookingDay,changeCheckIn}=require(join(temp,'lib/booking-query.js'));
 const original='https://example.test/?q='+encodeURIComponent('아소 소잔쿄')+'&region=pref-kumamoto&features=outdoor,natural,outdoor&provider=jalan&rating=4.5&reviews=50&sort=name&saved=1&checkIn=2026-11-01&checkOut=2026-11-03&adults=3&snapshot=discard#stay/jalan-327522';
 const query=parseHotelQuery(new URL(original).searchParams);assert(query);assert.deepEqual(query.filters.features,['natural','outdoor']);
 const url=new URL(listingUrl(original,query,'list'),'https://example.test');assert.deepEqual(parseHotelQuery(url.searchParams),query);assert.equal(url.hash,'#stay/jalan-327522');assert.equal(url.searchParams.get('checkIn'),'2026-11-01');assert.equal(url.searchParams.get('adults'),'3');assert(!url.searchParams.has('snapshot'));
 assert.equal(parseHotelQuery(new URLSearchParams('provider=jalan&rating=9')),null);assert.equal(parseHotelQuery(new URLSearchParams('features=made-up')),null);
 assert.equal(nextBookingDay('2028-02-28'),'2028-02-29');assert.equal(nextBookingDay('2026-12-31'),'2027-01-01');assert.equal(nextBookingDay('2026-02-30'),'');
 assert.equal(changeCheckIn({checkIn:'2026-11-01',checkOut:'2026-11-03',adults:2},'2026-11-04').checkOut,'2026-11-05');
 console.log('Listing URL/date checks passed: canonical filter round-trip, booking/hash preserved, transient session removed, validation, leap/year boundaries and date correction.');
}finally{rmSync(temp,{recursive:true,force:true})}
