import type { Hotel } from './hotel-types';
import catalog from './hotels.real.json';

export const CATALOG_VERIFIED_AT = '2026-10-03';
// Manually checked source snapshots, normalized at the repository boundary.
// Provider scores retain their original denominators; missing facts stay null.
export const realHotels: Hotel[] = catalog as Hotel[];
