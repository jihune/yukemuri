import {hasCrawlAccess} from './crawl-access';

// Public-site protection in front of the app. Cloudflare's network DDoS
// protection applies on every plan; this adds a per-IP limit for every request
// that reaches the Worker. Static assets are served before the Worker and are
// not counted. Pages count too: the home page runs a D1 search per request.
type RateLimiter={limit(options:{key:string}):Promise<{success:boolean}>};
type GuardEnv={API_RATE_LIMITER?:RateLimiter};
const RATE_LIMIT_MESSAGE='요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.';
const LIMITED_HEADERS={'Cache-Control':'no-store','Retry-After':'60'};

async function overLimit(request:Request,env:GuardEnv){
 const limiter=env.API_RATE_LIMITER,ip=request.headers.get('CF-Connecting-IP');
 // Collector and backup runners share GitHub IPs; a valid maintenance key is exempt.
 if(!limiter||!ip||hasCrawlAccess(request))return false;
 try{return !(await limiter.limit({key:ip})).success}
 catch(error){console.error('Rate limiter unavailable',error);return false}
}

export async function guardRequest(request:Request,env:GuardEnv,next:()=>Promise<Response>){
 if(!(await overLimit(request,env)))return next();
 if(new URL(request.url).pathname.startsWith('/api/'))return Response.json({error:RATE_LIMIT_MESSAGE},{status:429,headers:LIMITED_HEADERS});
 return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>잠시 뒤 다시 시도해 주세요</title><main style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.25rem">${RATE_LIMIT_MESSAGE}</h1><p><a href="/">처음 화면으로</a></p></main></html>`,{status:429,headers:{...LIMITED_HEADERS,'Content-Type':'text/html; charset=utf-8'}});
}
