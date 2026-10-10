const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {renderToStaticMarkup}=require('react-dom/server'),React=require('react');
function load(file,dependencies={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('require','module','exports',code)(name=>dependencies[name]??require(name),module,module.exports);
 return module.exports;
}
const language=load('lib/hotel-description.ts');
const Component=load('components/hotel-description.tsx',{'@/lib/hotel-description':language}).default;
const original='The hotel has free Wi-Fi and a restaurant called ブリランテ. Breakfast is available for a fee.';
assert(language.needsKoreanDescription(original));
assert(!language.needsKoreanDescription('한국어 설명입니다. Kyoto Hotel에서 머물 수 있습니다.'));
for(const source of ['日本の旅館です。レストランと露天風呂を楽しめます。Hotel Kyoto。','露天風呂があります。','酒店设有餐厅和温泉。','Cet hôtel propose un petit-déjeuner payant.','Отель расположен рядом с вокзалом.','يقع الفندق بالقرب من المحطة.','객실 안내: The restaurant serves breakfast for a fee from 7 AM to 10 AM.'])assert(language.needsKoreanDescription(source));
assert(!language.needsKoreanDescription('한국어로 작성한 설명이며 무료 Wi-Fi를 제공합니다.'));
assert(!language.needsKoreanDescription('123 …'));
let html=renderToStaticMarkup(React.createElement(Component,{hotel:{description:original}}));
assert(html.includes(original)&&html.includes('자동으로 순차 반영'));
assert(!html.includes('<details'));
const text='이 호텔에는 무료 Wi-Fi와 브리란테 레스토랑이 있습니다. 조식은 유료로 제공됩니다.';
html=renderToStaticMarkup(React.createElement(Component,{hotel:{description:original,descriptionTranslation:{text,translatedAt:'2026-10-04T09:00:00Z'}}}));
assert(html.includes('lang="ko"')&&html.indexOf(text)<html.indexOf(original));
assert(html.includes('원문 보기')&&!html.includes('영어 원문')&&html.includes('<details')&&!/<details[^>]*\bopen(?:\s|=|>)/.test(html));
assert(!html.includes('lang="en"')&&html.includes(original));
html=renderToStaticMarkup(React.createElement(Component,{hotel:{description:'露天風呂があります。',descriptionTranslation:{text:'노천탕이 있습니다.',translatedAt:'2026-10-04T09:00:00Z'}}}));
assert(html.includes('노천탕이 있습니다.')&&html.includes('露天風呂があります。')&&html.includes('원문 보기'));
console.log('Description UI checks passed: Japanese/Chinese/Latin/Cyrillic/Arabic and mixed text eligible; Korean/proper names skipped; Korean default; original preserved without an assumed language.');
