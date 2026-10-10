import { hotelRepository } from '@/lib/hotel-repository';

export async function GET() {
  try {
    return Response.json({ hotels: await hotelRepository.searchIndex() }, { headers: { 'Cache-Control': 'private, max-age=120' } });
  } catch (error) {
    console.error('Hotel name index failed', error);
    return Response.json({ error: '숙소 이름 목록을 불러오지 못했습니다.' }, { status: 503 });
  }
}
