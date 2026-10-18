// Shown names (U07, user decision 2026-10-17): a stay is named in Korean, else in English, else in
// its own language, and the original name is shown beside the first when it differs. The cases
// are the name shapes the public snapshot of 2026-10-17 holds (docs/U07-20261019.md), plus the
// one D07 adds: a Jalan stay that gets an English name.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {compileLib} from './build-search-snapshot.mjs';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-hotel-names-'));
try{
 const {displayNames:shown,nameLang}=createRequire(import.meta.url)(compileLib(dir,'lib/hotel-names.ts'));
 const names=(ko,ja,en)=>({ko,ja,en});
 // A Jalan stay: one Japanese name in all three fields (19,440 of 23,032).
 assert.deepEqual(shown(names('バーデン明日','バーデン明日','バーデン明日')),{title:'バーデン明日',titleLang:'ja',en:null,ja:null});
 // A Jalan stay named in Latin letters, full width or not: it is the original, shown once.
 assert.deepEqual(shown(names('Takahira Base','Takahira Base','Takahira Base')),{title:'Takahira Base',titleLang:'ja',en:null,ja:null});
 assert.deepEqual(shown(names('ＳＥＫＡＩ　ＨＯＴＥＬ','ＳＥＫＡＩ　ＨＯＴＥＬ','ＳＥＫＡＩ　ＨＯＴＥＬ')),{title:'ＳＥＫＡＩ　ＨＯＴＥＬ',titleLang:'ja',en:null,ja:null});
 // Korean, English and Japanese: Korean first, then English, then the original.
 assert.deepEqual(shown(names('긴린소','料亭湯宿 銀鱗荘','Ginrinsou')),{title:'긴린소',titleLang:'ko',en:'Ginrinsou',ja:'料亭湯宿 銀鱗荘'});
 // English that is the original again (Trip.com, a Latin original) is shown once, as the original.
 assert.deepEqual(shown(names('도쿄 웬주안스 게스트하우스',"Tokyo Wenjuan's Guesthouse","Tokyo Wenjuan's Guesthouse")),{title:'도쿄 웬주안스 게스트하우스',titleLang:'ko',en:null,ja:"Tokyo Wenjuan's Guesthouse"});
 assert.deepEqual(shown(names('코고 료고쿠','ＣＯＧＯ　ＲＹＯＧＯＫＵ','COGO RYOGOKU')),{title:'코고 료고쿠',titleLang:'ko',en:null,ja:'ＣＯＧＯ　ＲＹＯＧＯＫＵ'});
 // No Korean name: the English one leads, the original beside it.
 assert.deepEqual(shown(names('Hdo Hachiken House','八軒 JR デュプレックスハウス','Hdo Hachiken House')),{title:'Hdo Hachiken House',titleLang:'en',en:null,ja:'八軒 JR デュプレックスハウス'});
 assert.deepEqual(shown(names('バーデン明日','バーデン明日','Baden Asu')),{title:'Baden Asu',titleLang:'en',en:null,ja:'バーデン明日'});
 // Japanese in the English field, or Korean in it, is not English; a middle dot (・) does not
 // make a name Japanese.
 assert.deepEqual(shown(names('고베 오리엔탈 호텔','神戸オリエンタルホテル','神戸オリエンタルホテル')),{title:'고베 오리엔탈 호텔',titleLang:'ko',en:null,ja:'神戸オリエンタルホテル'});
 assert.equal(shown(names('누쿠모리노야도 후루카와','ぬくもりの宿 ふる川','누쿠모리 노 야도(Nukumori No Yado)')).en,null);
 assert.equal(shown(names('기라쿠 히수이','喜楽・翡翠','KIRAKU・HISUI')).en,'KIRAKU・HISUI');
 assert.equal(shown(names('존크 호텔','ゾンクホテル','')).en,null);
 // A Korean name in every field shows once.
 assert.deepEqual(shown(names('2 싱글 침대','2 싱글 침대','2 싱글 침대')),{title:'2 싱글 침대',titleLang:'ko',en:null,ja:null});
 assert.equal(nameLang('긴린소'),undefined);assert.equal(nameLang('Ginrinsou'),'en');assert.equal(nameLang('料亭湯宿 銀鱗荘'),'ja');
 console.log('Hotel names passed: Korean, else English, else the original; the original beside it once; Jalan, Latin, full-width, middle-dot, empty and Korean-only shapes.');
}finally{rmSync(dir,{recursive:true,force:true})}
