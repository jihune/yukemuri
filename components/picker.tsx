'use client';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
export type PickerOption={value:string;label:string};
// The chosen option's text is given to SelectValue: Radix fills it in only once its items have
// mounted, so the static first page would otherwise show an empty box until the page runs.
export default function Picker({value,onChange,options,groups,label}:{value:string;onChange:(v:string)=>void;options?:PickerOption[];groups?:{label:string;options:PickerOption[]}[];label:string}){
 const chosen=[...(options??[]),...(groups?.flatMap(g=>g.options)??[])].find(o=>o.value===value)?.label;
 return <Select value={value} onValueChange={onChange}><SelectTrigger className="picker" aria-label={label}><SelectValue>{chosen}</SelectValue></SelectTrigger><SelectContent position="popper">{options?.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}{groups?.map(g=><SelectGroup key={g.label}><SelectLabel>{g.label}</SelectLabel>{g.options.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectGroup>)}</SelectContent></Select>
}
