export class ApiError extends Error {
 constructor(message:string,public readonly reopen=false,public readonly retryable=false,public readonly status?:number){super(message);this.name='ApiError'}
}
const responseMessage='숙소 서비스의 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const accessMessage='사이트 접속을 확인하지 못했습니다. 페이지를 다시 열고 로그인 상태를 확인해 주세요.';
const blockedMessage='사이트 보안 설정이 숙소 조회 요청을 차단했습니다. 서비스의 접속 설정을 확인해야 합니다.';

function visitorToken(){
 if(typeof window==='undefined')return null;
 try{
  const name='yukemuri-visitor-v1';let token=window.localStorage.getItem(name);
  if(!token||!/^[a-f0-9]{64}$/.test(token)){
   token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
   window.localStorage.setItem(name,token);
  }
  return token;
 }catch{return null}
}

export async function readApiJson<T>(response:Response):Promise<T>{
 const contentType=response.headers.get('Content-Type')??'';
 const access=response.status===401||response.redirected&&/\/(?:signin(?:-with-chatgpt)?|login|callback|auth)(?:\/|\?|$)/i.test(response.url);
 if(access)throw new ApiError(accessMessage,true);
 if(!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)){
  if(response.status===403)throw new ApiError(blockedMessage);
  // An access gateway or transient error can return an HTML page, even with 200.
  // Never expose that page or a JSON parser exception in the interface.
  throw new ApiError(responseMessage,response.ok||response.redirected,true);
 }
 let data:unknown;
 try{data=await response.json()}catch{throw new ApiError(responseMessage,false,true)}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError(responseMessage,false,true);
 if(response.status===403&&(data as {cloudflare_error?:unknown}).cloudflare_error===true)throw new ApiError(blockedMessage);
 if(!response.ok){const message=(data as {error?:unknown}).error;throw new ApiError(typeof message==='string'&&message.trim()?message:response.status===403?blockedMessage:responseMessage,false,false,response.status)}
 return data as T;
}

function pause(signal:AbortSignal|null|undefined){
 return new Promise<void>((resolve,reject)=>{
  signal?.throwIfAborted();
  const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'))};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},350);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export async function apiJson<T>(path:string,init:RequestInit={}):Promise<T>{
 const headers=new Headers(init.headers);headers.set('Accept','application/json');
 // This browser key identifies a private D1 collection, without a login or
 // third-party cookie. It is sent only to this Site's own API.
 if(path.startsWith('/api/')){const token=visitorToken();if(token)headers.set('X-Yukemuri-Visitor',token)}
 const read=(init.method??'GET').toUpperCase()==='GET';
 for(let attempt=0;;attempt++){
  init.signal?.throwIfAborted();
  try{
   const response=await fetch(path,{...init,headers,credentials:'same-origin',cache:init.cache??'no-store'});
   return await readApiJson<T>(response);
  }catch(error){
   init.signal?.throwIfAborted();
   if(error instanceof DOMException&&error.name==='AbortError')throw error;
   const failure=error instanceof ApiError?error:new ApiError('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.',false,true);
   // Retry a read once. Saving a favorite must never be repeated automatically.
   if(read&&attempt===0&&failure.retryable){await pause(init.signal);continue}
   throw failure;
  }
 }
}
