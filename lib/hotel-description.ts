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
// The language a description is translated from, the rule of #166: kana or kanji, Japanese (the
// sources are Japanese sites); any Latin letter, English. It decides whether the translate button
// shows, so the stricter rule below must not change it (U07 follow-up #171, parent session).
export function translationSource(text:string){
 if(/[ぁ-ゖァ-ヺ㐀-䶿一-鿿]/.test(text))return 'ja';
 return /[A-Za-z]/.test(text)?'en':null;
}
// The original's lang, only where it is plain: kana, Japanese; letters that are all plain Latin,
// English. Anything else is lang="", unknown: kanji alone may be Chinese, an accent or a
// combining mark may be French, a long vowel may be romaji in English; no lang beats a wrong one.
export function descriptionLang(text:string){
 if(/[ぁ-ゖァ-ヺ]/.test(text))return 'ja';
 return /[A-Za-z]/.test(text)&&!/(?![A-Za-z])[\p{L}\p{M}]/u.test(text)?'en':'';
}
