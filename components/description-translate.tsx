'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
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
 create:(o:{sourceLanguage:string;targetLanguage:string;monitor?:(m:EventTarget)=>void;signal?:AbortSignal})=>Promise<Translator>;
};
const translatorApi=()=>(globalThis as {Translator?:TranslatorApi}).Translator;
// The answer does not change while the page is open, so there is nothing to subscribe to.
const noSubscription=()=>()=>{};
const chromeOrEdge=()=>((navigator as Navigator&{userAgentData?:{brands?:{brand:string}[]}}).userAgentData?.brands??[]).some(b=>b.brand==='Google Chrome'||b.brand==='Microsoft Edge');
// Kana or kanji: Japanese (the sources are Japanese sites); Latin letters only: English.
export function descriptionLanguage(text:string){
 if(/[ぁ-ゖァ-ヺ㐀-䶿一-鿿]/.test(text))return 'ja';
 return /[A-Za-z]/.test(text)?'en':null;
}
// The first download, as Google's component server sized the language packs on 2026-10-18 (Chrome's
// documents give no size): Japanese goes through English, en-ja and en-ko, 113,091,783 bytes;
// English needs en-ko alone, 56,601,733 bytes.
const modelSize={ja:'약 110MB',en:'약 57MB'};
// unsupported: not this browser at all; unavailable: Chrome or Edge that cannot translate this pair.
type State={kind:'checking'|'unsupported'|'unavailable'|'ready'|'translating'|'failed'|'done';progress?:number;text?:string};
export default function DescriptionTranslate({text}:{text:string}){
 const source=descriptionLanguage(text),translator=useRef<Translator|null>(null),pending=useRef<AbortController|null>(null);
 // Whether this browser has the translator, read as React reads browser-only values: null on the
 // server and while hydrating, so the first render is the same wherever it runs.
 const capable=useSyncExternalStore(noSubscription,()=>!!translatorApi()&&chromeOrEdge(),()=>null);
 const [answer,setState]=useState<State>({kind:'checking'});
 const state:State=!source||capable===false?{kind:'unsupported'}:capable===null?{kind:'checking'}:answer;
 useEffect(()=>{
  const api=translatorApi();
  if(!source||!api||!capable)return;
  let live=true;
  api.availability({sourceLanguage:source,targetLanguage:'ko'}).then(a=>{if(live)setState({kind:a==='unavailable'?'unavailable':'ready'})},()=>{if(live)setState({kind:'unavailable'})});
  return()=>{live=false;pending.current?.abort();translator.current?.destroy?.();translator.current=null};
 },[source,capable]);
 // Called from the click itself: the first use downloads the model, which needs the user's press.
 async function translate(){
  const api=translatorApi();if(!api||!source)return;
  // Aborted when the sheet closes: a translator that arrives after that is let go, not used.
  const control=pending.current=new AbortController(),{signal}=control;
  setState({kind:'translating'});
  try{
   const made=translator.current??await api.create({sourceLanguage:source,targetLanguage:'ko',signal,monitor(m){m.addEventListener('downloadprogress',e=>{if(!signal.aborted)setState({kind:'translating',progress:Math.round(((e as Event&{loaded:number}).loaded)*100)})})}});
   if(signal.aborted){made.destroy?.();return}
   translator.current=made;
   // Line by line: the translator works through its queue in order, and long text waits less.
   const lines=[];
   for(const line of text.split('\n')){if(signal.aborted)return;lines.push(line.trim()?await made.translate(line):'')}
   if(!signal.aborted)setState({kind:'done',text:lines.join('\n')});
  }catch{if(!signal.aborted)setState({kind:'failed'})}
 }
 if(state.kind==='checking')return null;
 if(state.kind==='unsupported')return <p className="translate-note">이 브라우저에서는 바로 번역을 쓸 수 없습니다. 데스크톱 Chrome·Edge에서는 이 자리에서 번역할 수 있습니다.</p>;
 if(state.kind==='unavailable')return <p className="translate-note">이 브라우저에서는 이 설명을 번역할 수 없습니다.</p>;
 const done=state.kind==='done',busy=state.kind==='translating';
 const status=state.kind==='failed'?'번역하지 못했습니다.':busy?(state.progress!==undefined&&state.progress<100?`번역 모델을 받는 중 ${state.progress}%`:'번역하는 중…'):done?'한국어 번역을 원문 아래에 붙였습니다.':'';
 // One status line and one button in every state: a keyboard user's focus stays on the button as
 // the translation arrives or closes (a removed or disabled button drops it to the sheet), and a
 // screen reader hears each step, the last one too.
 return <div className="browser-translation">
  {done&&<p className="description-caption">브라우저 번역 · 이 기기 안에서 자동으로 번역해 틀릴 수 있습니다</p>}
  {done&&<p className="hotel-intro" lang="ko">{state.text}</p>}
  <p className={status&&!done?'translate-note':'sr-only'} role="status">{status}</p>
  <button type="button" className="translate-button" aria-disabled={busy||undefined} onClick={busy?undefined:done?()=>setState({kind:'ready'}):translate}>{done?<X size={16} aria-hidden="true"/>:state.kind==='failed'?<RotateCw size={16} aria-hidden="true"/>:<Languages size={16} aria-hidden="true"/>}{done?'번역 닫기':state.kind==='failed'?'다시 시도':'이 자리에서 한국어로 번역'}</button>
  {state.kind==='ready'&&<p className="translate-note">브라우저 안에서 번역합니다. 처음 한 번은 번역 모델({modelSize[source!]})을 받습니다.</p>}
 </div>;
}
