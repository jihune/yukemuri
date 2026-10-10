import type {Hotel} from '@/lib/hotel-types';
import {needsKoreanDescription} from '@/lib/hotel-description';
export default function HotelDescription({hotel}:{hotel:Hotel}){
 const translation=hotel.descriptionTranslation;
 return <div className="hotel-description">
  {translation?<>
   <p className="description-caption">한국어 자동 번역</p>
   <p className="hotel-intro" lang="ko">{translation.text}</p>
   <details className="description-original"><summary>원문 보기</summary><p className="hotel-intro" lang="" dir="auto">{hotel.description}</p></details>
  </>:<>
   {needsKoreanDescription(hotel.description)&&<p className="description-caption">원문 · 한국어 번역은 자동으로 순차 반영됩니다.</p>}
   <p className="hotel-intro">{hotel.description}</p>
  </>}
 </div>;
}
