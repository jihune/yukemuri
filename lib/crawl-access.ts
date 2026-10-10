import {env} from 'cloudflare:workers';

// The public catalogue does not grant access to its maintenance endpoint.
export function hasCrawlAccess(request:Request){
 const expected=env.CRAWL_ACCESS_KEY,actual=request.headers.get('X-Yukemuri-Crawl-Key');
 if(!expected||!actual||actual.length!==expected.length)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^actual.charCodeAt(i);
 return difference===0;
}
