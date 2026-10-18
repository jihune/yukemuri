'use client';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
export type PickerOption={value:string;label:string};
// The chosen option's text is given to SelectValue: Radix fills it in only once its items have
// mounted, so the static first page would otherwise show an empty box until the page runs.
// An empty value is never a choice: no picker here offers one. Inside a form Radix also keeps
// a hidden native select and reports its change: right after an address set the value, that
// select had no such option yet and reported '', which emptied the region (U07 task 7).
export default function Picker({value,onChange,options,groups,label}:{value:string;onChange:(v:string)=>void;options?:PickerOption[];groups?:{label:string;options:PickerOption[]}[];label:string}){
 const chosen=[...(options??[]),...(groups?.flatMap(g=>g.options)??[])].find(o=>o.value===value)?.label;
 return <Select value={value} onValueChange={v=>{if(v)onChange(v)}}><SelectTrigger className="picker" aria-label={label}><SelectValue>{chosen}</SelectValue></SelectTrigger><SelectContent position="popper">{options?.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}{groups?.map(g=><SelectGroup key={g.label}><SelectLabel>{g.label}</SelectLabel>{g.options.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectGroup>)}</SelectContent></Select>
}
