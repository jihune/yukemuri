import type { Hotel } from './hotel-types';
export function hasCoordinates(h:Hotel):h is Hotel&{location:Hotel['location']&{latitude:number;longitude:number}}{
 return typeof h.location.latitude==='number'&&Number.isFinite(h.location.latitude)&&typeof h.location.longitude==='number'&&Number.isFinite(h.location.longitude);
}
