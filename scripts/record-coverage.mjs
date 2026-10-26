// C07 plan 2: store the count the snapshot build made after a collection (the
// report's progress) through the deployed Worker's crawl path: the aggregate,
// the day's trend row and the record counter, which the collector's queue GET
// stored at the end of each run until then (lib/hotel-repository.ts
// recordCoverage). deploy.yml runs it last, once the new Worker is live, and only
// in the deploy a collection calls (after_collection); a push deploy writes no
// aggregate. Prints one JSON line, from which scripts/daily-check.mjs reads the
// pages pending and done; the key comes from YUKEMURI_CRAWL_ACCESS_KEY.
// Usage: node scripts/record-coverage.mjs <public workers.dev origin> [snapshot-report.json]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin=process.argv[2],report=process.argv[3]??'snapshot-report.json',key=process.env.YUKEMURI_CRAWL_ACCESS_KEY;
assert.match(origin??'',/^https:\/\/yukemuri\.[a-z0-9-]+\.workers\.dev$/,'Expected the public workers.dev origin');
assert(key,'YUKEMURI_CRAWL_ACCESS_KEY is required');
const progress=JSON.parse(readFileSync(report,'utf8')).progress;
assert(progress?.day,'The snapshot report has no collection count (built without --progress-day)');
for(let attempt=1;;attempt++){
 const response=await fetch(origin+'/api/crawl',{method:'POST',headers:{'X-Yukemuri-Crawl-Key':key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'record-coverage',...progress}),redirect:'manual',signal:AbortSignal.timeout(60_000)});
 const body=/json/.test(response.headers.get('Content-Type')??'')?await response.json():null;
 if(response.status===200&&body?.recorded===true){
  const c=body.coverage;
  console.log(JSON.stringify({recordedCoverage:{day:progress.day,records:c.records,pending:c.pending,completedDetailPages:c.completedDetailPages}}));
  break;
 }
 // The sequence moved after this build read it: a queue GET stored a newer count, or an earlier
 // try of this record took the number before failing. The next collection's deploy stores its own.
 if(response.status===200&&body?.recorded===false){console.log(JSON.stringify({recordedCoverage:null,skipped:'the coverage sequence moved since the build read it'}));break}
 console.log(`record-coverage ${attempt}: HTTP ${response.status}`);
 // 503 is a D1 failure worth another try (the rows only ever take a newer count); nothing else is.
 if(response.status!==503||attempt>=3)throw new Error('record-coverage failed: HTTP '+response.status);
 await new Promise(r=>setTimeout(r,5000));
}
