import type {FeatureFact,FeatureKey} from './hotel-types';
import {hotelFeature} from './hotel-bath-facts';

// The six bath columns of a card (U05 B ‘탕 체크리스트’, user decision 2026-10-13):
// 천연온천·노천탕·전세탕·객실탕·카케나가시·니고리유. 대욕장, 자란 하이클래스 and 전망 욕탕
// (viewBath, D05) stay in the detail only.
//
// A column is ‘yes’ when any of its keys is confirmed, ‘no’ only when every one of its
// base keys is confirmed absent, and otherwise ‘unknown’ (never guessed). The derived keys
// (communalOutdoor, roomIndoorOnsen, …) are only ever set to true by lib/hotel-bath-facts.ts,
// so their absence says nothing; the base keys are the ones a source answers yes or no.
export const BATH_COLUMNS=[
 {id:'natural',label:'천연온천',keys:['natural'],base:['natural']},
 {id:'outdoor',label:'노천탕',keys:['outdoor','communalOutdoor','privateOutdoor'],base:['outdoor']},
 {id:'private',label:'전세탕',keys:['privateBath','privateOutdoor'],base:['privateBath']},
 {id:'room',label:'객실탕',keys:['roomOnsen','roomIndoorOnsen','roomOutdoorOnsen','roomOutdoor'],base:['roomOnsen','roomOutdoor']},
 {id:'freeFlow',label:'카케나가시',keys:['freeFlow'],base:['freeFlow']},
 {id:'nigori',label:'니고리유',keys:['nigori'],base:['nigori']},
] as const satisfies readonly {id:string;label:string;keys:readonly FeatureKey[];base:readonly FeatureKey[]}[];
export type BathColumnId=typeof BATH_COLUMNS[number]['id'];
export type BathState='yes'|'no'|'unknown';
export const BATH_STATE_LABEL:Record<BathState,string>={yes:'있음',no:'없음',unknown:'확인 전'};
type Features={features:Partial<Record<FeatureKey,Pick<FeatureFact,'value'|'scope'>>>};
// scope: for the room column, whether the confirmed room bath is in every room or some.
export function bathColumn(hotel:Features,column:typeof BATH_COLUMNS[number]):{state:BathState;scope?:'someRooms'|'allRooms'}{
 const facts=column.keys.map(key=>hotelFeature(hotel,key)),yes=facts.filter(f=>f.value===true);
 if(yes.length){
  if(column.id!=='room')return{state:'yes'};
  return{state:'yes',scope:yes.some(f=>f.scope==='allRooms')?'allRooms':yes.some(f=>f.scope==='someRooms')?'someRooms':undefined};
 }
 return{state:column.base.every(key=>hotelFeature(hotel,key).value===false)?'no':'unknown'};
}
