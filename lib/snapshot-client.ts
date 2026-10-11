import {SNAPSHOT_FORMAT,SNAPSHOT_MANIFEST,type SnapshotManifest,type SnapshotCore,type SnapshotText,type HotelSummary} from './search-snapshot';
import type {CollectionStatus} from './collection-status';
import {openSnapshot,addSnapshotText,type SearchSnapshot} from './static-search';
// Loads the static search snapshot. The manifest is revalidated on every load;
// the versioned files are immutable. A deploy can replace the version between
// the manifest and a file (404): then the manifest is read once more.
export class SnapshotError extends Error{constructor(message:string,public readonly reload=false){super(message);this.name='SnapshotError'}}
const unavailable='숙소 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
async function json<T>(path:string,cache:RequestCache,signal?:AbortSignal):Promise<T>{
 let response:Response;
 try{response=await fetch(path,{cache,signal,credentials:'same-origin',headers:{Accept:'application/json'}})}
 catch(error){if(signal?.aborted)throw error;throw new SnapshotError('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.')}
 if(response.status===404)throw new SnapshotError('missing');
 if(!response.ok||!/json/.test(response.headers.get('Content-Type')??''))throw new SnapshotError(unavailable);
 try{return await response.json() as T}catch{throw new SnapshotError(unavailable)}
}
async function manifest(signal?:AbortSignal){
 const m=await json<SnapshotManifest>(SNAPSHOT_MANIFEST,'no-cache',signal).catch(e=>{throw e instanceof SnapshotError&&e.message==='missing'?new SnapshotError(unavailable):e});
 // A page older than the deployed files reads a format it does not know.
 if(m.format!==SNAPSHOT_FORMAT)throw new SnapshotError('사이트가 새 버전으로 바뀌었습니다. 페이지를 다시 열어 주세요.',true);
 return m;
}
let loaded:SearchSnapshot|null=null;
// The snapshot of the current manifest; the loaded one when it is still current.
// known: the manifest the static page was rendered with (as fresh as the page,
// which is revalidated on every visit); its files may already be preloading.
export async function loadSnapshot(signal?:AbortSignal,known?:SnapshotManifest):Promise<SearchSnapshot>{
 for(let attempt=0;;attempt++){
  const m=attempt===0&&known?.format===SNAPSHOT_FORMAT?known:await manifest(signal);
  if(loaded?.manifest.id===m.id)return loaded;
  try{
   const [core,cards]=await Promise.all([json<SnapshotCore>(m.files.core,'default',signal),json<HotelSummary[]>(m.files.cards,'default',signal)]);
   loaded=openSnapshot(m,core,cards);return loaded;
  }catch(error){
   if(error instanceof SnapshotError&&error.message==='missing'){if(attempt===0)continue;throw new SnapshotError(unavailable)}
   if(error instanceof SnapshotError||signal?.aborted)throw error;
   throw new SnapshotError(unavailable);
  }
 }
}
const texts=new WeakMap<SearchSnapshot,Promise<SearchSnapshot>>();
// The name-search file of this snapshot, fetched once when a search needs it.
export function loadSnapshotText(s:SearchSnapshot):Promise<SearchSnapshot>{
 if(s.index)return Promise.resolve(s);
 let pending=texts.get(s);
 if(!pending){
  pending=json<SnapshotText>(s.manifest.files.text,'default').then(text=>{addSnapshotText(s,text);return s},error=>{texts.delete(s);throw error instanceof SnapshotError&&error.message!=='missing'?error:new SnapshotError('숙소 이름 검색 정보를 불러오지 못했습니다. 다시 시도해 주세요.',error instanceof SnapshotError)});
  texts.set(s,pending);
 }
 return pending;
}
export function loadSnapshotStatus(s:SearchSnapshot,signal?:AbortSignal){return json<CollectionStatus>(s.manifest.files.status,'default',signal)}
