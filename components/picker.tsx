'use client';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
export type PickerOption={value:string;label:string};
export default function Picker({value,onChange,options,groups,label}:{value:string;onChange:(v:string)=>void;options?:PickerOption[];groups?:{label:string;options:PickerOption[]}[];label:string}){
 return <Select value={value} onValueChange={onChange}><SelectTrigger className="picker" aria-label={label}><SelectValue/></SelectTrigger><SelectContent position="popper">{options?.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}{groups?.map(g=><SelectGroup key={g.label}><SelectLabel>{g.label}</SelectLabel>{g.options.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectGroup>)}</SelectContent></Select>
}
