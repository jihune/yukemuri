// Real-time quotes are outside the onsen explorer's product scope.
// Keep the old route explicit for bookmarks and older clients; never fetch
// a volatile source price without a supported rate API.
export async function GET(){return Response.json({error:'요금 조회는 예약 사이트에서 확인해 주세요. 유케무리는 온천 숙소 탐색을 제공합니다.'},{status:410,headers:{'Cache-Control':'no-store'}})}
