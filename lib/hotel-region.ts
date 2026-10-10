import type { Hotel } from './hotel-types';
export function sourceRegion(h:Hotel){
 if(h.prefecture!=='pref-hokkaido'||!h.regionId.startsWith('pref-'))return h.regionId;
 const address=h.location.address;
 const areas:[RegExp,string][]=[[/札幌|定山渓/,'sapporo'],[/登別/,'noboribetsu'],[/洞爺|壮瞥/,'toya'],[/函館/,'hakodate'],[/小樽/,'otaru'],[/ニセコ|倶知安|蘭越/,'niseko'],[/層雲峡/,'sounkyo'],[/阿寒/,'akan']];
 return areas.find(([pattern])=>pattern.test(address))?.[1]??h.regionId;
}
