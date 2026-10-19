// D08 Commons photos: the rule (lib/commons-photos.ts) on fixture extracts, the refresh's
// rules (scripts/update-commons-photos.mjs) on fixture responses, and the committed extract
// (data/commons-trip-photos.json), with a seeded copy that each extract rule must catch.
// Usage: node scripts/check-commons-photos.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileLib} from './build-search-snapshot.mjs';
import {extract,LICENCE,OUT,WIDTH} from './update-commons-photos.mjs';

const require=createRequire(import.meta.url),temp=mkdtempSync(join(tmpdir(),'yukemuri-commons-photos-'));
const hotel=(id,name)=>({id,names:{ko:name,ja:name,en:name},aliases:[],image:{url:'https://ak-d.tripcdn.com/images/a.jpg',alt:name,sourceId:id,isRepresentative:true},sources:[{sourceId:id,sourceType:'web',label:'숙소 상세',retrievedAt:'2026-10-01T00:00:00Z',verifiedAt:'2026-10-01',url:'https://www.trip.com/hotels/x-hotel-detail-1/',isMock:false}]});
const thumb=name=>`https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/${WIDTH}px-${name}`;
// What is wrong with an extract row, or nothing.
function problem([trip,item,url,page,author,licence,licenceUrl,...rest]){
 if(rest.length)return'extra columns';
 if(!/^\d+$/.test(trip??''))return'Trip id';
 if(!/^Q\d+$/.test(item??''))return'item';
 let u;try{u=new URL(url)}catch{return'image address'}
 if(u.protocol!=='https:'||!/^(upload|thumb)\.wikimedia\.org$/.test(u.hostname)||u.search)return'image host';
 // A hotlink must be the original or a standard thumbnail width.
 if(u.pathname.includes('/thumb/')&&!new RegExp(`/${WIDTH}px-[^/]+$`).test(u.pathname))return'thumbnail width';
 if(!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:./.test(page??''))return'file page';
 if(!author||/^(unknown( author)?|own work)$/i.test(author)||/[<>]/.test(author))return'author';
 if(!LICENCE.test(licence??''))return'licence';
 if(!/^https:\/\/creativecommons\.org\/./.test(licenceUrl??''))return'licence link';
 return null;
}
try{
 // The rule on fixture extracts: the compiled module reads the extracts beside it.
 const entry=compileLib(temp,'lib/commons-photos.ts');
 const row=(trip,item)=>[trip,item,thumb('A.jpg'),'https://commons.wikimedia.org/wiki/File:A.jpg','Author One','CC BY-SA 4.0','https://creativecommons.org/licenses/by-sa/4.0'];
 writeFileSync(join(temp,'data/wikidata-trip-names.json'),JSON.stringify({retrievedAt:'2026-10-18T00:00:00.000Z',hotels:[['100','Q1',null,'Hotel One'],['200','Q2',null,'Hotel Two'],['300','Q3',null,'Hotel Three']]}));
 writeFileSync(join(temp,'data/commons-trip-photos.json'),JSON.stringify({retrievedAt:'2026-10-19T00:00:00.000Z',hotels:[row('100','Q1'),row('200','Q9'),row('400','Q4')]}));
 const {withCommonsPhoto:cp}=require(entry);
 const base=hotel('trip-100','Hotel One Tokyo'),one=cp(base);
 assert.deepEqual(one.commonsPhoto,{url:thumb('A.jpg'),page:'https://commons.wikimedia.org/wiki/File:A.jpg',author:'Author One',licence:'CC BY-SA 4.0',licenceUrl:'https://creativecommons.org/licenses/by-sa/4.0'});
 assert.deepEqual(one.sources.at(-1),{sourceId:'commons-photo:trip-100',sourceType:'web',label:'Wikimedia Commons 사진(Author One, CC BY-SA 4.0)',retrievedAt:'2026-10-19T00:00:00.000Z',verifiedAt:null,url:'https://commons.wikimedia.org/wiki/File:A.jpg',isMock:false});
 assert.deepEqual({...one,commonsPhoto:undefined,sources:base.sources},{...base,commonsPhoto:undefined},'names, image and the rest stay as they were');
 assert.equal(one.sources.length,2,'the collected source stays first');
 // Exact ids only: another provider's record with the same number, a padded number, an id not in the extract.
 for(const id of ['jalan-100','trip-0100','trip-1000','100']){const h=hotel(id,'Hotel One Tokyo');assert.equal(cp(h),h,id+' is left as it is')}
 // The D07 link: the item must still name this hotel, be the item the names extract gives for
 // this Trip id, and be in that extract at all.
 for(const name of ['Hotel Uno Tokyo','ホテル壱','Hotel']){const h=hotel('trip-100',name);assert.equal(cp(h),h,name+' does not agree with Hotel One')}
 {const h=hotel('trip-200','Hotel Two');assert.equal(cp(h),h,'another item than the names extract gives')}
 {const h=hotel('trip-400','Hotel Four');assert.equal(cp(h),h,'a Trip id the names extract does not reach')}
 {const h=hotel('trip-300','Hotel Three');assert.equal(cp(h),h,'an item without a photo')}

 // The refresh's rules on fixture responses.
 const b=(trip,item,file)=>({trip:{value:trip},item:{value:'http://www.wikidata.org/entity/'+item},image:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)}});
 const page=(title,{artist='<a href="//commons.wikimedia.org/wiki/User:X" title="User:X">X</a>',licence='CC BY-SA 4.0',deed='https://creativecommons.org/licenses/by-sa/4.0',url=thumb('x.jpg')+'?utm_source=commons.wikimedia.org&utm_content=thumbnail',missing=false}={})=>missing?{title,missing:true}:{title,imageinfo:[{thumburl:url,url,descriptionurl:'https://commons.wikimedia.org/wiki/'+title.replace(/ /g,'_'),extmetadata:{Artist:{value:artist},LicenseShortName:{value:licence},...(deed?{LicenseUrl:{value:deed}}:{})}}]};
 const bindings=[b('1','Q1','Kept one.jpg'),b('2','Q2','Talk.jpg'),b('3','Q3','No author.jpg'),b('4','Q4','Own.jpg'),b('5','Q5','Unknown.jpg'),b('6','Q6','Gfdl.jpg'),b('7','Q7','Pd.jpg'),b('8','Q8','Gone.jpg'),b('9','Q9','Elsewhere.jpg'),b('10','Q10','A.jpg'),b('10','Q11','A.jpg'),b('11','Q12','Old name.jpg'),b('12','Q13','No deed.jpg'),b('13','Q14','Cc0.jpg'),b('x','Q15','X.jpg')];
 const responses=[{query:{normalized:[{from:'File:Kept_one.jpg',to:'File:Kept one.jpg'}],redirects:[{from:'File:Old name.jpg',to:'File:New name.jpg'}],pages:[
  page('File:Kept one.jpg'),page('File:Talk.jpg',{artist:'<a href="//commons.wikimedia.org/wiki/User:S">Sakaori</a> (<a href="//commons.wikimedia.org/wiki/User_talk:S"><span class="signature-talk">talk</span></a>) &amp; Co'}),
  page('File:No author.jpg',{artist:''}),page('File:Own.jpg',{artist:'<span class="int-own-work" lang="en">Own work</span>'}),page('File:Unknown.jpg',{artist:'Unknown author'}),
  page('File:Gfdl.jpg',{licence:'GFDL',deed:'https://www.gnu.org/copyleft/fdl.html'}),page('File:Pd.jpg',{licence:'Public domain',deed:null}),page('File:Gone.jpg',{missing:true}),
  page('File:Elsewhere.jpg',{url:'https://example.org/x.jpg'}),page('File:A.jpg'),page('File:New name.jpg'),page('File:No deed.jpg',{deed:null}),
  page('File:Cc0.jpg',{licence:'CC0',deed:'http://creativecommons.org/publicdomain/zero/1.0/deed.en'})]}}];
 const x=extract(bindings,responses),kept=new Map(x.rows.map(r=>[r[0],r]));
 assert.deepEqual([...kept.keys()],['1','2','11','13']);
 assert.deepEqual(kept.get('1'),['1','Q1',thumb('x.jpg'),'https://commons.wikimedia.org/wiki/File:Kept_one.jpg','X','CC BY-SA 4.0','https://creativecommons.org/licenses/by-sa/4.0'],'a kept file: tags and tracking parameters dropped');
 assert.equal(kept.get('2')[4],'Sakaori & Co','a signature\'s talk link is not part of the name; entities decoded');
 assert.equal(kept.get('11')[3],'https://commons.wikimedia.org/wiki/File:New_name.jpg','a renamed file is followed');
 assert.equal(kept.get('13')[6],'https://creativecommons.org/publicdomain/zero/1.0/deed.en','a deed link is made https');
 assert.deepEqual(x.dropped,[['3','no author'],['4','no author'],['5','no author'],['6','licence GFDL'],['7','licence Public domain'],['8','missing'],['9','no image address'],['10','two items or images'],['12','no licence link']]);
 for(const r of x.rows)assert.equal(problem(r),null,'a kept fixture row passes the extract check: '+r[0]);

 // The committed extract.
 const data=JSON.parse(readFileSync(OUT,'utf8'));
 assert.match(data.query,/wdt:P10425 \?trip ; wdt:P17 wd:Q17 ; wdt:P18 \?image/,'the image of items in Japan with a Trip.com id');assert(!Number.isNaN(Date.parse(data.retrievedAt)));
 assert(data.hotels.length>100,'a few hundred Trip ids');assert.equal(new Set(data.hotels.map(r=>r[0])).size,data.hotels.length,'one row per Trip id');
 assert(!data.hotels.some(r=>data.dropped.some(([trip])=>trip===r[0])),'dropped ids stay out');
 const bad=data.hotels.flatMap(r=>{const p=problem(r);return p?[r[0]+' '+p]:[]});
 assert.deepEqual(bad,[],'every row: an image on Wikimedia at a standard width, its file page, an author, a CC licence and its deed');
 // The photo follows the D07 link, so the item must be the one the names extract gives.
 const names=new Map(JSON.parse(readFileSync('data/wikidata-trip-names.json','utf8')).hotels.map(([trip,item])=>[trip,item]));
 assert.deepEqual(data.hotels.filter(r=>names.has(r[0])&&names.get(r[0])!==r[1]).map(r=>r[0]),[],'the names extract gives the same item for each Trip id');
 // Control: a copy with one defect of each kind; the check must name every one.
 const seeded=[['author',4,''],['author',4,'Own work'],['licence',5,'GFDL'],['licence link',6,'http://example.org/'],['image host',2,'https://example.org/a.jpg'],['thumbnail width',2,thumb('A.jpg').replace(`${WIDTH}px`,'1000px')],['file page',3,'https://en.wikipedia.org/wiki/File:A.jpg'],['item',1,'X1']];
 const caught=seeded.filter(([kind,column,value])=>{const r=[...data.hotels[0]];r[column]=value;return problem(r)===kind});
 assert.equal(caught.length,seeded.length,'the extract check catches every seeded defect');
 const licences=Object.entries(data.hotels.reduce((a,r)=>({...a,[r[5]]:(a[r[5]]??0)+1}),{})).sort((a,b)=>b[1]-a[1]).map(([l,n])=>n+' '+l).join(', ');
 console.log(`Commons photos passed: exact Trip.com ids on the D07 link only, the record unchanged but for the photo and its source, the refresh's author, licence and address rules; extract ${data.hotels.length} Trip ids (${licences}; ${data.dropped.length} left out, retrieved ${data.retrievedAt}), seeded defects caught ${caught.length}/${seeded.length}.`);
}finally{rmSync(temp,{recursive:true,force:true})}
