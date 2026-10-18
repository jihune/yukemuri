import type {Hotel} from '@/lib/hotel-types';
import {needsKoreanDescription} from '@/lib/hotel-description';
import DescriptionTranslate,{descriptionLanguage} from './description-translate';
export default function HotelDescription({hotel}:{hotel:Hotel}){
 const translation=hotel.descriptionTranslation,foreign=needsKoreanDescription(hotel.description);
 return <div className="hotel-description">
  {translation?<>
   <p className="description-caption">한국어 자동 번역</p>
   <p className="hotel-intro" lang="ko">{translation.text}</p>
   <details className="description-original"><summary>원문 보기</summary><p className="hotel-intro" lang="" dir="auto">{hotel.description}</p></details>
  </>:<>
   {foreign&&<p className="description-caption">원문 · 이 숙소의 한국어 번역은 없습니다. 새 번역은 지금 정기적으로 추가되지 않습니다.</p>}
   <p className="hotel-intro" lang={foreign?descriptionLanguage(hotel.description)??undefined:undefined}>{hotel.description}</p>
   {foreign&&<DescriptionTranslate text={hotel.description}/>}
  </>}
 </div>;
}
