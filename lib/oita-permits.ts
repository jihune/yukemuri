import list from '../data/oita-ryokan-permits.json';
import {lodgingList,type ListCandidate,type ListStay} from './lodging-lists';
// D08 PR 3: Oita Prefecture's lodging business permits (data/oita-ryokan-permits.json,
// scripts/update-oita-permits.py, CC BY 4.0; stays in Oita city are on the city's own list, not
// this one), linked by lib/lodging-lists.ts. Carried on the cards and shown by the detail sheet's
// sources, never on the card itself. A stay the list does not link is not unlicensed or closed.
export type OitaPermit={kind:string;permitted:string;asOf:string};
const rows=list.rows as [string,string,string,string,string,string][];
const oita=lodgingList(rows.map(([id,name,,address])=>({id,name,address})));
// Every row that agrees with one stay.
export const oitaCandidates=(hotel:ListStay)=>oita.candidates(hotel);
// The permit of every stay, from each stay's candidates (lodgingList's resolve), as the card carries it.
export function resolveOitaPermits(candidates:Map<string,ListCandidate[]>){
 const byId=new Map(rows.map(r=>[r[0],r])),permits=new Map<string,{id:string}&OitaPermit>();
 for(const [stay,id] of oita.resolve(candidates)){const r=byId.get(id)!;permits.set(stay,{id,kind:r[2],permitted:r[5],asOf:list.asOf})}
 return permits;
}
