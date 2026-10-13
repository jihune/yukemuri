import {hasCrawlAccess} from './crawl-access';

// Public-site protection in front of the app. Cloudflare's network DDoS
// protection applies on every plan; this adds a per-IP limit for every request
// that reaches the Worker. Static assets are served before the Worker and are
// not counted. Pages count too: the home page runs a D1 search per request.
type RateLimiter={limit(options:{key:string}):Promise<{success:boolean}>};
type GuardEnv={API_RATE_LIMITER?:RateLimiter;REJECT_AUTOMATED_AGENTS?:string};
const RATE_LIMIT_MESSAGE='요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.';
const AGENT_MESSAGE='브라우저가 아닌 자동화 도구의 요청은 받지 않습니다.';
const LIMITED_HEADERS={'Cache-Control':'no-store','Retry-After':'60'};
// Search engines and archives: the same rule as /* in public/_headers, which
// static assets get and Worker responses do not (docs/H02-20261013.md).
const ROBOTS='noindex, nofollow, noarchive';
// A tool or crawler that names itself (H02): no User-Agent, a client that is not
// a browser (curl, python-requests, Go-http-client, node), or a crawler token.
// HeadlessChrome is allowed: the repository's browser checks run on it.
const BROWSER=/^(?:Mozilla|Opera)\//;
const CRAWLER=/bot(?:[/;)-]|$)|crawl|spider|slurp|scrap|facebookexternalhit|meta-external|chatgpt-user|perplexity-user|claude-user|anthropic-ai|cohere-ai/i;

export function isAutomatedAgent(agent:string|null){return !agent||!BROWSER.test(agent)||CRAWLER.test(agent)}

async function overLimit(request:Request,env:GuardEnv){
 const limiter=env.API_RATE_LIMITER,ip=request.headers.get('CF-Connecting-IP');
 if(!limiter||!ip)return false;
 try{return !(await limiter.limit({key:ip})).success}
 catch(error){console.error('Rate limiter unavailable',error);return false}
}

function refuse(request:Request,status:number,message:string,headers:Record<string,string>){
 if(new URL(request.url).pathname.startsWith('/api/'))return Response.json({error:message},{status,headers});
 return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>잠시 뒤 다시 시도해 주세요</title><main style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.25rem">${message}</h1><p><a href="/">처음 화면으로</a></p></main></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}

async function guarded(request:Request,env:GuardEnv,next:()=>Promise<Response>){
 // Collector and backup runners share GitHub IPs and name themselves; a valid maintenance key is exempt.
 if(hasCrawlAccess(request))return next();
 // Refused before the app and the limiter: no D1 read or write.
 if(env.REJECT_AUTOMATED_AGENTS==='1'&&isAutomatedAgent(request.headers.get('User-Agent')))return refuse(request,403,AGENT_MESSAGE,{'Cache-Control':'no-store'});
 if(await overLimit(request,env))return refuse(request,429,RATE_LIMIT_MESSAGE,LIMITED_HEADERS);
 return next();
}

export async function guardRequest(request:Request,env:GuardEnv,next:()=>Promise<Response>){
 const response=await guarded(request,env,next);
 // A copy: a response from fetch or the assets binding has immutable headers.
 const out=new Response(response.body,response);out.headers.set('X-Robots-Tag',ROBOTS);
 return out;
}
