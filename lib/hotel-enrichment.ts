import verified from './hotels.verified.json';
import type { Hotel } from './hotel-types';
import { normalizeHotelImage } from './hotel-images';
import { formatHotelLocation } from './japan-place-labels';
import { enrichBathFacts } from './hotel-bath-facts';

export const verifiedHotels = verified as Hotel[];
export function enrichHotel(hotel: Hotel): Hotel {
  const manual = verifiedHotels.find(h => h.id === hotel.id);
  let h = hotel;
  if (manual) {
    const ratings = new Map(manual.ratings.map(r => [r.provider, r]));
    for (const r of hotel.ratings) {
      const old = ratings.get(r.provider);
      if (!old || (r.verifiedAt ?? '') >= (old.verifiedAt ?? '')) ratings.set(r.provider, r);
    }
    const sources = new Map(manual.sources.map(s => [s.sourceId, s]));
    for (const s of hotel.sources) sources.set(s.sourceId, s);
    h = {...hotel, names:manual.names, aliases:[...new Set([...(hotel.aliases ?? []), ...Object.values(hotel.names), ...(manual.aliases ?? [])])], kind:manual.kind, features:manual.features, spring:manual.spring, description:manual.description, links:manual.links, sources:[...sources.values()], ratings:[...ratings.values()], image:manual.image, location:manual.location};
  }
  return enrichBathFacts({...h, location:{...h.location,label:formatHotelLocation(h)}, image:{...h.image, url:normalizeHotelImage(h.image.url), alternatives:h.image.alternatives?.map(normalizeHotelImage).filter(Boolean)}});
}
