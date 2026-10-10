import { hotelRepository } from '@/lib/hotel-repository';
import { parseHotelQuery } from '@/lib/hotel-query';
import {visitorFavoriteIds} from '@/lib/visitor-favorites';

export async function GET(request: Request) {
  const query = parseHotelQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({ error: '검색 조건을 확인하세요.' }, { status: 400 });
  try {
    await hotelRepository.ready();
    return Response.json({ suggestions: await hotelRepository.suggest(query.filters, query.savedOnly, query.savedOnly?await visitorFavoriteIds(request):[]) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Hotel suggestions failed', error);
    return Response.json({ error: '예상 숙소를 불러오지 못했습니다.' }, { status: 503 });
  }
}
