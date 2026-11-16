// V01: scripts/build-search-snapshot.mjs readOnly() on a writable node:sqlite database in memory.
// SQLite reads $name(...) as one variable token whatever stands between the brackets (Tcl form),
// while readOnly's code() starts a comment or a string there and drops the rest of the statement.
// Run from the repository root: node docs/evidence/v01-20261110/v01-readonly-guard.mjs
import {DatabaseSync} from 'node:sqlite';
import {readOnly} from '../../../scripts/build-search-snapshot.mjs';
const sqlite=new DatabaseSync(':memory:');
const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),all:async()=>({results:sqlite.prepare(sql).all(...args),meta:{}})});
const guarded=readOnly({prepare:sql=>statement(sql)}).db;
const rows=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM t').get().n;
const reset=()=>{sqlite.exec('DROP TABLE IF EXISTS t;CREATE TABLE t(v);INSERT INTO t VALUES (1),(2),(3)')};
const cases=[
 ['control read','SELECT v FROM t'],
 ['control write','DELETE FROM t'],
 ['control write behind a CTE','WITH x AS (SELECT 1) DELETE FROM t'],
 ['control write behind a real comment','SELECT 1 -- x\n; DELETE FROM t'],
 ['variable suffix holding a comment marker','WITH x AS (SELECT $a(--)) DELETE FROM t'],
 ['variable suffixes holding quotes',"WITH x AS (SELECT $a(')) DELETE FROM t WHERE $b(') IS NULL"],
 ['variable suffix holding a block comment marker','WITH x AS (SELECT $a(/*)) DELETE FROM t WHERE $b(*/) IS NULL'],
];
let passedWrites=0;
for(const [label,sql] of cases){
 reset();let verdict;
 try{await guarded.prepare(sql).all();verdict='PASSED'}catch(error){verdict=/read-only/.test(error.message)?'REFUSED':'ERROR '+error.message.slice(0,60)}
 const left=rows();if(verdict==='PASSED'&&left!==3)passedWrites++;
 console.log(`${verdict.padEnd(8)} rows 3->${left} | ${label} | ${JSON.stringify(sql)}`);
}
console.log(`writes that passed the guard: ${passedWrites}`);
