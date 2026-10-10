import {z} from 'zod';
export const lifecyclePatch=z.object({
 id:z.string().regex(/^[a-zA-Z0-9-]{1,120}$/),state:z.enum(['operating','temporarily_closed','closed']),
 sourceUrl:z.string().url().max(1500).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password}),
 sourceKind:z.enum(['official_property','official_tourism']),sourceLabel:z.string().min(2).max(200),
 evidence:z.string().min(10).max(1600),identityEvidence:z.string().min(10).max(1600),checkedAt:z.string().datetime({offset:true}),
 effectiveDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),openedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 closedUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 expectedReopenAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().superRefine((p,c)=>{
 const date=(s:string)=>!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const today=new Date().toISOString().slice(0,10);
 if(!date(p.effectiveDate)||p.effectiveDate>today||Date.parse(p.checkedAt)>Date.now()+60000||p.openedAt&&(!date(p.openedAt)||p.openedAt>today||p.state!=='operating')||p.closedUntil&&(!date(p.closedUntil)||p.state!=='temporarily_closed'||p.closedUntil<p.effectiveDate)||p.expectedReopenAt&&(!date(p.expectedReopenAt)||p.state!=='temporarily_closed'||p.expectedReopenAt<p.effectiveDate))c.addIssue({code:'custom',message:'Invalid or future operational status'});
});
export type LifecyclePatch=z.infer<typeof lifecyclePatch>;
