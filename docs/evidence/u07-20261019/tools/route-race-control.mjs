// Mechanism control for the U02 route line: a request whose route is already handled when the
// check's handler answers it. 'old' is the handler as it was (the refusal is not caught), 'new' as
// it is now. The race itself is not reproduced; the first abort() stands in for whatever handled it.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const mode=process.argv[2];
const browser=await chromium.launch();
const context=await browser.newContext();
const old=route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort();
const now=route=>(['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort()).catch(()=>{});
let seen=0;
await context.route('**/*',route=>{seen++;route.abort().catch(()=>{});return (mode==='old'?old:now)(route)});
const page=await context.newPage();
await page.setContent('<img src="https://images.example.com/a.png">');
await page.waitForTimeout(1500);
console.log(`mode=${mode} routed=${seen} reached-end=1`);
await browser.close();
