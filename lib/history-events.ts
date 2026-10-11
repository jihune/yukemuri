// The framework router answers a history traversal by rendering the page on the
// server (an RSC request to the Worker; on the static page, a full reload). The
// explorer keeps its whole state in the address and reacts itself, so the page
// head takes every popstate before the router's own listener (registered when
// its module starts) and passes it on as POPSTATE.
export const POPSTATE='yukemuri:popstate';
// The same head script marks an address with conditions before the page paints:
// the static HTML carries the first page of the view without conditions, which
// stays hidden (globals.css) until the explorer has read the address.
export const POPSTATE_SCRIPT=`addEventListener('popstate',function(e){e.stopImmediatePropagation();dispatchEvent(new PopStateEvent('${POPSTATE}',{state:e.state}))},true);if(location.search)document.documentElement.setAttribute('data-conditions','')`;
