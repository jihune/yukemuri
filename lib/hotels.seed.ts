import photoCredits from '../public/images/credits-sample.json';
import { FEATURE_LABELS, FeatureKey, Hotel, RegionId, REGIONS } from './hotel-types';
// Fictional properties, synthetic ratings and approximate town-level coordinates. Not booking inventory.
type Row=[string,string,string,string,RegionId,string,number,number,number,number,'ryokan'|'hotel',FeatureKey[],string[],string,string];
const rows:Row[]=[
 ['sapporo-01','삿포로 키타 테라스','札幌 北テラス','Sapporo Kita Terrace','sapporo','삿포로 · 삿포로역',43.0701,141.3518,9.2,328,'hotel',['largeBath'],[],'도심 여행에 편리한 위치와 차분한 객실. 하루 일정을 마친 뒤 대욕장에서 쉴 수 있는 시티 호텔.','city'],
 ['sapporo-02','오도리 파크 스테이','大通パークステイ','Odori Park Stay','sapporo','삿포로 · 오도리',43.0585,141.3488,8.7,842,'hotel',[],[],'오도리 공원 주변의 산책과 맛집 탐방에 어울리는 간결한 도심 숙소.','city'],
 ['sapporo-03','조잔케이 모리노유','定山渓 森の湯','Jozankei Mori no Yu','sapporo','삿포로 · 조잔케이',42.9641,141.1612,9.4,186,'ryokan',['natural','largeBath','outdoor','privateBath','roomOnsen','roomOutdoor'],['나트륨 염화물천'],'계곡을 바라보는 노천탕과 조용한 객실탕. 숲속에서 온천에 집중하는 작은 료칸.','onsen'],
 ['sapporo-04','조잔케이 계곡 호텔','定山渓 渓谷ホテル','Jozankei Valley Hotel','sapporo','삿포로 · 조잔케이',42.9675,141.1658,8.9,412,'hotel',['natural','largeBath','outdoor','privateBath'],['나트륨 염화물천'],'가족 단위로 머물기 좋은 온천 호텔. 넓은 대욕장과 계곡 전망이 특징.','forest'],
 ['noboribetsu-01','노보리베츠 시라카바 료칸','登別 白樺旅館','Noboribetsu Shirakaba Ryokan','noboribetsu','노보리베츠 · 온천마을',42.4914,141.1445,9.3,264,'ryokan',['natural','largeBath','outdoor','privateBath'],['유황천','나트륨 염화물천'],'유황천과 노천탕을 즐기는 전통 료칸. 다다미 객실과 온천마을 산책을 함께 경험하는 숙소.','ryokan'],
 ['noboribetsu-02','노보리베츠 유노모리','登別 湯の森','Noboribetsu Yu no Mori','noboribetsu','노보리베츠 · 온천마을',42.4943,141.1406,9.6,42,'ryokan',['natural','largeBath','outdoor','roomOnsen','roomOutdoor'],['유황천'],'객실 노천탕을 중심으로 구성한 소규모 료칸. 아담한 객실에서 조용히 온천을 즐기는 숙소.','onsen'],
 ['noboribetsu-03','노보리베츠 유메 호텔','登別 ゆめホテル','Noboribetsu Yume Hotel','noboribetsu','노보리베츠 · 온천마을',42.4878,141.1420,8.6,1064,'hotel',['natural','largeBath','outdoor'],['유황천'],'다양한 탕을 갖춘 대형 온천 호텔. 온천 여행을 처음 시작하기에 편한 형태.','forest'],
 ['toya-01','도야호 미즈노테라스','洞爺湖 水のテラス','Lake Toya Mizu Terrace','toya','도야호 · 도야코온천',42.5610,140.8196,9.5,153,'ryokan',['natural','largeBath','outdoor','roomOnsen','roomOutdoor'],['나트륨·칼슘 염화물천'],'호수와 하늘을 함께 바라보는 노천탕. 호수 전망 객실에서 느긋하게 보내는 온천 휴식.','lake'],
 ['toya-02','도야 레이크 호텔','洞爺レイクホテル','Toya Lake Hotel','toya','도야호 · 도야코온천',42.5631,140.8254,9.0,50,'hotel',['natural','largeBath','outdoor','privateBath'],['나트륨·칼슘 염화물천'],'호숫가 산책로와 연결되는 온천 호텔. 넓은 공용탕과 전세탕에서 휴식을 즐기는 숙소.','lake'],
 ['toya-03','도야 힐사이드 인','洞爺ヒルサイドイン','Toya Hillside Inn','toya','도야호 · 호수 남쪽',42.5574,140.8054,8.8,96,'hotel',['largeBath'],[],'호수 남쪽의 아담한 숙소. 전망과 산책을 중심으로 머무는 호텔.','city'],
 ['hakodate-01','유노카와 우미아카리','湯の川 海あかり','Yunokawa Umiakari','hakodate','하코다테 · 유노카와온천',41.7740,140.7859,9.1,375,'ryokan',['natural','largeBath','outdoor','privateBath','roomOnsen'],['나트륨·칼슘 염화물천'],'바다 가까이에서 즐기는 온천과 일본식 객실. 전세탕이 있는 가족 여행형 료칸.','ryokan'],
 ['hakodate-02','하코다테 베이 스테이','函館ベイステイ','Hakodate Bay Stay','hakodate','하코다테 · 베이 에어리어',41.7669,140.7190,9.2,690,'hotel',['largeBath'],[],'항구와 벽돌 창고 주변을 걸어서 둘러보기 좋은 도시형 호텔.','city'],
 ['hakodate-03','유노카와 나기사 호텔','湯の川 なぎさホテル','Yunokawa Nagisa Hotel','hakodate','하코다테 · 유노카와온천',41.7761,140.7925,8.7,215,'hotel',['natural','largeBath','outdoor','roomOnsen','roomOutdoor'],['나트륨·칼슘 염화물천'],'해안 온천 지역의 현대적인 호텔. 일부 객실에 전용 노천탕이 있는 형태.','onsen'],
 ['otaru-01','오타루 운하 테라스','小樽 運河テラス','Otaru Canal Terrace','otaru','오타루 · 운하',43.2001,141.0035,9.0,219,'hotel',['largeBath'],[],'운하 주변의 아담한 도심 호텔. 오타루 산책을 중심으로 일정을 짜기 좋은 숙소.','city'],
 ['otaru-02','아사리 모리노야도','朝里 森の宿','Asari Mori no Yado','otaru','오타루 · 아사리가와온천',43.1444,141.0247,9.3,87,'ryokan',['natural','largeBath','outdoor','privateBath','roomOnsen'],['칼슘·나트륨 염화물천'],'숲을 바라보는 전세탕과 온천 객실을 갖춘 료칸. 도심에서 벗어나 조용히 쉬는 숙소.','forest'],
 ['niseko-01','니세코 유키노유','ニセコ 雪の湯','Niseko Yuki no Yu','niseko','니세코 · 안누푸리',42.8492,140.6414,9.4,128,'ryokan',['natural','largeBath','outdoor','privateBath','roomOnsen','roomOutdoor'],['나트륨 탄산수소염천'],'눈 덮인 산과 노천탕을 함께 즐기는 산악 료칸. 일부 객실에 전용 노천탕.','snow'],
 ['niseko-02','니세코 마운틴 로지','ニセコ マウンテンロッジ','Niseko Mountain Lodge','niseko','니세코 · 히라후',42.8634,140.7025,8.9,304,'hotel',['natural','largeBath','outdoor'],['나트륨 염화물천'],'스키와 트레킹 뒤 온천에서 쉬는 리조트형 숙소. 산 전망과 야외탕이 특징.','snow'],
 ['sounkyo-01','소운쿄 이와노유','層雲峡 岩の湯','Sounkyo Iwa no Yu','sounkyo','소운쿄 · 온천마을',43.7257,142.9440,9.1,74,'ryokan',['natural','largeBath','outdoor','privateBath'],['단순유황천'],'협곡의 풍경을 담은 노천탕과 다다미 객실. 산행과 온천을 함께 즐기는 숙소.','forest'],
 ['sounkyo-02','소운쿄 다이세쓰 호텔','層雲峡 大雪ホテル','Sounkyo Daisetsu Hotel','sounkyo','소운쿄 · 온천마을',43.7272,142.9463,8.5,489,'hotel',['natural','largeBath','outdoor'],['단순유황천'],'대욕장 중심의 산악 온천 호텔. 단체와 가족 여행에 어울리는 형태.','snow'],
 ['akan-01','아칸호 코모레비 료칸','阿寒湖 木漏れ日旅館','Lake Akan Komorebi Ryokan','akan','아칸호 · 아칸코온천',43.4320,144.0980,9.2,112,'ryokan',['natural','largeBath','outdoor','privateBath','roomOnsen','roomOutdoor'],['단순온천'],'호수와 숲 사이에서 보내는 조용한 온천 휴식. 전세탕과 온천 객실이 있는 료칸.','lake'],
];
export const seedHotels:Hotel[]=rows.map(([id,ko,ja,en,regionId,place,lat,lng,score,count,kind,keys,types,description,image])=>{
 const region=REGIONS.find(r=>r.id===regionId)!;
 const sourceId='seed-v0.1';
 const photo=photoCredits.find(p=>p.site_file===`/images/${image}.jpg`)!;
 const features=Object.fromEntries(Object.keys(FEATURE_LABELS).map(key=>[key,{value:keys.includes(key as FeatureKey),sourceId,verifiedAt:null,...((key==='roomOnsen'||key==='roomOutdoor')&&keys.includes(key as FeatureKey)?{note:'일부 객실 타입만 제공 · 샘플 설정'}:{})}])) as Hotel['features'];
 if(id==='toya-03') features.privateBath.value=null;
 return {
  id,names:{ko,ja,en},kind,regionId,
  location:{label:place,address:`일본 홋카이도 ${region.name} 주변 (샘플 위치)`,latitude:lat,longitude:lng,isApproximate:true},
  description,image:{url:`/images/${image}.jpg`,alt:`${place} 숙소 분위기 참고 사진 · 실제 숙소 사진 아님`,sourceId:`photo-${image}`,isRepresentative:true},
  features,spring:{types,waterNotes:types.length?'온천수 사용 방식·가수·가온·순환 여부는 실제 데이터 연결 후 확인이 필요합니다.':'온천으로 설정되지 않은 숙소입니다. 대욕장이 있어도 천연온천은 아닐 수 있습니다.',useNotes:'객실탕은 일부 객실에 한합니다. 전세탕은 별도 예약·요금이 필요할 수 있습니다. (샘플 설정)'},
  ratings:[{sourceId,score,scale:10,reviewCount:count,summary:keys.includes('outdoor')?'온천 분위기와 전망이 좋은 편이며, 조용한 휴식에 어울린다는 샘플 리뷰 요약.':'위치와 객실의 편의성이 좋고 주변 관광을 즐기기 편하다는 샘플 리뷰 요약.',highlights:keys.includes('natural')?['온천 분위기','편안한 객실','주변 풍경']:['편리한 위치','객실 청결','주변 산책'],isMock:true,verifiedAt:null}],
  links:[{provider:'trip',url:'https://kr.trip.com/hotels/list?keyword='+encodeURIComponent(region.en),kind:'search',label:'Trip.com 지역 검색'}, {provider:'jalan',url:'https://www.jalan.net/010000/',kind:'search',label:'Jalan 홋카이도 검색'}, {provider:'official',url:null,kind:'unavailable',label:'공식 홈페이지 미연결'}, {provider:'maps',url:`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,kind:'coordinates',label:'Google Maps 샘플 위치'}],
  sources:[{sourceId,sourceType:'seed',label:'홋카이도 UX 검증용 샘플',retrievedAt:'2026-10-02T11:30:00Z',verifiedAt:null,url:null,isMock:true},{sourceId:`photo-${image}`,sourceType:'asset',label:`참고 사진 · ${photo.author} · ${photo.license}`,retrievedAt:'2026-10-02T11:30:00Z',verifiedAt:null,url:photo.source,isMock:false}],
 };
});
