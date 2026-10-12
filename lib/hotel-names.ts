import type { Hotel } from './hotel-types';
import { REGIONS } from './hotel-types';

export function normalizeSearch(value: string): string {
  // Locale-independent: the stored search text and name keys were lower-cased
  // this way, so a Turkish browser must not turn "I" into a dotless "ı".
  return value.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/[\s\p{P}\p{S}]/gu, '');
}

export function hotelNames(hotel: Pick<Hotel,'names'|'aliases'>): string[] {
  return [...new Set([hotel.names.ko, hotel.names.ja, hotel.names.en, ...(hotel.aliases ?? [])].map(s => s.trim()).filter(Boolean))];
}

export function hotelSearchText(hotel: Pick<Hotel,'names'|'aliases'|'regionId'|'prefecture'|'location'>): string {
  const region = REGIONS.find(r => r.id === hotel.regionId);
  const pref = REGIONS.find(r => r.id === hotel.prefecture);
  return normalizeSearch([...hotelNames(hotel), hotel.location.label, hotel.location.address, region?.name.split(' · ')[0], region?.ja.split('・')[0], region?.en.split(' ')[0], pref?.name.split(' · ')[0], pref?.ja, pref?.en.split(' ')[0]].join(' '));
}
