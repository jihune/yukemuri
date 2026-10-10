'use client';
import { type BookingQuery, japanToday,nextBookingDay,changeCheckIn } from '@/lib/booking-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export default function BookingFields({query,onChange,prefix}:{query:BookingQuery;onChange:(q:BookingQuery)=>void;prefix:string}){
 return <div className="booking-fields">
  <label htmlFor={prefix+'-in'}>체크인<input id={prefix+'-in'} type="date" value={query.checkIn} min={japanToday()} onChange={e=>onChange(changeCheckIn(query,e.target.value))}/></label>
  <label htmlFor={prefix+'-out'}>체크아웃<input id={prefix+'-out'} type="date" value={query.checkOut} min={nextBookingDay(query.checkIn||japanToday())} onChange={e=>onChange({...query,checkOut:e.target.value})}/></label>
  <label>성인 · 객실 1개<Select value={String(query.adults)} onValueChange={value=>onChange({...query,adults:Number(value)})}><SelectTrigger aria-label="성인 인원" className="booking-adults"><SelectValue/></SelectTrigger><SelectContent>{[1,2,3,4,5,6].map(n=><SelectItem key={n} value={String(n)}>{n}명</SelectItem>)}</SelectContent></Select></label>
 </div>
}
