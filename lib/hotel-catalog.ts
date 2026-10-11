import collected from './hotels.crawled.json';
import { Hotel } from './hotel-types';
import { sourceRegion } from './hotel-region';
import { verifiedHotels, enrichHotel } from './hotel-enrichment';
import { curatedHotels } from './catalog-core';
export { catalogCoverage, catalogVersion } from './catalog-core';
export const catalogHotels:Hotel[]=[...curatedHotels,...(collected as Hotel[]).filter(h=>!verifiedHotels.some(v=>v.id===h.id)).map(h=>({...h,regionId:sourceRegion(h)})),...verifiedHotels].map(enrichHotel);
