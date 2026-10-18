'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Check,Copy} from 'lucide-react';
// U07: one press copies a stay's original or English name. Where the clipboard cannot be
// written (an insecure page, a refused permission, an old browser) the name is selected
// instead, so the reader copies it with the browser's own menu. The status line says which.
// target: the element showing the name, whose text is selected; id: its id, which describes the
// button (left out beside a dialog's title, whose id names the dialog).
export default function CopyName({name,label,target,id}:{name:string;label:string;target:RefObject<HTMLElement|null>;id?:string}){
 const [done,setDone]=useState<''|'copied'|'selected'>(''),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 async function copy(){
  let result:'copied'|'selected'='copied';
  try{await navigator.clipboard.writeText(name)}
  catch{
   result='selected';
   const selection=getSelection();
   if(target.current&&selection){const range=document.createRange();range.selectNodeContents(target.current);selection.removeAllRanges();selection.addRange(range)}
  }
  setDone(result);clearTimeout(timer.current);timer.current=setTimeout(()=>setDone(''),2000);
 }
 return <button type="button" className={'copy-name'+(done?' is-done':'')} onClick={copy} aria-label={label+' 복사'} aria-describedby={id} title={label+' 복사'}>{done==='copied'?<Check size={16} aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}<span className="copy-name-status" role="status">{done==='copied'?'복사됨':done==='selected'?'이름을 선택했어요':''}</span></button>;
}
