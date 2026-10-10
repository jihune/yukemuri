// Every source language is eligible. A few foreign proper names or common
// loanwords within otherwise Korean prose do not require another translation.
export function needsKoreanDescription(text:string){
 const normalized=text.normalize('NFKC');
 const korean=normalized.match(/\p{Script=Hangul}/gu)?.length??0;
 const foreign=normalized.replace(/\p{Script=Hangul}/gu,'').match(/\p{Letter}/gu)?.length??0;
 if(!foreign)return false;
 if(!korean)return true;
 return foreign>=20&&foreign>korean;
}
