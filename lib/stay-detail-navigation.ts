export type ListingPosition={x:number;y:number;opener:HTMLElement|null};
export function openStayHistory(id:string,alreadyOpen:boolean){
 const url=new URL(window.location.href);url.hash='stay/'+encodeURIComponent(id);
 const state={...window.history.state,yukemuriStay:true};
 if(alreadyOpen)window.history.replaceState(state,'',url);
 else window.history.pushState(state,'',url);
}
export function closeStayHistory(){
 if(!window.location.hash.startsWith('#stay/'))return;
 if(window.history.state?.yukemuriStay)window.history.back();
 else{const url=new URL(window.location.href);url.hash='';window.history.replaceState(window.history.state,'',url)}
}
export function restoreListingPosition(position:ListingPosition|null){
 if(!position)return;
 requestAnimationFrame(()=>{
  if(position.opener?.isConnected)position.opener.focus({preventScroll:true});
  window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
 });
}
