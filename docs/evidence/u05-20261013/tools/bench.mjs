// One page view per public site at 390px for design reference. No crawling, no form submits.
import {createRequire} from 'node:module';
const require=createRequire('/home/user/yukemuri/.sites-runtime/u01-browser/package.json');
const {chromium}=require('playwright');
const out=process.argv[2];
const sites=[
 ['jalan-onsen','https://www.jalan.net/onsen/'],
 ['jalan-yado','https://www.jalan.net/kanagawa/LRG_140500/'],
 ['rakuten-onsen','https://travel.rakuten.co.jp/onsen/'],
 ['ikyu','https://www.ikyu.com/'],
 ['relux','https://rlx.jp/'],
 ['yukoyuko','https://www.yukoyuko.net/'],
 ['yanolja','https://www.yanolja.com/'],
 ['myrealtrip','https://www.myrealtrip.com/'],
 ['booking','https://www.booking.com/index.ko.html'],
 ['airbnb','https://www.airbnb.co.kr/'],
 ['trip','https://kr.trip.com/hotels/'],
];
const browser=await chromium.launch();
const res=[];
for(const [name,url] of sites){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ko-KR',deviceScaleFactor:2,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'});
 const page=await ctx.newPage();
 try{const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(5000);
  await page.screenshot({path:`${out}/${name}.png`});
  res.push([name,r?.status(),await page.title()]);}
 catch(e){res.push([name,'ERR',String(e).slice(0,100)])}
 await ctx.close();
}
await browser.close();console.log(JSON.stringify(res,null,1));
