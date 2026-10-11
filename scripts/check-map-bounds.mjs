// The bounds the map-area search sends stay inside ±180/±90 with west below east,
// however far the map was dragged around the world.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-map-bounds-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/map-bounds.ts','--outDir',dir,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 const {mapSearchBounds}=createRequire(join(dir,'x.cjs'))(join(dir,'map-bounds.js'));
 const valid=b=>b.west>=-180&&b.east<=180&&b.south>=-90&&b.north<=90&&b.west<b.east&&b.south<b.north;
 // A view of Japan stays as it is.
 assert.deepEqual(mapSearchBounds({west:129,south:31,east:146,north:46}),{west:129,south:31,east:146,north:46});
 // The review's request: dragged east past 180, which became west 390.6 > east 180.
 const east=mapSearchBounds({west:390.58594,south:-27.52776,east:540,north:71.69129});
 assert(valid(east),JSON.stringify(east));assert.ok(Math.abs(east.west-30.58594)<1e-9);
 // Japan one world copy to the east and to the west comes back to Japan.
 for(const k of [360,-360,720]){const b=mapSearchBounds({west:129+k,south:31,east:146+k,north:46});assert.ok(Math.abs(b.west-129)<1e-9&&Math.abs(b.east-146)<1e-9,JSON.stringify(b))}
 // A view wider than the world becomes the whole world; poles are clamped.
 assert.deepEqual(mapSearchBounds({west:-400,south:-95,east:400,north:95}),{west:-180,south:-90,east:180,north:90});
 // A view across the date line keeps west below east (clamped to the side holding its centre).
 for(const raw of [{west:170,south:0,east:200,north:10},{west:-200,south:0,east:-170,north:10},{west:175,south:0,east:181,north:1}]){const b=mapSearchBounds(raw);assert(valid(b),JSON.stringify([raw,b]))}
 console.log('Map bounds passed: Japan unchanged, world copies wrapped back, wider-than-world views and poles clamped, date-line views keep west below east.');
}finally{rmSync(dir,{recursive:true,force:true})}
