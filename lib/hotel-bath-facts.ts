import {FEATURE_LABELS,type Hotel,type FeatureFact,type FeatureKey} from './hotel-types';

export const FEATURE_KEYS=Object.keys(FEATURE_LABELS) as FeatureKey[];
// A hotel grade alone never counts as a checked bath or onsen condition.
export const BATH_FEATURE_MASK=FEATURE_KEYS.reduce((mask,key,index)=>key==='jalanHighClass'?mask:mask|(1<<index),0);
const propertyBathKeys:FeatureKey[]=['natural','largeBath','outdoor','privateBath','communalOutdoor','privateOutdoor','nigori','freeFlow'];
export function externalBathDescription(text:string){return /温泉施設はリゾート内の施設|温泉施設は(?:館外|敷地外|別施設)|(?:館外|敷地外|外部)の温泉施設/.test(text)}
export const externalBathNote='리조트 공용 또는 외부 온천 이용 안내입니다. 별도 입장료·이동 여부를 확인하세요. 이 안내만으로 숙소 내 온천·욕탕이 있다고 확정하지 않습니다.';
export function hotelFeature(hotel:Hotel,key:FeatureKey):FeatureFact {
 return hotel.features[key]??{value:null,sourceId:'',verifiedAt:null};
}
export function featureMasks(hotel:Hotel){
 return FEATURE_KEYS.reduce((m,key,i)=>{const f=hotelFeature(hotel,key);if(f.value===true)m.features|=1<<i;if(f.value!==null)m.knownFeatures|=1<<i;return m},{features:0,knownFeatures:0});
}

// Interpret only property facts already collected from Jalan or the official
// bath/room source. A Trip.com spa/public-bath amenity never proves natural water.
export function enrichBathFacts(hotel:Hotel):Hotel {
 const features={...hotel.features};
 const grade=features.jalanHighClass;
 if(grade?.value!==null&&grade?.value!==undefined){
  const source=hotel.sources.find(s=>s.sourceId===grade.sourceId&&!s.isMock);
  if(!grade.verifiedAt||!source?.url||!/^https:\/\/www\.jalan\.net\/yad\d+\//.test(source.url))features.jalanHighClass={value:null,sourceId:'',verifiedAt:null,note:'자란 숙소 페이지의 하이클래스 표시를 아직 확인하지 못했습니다.'};
 }
 const jalan=hotel.sources.find(s=>!s.isMock&&s.url&&/^https:\/\/www\.jalan\.net\/yad\d+\//.test(s.url)&&s.label.includes('상세'));
 const spa=hotel.sources.find(s=>s.sourceId===features.natural.sourceId&&!s.isMock);
 const water=hotel.spring.waterNotes??'',springRow=water.split(/\s*\/\s*/)[0];
 const external=externalBathDescription(water);
 if(jalan&&external)for(const key of propertyBathKeys)if(features[key]?.sourceId===jalan.sourceId)features[key]={value:null,sourceId:jalan.sourceId,verifiedAt:null,note:externalBathNote};
 const set=(key:FeatureKey,value:boolean,note:string,sourceId:string,verifiedAt:string|null,scope:FeatureFact['scope']='property')=>{
  if(features[key]?.value!==null&&features[key]?.value!==undefined)return;
  if(external&&sourceId===jalan?.sourceId&&propertyBathKeys.includes(key))return;
  if(!sourceId||!verifiedAt)return;
  features[key]={value,note,sourceId,verifiedAt,scope};
 };
 if(jalan&&!external){
  const verified=jalan.verifiedAt??jalan.retrievedAt.slice(0,10);
  if(/^(?:無し|なし|無|なし\s*※)$/.test(springRow))set('natural',false,'자란 온천 항목: 없음. 대욕탕 유무와 별도로 구분합니다.',jalan.sourceId,verified);
  else if(/人工温泉/.test(springRow)&&!/人工温泉含まず/.test(springRow))set('natural',false,'자란 온천 항목에 인공 온천으로 명시되어 있습니다.',jalan.sourceId,verified);
  else if(/天然温泉|人工温泉含まず/.test(springRow)&&!/天然温泉(?:ではない|でない|なし|無し)/.test(springRow))set('natural',true,'자란 온천 항목: '+springRow,jalan.sourceId,verified);
 }
 const natural=features.natural;
 const evidence=[...(external?[]:[water,...hotel.spring.types]),natural.note??''].join(' ');
 const waterSource=external?(spa?.sourceId===jalan?.sourceId?undefined:spa):jalan??spa;
 if(natural.value===true&&waterSource){
  const date=waterSource.verifiedAt??natural.verifiedAt;
  if(/(?:源泉|温泉)[掛か]け流し|카케나가시|원천\s*방류식|완전\s*방류식/.test(evidence)&&!/(?:掛け流し|かけ流し|카케나가시)(?:ではない|でない|ではありません|가\s*아닙)/.test(evidence))set('freeFlow',true,'원천을 흘려보내는 방식으로 안내된 욕탕이 있습니다. 가수·가온 여부와 모든 욕탕 적용 여부는 별도 확인하세요.',waterSource.sourceId,date);
  if(/にごり湯|濁り湯|白濁|유백색|백탁|니고리유/.test(evidence)&&!/にごり湯(?:ではない|なし)|白濁(?:しない|なし)/.test(evidence))set('nigori',true,'출처에서 탁한 색의 온천수를 명시합니다. 계절·욕탕·원천에 따라 색이 달라질 수 있습니다.',waterSource.sourceId,date);
 }
 const outdoor=features.outdoor,privateBath=features.privateBath,room=features.roomOnsen,roomOutdoor=features.roomOutdoor;
 if(outdoor.value===true&&/(?:男女とも|공용|대욕장|大浴場)/.test(outdoor.note??''))set('communalOutdoor',true,outdoor.note??'',outdoor.sourceId,outdoor.verifiedAt);
 const privateEvidence=[privateBath.note??'',outdoor.note??''].join(' ');
 if(privateBath.value===true&&/(?:전세|가족)\s*(?:반)?노천|(?:반)?노천\s*전세|(?:貸切|家族)(?:半)?露天/.test(privateEvidence))set('privateOutdoor',true,privateEvidence,privateBath.sourceId,privateBath.verifiedAt);
 if(room.value===true&&/(?:전망\s*온천탕|객실\s*내탕|실내\s*온천|内湯|室内.*温泉)/.test(room.note??''))set('roomIndoorOnsen',true,room.note??'',room.sourceId,room.verifiedAt,room.scope??'someRooms');
 if(room.value===true&&roomOutdoor.value===true&&/노천\s*온천|온천\s*노천|露天温泉/.test(room.note??'')&&!/(?:온천|온천수).{0,6}(?:아님|확인\s*필요)|露天温泉(?:ではない|なし)/.test(room.note??''))set('roomOutdoorOnsen',true,room.note??'',room.sourceId,room.verifiedAt,room.scope??'someRooms');
 if(external&&roomOutdoor.value===true&&features.outdoor.value===null)features.outdoor={...roomOutdoor,note:'객실 노천탕 안내입니다. 리조트 공용 온천과는 별도로 확인한 객실 타입에만 적용합니다.'};
 const spring=external&&!hotel.spring.useNotes.includes(externalBathNote)?{...hotel.spring,useNotes:externalBathNote+'\n'+hotel.spring.useNotes}:hotel.spring;
 return {...hotel,features,spring};
}
