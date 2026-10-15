import {BATH_COLUMNS,BATH_STATE_LABEL,bathColumn} from '@/lib/bath-columns';
import type {HotelSummary} from '@/lib/search-snapshot';
// U05 B ‘탕 체크리스트’: the six bath columns sit in the same place on every card and on the
// detail summary. ✓ filled = confirmed, – struck = confirmed absent, ? dashed = not checked
// yet; the shape says it as well as the colour.
const MARK={yes:'✓',no:'–',unknown:'?'} as const;
export default function BathCells({hotel,className}:{hotel:Pick<HotelSummary,'features'>;className?:string}){
 return <ul className={'bath-cells'+(className?' '+className:'')} aria-label="탕 조건">{BATH_COLUMNS.map(column=>{const c=bathColumn(hotel,column);return <li key={column.id} className={'bath-cell is-'+c.state}><span className="bath-mark" aria-hidden="true">{MARK[c.state]}</span><span className="bath-label">{column.label}</span>{c.scope&&<small>{c.scope==='allRooms'?'전 객실':'일부'}</small>}<span className="sr-only"> {BATH_STATE_LABEL[c.state]}</span></li>})}</ul>;
}
