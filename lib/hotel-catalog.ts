import curated from './hotels.real.json';
import collected from './hotels.crawled.json';
import coverage from '../data/coverage.json';
import { Hotel } from './hotel-types';
import { sourceRegion } from './hotel-region';
import { verifiedHotels, enrichHotel } from './hotel-enrichment';
export const catalogHotels:Hotel[]=[...(curated as Hotel[]).map(h=>({...h,prefecture:'pref-hokkaido'})),...(collected as Hotel[]).filter(h=>!verifiedHotels.some(v=>v.id===h.id)).map(h=>({...h,regionId:sourceRegion(h)})),...verifiedHotels].map(enrichHotel);
export const catalogCoverage=coverage;
export const catalogVersion=coverage.updatedAt+'-multilingual-photos-v1';
