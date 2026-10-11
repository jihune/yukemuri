import type { Hotel, RatingProvider } from './hotel-types';
// Any hotel with ratings: a full record, or a snapshot card (mock ratings left out).
type Rated={ratings:(Pick<Hotel['ratings'][number],'provider'|'score'|'scale'|'reviewCount'>&{isMock?:boolean})[]};

// Keep each provider's original scale; the user's 9.0 / 50 rule uses Trip.com only.
export const primaryRating = <H extends Rated>(hotel: H):H['ratings'][number]|undefined => hotel.ratings.find(r => r.provider === 'trip' && r.scale === 10 && !r.isMock);
export const providerRating=<H extends Rated>(hotel:H,provider:RatingProvider):H['ratings'][number]|undefined=>hotel.ratings.find(r=>r.provider===provider&&r.scale===(provider==='trip'?10:5)&&!r.isMock);
export const displayRating=<H extends Rated>(hotel:H)=>primaryRating(hotel)??providerRating(hotel,'jalan');
export const orderedRatings=(hotel:Hotel)=>[...hotel.ratings].sort((a,b)=>['trip','google','jalan','rakuten'].indexOf(a.provider??'')-['trip','google','jalan','rakuten'].indexOf(b.provider??''));
export const meetsVerifiedCriteria = (hotel: Rated) => {
  const rating = primaryRating(hotel);
  return !!rating && rating.scale === 10 && rating.score >= 9 && rating.reviewCount >= 50;
};
