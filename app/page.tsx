import {env} from 'cloudflare:workers';
import {preload} from 'react-dom';
import HotelExplorer from '@/components/hotel-explorer';
import type {FirstPage} from '@/lib/static-search';
// The same HTML for every visitor: it is built once into a static asset
// (scripts/build-static-page.mjs), so opening the site never calls the Worker.
// The explorer reads the conditions from the address and the results from the
// static search snapshot. The snapshot step renders the page again with the
// default view's first page (FIRST_PAGE, a build-time binding only), so the
// list is in the HTML before any script or snapshot file arrives, and the
// page asks for that snapshot's list files while its scripts still load.
export default function Home(){
 const raw=(env as {FIRST_PAGE?:string}).FIRST_PAGE,firstPage=raw?JSON.parse(raw) as FirstPage:null;
 // Same request as lib/snapshot-client.ts (same-origin credentials), so the fetch reuses it.
 if(firstPage)for(const name of ['core','cards'])preload(`/snapshot/v/${firstPage.snapshot}/${name}.json`,{as:'fetch',crossOrigin:'anonymous',fetchPriority:'low'});
 return <HotelExplorer firstPage={firstPage}/>;
}
