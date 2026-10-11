import curated from './hotels.real.json';
import coverage from '../data/coverage.json';
import type { Hotel } from './hotel-types';
import { verifiedHotels, enrichHotel } from './hotel-enrichment';
// The small part of the catalogue seed that requests may need. The 4.77MB
// collected seed stays in hotel-catalog.ts and is imported only to seed a DB.
export const curatedHotels:Hotel[]=(curated as Hotel[]).map(h=>({...h,prefecture:'pref-hokkaido'}));
// The catalogue records that are not provider rows (ids other than jalan-N or
// trip-N). The collected seed has none; check-catalog.mjs asserts it.
export const curatedCatalogHotels:Hotel[]=[...curatedHotels,...verifiedHotels].map(enrichHotel).filter(h=>!/^(jalan|trip)-\d+$/.test(h.id));
export const catalogCoverage=coverage;
export const catalogVersion=coverage.updatedAt+'-multilingual-photos-v1';
