import type { Hotel } from './hotel-types';
export function hasCoordinates<H extends {location:Pick<Hotel['location'],'latitude'|'longitude'>}>(h:H):h is H&{location:H['location']&{latitude:number;longitude:number}}{
 return typeof h.location.latitude==='number'&&Number.isFinite(h.location.latitude)&&typeof h.location.longitude==='number'&&Number.isFinite(h.location.longitude);
}
