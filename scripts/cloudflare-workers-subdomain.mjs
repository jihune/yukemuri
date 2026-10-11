// Read the account's workers.dev subdomain, and register it only when none
// exists (never overwrite). The token comes from the environment and is never
// printed; output is the subdomain, the public origin and whether it was set now.
const API='https://api.cloudflare.com/client/v4';
export const SUBDOMAIN=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export async function ensureSubdomain({fetch,token,accountId,requested}){
 if(!token||!accountId)throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
 if(!/^[0-9a-f]{32}$/.test(accountId))throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character account id');
 if(requested&&!SUBDOMAIN.test(requested))throw new Error('workers_subdomain must be 1-63 lowercase letters, digits or hyphens, without a leading or trailing hyphen');
 const url=`${API}/accounts/${accountId}/workers/subdomain`;
 const call=async init=>{
  const response=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
  let body;try{body=await response.json()}catch{body={}}
  return {status:response.status,success:body.success===true,subdomain:body.result?.subdomain,codes:(body.errors??[]).map(e=>e.code)};
 };
 const current=await call({method:'GET'});
 // 10007: the account has no workers.dev subdomain yet.
 const missing=!current.success&&(current.status===404||current.codes.includes(10007));
 if(!current.success&&!missing)throw new Error(`Reading the workers.dev subdomain failed (HTTP ${current.status}, codes ${current.codes.join(',')||'none'})`);
 if(current.success&&current.subdomain){
  if(!SUBDOMAIN.test(current.subdomain))throw new Error('Cloudflare returned an unexpected subdomain format');
  return {subdomain:current.subdomain,registered:false,ignoredInput:Boolean(requested&&requested!==current.subdomain)};
 }
 if(!requested)return {subdomain:null,registered:false,ignoredInput:false};
 const created=await call({method:'PUT',body:JSON.stringify({subdomain:requested})});
 if(!created.success||created.subdomain!==requested)throw new Error(`Registering the workers.dev subdomain failed (HTTP ${created.status}, codes ${created.codes.join(',')||'none'})`);
 return {subdomain:requested,registered:true,ignoredInput:false};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const result=await ensureSubdomain({fetch,token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,requested:process.env.WORKERS_SUBDOMAIN?.trim()||''});
 console.log(`subdomain=${result.subdomain??''}`);
 console.log(`public_origin=${result.subdomain?`https://yukemuri.${result.subdomain}.workers.dev`:''}`);
 console.log(`registered=${result.registered}`);
 console.log(`ignored_input=${result.ignoredInput}`);
}
