// Preflight summary (deploy.yml, preflight: true): what the next deploy would
// find in D1 and what preparing it would write. Inputs are read-only results:
// the snapshot report (build-search-snapshot.mjs --remote --report) and the
// catalog_meta rows (wrangler d1 execute --json). The write estimate comes from
// the measured per-step rows (measure-d1-reads.mjs --grow --prepare-steps, a
// production-size local copy). Prints keys and counts only.
// Usage: node scripts/preflight-report.mjs <snapshot-report.json> <catalog-meta.json> [evidence.json]
import {readFileSync} from 'node:fs';

export const EVIDENCE='docs/evidence/h01-deploy-preflight-20261012.json';
export const D1_DAILY_WRITES=100000;

// prepare: {none:{rowsWritten}, <step>:{rowsWritten}, all:{rowsWritten}}.
// Each case includes the crawl-prepare work that runs on every call (none),
// so steps add their difference to it once.
export function prepareEstimate(unprepared,prepare){
 if(!unprepared.length)return {rowsWritten:0,basis:'catalogue prepared: deploy runs no crawl-prepare'};
 const unknown=unprepared.filter(k=>!prepare[k]);
 if(unknown.length)return {rowsWritten:null,basis:'no measurement for '+unknown.join(', ')};
 const base=prepare.none.rowsWritten;
 const sum=base+unprepared.reduce((n,k)=>n+Math.max(0,prepare[k].rowsWritten-base),0);
 // With every step undone the measured total can be lower than the sum (later
 // steps find rows the earlier ones already rewrote); keep the larger.
 const every=Object.keys(prepare).filter(k=>!['none','all','settle'].includes(k));
 const all=unprepared.length===every.length&&prepare.all?prepare.all.rowsWritten:null;
 return all!==null&&all>sum?{rowsWritten:all,basis:'measured with every step undone'}:{rowsWritten:sum,basis:'sum of the measured steps'};
}

export function metaRows(output){
 const sets=Array.isArray(output)?output:[output];
 const rows=sets.flatMap(s=>s?.results??[]);
 if(!rows.every(r=>typeof r?.key==='string'))throw new Error('catalog_meta output has no key column');
 return rows;
}

// Per-row maintenance every crawl-prepare call resumes (not a seed step): done
// on a database loaded from a prepared one. When behind, the first calls redo
// it over every hotel (measured as settle).
export const MAINTENANCE=['onsen-place-search-v1','external-bath-scope-v1','collection-priority:'];
export function maintenanceBehind(meta){
 return MAINTENANCE.filter(prefix=>{const rows=meta.filter(r=>prefix.endsWith(':')?r.key.startsWith(prefix):r.key===prefix);return !rows.length||rows.some(r=>r.value!=='done')});
}

export function summary(report,meta,evidence){
 const estimate=prepareEstimate(report.unprepared,evidence.prepareSteps);
 const behind=maintenanceBehind(meta),settle=evidence.prepareSteps.settle;
 const kb=n=>(n/1024).toFixed(1)+' KiB';
 return [
  '### Preflight (read-only)',
  `- Snapshot: ${report.manifest.hotels} hotels, ${report.rowsRead||'unreported'} rows read in ${report.queries} queries; gzip ${Object.entries(report.sizes).map(([k,s])=>`${k} ${kb(s.gzip)}`).join(', ')}.`,
  `- catalog_meta keys (${meta.length}): ${meta.map(r=>r.key).join(', ')||'none'}.`,
  `- Not prepared for this release: ${report.unprepared.join(', ')||'none'}.`,
  `- Per-row maintenance not done: ${behind.map(k=>k.endsWith(':')?k+'*':k).join(', ')||'none'}${behind.length&&settle?` (on the local copy, catching up took ${settle.calls} calls, ${settle.rowsRead.toLocaleString('en-US')} rows read and ${settle.rowsWritten.toLocaleString('en-US')} written; D1 free plan reads 5,000,000 rows per UTC day)`:''}.`,
  `- crawl-prepare writes if deployed now: ${estimate.rowsWritten===null?'unknown':'about '+estimate.rowsWritten.toLocaleString('en-US')+' rows'} (${estimate.basis}; ${evidence.measuredAt}, local copy of ${evidence.tables.hotels} hotels). D1 free plan: ${D1_DAILY_WRITES.toLocaleString('en-US')} rows written per UTC day.`,
 ].join('\n');
}

if(import.meta.url===`file://${process.argv[1]}`){
 const [reportPath,metaPath,evidencePath=EVIDENCE]=process.argv.slice(2);
 if(!reportPath||!metaPath)throw new Error('Usage: preflight-report.mjs <snapshot-report.json> <catalog-meta.json> [evidence.json]');
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 console.log(summary(read(reportPath),metaRows(read(metaPath)),read(evidencePath)));
}
