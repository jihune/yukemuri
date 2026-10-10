import type { Hotel, RatingProvider } from './hotel-types';

// Keep each provider's original scale; the user's 9.0 / 50 rule uses Trip.com only.
export const primaryRating = (hotel: Hotel) => hotel.ratings.find(r => r.provider === 'trip' && r.scale === 10 && !r.isMock);
export const providerRating=(hotel:Hotel,provider:RatingProvider)=>hotel.ratings.find(r=>r.provider===provider&&r.scale===(provider==='trip'?10:5)&&!r.isMock);
export const displayRating=(hotel:Hotel)=>primaryRating(hotel)??providerRating(hotel,'jalan');
export const orderedRatings=(hotel:Hotel)=>[...hotel.ratings].sort((a,b)=>['trip','google','jalan','rakuten'].indexOf(a.provider??'')-['trip','google','jalan','rakuten'].indexOf(b.provider??''));
export const meetsVerifiedCriteria = (hotel: Hotel) => {
  const rating = primaryRating(hotel);
  return !!rating && rating.scale === 10 && rating.score >= 9 && rating.reviewCount >= 50;
};
