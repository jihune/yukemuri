// Same shape as MapBounds in hotel-repository; kept here so this file compiles alone.
type MapBounds={west:number;south:number;east:number;north:number};
// Leaflet reports longitudes past ±180 once the map is dragged around the world.
// Bring the view's centre back into range, then clamp, so west stays below east.
export function mapSearchBounds(raw:MapBounds):MapBounds{
 let {west,east}=raw;
 if(east-west>=360){west=-180;east=180}
 else{const shift=Math.round((west+east)/2/360)*360;west-=shift;east-=shift}
 return{west:Math.max(-180,west),south:Math.max(-90,raw.south),east:Math.min(180,east),north:Math.min(90,raw.north)};
}
