import { Hotel, HotelFilters, REGIONS } from './hotel-types';
import { providerRating, meetsVerifiedCriteria } from './hotel-ratings';
import { normalizeSearch, hotelSearchText, hotelNames } from './hotel-names';
import { prepareHotelQuery, prepareHotelRelevance, hotelRelevance } from './hotel-relevance';
import { hotelPlaceSearchText } from './japan-place-labels';
export type SortOrder='recommended'|'rating'|'reviews'|'name';
const normalize=normalizeSearch;
export function filterHotels(hotels:Hotel[],filters:HotelFilters,sort:SortOrder='recommended'):Hotel[]{
 const q=normalize(filters.query);
 const plan=prepareHotelQuery(filters.query),scores=new Map(hotels.map(h=>{const prepared=prepareHotelRelevance(hotelNames(h),hotelPlaceSearchText(h));return[h.id,hotelRelevance(plan,prepared.names,prepared.context)?.score??0]}));
 return hotels.filter(h=>{
  const region=REGIONS.find(r=>r.id===h.regionId);
  const pref=REGIONS.find(r=>r.id===(h.prefecture??'pref-hokkaido'));
  const haystack=hotelSearchText(h);
  const rating=providerRating(h,filters.ratingProvider);
  return (filters.region==='all'||h.regionId===filters.region||(h.prefecture??'pref-hokkaido')===filters.region) && (!q||haystack.includes(q)||!!scores.get(h.id)) && (!filters.ryokanOnly||h.kind==='ryokan') && filters.features.every(key=>h.features[key]?.value===true) && (!filters.minRating||!!rating&&rating.score>=filters.minRating) && (!filters.minReviews||!!rating&&rating.reviewCount>=filters.minReviews);
 }).sort((a,b)=>{
   const ar=providerRating(a,filters.ratingProvider),br=providerRating(b,filters.ratingProvider);
   if(sort==='reviews') return (br?.reviewCount??-1)-(ar?.reviewCount??-1);
   if(sort==='name') return a.names.ko.localeCompare(b.names.ko,'ko');
   if(sort==='rating') return (br?.score??-1)-(ar?.score??-1)||(br?.reviewCount??-1)-(ar?.reviewCount??-1);
   if(q&&(scores.get(a.id)??0)!==(scores.get(b.id)??0))return(scores.get(b.id)??0)-(scores.get(a.id)??0);
   return Number(meetsVerifiedCriteria(b))-Number(meetsVerifiedCriteria(a))||(br?.score??-1)-(ar?.score??-1)||(br?.reviewCount??-1)-(ar?.reviewCount??-1);
 });
}
