import prefectures from '../data/prefectures.json';
export const PREFECTURES=prefectures;
export const CORE_FEATURE_LABELS = {
  natural: '천연온천', largeBath: '대욕장', outdoor: '노천탕', privateBath: '전세탕 / 가족탕', roomOnsen: '객실 온천', roomOutdoor: '객실 노천탕',
} as const;
export const EXTRA_FEATURE_LABELS = {
  communalOutdoor:'공용 대욕장 노천탕', privateOutdoor:'전세·가족 노천탕', roomIndoorOnsen:'객실 실내 온천탕', roomOutdoorOnsen:'객실 노천 온천탕',
  nigori:'니고리유 · 탁한 온천', freeFlow:'카케나가시 · 흘려보내는 온천', jalanHighClass:'자란 하이클래스',
  // Last, so the search columns' feature bits 0-12 keep their order (D05).
  viewBath:'전망 욕탕',
} as const;
export const FEATURE_LABELS={...CORE_FEATURE_LABELS,...EXTRA_FEATURE_LABELS};
export const FEATURE_GROUPS=[
 {label:'온천수와 사용 방식',keys:['natural','nigori','freeFlow']},
 {label:'공용·전세 목욕 시설',keys:['largeBath','outdoor','communalOutdoor','privateBath','privateOutdoor']},
 {label:'객실 목욕 시설',keys:['roomOnsen','roomIndoorOnsen','roomOutdoor','roomOutdoorOnsen']},
] as const;
export type CoreFeatureKey=keyof typeof CORE_FEATURE_LABELS;
export type ExtraFeatureKey=keyof typeof EXTRA_FEATURE_LABELS;
export type FeatureKey = keyof typeof FEATURE_LABELS;
export const REGIONS = [
  {id:'all',name:'일본 전국',ja:'日本全国',en:'Japan'},
  ...PREFECTURES,
  {id:'sapporo',name:'삿포로',ja:'札幌・定山渓',en:'Sapporo Jozankei'},
  {id:'noboribetsu',name:'노보리베츠',ja:'登別',en:'Noboribetsu'},
  {id:'toya',name:'도야호',ja:'洞爺湖',en:'Lake Toya'},
  {id:'hakodate',name:'하코다테',ja:'函館・湯の川',en:'Hakodate Yunokawa'},
  {id:'otaru',name:'오타루',ja:'小樽',en:'Otaru'},
  {id:'niseko',name:'니세코',ja:'ニセコ',en:'Niseko'},
  {id:'sounkyo',name:'소운쿄',ja:'層雲峡',en:'Sounkyo'},
  {id:'akan',name:'아칸호',ja:'阿寒湖',en:'Lake Akan'},
] as const;
export type RegionId = string;
export type Provenance = { sourceId:string; sourceType:'seed'|'api'|'manual'|'asset'|'web'; label:string; retrievedAt:string; verifiedAt:string|null; url:string|null; isMock:boolean; nameLocaleUrl?:string; bathDataVersion?:'v1'|'v2'|'v3' };
export type FeatureFact = { value:boolean|null; sourceId:string; verifiedAt:string|null; scope?:'property'|'someRooms'|'allRooms'; note?:string };
// The source's stated room count (D05). Missing means unknown; byType: Jalan's 洋室·和室·和洋室·その他.
export type RoomCount = { total:number; byType?:{western:number;japanese:number;japaneseWestern:number;other:number}; sourceId:string; verifiedAt:string; note:string };
// Opening and renovation years a source states (D04). Missing means unknown, never 'old'.
export type FacilityYears = { opened?:number; renovated?:number; sourceId:string; verifiedAt:string; note:string };
// Room type names and room photos a source shows (D05). Jalan's room gallery names no type (name null).
export type RoomTypeSet = { sourceId:string; verifiedAt:string; items:{ name:string|null; photos:{url:string;caption:string}[] }[] };
export type ExternalLink = { provider:'trip'|'jalan'|'official'|'maps'; url:string|null; kind:'search'|'property'|'unavailable'|'coordinates'; label:string };
export type HotelLifecycle={state:'unverified'|'operating'|'temporarily_closed'|'closed';firstSeenAt:string;lastSeenAt:string;lastDetailAt:string|null;reviewNeeded:boolean;checkedAt:string|null;evidence?:import('./lifecycle-contract').LifecyclePatch};
export type Hotel = {
  lifecycle?:HotelLifecycle;
  googlePlaceId?:string;
  photoCandidates?:import('./source-policy').PhotoCandidate[];
  id:string; names:{ko:string;ja:string;en:string}; aliases?:string[]; kind:'ryokan'|'hotel'|'unknown';
  regionId:RegionId; prefecture?:string|null; location:{label:string;address:string;latitude:number|null;longitude:number|null;isApproximate:boolean};
  description:string; descriptionTranslation?:{text:string;translatedAt:string}; image:{url:string;alt:string;sourceId:string;isRepresentative:boolean;alternatives?:string[]};
  features:Record<CoreFeatureKey,FeatureFact>&Partial<Record<ExtraFeatureKey,FeatureFact>>; rooms?:RoomCount; roomTypes?:RoomTypeSet[]; facilityYears?:FacilityYears; spring:{types:string[];waterNotes:string;useNotes:string};
  ratings:{sourceId:string;provider?:'trip'|'google'|'jalan'|'rakuten';score:number;scale:5|10;reviewCount:number;summary:string;highlights:string[];isMock:boolean;verifiedAt:string|null}[];
  links:ExternalLink[]; sources:Provenance[];
};
export type RatingProvider='trip'|'jalan';
export type HotelFilters = {region:RegionId;query:string;features:FeatureKey[];ryokanOnly:boolean;minRating:number;minReviews:number;ratingProvider:RatingProvider};
export const DEFAULT_FILTERS:HotelFilters={region:'all',query:'',features:[],ryokanOnly:false,minRating:0,minReviews:0,ratingProvider:'trip'};
export const isVerifiedCriteria=(f:HotelFilters)=>f.ratingProvider==='trip' && f.minRating===9 && f.minReviews===50;
