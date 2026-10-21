import list from '../data/jta-registered.json';
import {lodgingList,type ListStay} from './lodging-lists';
// D08 PR 1: hotels and ryokan registered with the Japan Tourism Agency under the International
// Tourism Hotel Act (data/jta-registered.json, scripts/update-jta-registered.py, PDL1.0), linked by
// lib/lodging-lists.ts. Carried on the cards and shown by the card and the detail sheet.
export {nameParts,addressParts} from './lodging-lists';
export type JtaRegistration={kind:'hotel'|'ryokan';number:string;name:string};
export type JtaCandidate={number:string;how:'exact'|'part'};
const rows=list.rows as [string,string,string,string][];
const jta=lodgingList(rows.map(([id,name,address])=>({id,name,address})));
// Every row that agrees with one stay.
export function jtaCandidates(hotel:ListStay):JtaCandidate[]{
 return jta.candidates(hotel).map(({id,how})=>({number:id,how}));
}
// The registration of every stay, from each stay's candidates (lodgingList's resolve).
export function resolveJtaLinks(candidates:Map<string,JtaCandidate[]>){
 const rowName=new Map(rows.map(r=>[r[0],r[1]])),links=new Map<string,JtaRegistration>();
 for(const [id,number] of jta.resolve(new Map([...candidates].map(([id,found])=>[id,found.map(c=>({id:c.number,how:c.how}))]))))links.set(id,{kind:number.startsWith('R')?'ryokan':'hotel',number,name:rowName.get(number)!});
 return links;
}
