import {DEFAULT_FILTERS} from './hotel-types';
import {hotelQueryParams} from './hotel-query';
// The framework router answers a history traversal by rendering the page on the
// server (an RSC request to the Worker; on the static page, a full reload). The
// explorer keeps its whole state in the address and reacts itself, so the page
// head takes every popstate before the router's own listener (registered when
// its module starts) and passes it on as POPSTATE.
export const POPSTATE='yukemuri:popstate';
// The list parameters of the view without conditions, as listingUrl writes
// them; the view and the booking dates and guests do not change the list.
const DEFAULT_LIST={...Object.fromEntries(hotelQueryParams(DEFAULT_FILTERS,'',false)),sort:'recommended',page:'1'};
const LIST_NEUTRAL=['view','checkIn','checkOut','adults'];
// The same head script marks an address whose conditions differ from that view
// before the page paints: the static HTML carries the first page of the view
// without conditions, which stays hidden (globals.css) until the explorer has
// read the address. An address that spells out the defaults is not marked.
export const POPSTATE_SCRIPT=`addEventListener('popstate',function(e){e.stopImmediatePropagation();dispatchEvent(new PopStateEvent('${POPSTATE}',{state:e.state}))},true);(function(){var d=${JSON.stringify(DEFAULT_LIST)},n=${JSON.stringify(LIST_NEUTRAL)},c=0;new URLSearchParams(location.search).forEach(function(v,k){if(n.indexOf(k)<0&&d[k]!==v)c=1});if(c)document.documentElement.setAttribute('data-conditions','')})()`;
