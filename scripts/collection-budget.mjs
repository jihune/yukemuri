// How many pages one gentle collection may take within the free D1 limits
// (C03, user 2026-10-13: collect as much as the free plan allows). Reads the
// account's usage for today (UTC, the day the limits reset on) through
// cloudflare-usage.mjs and leaves room for the snapshot deploy at the end of
// the run and, through `share`, for backups, deploys and visitors. Prints
// pages=<n> and reason=<text> for GITHUB_OUTPUT. Never fails: when usage cannot
// be read the run falls back to the runner's original 16 pages.
import {appendFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {LIMITS,queryDay} from './cloudflare-usage.mjs';

export const BUDGET=Object.freeze({
 maxPages:120,         // one run; the runner dispatches every 3 hours
 fallbackPages:16,     // usage unreadable: the run size before C03
 share:0.85,           // of each daily limit; the rest stays for backups, deploys and visitors
 writesPerPage:150,    // 2026-10-17: up to 150.4 a page between runs (day average 129.7; 77 on 10-13).
                       // Each run re-reads today's usage, so a high value only shortens the run the
                       // write share stops; a low one lets that run pass 85%.
 readsPerPage:3000,    // 2026-10-17: 2,713-2,981 a page between runs, snapshot taken out
 snapshotReads:260000  // 2026-10-17: the last snapshot build read 257,099 rows (23,032 hotels)
});

// usage: {rowsRead, rowsWritten} of the account today; null counts mean no
// rows today (an authorised query that found nothing), so zero.
export function pagesFor(usage,budget=BUDGET){
 if(!usage)return {pages:budget.fallbackPages,reason:'usage unavailable: fallback to '+budget.fallbackPages+' pages'};
 const written=usage.rowsWritten??0,read=usage.rowsRead??0;
 if(!Number.isFinite(written)||!Number.isFinite(read)||written<0||read<0)
  return {pages:budget.fallbackPages,reason:'usage unreadable: fallback to '+budget.fallbackPages+' pages'};
 const byWrites=Math.floor((budget.share*LIMITS.rowsWritten-written)/budget.writesPerPage);
 const byReads=Math.floor((budget.share*LIMITS.rowsRead-read-budget.snapshotReads)/budget.readsPerPage);
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
 const {pages,reason}=await budgetToday();
 console.log('pages='+pages);
 console.log('reason='+reason.replace(/[\r\n]/g,' '));
 const summary=process.env.GITHUB_STEP_SUMMARY;
 if(summary)appendFileSync(summary,`- 수집 페이지 예산: ${pages}쪽 (${reason})\n`);
}

if(import.meta.url===pathToFileURL(process.argv[1]).href)await main();
