import {FEATURE_LABELS,REGIONS,type HotelFilters} from './hotel-types';
import {FEATURE_KEYS} from './hotel-bath-facts';
import {hotelRelevance,prepareHotelQuery} from './hotel-relevance';
import type {PreparedSearchIndex} from './hotel-search-index';
function affinity(query:string,name:string){
 if(query.length<2)return 0;
 const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
 const q=grams(query),n=grams(name);let shared=0;for(const g of q)if(n.has(g))shared++;
 return q.size?shared/q.size:0;
}
export function rankHotelAlternatives(index:PreparedSearchIndex,filters:HotelFilters,savedIds?:Set<string>){
 const plan=prepareHotelQuery(filters.query);
 return index.filter(row=>!savedIds||savedIds.has(row.hotel.id)).map(row=>{
  const h=row.hotel,reasons:string[]=[];
  const nameMatch=plan.key?hotelRelevance(plan,row.names,row.context):null,queryMatched=!plan.key||!!nameMatch;
  let score=nameMatch?1000+nameMatch.score*2:plan.key?40*Math.max(0,...row.names.map(n=>affinity(plan.core,n.key))):0;
  if(!queryMatched)reasons.push('검색어 일치 없음');
  if(filters.region==='all'||h.region===filters.region||h.prefecture===filters.region)score+=250;
  else reasons.push((REGIONS.find(r=>r.id===filters.region)?.name??'선택 지역')+' 밖');
  for(const key of filters.features){const bit=1<<FEATURE_KEYS.indexOf(key);if(h.features&bit)score+=80/Math.max(1,filters.features.length);else reasons.push(FEATURE_LABELS[key]+((h.knownFeatures??0)&bit?' · 없음':' · 확인 필요'))}
  if(filters.ryokanOnly){if(h.kind==='ryokan')score+=40;else reasons.push(h.kind==='unknown'?'료칸 여부 확인 필요':'료칸 아님')}
  const rating=filters.ratingProvider==='jalan'?h.jalanScore:h.tripScore,reviews=filters.ratingProvider==='jalan'?h.jalanReviews:h.tripReviews;
  if(filters.minRating){if(rating!==null&&rating>=filters.minRating)score+=30;else reasons.push(rating===null?'선택한 출처의 평점 미확인':`평점 ${filters.minRating.toFixed(1)} 미만`)}
  if(filters.minReviews){if(reviews!==null&&reviews>=filters.minReviews)score+=20;else reasons.push(reviews===null?'선택한 출처의 리뷰 수 미확인':`리뷰 ${filters.minReviews.toLocaleString()}개 미만`)}
  return{id:h.id,unmetConditions:reasons,queryMatched,score,rating:rating??0,reviews:reviews??0};
 }).filter(c=>c.unmetConditions.length).sort((a,b)=>b.score-a.score||a.unmetConditions.length-b.unmetConditions.length||b.rating-a.rating||b.reviews-a.reviews||a.id.localeCompare(b.id)).slice(0,8);
}
