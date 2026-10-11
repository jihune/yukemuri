import type { Metadata } from 'next';
import './globals.css';
import {POPSTATE_SCRIPT} from '@/lib/history-events';
export const metadata:Metadata={title:'유케무리 · 일본 온천 탐색',description:'하코네·유후인 등 일본 전통 온천마을과 전국 호텔·료칸을 찾아보세요. 천연온천, 전세탕, 객실탕 조건과 지도, 브라우저별 즐겨찾기.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><head><script dangerouslySetInnerHTML={{__html:POPSTATE_SCRIPT}}/></head><body>{children}</body></html>}
