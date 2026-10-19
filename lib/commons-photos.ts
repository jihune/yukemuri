import type {Hotel} from './hotel-types';
import {wikidataItem} from './wikidata-names';
import extract from '../data/commons-trip-photos.json';
// D08 PR 2: the Wikimedia Commons photo of the Wikidata item (its image, P18) that a Trip.com
// record's exact Trip.com hotel ID (P10425) reaches, on the D07 link (wikidataItem: the same
// item, still naming the hotel). scripts/update-commons-photos.mjs keeps only files with an
// author, a CC BY, CC BY-SA or CC0 licence and its deed. The photo is shown only beside that
// credit, after the collected photos in the detail (components/hotel-photo.tsx), and is listed
// among the sources and the photo credits; never on a card. Applied where hotels are read,
// never written to D1.
export type CommonsPhoto={url:string;page:string;author:string;licence:string;licenceUrl:string};
const byTrip=new Map((extract.hotels as string[][]).map(([trip,item,url,page,author,licence,licenceUrl])=>[trip,{item,photo:{url,page,author,licence,licenceUrl}}]));
export function withCommonsPhoto(hotel:Hotel):Hotel{
 const row=/^trip-\d+$/.test(hotel.id)?byTrip.get(hotel.id.slice(5)):undefined;
 if(!row||wikidataItem(hotel)!==row.item)return hotel;
 const {photo}=row;
 return{...hotel,commonsPhoto:photo,sources:[...hotel.sources,{sourceId:'commons-photo:'+hotel.id,sourceType:'web',label:`Wikimedia Commons 사진(${photo.author}, ${photo.licence})`,retrievedAt:extract.retrievedAt,verifiedAt:null,url:photo.page,isMock:false}]};
}
