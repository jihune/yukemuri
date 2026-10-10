import type { ExternalLink } from './hotel-types';
export type BookingQuery={checkIn:string;checkOut:string;adults:number};
export const japanToday=()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(key:string)=>parts.find(p=>p.type===key)!.value;return [get('year'),get('month'),get('day')].join('-')};
export function nights(q:BookingQuery){return (Date.parse(q.checkOut+'T00:00:00Z')-Date.parse(q.checkIn+'T00:00:00Z'))/86400000}
function isDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
export function bookingError(q:BookingQuery,today=japanToday()):string|null{
 if(!q.checkIn||!q.checkOut)return '체크인과 체크아웃 날짜를 선택하세요.';
 if(!isDate(q.checkIn)||!isDate(q.checkOut))return '올바른 날짜를 선택하세요.';
 if(q.checkIn<today)return '체크인은 오늘 이후로 선택하세요.';
 if(nights(q)<1||nights(q)>7)return '1~7박 일정으로 조회할 수 있습니다.';
 if(Date.parse(q.checkIn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z')>330*86400000)return '체크인은 330일 이내로 선택하세요.';
 if(!Number.isInteger(q.adults)||q.adults<1||q.adults>6)return '성인 1~6명, 객실 1개로 조회할 수 있습니다.';
 return null;
}
export function jalanPlanUrl(property:string,q:BookingQuery){
 const base=new URL(property);const id=base.pathname.match(/^\/yad(\d+)\/$/)?.[1];
 if(base.hostname!=='www.jalan.net'||base.protocol!=='https:'||!id)throw new Error('Unsupported Jalan property');
 const url=new URL('/yad'+id+'/plan/',base);
 const [year,month,day]=q.checkIn.split('-');
 url.search=new URLSearchParams({stayYear:year,stayMonth:String(Number(month)),stayDay:String(Number(day)),stayCount:String(nights(q)),adultNum:String(q.adults),roomCount:'1',roomCrack:q.adults+'00000',dateUndecided:'0'}).toString();
 return url.toString();
}
export function datedLink(link:ExternalLink,q:BookingQuery){
 if(!link.url||bookingError(q))return link.url;
 if(link.provider==='jalan')return jalanPlanUrl(link.url,q);
 if(link.provider==='trip'){
  const url=new URL(link.url);if(url.hostname!=='www.trip.com')return link.url;
  for(const [key,value] of Object.entries({checkIn:q.checkIn,checkOut:q.checkOut,adult:String(q.adults),crn:'1',currency:'JPY'}))url.searchParams.set(key,value);
  return url.toString();
 }
 return link.url;
}

export function nextBookingDay(value:string){return isDate(value)?new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10):''}
export function changeCheckIn(query:BookingQuery,checkIn:string):BookingQuery{return {...query,checkIn,checkOut:query.checkOut&&checkIn&&query.checkOut<=checkIn?nextBookingDay(checkIn):query.checkOut}}
