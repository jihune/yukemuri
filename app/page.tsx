import HotelExplorer from '@/components/hotel-explorer';
import Link from 'next/link';
import {hotelRepository,type SearchResponse} from '@/lib/hotel-repository';
import {parseHotelQuery,defaultHotelQuery} from '@/lib/hotel-query';
import {searchIndexHotel} from '@/lib/hotel-search-index';
export default async function Home({searchParams}: {searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const values=await searchParams??{},params=new URLSearchParams();
 for(const [key,value] of Object.entries(values))if(value!==undefined)params.set(key,Array.isArray(value)?value[0]:value);
 const initialQuery=parseHotelQuery(params)??defaultHotelQuery(),view=params.get('view')??'split';
 const initialView=['split','list','map'].includes(view)?view:'split';
 let initial:SearchResponse|null=null;
 try{initial=await hotelRepository.search(initialQuery.filters,initialQuery.sort,1,initialQuery.savedOnly,[],{stable:true})}
 catch(error){console.error('Catalog unavailable',error)}
 if(!initial)return <main className="catalog-unavailable"><h1>숙소 목록을 불러오지 못했습니다.</h1><p>잠시 후 새로고침해 주세요. 즐겨찾기는 보관되어 있습니다.</p><Link href="/">다시 시도</Link></main>;
 return <HotelExplorer initialQuery={initialQuery} initialView={initialView} initial={initial} initialSearchIndex={initial.hotels.map(searchIndexHotel)}/>;
}
