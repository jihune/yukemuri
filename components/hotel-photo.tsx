'use client';
import {useState} from 'react';
import type {Hotel} from '@/lib/hotel-types';
import type {HotelSummary} from '@/lib/search-snapshot';
import type {GooglePlaceData} from '@/lib/google-places';
import {photoProvider,type PhotoCandidate} from '@/lib/source-policy';
import RetryImage from './retry-image';
export default function HotelPhoto({hotel,google,credit=false,loading}:{hotel:HotelSummary&{sources?:Hotel['sources']};google?:GooglePlaceData|null;credit?:boolean|'label';loading?:'lazy'|'eager'}){
 const photos:PhotoCandidate[]=[...(hotel.photoCandidates??[hotel.image.url,...(hotel.image.alternatives??[])].filter(Boolean).map(url=>({url,sourceId:hotel.image.sourceId,provider:photoProvider(url)}))),...(google?.photo?[{url:google.photo.url,sourceId:'google:'+google.placeId,provider:'google' as const}]:[])].sort((a,b)=>['trip','google','jalan','official','unknown'].indexOf(a.provider)-['trip','google','jalan','official','unknown'].indexOf(b.provider));
 const [src,setSrc]=useState(photos[0]?.url??'');
 const current=photos.find(p=>p.url===src)??photos.find(p=>p.provider===photoProvider(src))??photos[0],source=hotel.sources?.find(s=>s.sourceId===current?.sourceId);
 const googlePhoto=current?.provider==='google'?google?.photo:undefined;
 const label=googlePhoto?'Google Maps':current?.provider==='trip'?'Trip.com':current?.provider==='jalan'?'Jalan':source?.label??'숙소 사진';
 return <><RetryImage src={photos[0]?.url??''} alternatives={photos.slice(1).map(p=>p.url)} alt={hotel.image.alt} onSourceChange={setSrc} loading={loading}/>{credit&&<span className="photo-source-credit">{credit==='label'?label:<><a href={googlePhoto?.mapsUrl??source?.url??undefined} target="_blank" rel="noopener noreferrer" translate={googlePhoto?'no':undefined}>{label}</a>{googlePhoto?.authors.map(a=><a key={a.name} href={a.url||googlePhoto.mapsUrl} target="_blank" rel="noopener noreferrer">{a.avatar&&<img src={a.avatar} alt="" width={20} height={20}/>} {a.name}</a>)}</>}</span>}</>;
}
