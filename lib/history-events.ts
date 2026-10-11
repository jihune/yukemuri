// The framework router answers a history traversal by rendering the page on the
// server (an RSC request to the Worker; on the static page, a full reload). The
// explorer keeps its whole state in the address and reacts itself, so the page
// head takes every popstate before the router's own listener (registered when
// its module starts) and passes it on as POPSTATE.
export const POPSTATE='yukemuri:popstate';
export const POPSTATE_SCRIPT=`addEventListener('popstate',function(e){e.stopImmediatePropagation();dispatchEvent(new PopStateEvent('${POPSTATE}',{state:e.state}))},true)`;
