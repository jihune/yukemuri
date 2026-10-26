// How many pages one gentle collection may take within the free D1 limits
// (C03, user 2026-10-13: collect as much as the free plan allows). Reads the
// account's usage for today (UTC, the day the limits reset on) through
// cloudflare-usage.mjs and leaves room for the run's own reads, the snapshot
// deploy at the end of the run and, through `share`, for backups, deploys and
// visitors. Prints
// pages=<n> and reason=<text> for GITHUB_OUTPUT. Never fails: when usage cannot
// be read the run falls back to the runner's original 16 pages.
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {LIMITS,queryDay} from './cloudflare-usage.mjs';

export const BUDGET=Object.freeze({
 maxPages:120,         // one run; the runner dispatches hourly (C05), so later runs of a day often get 0
 fallbackPages:16,     // usage unreadable: the run size before C03
 share:0.85,           // of each daily limit; the rest stays for backups, deploys and visitors
 writesPerPage:185,    // 2026-10-18, after C04: runs wrote at most 56.0 a page, but a round of
                       // update-site.py --gentle can hold only a Jalan detail page (11 rows) and a Jalan
                       // list page of 30 new properties (348): 179.5 a page (measure-d1-writes.mjs --check),
                       // and the count the snapshot deploy stores after the run writes 4 rows
                       // (compare-progress.mjs; the run's last queue read wrote them until C07 plan 2).
                       // Each run re-reads today's usage, so a high value only shortens the run the
                       // write share stops; a low one lets that run pass 85%.
 readsPerPage:4600,    // 2026-10-18, a production-size D1 (compare-write-builds.mjs): a round's claims read
                       // up to 3,481 rows, plus 525 for the done D07 names jobs (PR #154 review), and a
                       // page's save up to 582; a round may hold a single page
 snapshotReads:168000, // 2026-10-18: the last snapshot build read 122,302 rows (23,784 hotels, after
                       // P04), plus 10,000 for D07's names (D07-20261019.md) and two days of hotel
                       // growth (5.73 rows a hotel, 3,051 hotels on 10-17)
 runReads:100          // 2026-10-20 (C07 plan 2): a run's own preparation and readback (9 + 14 rows on
                       // the 10-18 D1) and, in its snapshot deploy, the counter read and the stored count
                       // (1 + 10 rows, docs/evidence/c07-20261019/progress-normal.json). The run-end queue
                       // read (84,938 rows on 10-18, growing 3 a hotel) is gone; none of these grow.
});

// usage: {rowsRead, rowsWritten} of the account today; null counts mean no
// rows today (an authorised query that found nothing), so zero.
export function pagesFor(usage,budget=BUDGET){
 if(!usage)return {pages:budget.fallbackPages,reason:'usage unavailable: fallback to '+budget.fallbackPages+' pages'};
 const written=usage.rowsWritten??0,read=usage.rowsRead??0;
 if(!Number.isFinite(written)||!Number.isFinite(read)||written<0||read<0)
  return {pages:budget.fallbackPages,reason:'usage unreadable: fallback to '+budget.fallbackPages+' pages'};
 const byWrites=Math.floor((budget.share*LIMITS.rowsWritten-written)/budget.writesPerPage);
 const byReads=Math.floor((budget.share*LIMITS.rowsRead-read-budget.snapshotReads-budget.runReads)/budget.readsPerPage);
 const pages=Math.max(0,Math.min(budget.maxPages,byWrites,byReads));
 return {pages,reason:`today ${written} rows written, ${read} read; writes allow ${byWrites} pages, reads ${byReads}, cap ${budget.maxPages}`};
}

export async function budgetToday({fetch=globalThis.fetch,env=process.env,config='cloudflare-deploy.json',now=new Date()}={}){
 try{
  const deploy=JSON.parse(readFileSync(config,'utf8'));
  const token=env.CLOUDFLARE_API_TOKEN??'',accountId=(env.CLOUDFLARE_ACCOUNT_ID??'').trim();
  if(!token||!accountId||!deploy.databaseId)return pagesFor(null);
  const day=await queryDay({fetch,token,accountId,scriptName:deploy.workerName,databaseId:deploy.databaseId,date:now.toISOString().slice(0,10)});
  return pagesFor(day.account);
 }catch{
  // Never print the error itself: it may carry the request.
  return pagesFor(null);
 }
}

async function main(){
 // C06: a run that repeats another gentle run in flight (collect.yml's overlap step) takes 0 pages.
 const overlap=process.env.OVERLAP;
 const {pages,reason}=overlap?{pages:0,reason:'overlap: '+overlap}:await budgetToday();
 console.log('pages='+pages);
 console.log('reason='+reason.replace(/[\r\n]/g,' '));
 const summary=process.env.GITHUB_STEP_SUMMARY;
 if(summary)appendFileSync(summary,`- 수집 페이지 예산: ${pages}쪽 (${reason})\n`);
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)await main();
