import { FEATURE_LABELS, type HotelFilters, type Hotel } from './hotel-types';
import { hotelRelevance, prepareHotelQuery, prepareHotelRelevance } from './hotel-relevance';
import type { HotelSuggestion } from './hotel-suggestions';
import {hotelNames} from './hotel-names';
import {formatHotelLocation,hotelPlaceSearchText} from './japan-place-labels';
import {featureMasks} from './hotel-bath-facts';
import {providerRating} from './hotel-ratings';

export const SEARCH_FEATURES=Object.keys(FEATURE_LABELS) as HotelFilters['features'];
export type SearchIndexHotel={
  id:string;names:string[];location:string;context:string;region:string;prefecture:string|null;kind:string;features:number;knownFeatures?:number;
  tripScore:number|null;tripReviews:number|null;jalanScore:number|null;jalanReviews:number|null;
};
export function searchIndexHotel(hotel:Hotel):SearchIndexHotel{
 const trip=providerRating(hotel,'trip'),jalan=providerRating(hotel,'jalan'),mask=featureMasks(hotel);
 return{id:hotel.id,names:hotelNames(hotel),location:formatHotelLocation(hotel),context:hotelPlaceSearchText(hotel),region:hotel.regionId,prefecture:hotel.prefecture??null,kind:hotel.kind,features:mask.features,knownFeatures:mask.knownFeatures,tripScore:trip?.score??null,tripReviews:trip?.reviewCount??null,jalanScore:jalan?.score??null,jalanReviews:jalan?.reviewCount??null};
}
export function prepareSearchIndex(hotels:SearchIndexHotel[]){
  return hotels.map(hotel=>({hotel,...prepareHotelRelevance(hotel.names,hotel.context)}));
}
export type PreparedSearchIndex=ReturnType<typeof prepareSearchIndex>;
export function searchIndexMatches(index:PreparedSearchIndex,query:string,region='all'){
  const plan=prepareHotelQuery(query);
  if(!plan.key)return [];
  return index.flatMap(row=>{
    if(region!=='all'&&row.hotel.region!==region&&row.hotel.prefecture!==region)return [];
    const match=hotelRelevance(plan,row.names,row.context);
    return match?[{id:row.hotel.id,hotel:row.hotel,...match}]:[];
  });
}
export function localHotelSuggestions(index:PreparedSearchIndex,query:string,filters:HotelFilters,savedIds?:Set<string>):HotelSuggestion[]{
  if(!query.trim())return [];
  const mask=filters.features.reduce((value,key)=>value|(1<<SEARCH_FEATURES.indexOf(key)),0);
  const eligible=index.filter(({hotel:h})=>{
    const score=filters.ratingProvider==='jalan'?h.jalanScore:h.tripScore,reviews=filters.ratingProvider==='jalan'?h.jalanReviews:h.tripReviews;
    return (!savedIds||savedIds.has(h.id))&&(!filters.ryokanOnly||h.kind==='ryokan')&&(h.features&mask)===mask&&(!filters.minRating||score!==null&&score>=filters.minRating)&&(!filters.minReviews||reviews!==null&&reviews>=filters.minReviews);
  });
  return searchIndexMatches(eligible,query,filters.region).sort((a,b)=>b.score-a.score||(b.hotel.tripReviews??0)-(a.hotel.tripReviews??0)||a.id.localeCompare(b.id)).slice(0,8).map(match=>({id:match.id,name:match.hotel.names[0],location:match.hotel.location,matchedName:match.matchedName,similar:match.similar}));
}
