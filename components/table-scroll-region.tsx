'use client';
import type {ReactNode} from 'react';

export default function TableScrollRegion({className,label,children}:{className:string;label:string;children:ReactNode}){
 return <div className={className} role="region" aria-label={label} tabIndex={0} onKeyDown={event=>{
  // Preserve the keyboard actions of links, buttons and disclosures in cells.
  if(event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
   event.preventDefault();event.currentTarget.scrollLeft+=event.key==='ArrowRight'?220:-220;
  }
 }}>{children}</div>;
}
