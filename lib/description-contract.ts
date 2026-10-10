import {z} from 'zod';
export const descriptionUpdates=z.object({patches:z.array(z.object({
 id:z.string().min(1).max(100),sourceText:z.string().min(1).max(6000),
 textKo:z.string().trim().min(1).max(9000).regex(/[가-힣]/),
}).strict()).min(1).max(40)}).strict().refine(value=>new Set(value.patches.map(p=>p.id)).size===value.patches.length,'Duplicate hotel IDs');
export type DescriptionPatch=z.infer<typeof descriptionUpdates>['patches'][number];
