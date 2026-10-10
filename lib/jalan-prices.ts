import { BookingQuery, nights } from './booking-query';
export type PricePlan={id:string;plan:string;room:string;meal:string;total:number;currency:'JPY';taxIncluded:true;url:string;roomLabels:string;roomOnsen:boolean;roomOutdoor:boolean};
export type PriceQuote={hotelId:string;provider:'jalan';query:BookingQuery;retrievedAt:string;sourceUrl:string;plans:PricePlan[];observedPlans:number;cached?:boolean};
const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function plain(s:string){return s.replace(/<[^>]*>/g,' ').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,name:string)=>entities[name]??'').replace(/&#(x[\da-f]+|\d+);/gi,(_,code:string)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/\s+/g,' ').trim()}
function input(raw:string,name:string){const tags=raw.match(new RegExp('<input\\b[^>]*\\bname=["\\\']'+name+'["\\\'][^>]*>','gi'))??[];const tag=tags.find(t=>/\btype=["']hidden["']/i.test(t));return tag?.match(/\bvalue=["']([^"']*)/i)?.[1]}
function element(raw:string,tag:string,className:string){return raw.match(new RegExp('<'+tag+'\\b[^>]*class=["\\\'][^"\\\']*\\b'+className+'\\b[^"\\\']*["\\\'][^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]??''}
export function parseJalanPrices(raw:string,hotelId:string,sourceUrl:string,q:BookingQuery,at=new Date().toISOString()):PriceQuote{
 const expected={stayYear:Number(q.checkIn.slice(0,4)),stayMonth:Number(q.checkIn.slice(5,7)),stayDay:Number(q.checkIn.slice(8,10)),stayCount:nights(q),roomCount:1,adultNum:q.adults};
 for(const [key,value] of Object.entries(expected)){const actual=input(raw,key);if(actual===undefined||Number(actual)!==value)throw new Error('Returned booking conditions do not match: '+key+'='+String(actual))}
 if(input(raw,'dateUndecided')!=='0')throw new Error('Undated rates are not quotes');
 const propertyId=new URL(sourceUrl).pathname.match(/^\/yad(\d+)\/plan\/$/)?.[1];
 if(!propertyId)throw new Error('Unsupported source');
 const blocks=raw.split(/<li\b[^>]*class=["'][^"']*\bp-planCassette\b[^"']*["'][^>]*>/i).slice(1);
 const plans:PricePlan[]=[];
 for(const block of blocks){
  const plan=plain(element(block,'p','p-searchResultItem__catchPhrase'));
  const meal=plain(element(block,'dd','p-mealType__value'));
  const header=plain(element(block,'th','p-searchResultItem__headCell--total'));
  if(!header.includes('合計(税込)')||!header.includes(q.adults+'名')||!header.includes(nights(q)+'泊'))continue;
  for(const row of block.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi)){
   const id=row[1].match(/\bid=["'](yd\d+pc\d+rc\d+)/)?.[1];
   const link=row[1].match(/<a\b[^>]*class=["'][^"']*\bp-searchResultItem__planName\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
   const total=Number(plain(element(row[1],'span','p-searchResultItem__total')).replace(/[,円\s]/g,''));
   if(!id?.startsWith('yd'+propertyId+'pc')||!link||!plan||!Number.isFinite(total)||total<=0)continue;
   const url=new URL(plain(link[1]),sourceUrl);
   if(url.protocol!=='https:'||url.hostname!=='www.jalan.net'||url.pathname!=='/uw/uwp3200/uww3201init.do'||url.searchParams.get('yadNo')!==propertyId||Object.entries(expected).some(([key,value])=>Number(url.searchParams.get(key))!==value)||url.searchParams.get('dateUndecided')!=='0')continue;
   // Evidence comes only from this room's name/labels, never a property's bath
   // description or a plan heading mentioning a communal onsen.
   const room=plain(link[2]),labels=plain(element(row[1],'ul','p-searchResultItem__horizontalLabels'));
   const evidence=room+' '+labels;
   plans.push({id,plan,room,meal:meal||'원문 플랜 확인',total,currency:'JPY',taxIncluded:true,url:url.toString(),roomLabels:labels,roomOnsen:/(?:温泉(?:内|半露天|露天)?(?:風呂|浴室|浴槽|バス|付き|付)|源泉(?:かけ流し|掛け流し|掛流し)?(?:の)?(?:半露天|露天|内)?(?:風呂|浴室|浴槽|バス))/.test(evidence)&&!/(?:温泉では|温泉なし|温泉無し)/.test(evidence),roomOutdoor:/露天(?:風呂|温泉|バス|付き|付)/.test(evidence)&&!/(?:露天風呂なし|露天風呂無し)/.test(evidence)});
  }
 }
 const unique=[...new Map(plans.map(p=>[p.id,p])).values()].sort((a,b)=>a.total-b.total||a.id.localeCompare(b.id));
 // An empty response, a challenge, or changed markup never means sold out.
 if(!unique.length)throw new Error('No verifiable dated room totals');
 return {hotelId,provider:'jalan',query:q,retrievedAt:at,sourceUrl,plans:unique,observedPlans:unique.length};
}
