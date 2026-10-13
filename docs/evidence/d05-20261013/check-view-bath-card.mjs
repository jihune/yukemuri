// D05 (Codex review 2 on PR #77): the ‘전망 욕탕’ tag on real search cards in Chromium
// at 360px and 390px with touch. For each card prepare-view-bath-site.mjs gave viewBath:
// - the tag is shown, reachable at its centre, on one line and not cut (scrollWidth),
// - every tag stays inside its tag row and its card, and no two tags overlap,
// - the card and the page have no horizontal overflow, the card buttons stay inside the card.
// It also records the tag rows and the card height with the tag hidden (the tag's cost).
// Needs the local site (node scripts/prepare-local-site.mjs, then
// node docs/evidence/d05-20261013/prepare-view-bath-site.mjs, then pnpm start) and the isolated
// Playwright install in docs/ui-u01-20261010.md. External requests are blocked, so photos do not load.
// Usage: node docs/evidence/d05-20261013/check-view-bath-card.mjs [base] [evidence.json] [--control=nowrap|clip]
// A control injects a defect (tags in one unwrapped row / tags cut at 40px) and must FAIL.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(new URL('../../../.sites-runtime/u01-browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const args=process.argv.slice(2),control=args.find(a=>a.startsWith('--control='))?.slice(10),[base='http://127.0.0.1:8787',evidence]=args.filter(a=>!a.startsWith('--'));
const CONTROL_CSS={nowrap:'.feature-tags{flex-wrap:nowrap!important}',clip:'.feature-tags>span{max-width:40px!important;overflow:hidden!important}'};
if(control&&!CONTROL_CSS[control])throw new Error('Unknown control '+control);
const CARDS=[['jalan-345284','グリーンプラザ'],['jalan-321273','花由'],['jalan-999171','蘇山郷']];
const results=[];let width=0;
const check=(name,pass,detail={})=>{results.push({width,name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${width}px ${name}`)};
const browser=await chromium.launch();
const measure=(page,id)=>page.evaluate(id=>{
 const card=document.getElementById('card-'+id);if(!card)return null;
 const box=e=>{const b=e.getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}};
 const inside=(a,b)=>a.l>=b.l-0.5&&a.r<=b.r+0.5&&a.t>=b.t-0.5&&a.b<=b.b+0.5;
 const row=card.querySelector('.feature-tags'),spans=[...row.children],tag=spans.find(s=>s.textContent.trim()==='전망 욕탕');
 const c=box(card),rowBox=box(row),boxes=spans.map(box);
 const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(Math.min(a.r,b.r)-Math.max(a.l,b.l)>0.5&&Math.min(a.b,b.b)-Math.max(a.t,b.t)>0.5)overlaps.push([spans[i].textContent.trim(),spans[j].textContent.trim()])}
 const out={tags:spans.map(s=>s.textContent.trim()),rows:new Set(boxes.map(b=>Math.round(b.t))).size,card:c,vw:innerWidth,
  pageOverflow:document.scrollingElement.scrollWidth-innerWidth,cardOverflow:card.scrollWidth-card.clientWidth,
  outsideRow:spans.filter((s,i)=>!inside(boxes[i],rowBox)).map(s=>s.textContent.trim()),outsideCard:spans.filter((s,i)=>!inside(boxes[i],c)).map(s=>s.textContent.trim()),overlaps,
  buttonsOutside:[...card.querySelectorAll('.card-bottom button')].filter(b=>!inside(box(b),c)).map(b=>b.textContent.trim()),
  cardInViewport:c.l>=-0.5&&c.r<=innerWidth+0.5};
 if(tag){
  const t=box(tag),s=getComputedStyle(tag),range=document.createRange();range.selectNodeContents(tag);
  const hit=document.elementFromPoint(t.l+t.w/2,t.t+t.h/2);
  Object.assign(out,{tag:t,shown:t.w>0&&t.h>0&&s.visibility==='visible'&&s.display!=='none',reachable:!!hit&&(hit===tag||tag.contains(hit)),
   cut:tag.scrollWidth-tag.clientWidth,lines:new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size,fontSize:s.fontSize});
  const before=card.getBoundingClientRect().height;tag.style.display='none';out.heightWithoutTag=card.getBoundingClientRect().height;out.rowsWithoutTag=new Set(spans.filter(x=>x!==tag).map(x=>Math.round(x.getBoundingClientRect().top))).size;tag.style.display='';out.height=before;
 }
 return out;
},id);
for(width of [360,390]){
 const context=await browser.newContext({viewport:{width,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'ko-KR',timezoneId:'Asia/Seoul'});
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 for(const [id,q] of CARDS){
  await page.goto(base+'/?q='+encodeURIComponent(q),{waitUntil:'networkidle'});
  if(control)await page.addStyleTag({content:CONTROL_CSS[control]});
  const card=page.locator('#card-'+id);
  try{await card.waitFor({timeout:15000})}catch{check(`${id}: 검색 결과에 카드가 있음`,false,{q});continue}
  await card.scrollIntoViewIfNeeded();
  const m=await measure(page,id);
  check(`${id}: ‘전망 욕탕’ 표지가 보이고 가운데를 누를 수 있음`,m.tag&&m.shown&&m.reachable,{tags:m.tags,tag:m.tag,fontSize:m.fontSize});
  check(`${id}: 표지 글자가 한 줄이고 잘리지 않음`,m.tag&&m.cut<=0&&m.lines===1,{cut:m.cut,lines:m.lines});
  check(`${id}: 모든 표지가 표지 줄과 카드 안에 있고 서로 겹치지 않음`,!m.outsideRow.length&&!m.outsideCard.length&&!m.overlaps.length,{outsideRow:m.outsideRow,outsideCard:m.outsideCard,overlaps:m.overlaps});
  check(`${id}: 카드·페이지 가로 넘침 없음, 카드 아래 버튼이 카드 안에 있음`,m.pageOverflow<=0&&m.cardOverflow<=0&&m.cardInViewport&&!m.buttonsOutside.length,{pageOverflow:m.pageOverflow,cardOverflow:m.cardOverflow,card:m.card,buttonsOutside:m.buttonsOutside});
  results.at(-1).detail.layout={tagCount:m.tags.length,rows:m.rows,rowsWithoutTag:m.rowsWithoutTag,cardHeight:m.height,cardHeightWithoutTag:m.heightWithoutTag};
 }
 await context.close();
}
const chromiumVersion=browser.version();
await browser.close();
const failed=results.filter(r=>!r.pass).length;
if(evidence)writeFileSync(evidence,JSON.stringify({measuredAt:new Date().toISOString(),base,browser:'Chromium '+chromiumVersion,viewport:'360x780, 390x780 · isMobile · hasTouch · deviceScaleFactor 2',externalRequests:'blocked',control:control??null,results},null,1)+'\n');
console.log(`RESULT ${failed?'FAIL':'PASS'} ${results.length-failed}/${results.length}${control?' (control '+control+')':''}`);
process.exitCode=failed?1:0;
