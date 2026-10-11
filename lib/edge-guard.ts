import {hasCrawlAccess} from './crawl-access';

// Public-site protection in front of the app. Cloudflare's network DDoS
// protection applies on every plan; this adds a per-IP API limit and a short
// shared cache for anonymous searches. Both are skipped when unavailable.
type RateLimiter={limit(options:{key:string}):Promise<{success:boolean}>};
type GuardEnv={API_RATE_LIMITER?:RateLimiter};
const SEARCH_CACHE_SECONDS=30;
const RATE_LIMIT_MESSAGE='요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.';

// Only anonymous catalogue searches are shared. saved=1 depends on
// X-Yukemuri-Visitor, fresh=1 asks to skip caches and snapshot reads a session.
export function isSharedSearch(request:Request){
 const url=new URL(request.url),params=url.searchParams;
 return request.method==='GET'&&url.pathname==='/api/hotels'&&params.get('saved')!=='1'&&!params.has('fresh')&&!params.has('snapshot');
}

async function overLimit(request:Request,env:GuardEnv){
 const limiter=env.API_RATE_LIMITER,ip=request.headers.get('CF-Connecting-IP');
 // Collector and backup runners share GitHub IPs; a valid maintenance key is exempt.
 if(!limiter||!ip||hasCrawlAccess(request))return false;
 try{return !(await limiter.limit({key:ip})).success}
 catch(error){console.error('Rate limiter unavailable',error);return false}
}

function withHeaders(response:Response,headers:Record<string,string>){
 const copy=new Response(response.body,response);
 for(const [name,value] of Object.entries(headers))copy.headers.set(name,value);
 return copy;
}

export async function guardApi(request:Request,env:GuardEnv,ctx:{waitUntil(promise:Promise<unknown>):void},next:()=>Promise<Response>){
 if(!new URL(request.url).pathname.startsWith('/api/'))return next();
 if(await overLimit(request,env))return Response.json({error:RATE_LIMIT_MESSAGE},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
 const cache=isSharedSearch(request)&&typeof caches!=='undefined'?(caches as unknown as {default:Cache}).default:null;
 if(!cache)return next();
 // Key by URL alone so no request header can select or poison an entry.
 const key=new Request(request.url,{method:'GET'});
 const hit=await cache.match(key).catch(()=>undefined);
 if(hit)return withHeaders(hit,{'Cache-Control':'no-store','X-Yukemuri-Cache':'HIT'});
 const response=await next();
 if(response.status!==200)return response;
 ctx.waitUntil(cache.put(key,withHeaders(response.clone(),{'Cache-Control':`public, max-age=${SEARCH_CACHE_SECONDS}`})).catch(error=>console.error('Search cache write failed',error)));
 return withHeaders(response,{'X-Yukemuri-Cache':'MISS'});
}
