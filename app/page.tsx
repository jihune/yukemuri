import HotelExplorer from '@/components/hotel-explorer';
// The same HTML for every visitor: it is built once into a static asset
// (scripts/build-static-page.mjs), so opening the site never calls the Worker.
// The explorer reads the conditions from the address and the results from the
// static search snapshot.
export default function Home(){return <HotelExplorer/>}
