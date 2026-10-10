import type {SearchResponse} from './hotel-repository';
export function appendHotelPage(current:SearchResponse,next:SearchResponse):SearchResponse {
 const known=new Set(current.hotels.map(h=>h.id));
 return {...next,hotels:[...current.hotels,...next.hotels.filter(h=>!known.has(h.id))],similarHotelIds:[...new Set([...(current.similarHotelIds??[]),...(next.similarHotelIds??[])])],alternatives:current.alternatives??[]};
}
