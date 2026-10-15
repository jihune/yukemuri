import type {RoomCount} from './hotel-types';
// The room kinds a source states (D05), kinds with no room left out: ‘양실 10실 · 화실 100실’.
// '' when the source gives only a total.
const ROOM_KINDS=[['western','양실'],['japanese','화실'],['japaneseWestern','화양실'],['other','기타']] as const;
export function roomKindsText(rooms:RoomCount){
 const byType=rooms.byType;
 return byType?ROOM_KINDS.filter(([k])=>byType[k]>0).map(([k,label])=>label+' '+byType[k].toLocaleString()+'실').join(' · '):'';
}
