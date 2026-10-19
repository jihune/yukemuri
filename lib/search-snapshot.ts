import type {Hotel,FeatureKey,FeatureFact} from './hotel-types';
import type {PhotoCandidate} from './source-policy';
import type coverageJson from '../data/coverage.json';
// The static search snapshot (P03): every hotel's search columns, list-card
// fields and name-search text, made by scripts/build-search-snapshot.mjs from
// D1 after each collection run and at deploy, and served as Worker static
// assets. The browser filters, sorts, pages and maps from it; no list, search
// or map request reaches the Worker. Bump SNAPSHOT_FORMAT when a file changes shape.
export const SNAPSHOT_FORMAT=1;
export const SNAPSHOT_MANIFEST='/snapshot/manifest.json';
// The card fields of a hotel: what a list card, a map marker and the map
// preview show. The detail sheet reads the full hotel from /api/hotels/<id>.
export type HotelSummary={
 id:string;names:Hotel['names'];kind:Hotel['kind'];
 location:Pick<Hotel['location'],'label'|'latitude'|'longitude'>;
 image:Pick<Hotel['image'],'url'|'alt'|'sourceId'|'alternatives'>;photoCandidates?:PhotoCandidate[];
 features:Partial<Record<FeatureKey,Pick<FeatureFact,'value'|'scope'>>>;
 ratings:Pick<Hotel['ratings'][number],'provider'|'score'|'scale'|'reviewCount'>[];
 lifecycle?:{state:NonNullable<Hotel['lifecycle']>['state'];reviewNeeded:boolean;evidence?:{openedAt?:string}};
 // The names lib/wikidata-names.ts added (D07): the item and the values the added names replaced,
 // so the public audit (scripts/check-wikidata-names.mjs --public) tells them from collected
 // names. No page reads it, so adding it did not change SNAPSHOT_FORMAT.
 wikidataNames?:{item:string;was:Partial<Pick<Hotel['names'],'ko'|'en'>>};
 // D08: the Japan Tourism Agency registration number lib/jta-registration.ts linked (H… a
 // registered hotel, R… a registered ryokan). A page older than it ignores it, and a page reading
 // a snapshot without it shows no registration, so it did not change SNAPSHOT_FORMAT.
 jta?:string;
};
export function hotelSummary(h:Hotel):HotelSummary{
 const features:HotelSummary['features']={};
 // A fact without a value reads the same as a missing one (hotelFeature), so it is left out.
 for(const [key,fact] of Object.entries(h.features) as [FeatureKey,FeatureFact|undefined][])if(fact&&fact.value!==null)features[key]=fact.scope===undefined?{value:fact.value}:{value:fact.value,scope:fact.scope};
 const life=h.lifecycle,openedAt=life?.evidence?.openedAt;
 return{id:h.id,names:h.names,kind:h.kind,location:{label:h.location.label,latitude:h.location.latitude,longitude:h.location.longitude},
  image:{url:h.image.url,alt:h.image.alt,sourceId:h.image.sourceId,...(h.image.alternatives?{alternatives:h.image.alternatives}:{})},
  ...(h.photoCandidates?{photoCandidates:h.photoCandidates}:{}),features,
  // Mock ratings never count (providerRating, displayRating), so they are left out.
  ratings:h.ratings.filter(r=>!r.isMock).map(r=>({provider:r.provider,score:r.score,scale:r.scale,reviewCount:r.reviewCount})),
  ...(life?{lifecycle:{state:life.state,reviewNeeded:life.reviewNeeded,...(openedAt?{evidence:{openedAt}}:{})}}:{})};
}
// Search columns, one array per column, all in hotel id order (SQLite BINARY).
// Values are the hotels table's columns, which the former SQL filtered and
// sorted on; lat/lng only when both payload coordinates are JSON numbers.
export type SnapshotCore={
 ids:string[];region:string[];prefecture:(string|null)[];name:string[];kind:string[];
 tripScore:(number|null)[];tripReviews:(number|null)[];jalanScore:(number|null)[];jalanReviews:(number|null)[];
 natural:(number|null)[];features:(number|null)[];known:(number|null)[];lat:(number|null)[];lng:(number|null)[];state:(string|null)[];
};
// Name search, in the same order. searchText and nameKeys: the former substring
// match (hotels.search_text, hotel_names.name_key). names, location, context:
// the typo-tolerant index (SearchIndexHotel), null for closed hotels as before.
export type SnapshotText={searchText:string[];nameKeys:string[][];names:(string[]|null)[];location:(string|null)[];context:(string|null)[]};
// The list's collection summary (lib/hotel-repository.ts coverageFrom).
export type SnapshotCoverage=typeof coverageJson;
// Map positions (D06), in core order, in a file of their own so the list never
// loads them. grade: GEO_GRADE. lat/lng: the payload coordinates for grade 1
// (core.lat/lng keeps only those, as before), otherwise the approximate point
// the snapshot builder found, rounded to 6 decimals. Every grade from 2 is
// approximate: what the hotel detail calls location.isApproximate (the detail
// API reads D1 and has no coordinates for these hotels). overture: a grade 3-6
// point moved to the matched Overture Maps place (D08, scripts/snapshot-geo.mjs);
// like Wikidata, a building's point that no booking site confirmed.
export const GEO_GRADE={none:0,source:1,block:2,oaza:3,city:4,prefecture:5,wikidata:6,overture:7} as const;
export type GeoGrade=typeof GEO_GRADE[keyof typeof GEO_GRADE];
export type SnapshotGeo={grade:GeoGrade[];lat:(number|null)[];lng:(number|null)[]};
// The geocoder's input for a hotel without payload coordinates
// (lib/japan-place-labels.ts geocodeInput, scripts/geo/geocode.py).
export type GeocodeInput={address:string;prefecture:string|null;places:string[]};
// files.geo is optional: a page older than D06 never reads it, so adding it
// did not change SNAPSHOT_FORMAT. mergedInto (D08 PR 6) likewise: a provider record shown on
// the card of the same stay's other provider record (a group whose own hotel is one of its
// provider records), by id; it has no row in the files, and a saved, compared or shared
// address of it goes to that card. A page older than it shows no card for such an address.
export type SnapshotManifest={format:typeof SNAPSHOT_FORMAT;id:string;generatedAt:string;hotels:number;coverage:SnapshotCoverage;files:{core:string;cards:string;text:string;status:string;geo?:string};bytes:Record<'core'|'cards'|'text'|'status',number>&{geo?:number};mergedInto?:Record<string,string>};
