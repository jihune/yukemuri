'use client';
import {useEffect,useRef,useState} from 'react';
import {Languages,RotateCw,X} from 'lucide-react';
// U07: the description translated in place by the browser's own on-device translator, the
// Translator API of Chrome 138+ and Edge 148+ on a desktop (no payment, no new window, and not a
// language model: Chrome documents it as an expert translation model; user decision 2026-10-17).
// The button shows only where the browser says the pair can be translated, and only in Chrome
// or Edge: a Chromium build without the translation service ended the page when asked
// (Playwright's headless shell 141, docs/U07-20261019.md). The original stays where it is and
// the translation shows under it, marked as the browser's.
type Translator={translate:(text:string)=>Promise<string>;destroy?:()=>void};
type TranslatorApi={
 availability:(o:{sourceLanguage:string;targetLanguage:string})=>Promise<string>;
 create:(o:{sourceLanguage:string;targetLanguage:string;monitor?:(m:EventTarget)=>void})=>Promise<Translator>;
};
const translatorApi=()=>(globalThis as {Translator?:TranslatorApi}).Translator;
const chromeOrEdge=()=>((navigator as Navigator&{userAgentData?:{brands?:{brand:string}[]}}).userAgentData?.brands??[]).some(b=>b.brand==='Google Chrome'||b.brand==='Microsoft Edge');
// Kana or kanji: Japanese (the sources are Japanese sites); Latin letters only: English.
export function descriptionLanguage(text:string){
 if(/[ぁ-ゖァ-ヺ㐀-䶿一-鿿]/.test(text))return 'ja';
 return /[A-Za-z]/.test(text)?'en':null;
}
type State={kind:'checking'|'unsupported'|'ready'|'translating'|'failed'|'done';progress?:number;text?:string};
export default function DescriptionTranslate({text}:{text:string}){
 const source=descriptionLanguage(text),translator=useRef<Translator|null>(null);
 const [state,setState]=useState<State>(()=>source&&translatorApi()&&chromeOrEdge()?{kind:'checking'}:{kind:'unsupported'});
 useEffect(()=>{
  const api=translatorApi();
  if(!source||!api||!chromeOrEdge())return;
  let live=true;
  api.availability({sourceLanguage:source,targetLanguage:'ko'}).then(a=>{if(live)setState({kind:a==='unavailable'?'unsupported':'ready'})},()=>{if(live)setState({kind:'unsupported'})});
  return()=>{live=false;translator.current?.destroy?.();translator.current=null};
 },[source]);
 // Called from the click itself: the first use downloads the model, which needs the user's press.
 async function translate(){
  const api=translatorApi();if(!api||!source)return;
  setState({kind:'translating'});
  try{
   translator.current??=await api.create({sourceLanguage:source,targetLanguage:'ko',monitor(m){m.addEventListener('downloadprogress',e=>setState({kind:'translating',progress:Math.round(((e as Event&{loaded:number}).loaded)*100)}))}});
   // Line by line: the translator works through its queue in order, and long text waits less.
   const lines=[];
   for(const line of text.split('\n'))lines.push(line.trim()?await translator.current.translate(line):'');
   setState({kind:'done',text:lines.join('\n')});
  }catch{setState({kind:'failed'})}
 }
 if(state.kind==='checking')return null;
 if(state.kind==='unsupported')return <p className="translate-note">이 브라우저에서는 바로 번역을 쓸 수 없습니다. 데스크톱 Chrome·Edge에서는 이 자리에서 번역할 수 있습니다.</p>;
 if(state.kind==='done')return <div className="browser-translation">
  <p className="description-caption">브라우저 번역 · 이 기기 안에서 자동으로 번역해 틀릴 수 있습니다</p>
  <p className="hotel-intro" lang="ko">{state.text}</p>
  <button type="button" className="translate-button" onClick={()=>setState({kind:'ready'})}><X size={16} aria-hidden="true"/>번역 닫기</button>
 </div>;
 return <div className="browser-translation">
  {state.kind==='failed'?<p className="translate-note" role="status">번역하지 못했습니다.</p>:state.kind==='translating'&&<p className="translate-note" role="status">{state.progress!==undefined&&state.progress<100?`번역 모델을 받는 중 ${state.progress}%`:'번역하는 중…'}</p>}
  <button type="button" className="translate-button" onClick={translate} disabled={state.kind==='translating'}>{state.kind==='failed'?<RotateCw size={16} aria-hidden="true"/>:<Languages size={16} aria-hidden="true"/>}{state.kind==='failed'?'다시 시도':'이 자리에서 한국어로 번역'}</button>
  {state.kind==='ready'&&<p className="translate-note">브라우저 안에서 번역합니다. 처음 한 번은 번역 모델을 받습니다.</p>}
 </div>;
}
