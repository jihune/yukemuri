import type {FeatureFact,FeatureKey,Hotel} from './hotel-types';

export const COMPARISON_LIMIT=4;
export const COMPARISON_STORAGE_KEY='yukemuri-comparison-v1';
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,120}$/.test(id);
export function validComparisonIds(value:unknown):value is string[]{
 return Array.isArray(value)&&value.length<=COMPARISON_LIMIT&&value.every(validId)&&new Set(value).size===value.length;
}
export function parseComparisonIds(value:string|null):string[]|null{
 if(!value)return null;
 const ids=value.split(',');return validComparisonIds(ids)&&ids.length?ids:null;
}
export function storedComparisonIds(value:string|null):string[]{
 if(!value||value.length>600)return[];
 try{const ids:unknown=JSON.parse(value);return validComparisonIds(ids)?ids:[]}catch{return[]}
}
export function toggleComparisonId(ids:string[],id:string):string[]|null{
 if(!validComparisonIds(ids)||!validId(id))return null;
 if(ids.includes(id))return ids.filter(item=>item!==id);
 return ids.length<COMPARISON_LIMIT?[...ids,id]:null;
}
export function comparisonFeatureLabel(key:FeatureKey,fact:FeatureFact){
 if(fact.value===null)return'확인 필요';
 if(fact.value===false)return'없음';
 if(fact.scope==='someRooms')return'일부 객실';
 if(fact.scope==='allRooms')return'전 객실';
 return key.startsWith('room')?'있음 · 객실 타입 확인':'있음';
}
export type HotelComparisonResult={hotels:Hotel[];missingIds:string[];measuredAt:string};
