import { normalizeSearch } from './hotel-names';
import { matchPreparedHotelName, prepareHotelName, type PreparedName, type NameMatch } from './hotel-name-match';

const generic=new Set(['호텔','료칸','여관','숙소','리조트','온천','hotel','hotels','ryokan','resort','onsen','ホテル','旅館','温泉'].map(normalizeSearch));
export type HotelQueryPlan={key:string;core:string;tokens:string[]};
export function prepareHotelQuery(query:string):HotelQueryPlan {
  const key=normalizeSearch(query),words=query.split(/[\s・·,/()[\]（）]+/u).map(normalizeSearch).filter(Boolean);
  const significant=words.filter(word=>!generic.has(word));
  let core=(significant.length?significant:words).join('');
  if(words.length===1)for(const term of generic){
    if(core.endsWith(term)&&core.length-term.length>=3)core=core.slice(0,-term.length);
    if(core.startsWith(term)&&core.length-term.length>=3)core=core.slice(term.length);
  }
  return {key,core,tokens:[...new Set(significant.length?significant:words)]};
}
export type RelevantMatch=NameMatch&{matchedName:string};
export function hotelRelevance(plan:HotelQueryPlan,names:PreparedName[],context:string):RelevantMatch|null {
  if(!plan.key)return null;
  let best:RelevantMatch|null=null;
  const bestName=(key:string,shortToken=false)=>{
    let result:RelevantMatch|null=null;
    for(const name of names){
      if(shortToken&&/^[a-z]{1,3}$/.test(key)&&!name.words.includes(key))continue;
      const match=matchPreparedHotelName(key,name);if(match&&match.score>(result?.score??0))result={...match,matchedName:name.name};
    }
    return result;
  };
  best=bestName(plan.key);
  if(plan.core&&plan.core!==plan.key){const core=bestName(plan.core);if(core&&core.score-2>(best?.score??0))best={...core,score:core.score-2}}
  if(plan.tokens.length>1){
    let covered=0,nameCovered=0,sum=0,similar=false,matchedName='';
    for(const token of plan.tokens){
      const name=bestName(token,true);
      if(name){covered++;nameCovered++;sum+=name.score;similar||=name.similar;if(!matchedName||name.score>=80)matchedName=name.matchedName}
      else if(context.includes(token))covered++;
    }
    if(nameCovered){
      const score=45+35*covered/plan.tokens.length+15*nameCovered/plan.tokens.length+.02*sum/plan.tokens.length;
      if(score>(best?.score??0))best={score,similar,matchedName};
    }else if(covered===plan.tokens.length&&!best)best={score:30,similar:false,matchedName:''};
  }
  // Matched by the place only: no name matched, so none is named (a suggestion shows its title).
  if(!best&&(context.includes(plan.key)||plan.core&&context.includes(plan.core)))best={score:30,similar:false,matchedName:''};
  return best;
}
export function prepareHotelRelevance(names:string[],context:string){return{names:names.map(prepareHotelName),context:normalizeSearch(context)}};
