import { DEFAULT_FILTERS, FEATURE_LABELS, REGIONS, type HotelFilters } from './hotel-types';
import type { SortOrder } from './hotel-search';

export function parseHotelQuery(p: URLSearchParams) {
  const region = p.get('region') ?? 'all', provider = p.get('provider') ?? 'trip', sort = p.get('sort') ?? 'recommended';
  const features = (p.get('features') ?? '').split(',').filter(Boolean), rating = Number(p.get('rating') ?? 0), reviews = Number(p.get('reviews') ?? 0), page = Number(p.get('page') ?? 1), query = p.get('q') ?? '';
  if (!REGIONS.some(r => r.id === region) || !['trip', 'jalan'].includes(provider) || !['recommended', 'rating', 'reviews', 'name'].includes(sort) || features.some(k => !Object.hasOwn(FEATURE_LABELS, k)) || !Number.isFinite(rating) || rating < 0 || rating > (provider === 'trip' ? 10 : 5) || !Number.isInteger(reviews) || reviews < 0 || !Number.isInteger(page) || page < 1 || page > 100000 || query.length > 200) return null;
  const filters: HotelFilters = { ...DEFAULT_FILTERS, region, query, ratingProvider: provider as 'trip' | 'jalan', features: [...new Set(features)].sort() as HotelFilters['features'], minRating: rating, minReviews: reviews, ryokanOnly: p.get('ryokan') === '1' };
  return { filters, sort: sort as SortOrder, page, savedOnly: p.get('saved') === '1' };
}

export function hotelQueryParams(filters: HotelFilters, query = filters.query, savedOnly = false) {
  return new URLSearchParams({ region: filters.region, q: query, provider: filters.ratingProvider, rating: String(filters.minRating), reviews: String(filters.minReviews), features: filters.features.join(','), ryokan: filters.ryokanOnly ? '1' : '0', saved: savedOnly ? '1' : '0' });
}

export type HotelQuery=NonNullable<ReturnType<typeof parseHotelQuery>>;
export const defaultHotelQuery=():HotelQuery=>({filters:{...DEFAULT_FILTERS,features:[]},sort:'recommended',page:1,savedOnly:false});
export function listingUrl(current:string,query:HotelQuery,view:string){
 const url=new URL(current),params=hotelQueryParams(query.filters,query.filters.query,query.savedOnly);params.set('sort',query.sort);
 for(const [key,value] of params)url.searchParams.set(key,value);
 url.searchParams.set('view',view);url.searchParams.delete('page');url.searchParams.delete('snapshot');url.searchParams.delete('stable');url.searchParams.delete('fresh');
 return url.pathname+url.search+url.hash;
}
