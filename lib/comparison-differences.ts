// Difference judgement for one comparison row. A candidate's value is null when it is
// unknown. A known value is a presence word and, for a present room facility, its scope,
// which may itself be unknown (null). Unknowns never count as the same or as different.
export type ComparisonValue=null|readonly [string]|readonly [string,string|null];
export type ComparisonRowState={kind:'differs'|'same'|'undecided';unknown:number};

const knownDifferent=(a:ComparisonValue,b:ComparisonValue)=>{
 if(a===null||b===null)return false;
 if(a[0]!==b[0])return true;
 const scopeA=a[1]??null,scopeB=b[1]??null;
 return scopeA!==null&&scopeB!==null&&scopeA!==scopeB;
};
const fullyKnown=(value:ComparisonValue)=>value!==null&&value.every(part=>part!==null);

// null when there is nothing to compare: fewer than two candidates.
export function comparisonRowState(values:ComparisonValue[]):ComparisonRowState|null{
 if(values.length<2)return null;
 const unknown=values.filter(value=>!fullyKnown(value)).length;
 for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++)if(knownDifferent(values[i],values[j]))return {kind:'differs',unknown};
 if(unknown===0&&values.every(value=>value!.join('|')===values[0]!.join('|')))return {kind:'same',unknown};
 return {kind:'undecided',unknown};
}

// The value a facility cell shows, as comparisonFeatureLabel words it: a room facility
// that is present without a recorded scope has a known presence and an unknown scope.
export function featureComparisonValue(key:string,fact:{value:boolean|null;scope?:string}):ComparisonValue{
 if(fact.value===null)return null;
 if(fact.value===false)return ['없음'];
 if(fact.scope==='someRooms'||fact.scope==='allRooms')return ['있음',fact.scope];
 return key.startsWith('room')?['있음',null]:['있음'];
}
