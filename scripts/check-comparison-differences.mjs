// Comparison difference judgement: a row differs only on two known values that differ,
// is the same only when every candidate is known and equal, and is otherwise undecided.
// Unknown and "none" stay apart, and an unknown room scope is never guessed.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'yukemuri-comparison-diff-'));
try{
 const compile=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','lib/comparison-differences.ts','--outDir',dir,'--module','commonjs','--target','es2022','--skipLibCheck'],{encoding:'utf8'});
 if(compile.status!==0)throw new Error(compile.stdout+compile.stderr);
 const {comparisonRowState:state,featureComparisonValue:feature}=createRequire(join(dir,'x.cjs'))(join(dir,'comparison-differences.js'));
 const kind=values=>state(values)?.kind??null;
 // Ratings in one row share a source and a scale.
 assert.deepEqual(state([['8.9'],['9.5']]),{kind:'differs',unknown:0});
 assert.deepEqual(state([['8.9'],['8.9']]),{kind:'same',unknown:0});
 // An unknown next to a known value is neither the same nor different.
 assert.deepEqual(state([['8.9'],null]),{kind:'undecided',unknown:1});
 assert.deepEqual(state([['8.9'],['8.9'],null,null]),{kind:'undecided',unknown:2});
 assert.deepEqual(state([null,null]),{kind:'undecided',unknown:2});
 // Two known values that differ decide the row even when others are unknown.
 assert.deepEqual(state([['8.9'],null,['9.3'],null]),{kind:'differs',unknown:2});
 // "None" is known: none against present differs, none against unknown is undecided.
 const none=feature('privateBath',{value:false}),present=feature('privateBath',{value:true}),unknown=feature('privateBath',{value:null});
 assert.equal(unknown,null);
 assert.equal(kind([none,present]),'differs');
 assert.equal(kind([none,unknown]),'undecided');
 assert.equal(kind([none,none]),'same');
 // Room scope: some rooms against all rooms differs; an unrecorded scope is not guessed.
 const some=feature('roomOnsen',{value:true,scope:'someRooms'}),all=feature('roomOnsen',{value:true,scope:'allRooms'}),scopeUnknown=feature('roomOnsen',{value:true,scope:'property'});
 assert.deepEqual(scopeUnknown,['있음',null]);
 assert.equal(kind([some,all]),'differs');
 assert.equal(kind([some,some]),'same');
 assert.deepEqual(state([some,scopeUnknown]),{kind:'undecided',unknown:1});
 assert.deepEqual(state([scopeUnknown,scopeUnknown]),{kind:'undecided',unknown:2});
 // Presence still differs when one side has an unknown scope.
 assert.equal(kind([scopeUnknown,feature('roomOnsen',{value:false})]),'differs');
 // A property facility present everywhere is the same.
 assert.equal(kind([feature('natural',{value:true,scope:'property'}),feature('natural',{value:true})]),'same');
 // One candidate: nothing to compare.
 assert.equal(state([['8.9']]),null);
 assert.equal(state([]),null);
 console.log('Comparison differences passed: known differences, all-known sameness, unknowns undecided, none kept apart from unknown, room scope not guessed, single candidate skipped.');
}finally{rmSync(dir,{recursive:true,force:true})}
