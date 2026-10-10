'use client';
import type {Hotel} from '@/lib/hotel-types';
import type {GooglePlaceData} from '@/lib/google-places';
export default function GooglePlaceRating({hotel,data}:{hotel:Hotel;data:GooglePlaceData|null}){
 const url=data?.mapsUrl??hotel.links.find(l=>l.provider==='maps')?.url;
 if(data?.score!==null&&data?.score!==undefined)return <div className="detail-rating google-place-rating"><span className="score">{data.score.toFixed(1)}</span><b translate="no">Google Maps</b><span>5점 만점 · 리뷰 {data.reviewCount===null?'수 확인 필요':data.reviewCount.toLocaleString()+'개'}</span><small><a href={url??undefined} target="_blank" rel="noopener noreferrer">지도 리뷰 보기</a> · 확인 {data.checkedAt.slice(0,10)}</small></div>;
 return url?<p className="secondary"><a href={url} target="_blank" rel="noopener noreferrer" translate="no">Google Maps</a>에서 평점과 사진 확인</p>:null;
}
