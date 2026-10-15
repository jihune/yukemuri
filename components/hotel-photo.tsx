'use client';
import {useState} from 'react';
import type {Hotel} from '@/lib/hotel-types';
import type {HotelSummary} from '@/lib/search-snapshot';
import type {GooglePlaceData} from '@/lib/google-places';
import {photoProvider,type PhotoCandidate} from '@/lib/source-policy';
import {hotelImageCandidates} from '@/lib/hotel-images';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import RetryImage from './retry-image';
// carousel (the detail): previous/next step through the candidates. A photo that fails falls
// through to the later ones as before, and the counter follows the one actually shown. The
// buttons wrap around rather than disabling, so focus never drops out of the sheet.
export default function HotelPhoto({hotel,google,credit=false,loading,carousel=false}:{hotel:HotelSummary&{sources?:Hotel['sources']};google?:GooglePlaceData|null;credit?:boolean|'label';loading?:'lazy'|'eager';carousel?:boolean}){
 const photos:PhotoCandidate[]=[...(hotel.photoCandidates??[hotel.image.url,...(hotel.image.alternatives??[])].filter(Boolean).map(url=>({url,sourceId:hotel.image.sourceId,provider:photoProvider(url)}))),...(google?.photo?[{url:google.photo.url,sourceId:'google:'+google.placeId,provider:'google' as const}]:[])].sort((a,b)=>['trip','google','jalan','official','unknown'].indexOf(a.provider)-['trip','google','jalan','official','unknown'].indexOf(b.provider));
 const [src,setSrc]=useState(photos[0]?.url??''),[at,setAt]=useState(0);
 const start=carousel?Math.min(at,Math.max(photos.length-1,0)):0,shown=photos.slice(start);
 const found=photos.findIndex((p,i)=>i>=start&&hotelImageCandidates(p.url).includes(src)),index=found<0?start:found;
 const current=photos.find(p=>p.url===src)??photos.find(p=>p.provider===photoProvider(src))??photos[0],source=hotel.sources?.find(s=>s.sourceId===current?.sourceId);
 const googlePhoto=current?.provider==='google'?google?.photo:undefined;
 const label=googlePhoto?'Google Maps':current?.provider==='trip'?'Trip.com':current?.provider==='jalan'?'Jalan':source?.label??'숙소 사진';
 return <><RetryImage src={shown[0]?.url??''} alternatives={shown.slice(1).map(p=>p.url)} alt={hotel.image.alt} onSourceChange={setSrc} loading={loading}/>{credit&&<span className="photo-source-credit">{credit==='label'?label:<><a href={googlePhoto?.mapsUrl??source?.url??undefined} target="_blank" rel="noopener noreferrer" translate={googlePhoto?'no':undefined}>{label}</a>{googlePhoto?.authors.map(a=><a key={a.name} href={a.url||googlePhoto.mapsUrl} target="_blank" rel="noopener noreferrer">{a.avatar&&<img src={a.avatar} alt="" width={20} height={20}/>} {a.name}</a>)}</>}</span>}{carousel&&photos.length>1&&<div className="photo-nav"><button type="button" aria-label="이전 사진" onClick={()=>setAt((Math.min(start,index)-1+photos.length)%photos.length)}><ChevronLeft size={22} aria-hidden="true"/></button><span aria-live="polite"><span className="sr-only">사진 </span>{index+1}/{photos.length}</span><button type="button" aria-label="다음 사진" onClick={()=>setAt((index+1)%photos.length)}><ChevronRight size={22} aria-hidden="true"/></button></div>}</>;
}
