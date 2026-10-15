import plan from '../data/collection-priorities.json';
import { PREFECTURES, REGIONS } from './hotel-types';
import { normalizeSearch } from './hotel-names';
import type { GeocodeInput } from './search-snapshot';

type City = [prefecture: string, ko: string, ja: string, en: string];
// Korean place labels and onsen areas follow Japan National Tourism
// Organization's regional guides, including:
// https://www.japan.travel/ko/destinations/okinawa/okinawa/
// https://www.japan.travel/ko/spot/1907/
// https://www.japan.travel/ko/destinations/kyushu/oita/beppu-and-yufuin-around/
// https://www.japan.travel/ko/destinations/kanto/kanagawa/hakone-and-around/
const cities: City[] = [
  ['hokkaido','삿포로','札幌','Sapporo'],['hokkaido','하코다테','函館','Hakodate'],['hokkaido','오타루','小樽','Otaru'],['hokkaido','아사히카와','旭川','Asahikawa'],['hokkaido','후라노','富良野','Furano'],['hokkaido','비에이','美瑛','Biei'],['hokkaido','니세코','ニセコ','Niseko'],['hokkaido','구시로','釧路','Kushiro'],['hokkaido','오비히로','帯広','Obihiro'],['hokkaido','치토세','千歳','Chitose'],['hokkaido','노보리베츠','登別','Noboribetsu'],['hokkaido','도야호','洞爺湖','Toyako'],['hokkaido','아바시리','網走','Abashiri'],['hokkaido','왓카나이','稚内','Wakkanai'],
  ['aomori','아오모리','青森','Aomori'],['aomori','히로사키','弘前','Hirosaki'],['aomori','하치노헤','八戸','Hachinohe'],['aomori','도와다','十和田','Towada'],['aomori','히라나이','平内','Hiranai'],
  ['iwate','모리오카','盛岡','Morioka'],['iwate','하나마키','花巻','Hanamaki'],['iwate','시즈쿠이시','雫石','Shizukuishi'],['iwate','다키자와','滝沢','Takizawa'],['iwate','이치노세키','一関','Ichinoseki'],
  ['miyagi','센다이','仙台','Sendai'],['miyagi','마쓰시마','松島','Matsushima'],['miyagi','나토리','名取','Natori'],['miyagi','이시노마키','石巻','Ishinomaki'],
  ['akita','아키타','秋田','Akita'],['akita','센보쿠','仙北','Semboku'],['akita','다이센','大仙','Daisen'],['akita','미사토','美郷','Misato'],['akita','오가','男鹿','Oga'],
  ['yamagata','야마가타','山形','Yamagata'],['yamagata','덴도','天童','Tendo'],['yamagata','가미노야마','上山','Kaminoyama'],['yamagata','쓰루오카','鶴岡','Tsuruoka'],['yamagata','사카타','酒田','Sakata'],
  ['fukushima','후쿠시마','福島','Fukushima'],['fukushima','아이즈와카마쓰','会津若松','Aizuwakamatsu'],['fukushima','고리야마','郡山','Koriyama'],['fukushima','니혼마쓰','二本松','Nihonmatsu'],['fukushima','이와키','いわき','Iwaki'],
  ['tochigi','우쓰노미야','宇都宮','Utsunomiya'],['tochigi','닛코','日光','Nikko'],['tochigi','나스','那須','Nasu'],['tochigi','사쿠라','さくら','Sakura'],['tochigi','다카네자와','高根沢','Takanezawa'],
  ['gunma','다카사키','高崎','Takasaki'],['gunma','마에바시','前橋','Maebashi'],['gunma','나카노조','中之条','Nakanojo'],['gunma','히가시아가쓰마','東吾妻','Higashiagatsuma'],['gunma','나가노하라','長野原','Naganohara'],['gunma','미나카미','みなかみ','Minakami'],
  ['ibaraki','미토','水戸','Mito'],['ibaraki','쓰쿠바','つくば','Tsukuba'],['ibaraki','히타치','日立','Hitachi'],['ibaraki','기타이바라키','北茨城','Kitaibaraki'],['ibaraki','다카하기','高萩','Takahagi'],['ibaraki','히타치오타','常陸太田','Hitachiota'],['ibaraki','히타치오미야','常陸大宮','Hitachiomiya'],['ibaraki','다이고','大子','Daigo'],
  ['saitama','사이타마','さいたま','Saitama'],['saitama','가와고에','川越','Kawagoe'],['saitama','가와구치','川口','Kawaguchi'],['saitama','도코로자와','所沢','Tokorozawa'],['saitama','치치부','秩父','Chichibu'],['saitama','이루마','入間','Iruma'],['saitama','와코','和光','Wako'],['saitama','도다','戸田','Toda'],['saitama','니자','新座','Niiza'],
  ['chiba','지바','千葉','Chiba'],['chiba','우라야스','浦安','Urayasu'],['chiba','나리타','成田','Narita'],['chiba','기사라즈','木更津','Kisarazu'],['chiba','이치하라','市原','Ichihara'],['chiba','가모가와','鴨川','Kamogawa'],['chiba','다테야마','館山','Tateyama'],
  ['tokyo','신주쿠','新宿','Shinjuku'],['tokyo','시부야','渋谷','Shibuya'],['tokyo','시나가와','品川','Shinagawa'],['tokyo','고토','江東','Koto'],['tokyo','미나토','港','Minato'],['tokyo','다이토','台東','Taito'],['tokyo','하치오지','八王子','Hachioji'],['tokyo','다치카와','立川','Tachikawa'],['tokyo','도쿄','東京','Tokyo'],
  ['kanagawa','요코하마','横浜','Yokohama'],['kanagawa','가와사키','川崎','Kawasaki'],['kanagawa','가마쿠라','鎌倉','Kamakura'],['kanagawa','하코네','箱根','Hakone'],['kanagawa','오다와라','小田原','Odawara'],['kanagawa','후지사와','藤沢','Fujisawa'],['kanagawa','사가미하라','相模原','Sagamihara'],
  ['yamanashi','고후','甲府','Kofu'],['yamanashi','후지카와구치코','富士河口湖','Fujikawaguchiko'],['yamanashi','후지요시다','富士吉田','Fujiyoshida'],['yamanashi','가이','甲斐','Kai'],['yamanashi','주오','中央','Chuo'],['yamanashi','쇼와','昭和','Showa'],
  ['nagano','나가노','長野','Nagano'],['nagano','마쓰모토','松本','Matsumoto'],['nagano','가루이자와','軽井沢','Karuizawa'],['nagano','스와','諏訪','Suwa'],['nagano','야마노우치','山ノ内','Yamanouchi'],['nagano','다카야마','高山','Takayama'],['nagano','하쿠바','白馬','Hakuba'],
  ['niigata','니가타','新潟','Niigata'],['niigata','나가오카','長岡','Nagaoka'],['niigata','시바타','新発田','Shibata'],['niigata','고센','五泉','Gosen'],['niigata','아가노','阿賀野','Agano'],['niigata','아가','阿賀','Aga'],['niigata','유자와','湯沢','Yuzawa'],['niigata','묘코','妙高','Myoko'],['niigata','사도','佐渡','Sado'],
  ['toyama','도야마','富山','Toyama'],['toyama','다카오카','高岡','Takaoka'],['toyama','구로베','黒部','Kurobe'],['toyama','우오즈','魚津','Uozu'],['toyama','다테야마','立山','Tateyama'],['toyama','뉴젠','入善','Nyuzen'],['toyama','아사히','朝日','Asahi'],['toyama','가미이치','上市','Kamiichi'],
  ['ishikawa','가나자와','金沢','Kanazawa'],['ishikawa','가가','加賀','Kaga'],['ishikawa','나나오','七尾','Nanao'],['ishikawa','와지마','輪島','Wajima'],['ishikawa','스즈','珠洲','Suzu'],['ishikawa','하쿠이','羽咋','Hakui'],['ishikawa','시카','志賀','Shika'],['ishikawa','아나미즈','穴水','Anamizu'],['ishikawa','노토','能登','Noto'],['ishikawa','나카노토','中能登','Nakanoto'],
  ['fukui','후쿠이','福井','Fukui'],['fukui','아와라','あわら','Awara'],['fukui','사카이','坂井','Sakai'],['fukui','쓰루가','敦賀','Tsuruga'],
  ['shizuoka','시즈오카','静岡','Shizuoka'],['shizuoka','아타미','熱海','Atami'],['shizuoka','이토','伊東','Ito'],['shizuoka','이즈','伊豆','Izu'],['shizuoka','이즈노쿠니','伊豆の国','Izunokuni'],['shizuoka','고텐바','御殿場','Gotemba'],['shizuoka','하마마쓰','浜松','Hamamatsu'],['shizuoka','시모다','下田','Shimoda'],
  ['gifu','다카야마','高山','Takayama'],['gifu','히다','飛騨','Hida'],['gifu','게로','下呂','Gero'],['gifu','기후','岐阜','Gifu'],
  ['aichi','나고야','名古屋','Nagoya'],['aichi','도요하시','豊橋','Toyohashi'],['aichi','도요타','豊田','Toyota'],['aichi','가마고리','蒲郡','Gamagori'],['aichi','이누야마','犬山','Inuyama'],
  ['mie','이세','伊勢','Ise'],['mie','도바','鳥羽','Toba'],['mie','시마','志摩','Shima'],['mie','욧카이치','四日市','Yokkaichi'],['mie','구와나','桑名','Kuwana'],['mie','스즈카','鈴鹿','Suzuka'],['mie','가메야마','亀山','Kameyama'],['mie','이나베','いなべ','Inabe'],['mie','고모노','菰野','Komono'],['mie','기소사키','木曽岬','Kisosaki'],
  ['shiga','오쓰','大津','Otsu'],['shiga','히코네','彦根','Hikone'],['shiga','나가하마','長浜','Nagahama'],['shiga','구사쓰','草津','Kusatsu'],
  ['kyoto','교토','京都','Kyoto'],['kyoto','우지','宇治','Uji'],['kyoto','미야즈','宮津','Miyazu'],['kyoto','가메오카','亀岡','Kameoka'],
  ['oosaka','오사카','大阪','Osaka'],['oosaka','이즈미사노','泉佐野','Izumisano'],['oosaka','사카이','堺','Sakai'],['oosaka','도요나카','豊中','Toyonaka'],['oosaka','이케다','池田','Ikeda'],['oosaka','스이타','吹田','Suita'],['oosaka','이바라키','茨木','Ibaraki'],['oosaka','다카쓰키','高槻','Takatsuki'],['oosaka','히라카타','枚方','Hirakata'],['oosaka','미노오','箕面','Minoh'],['oosaka','시마모토','島本','Shimamoto'],['oosaka','노세','能勢','Nose'],
  ['hyogo','고베','神戸','Kobe'],['hyogo','히메지','姫路','Himeji'],['hyogo','도요오카','豊岡','Toyooka'],['hyogo','아와지','淡路','Awaji'],['hyogo','스모토','洲本','Sumoto'],
  ['nara','나라','奈良','Nara'],['nara','덴리','天理','Tenri'],['nara','이카루가','斑鳩','Ikaruga'],['nara','산고','三郷','Sango'],['nara','헤구리','平群','Heguri'],
  ['wakayama','와카야마','和歌山','Wakayama'],['wakayama','시라하마','白浜','Shirahama'],['wakayama','다나베','田辺','Tanabe'],['wakayama','가이난','海南','Kainan'],['wakayama','기노카와','紀の川','Kinokawa'],['wakayama','기미노','紀美野','Kimino'],['wakayama','나치카쓰우라','那智勝浦','Nachikatsuura'],
  ['tottori','돗토리','鳥取','Tottori'],['tottori','요나고','米子','Yonago'],['tottori','구라요시','倉吉','Kurayoshi'],['tottori','이와미','岩美','Iwami'],['tottori','야즈','八頭','Yazu'],
  ['shimane','마쓰에','松江','Matsue'],['shimane','이즈모','出雲','Izumo'],['shimane','오쿠이즈모','奥出雲','Okuizumo'],
  ['okayama','오카야마','岡山','Okayama'],['okayama','구라시키','倉敷','Kurashiki'],['okayama','다마노','玉野','Tamano'],['okayama','세토우치','瀬戸内','Setouchi'],
  ['hiroshima','히로시마','広島','Hiroshima'],['hiroshima','오노미치','尾道','Onomichi'],['hiroshima','후쿠야마','福山','Fukuyama'],['hiroshima','하쓰카이치','廿日市','Hatsukaichi'],
  ['yamaguchi','야마구치','山口','Yamaguchi'],['yamaguchi','시모노세키','下関','Shimonoseki'],['yamaguchi','이와쿠니','岩国','Iwakuni'],['yamaguchi','슈난','周南','Shunan'],['yamaguchi','구다마쓰','下松','Kudamatsu'],['yamaguchi','히카리','光','Hikari'],['yamaguchi','야나이','柳井','Yanai'],['yamaguchi','스오오시마','周防大島','Suooshima'],
  ['tokushima','도쿠시마','徳島','Tokushima'],['tokushima','나루토','鳴門','Naruto'],['tokushima','고마쓰시마','小松島','Komatsushima'],['tokushima','마쓰시게','松茂','Matsushige'],['tokushima','이타노','板野','Itano'],
  ['kagawa','다카마쓰','高松','Takamatsu'],['kagawa','고토히라','琴平','Kotohira'],['kagawa','미키','三木','Miki'],['kagawa','쇼도시마','小豆島','Shodoshima'],
  ['ehime','마쓰야마','松山','Matsuyama'],['ehime','이마바리','今治','Imabari'],
  ['kochi','고치','高知','Kochi'],['kochi','난코쿠','南国','Nankoku'],['kochi','도사','土佐','Tosa'],['kochi','스사키','須崎','Susaki'],['kochi','고난','香南','Konan'],['kochi','가미','香美','Kami'],['kochi','이노','いの','Ino'],['kochi','니요도가와','仁淀川','Niyodogawa'],['kochi','게이세이','芸西','Geisei'],
  ['fukuoka','후쿠오카','福岡','Fukuoka'],['fukuoka','기타큐슈','北九州','Kitakyushu'],['fukuoka','구루메','久留米','Kurume'],['fukuoka','다자이후','太宰府','Dazaifu'],
  ['saga','사가','佐賀','Saga'],['saga','다케오','武雄','Takeo'],['saga','우레시노','嬉野','Ureshino'],['saga','가라쓰','唐津','Karatsu'],['saga','도스','鳥栖','Tosu'],['saga','간자키','神埼','Kanzaki'],
  ['nagasaki','나가사키','長崎','Nagasaki'],['nagasaki','사세보','佐世保','Sasebo'],['nagasaki','운젠','雲仙','Unzen'],['nagasaki','시마바라','島原','Shimabara'],['nagasaki','이사하야','諫早','Isahaya'],
  ['kumamoto','구마모토','熊本','Kumamoto'],['kumamoto','아소','阿蘇','Aso'],['kumamoto','미나미아소','南阿蘇','Minamiaso'],['kumamoto','미나미오구니','南小国','Minamioguni'],['kumamoto','가미아마쿠사','上天草','Kamiamakusa'],['kumamoto','아마쿠사','天草','Amakusa'],['kumamoto','마시키','益城','Mashiki'],
  ['ooita','오이타','大分','Oita'],['ooita','벳푸','別府','Beppu'],['ooita','유후','由布','Yufu'],['ooita','히지','日出','Hiji'],['ooita','히타','日田','Hita'],['ooita','우스키','臼杵','Usuki'],['ooita','사이키','佐伯','Saiki'],['ooita','분고오노','豊後大野','Bungoono'],
  ['miyazaki','미야자키','宮崎','Miyazaki'],['miyazaki','니치난','日南','Nichinan'],['miyazaki','다카치호','高千穂','Takachiho'],
  ['kagoshima','가고시마','鹿児島','Kagoshima'],['kagoshima','기리시마','霧島','Kirishima'],['kagoshima','이부스키','指宿','Ibusuki'],['kagoshima','야쿠시마','屋久島','Yakushima'],
  ['okinawa','나하','那覇','Naha'],['okinawa','나고','名護','Nago'],['okinawa','자탄','北谷','Chatan'],['okinawa','온나','恩納','Onna'],['okinawa','나키진','今帰仁','Nakijin'],['okinawa','모토부','本部','Motobu'],['okinawa','이시가키','石垣','Ishigaki'],['okinawa','미야코지마','宮古島','Miyakojima'],['okinawa','도미구스쿠','豊見城','Tomigusuku'],['okinawa','우루마','うるま','Uruma'],['okinawa','기노완','宜野湾','Ginowan'],['okinawa','요미탄','読谷','Yomitan'],
];
const preparedCities=cities.map(city=>({city,labels:[city[1],city[2],city[2]+'市',city[3]].map(normalizeSearch),native:new RegExp('^(?:[^\\s]+郡)?'+city[2]+'[市町村区]'),english:new RegExp('\\b'+city[3]+'\\s+(?:City|Town|Village)\\b|^\\s*'+city[3]+'\\s*$','i')}));
type Onsen = [prefecture: string, label: string, city: string, pattern: RegExp];
const onsens: Onsen[] = [
  ['hokkaido','조잔케이 온천','삿포로',/定山渓|jozankei|조잔케이/i],['hokkaido','유노카와 온천','하코다테',/湯の川|湯川町|yunokawa|유노카와/i],['hokkaido','노보리베츠 온천','',/登別温泉|登別市登別温泉町|noboribetsu\s*onsen|노보리베츠\s*온천/i],['hokkaido','소운쿄 온천','가미카와',/層雲峡|sounkyo|소운쿄/i],['hokkaido','도야호 온천','',/洞爺湖温泉|toyako\s*onsen|도야호\s*온천/i],['hokkaido','아칸호 온천','구시로',/阿寒湖温泉|akanko\s*onsen|아칸호\s*온천/i],['hokkaido','시코쓰호 온천','치토세',/支笏湖温泉|shikotsuko\s*onsen|시코쓰호\s*온천/i],['hokkaido','도카치가와 온천','오토후케',/十勝川温泉|tokachigawa|도카치가와/i],['hokkaido','곤부 온천','니세코',/昆布温泉|konbu\s*onsen|곤부\s*온천/i],['hokkaido','히라이소 온천','오타루',/平磯温泉|히라이소\s*온천/i],
  ['aomori','아사무시 온천','아오모리',/浅虫|asamushi|아사무시/i],['aomori','스카유 온천','아오모리',/酸ヶ湯|酸ケ湯|sukayu|스카유/i],
  ['iwate','쓰나기 온천','모리오카',/繋温泉|つなぎ温泉|tsunagi\s*onsen|쓰나기\s*온천/i],['iwate','하나마키 온천','',/花巻温泉|hanamaki\s*onsen|하나마키\s*온천/i],
  ['miyagi','아키우 온천','센다이',/秋保|akiu|아키우/i],['miyagi','사쿠나미 온천','센다이',/作並|sakunami|사쿠나미/i],['miyagi','나루코 온천','오사키',/鳴子|naruko|나루코/i],
  ['akita','뉴토 온천','센보쿠',/乳頭温泉|nyuto|뉴토/i],['akita','다자와코 온천','센보쿠',/田沢湖高原温泉|田沢湖温泉|tazawako\s*onsen|다자와코\s*온천/i],
  ['yamagata','긴잔 온천','오바나자와',/銀山温泉|ginzan\s*onsen|긴잔\s*온천/i],['yamagata','자오 온천','야마가타',/蔵王温泉|zao\s*onsen|자오\s*온천/i],['yamagata','덴도 온천','',/天童温泉|tendo\s*onsen|덴도\s*온천/i],['yamagata','가미노야마 온천','',/かみのやま温泉|上山温泉|kaminoyama\s*onsen|가미노야마\s*온천/i],
  ['fukushima','이이자카 온천','후쿠시마',/飯坂|iizaka|이이자카/i],['fukushima','쓰치유 온천','후쿠시마',/土湯温泉|tsuchiyu|쓰치유/i],['fukushima','다케 온천','니혼마쓰',/岳温泉|dake\s*onsen|다케\s*온천/i],['fukushima','히가시야마 온천','아이즈와카마쓰',/東山温泉|higashiyama\s*onsen|히가시야마\s*온천/i],
  ['tochigi','기누가와 온천','닛코',/鬼怒川|kinugawa|기누가와/i],['tochigi','유니시가와 온천','닛코',/湯西川|yunishigawa|유니시가와/i],['tochigi','닛코 유모토 온천','닛코',/日光湯元|nikko\s*yumoto|닛코\s*유모토/i],['tochigi','시오바라 온천','나스시오바라',/塩原温泉|shiobara\s*onsen|시오바라\s*온천/i],
  ['gunma','구사쓰 온천','',/草津|kusatsu|구사쓰/i],['gunma','시마 온천','나카노조',/四万|shima\s*onsen|시마\s*온천/i],['gunma','이카호 온천','시부카와',/伊香保|ikaho|이카호/i],['gunma','미나카미 온천','',/水上温泉|minakami\s*onsen|미나카미\s*온천/i],['gunma','사와타리 온천','나카노조',/沢渡温泉|sawatari\s*onsen|사와타리\s*온천/i],
  ['kanagawa','하코네 유모토 온천','하코네',/箱根湯本|箱根町湯本|hakone\s*yumoto|하코네\s*유모토/i],['kanagawa','고라 온천','하코네',/箱根町強羅|強羅温泉|gora\s*onsen|고라\s*온천/i],['kanagawa','하코네 온천','',/箱根|hakone|하코네/i],['kanagawa','유가와라 온천','',/湯河原|yugawara|유가와라/i],
  ['nagano','시부 온천','야마노우치',/渋温泉|shibu\s*onsen|시부\s*온천/i],['nagano','유다나카 온천','야마노우치',/湯田中|yudanaka|유다나카/i],['nagano','노자와 온천','',/野沢温泉|nozawa\s*onsen|노자와\s*온천/i],['nagano','벳쇼 온천','우에다',/別所温泉|bessho\s*onsen|벳쇼\s*온천/i],
  ['niigata','쓰키오카 온천','시바타',/月岡温泉|tsukioka|쓰키오카/i],['niigata','에치고유자와 온천','유자와',/越後湯沢|湯沢温泉|echigo\s*yuzawa|에치고유자와/i],['toyama','우나즈키 온천','구로베',/宇奈月|unazuki|우나즈키/i],
  ['ishikawa','와쿠라 온천','나나오',/和倉|wakura|와쿠라/i],['ishikawa','야마시로 온천','가가',/山代温泉|yamashiro\s*onsen|야마시로\s*온천/i],['ishikawa','야마나카 온천','가가',/山中温泉|yamanaka\s*onsen|야마나카\s*온천/i],['ishikawa','가타야마즈 온천','가가',/片山津|katayamazu|가타야마즈/i],['fukui','아와라 온천','',/あわら温泉|芦原温泉|awara\s*onsen|아와라\s*온천/i],
  ['shizuoka','슈젠지 온천','이즈',/修善寺|shuzenji|슈젠지/i],['shizuoka','이즈나가오카 온천','이즈노쿠니',/伊豆長岡|izunagaoka|이즈나가오카/i],['shizuoka','아타미 온천','',/熱海|atami|아타미/i],['shizuoka','이토 온천','',/伊東温泉|ito\s*onsen|이토\s*온천/i],['gifu','게로 온천','',/下呂|gero|게로/i],['gifu','히라유 온천','다카야마',/平湯|hirayu|히라유/i],['gifu','신호타카 온천','다카야마',/新穂高|shinhotaka|신호타카/i],
  ['mie','유노야마 온천','고모노',/湯の山温泉|yunoyama|유노야마/i],['shiga','오고토 온천','오쓰',/おごと温泉|雄琴|ogoto|오고토/i],
  ['hyogo','아리마 온천','고베',/有馬|arima|아리마/i],['hyogo','기노사키 온천','도요오카',/城崎|kinosaki|기노사키/i],['hyogo','유무라 온천','신온센',/湯村温泉|yumura\s*onsen|유무라\s*온천/i],
  ['wakayama','시라하마 온천','',/白浜|shirahama|시라하마/i],['wakayama','가쓰우라 온천','나치카쓰우라',/勝浦温泉|katsuura\s*onsen|가쓰우라\s*온천/i],['tottori','가이케 온천','요나고',/皆生|kaike|가이케/i],['tottori','미사사 온천','',/三朝|misasa|미사사/i],['shimane','다마쓰쿠리 온천','마쓰에',/玉造温泉|tamatsukuri\s*onsen|다마쓰쿠리\s*온천/i],['shimane','마쓰에 신지코 온천','마쓰에',/松江しんじ湖温泉|신지코\s*온천/i],['yamaguchi','유다 온천','야마구치',/湯田温泉|yuda\s*onsen|유다\s*온천/i],['ehime','도고 온천','마쓰야마',/道後|dogo|도고/i],
  ['saga','우레시노 온천','',/嬉野|ureshino|우레시노/i],['saga','다케오 온천','',/武雄温泉|takeo\s*onsen|다케오\s*온천/i],['nagasaki','운젠 온천','',/雲仙温泉|unzen\s*onsen|운젠\s*온천/i],['nagasaki','오바마 온천','운젠',/小浜温泉|obama\s*onsen|오바마\s*온천/i],
  ['kumamoto','구로카와 온천','아소',/黒川温泉|kurokawa\s*onsen|구로카와\s*온천/i],['kumamoto','우치노마키 온천','아소',/内牧|uchinomaki|우치노마키/i],['kumamoto','히토요시 온천','',/人吉温泉|hitoyoshi\s*onsen|히토요시\s*온천/i],
  ['ooita','유노히라 온천','유후',/湯平|yunohira|유노히라/i],['ooita','유후인 온천','',/由布院|湯布院|yufuin|유후인/i],['ooita','벳푸 온천','',/別府|beppu|벳푸/i],['ooita','나가유 온천','다케타',/長湯温泉|nagayu|나가유/i],
  ['kagoshima','이부스키 온천','',/指宿|ibusuki|이부스키/i],['kagoshima','기리시마 온천','',/霧島温泉|牧園町高千穂|kirishima\s*onsen|기리시마\s*온천/i],
];

// Romanized parts need word boundaries, but provider addresses glue suffixes
// on (Yunokawacho, Jozankeionsen). Regex escapes such as \s are not letters.
const preparedOnsens=onsens.map(([pref,label,city,pattern])=>({pref,label,city,pattern:new RegExp(pattern.source.split('|').map(part=>/[a-z]/i.test(part.replace(/\\./g,''))?'\\b(?:'+part+')(?=onsen|ch[oō]|machi|\\b)':part).join('|'),pattern.flags)}));

export type PlaceInput = { prefecture?: string | null; regionId: string; location: { label: string; address: string }; names?: { ja: string } };
const unique = (parts: string[]) => [...new Set(parts.filter(Boolean))].join(' · ');
function prefectureFor(hotel:PlaceInput){
  return PREFECTURES.find(p => p.id === hotel.prefecture || p.id === hotel.regionId)
    ?? PREFECTURES.find(p => hotel.location.address.startsWith(p.ja))
    ?? (REGIONS.some(r=>r.id===hotel.regionId&&!r.id.startsWith('pref-')&&r.id!=='all') ? PREFECTURES[0] : undefined);
}
// The collector stored the prefecture's display name as the label when a page
// named no region (scripts/crawler/collect.py before L01). Five of those names
// carry a town ('가나가와 · 하코네'), which is not where the hotel is (Trip.com
// Yokohama hotels), so such a label says nothing beyond the prefecture. A PUT
// stores the label formatHotelLocation made of it (lib/hotel-enrichment.ts), the
// town first ('하코네 · 가나가와'); that one is kept only when the address names
// the town.
function storedLabel(hotel: PlaceInput, pref: ReturnType<typeof prefectureFor>): string {
  const label = hotel.location.label ?? '';
  if (!pref?.name.includes(' · ')) return label;
  const [name, town] = pref.name.split(' · ');
  if (label === pref.name) return '';
  if (label !== town + ' · ' + name) return label;
  const row = cities.find(([p, ko]) => p === pref.slug && ko === town), address = (hotel.location.address ?? '').toLowerCase();
  return (row ? row.slice(1) : [town]).some(word => address.includes(word.toLowerCase())) ? label : '';
}

export function formatHotelLocation(hotel: PlaceInput): string {
  const pref = prefectureFor(hotel);
  const slug = pref?.slug;
  const prefix = pref?.name.split(' · ')[0] ?? '';
  const address = hotel.location.address ?? '', label = storedLabel(hotel, pref);
  const regionalOnsens=preparedOnsens.filter(area=>area.pref===slug),name=hotel.names?.ja??'';
  const onsen = regionalOnsens.find(area => area.pattern.test(address))
    ?? regionalOnsens.find(area => !label.includes('·') && area.pattern.test(label))
    ?? regionalOnsens.find(area => /温泉|\bonsen\b|온천/i.test(name) && area.pattern.test(name));
  if (onsen) return unique([onsen.label, onsen.city, prefix]);
  const regionalCities = preparedCities.filter(({city}) => city[0] === slug);
  const normalizedLabel = normalizeSearch(label.replace(/\s+(?:city|town|village)$/i, ''));
  const nativeAddress=address.replace(pref?.ja??'', '').replace(/^〒?\s*\d{3}[-ー]?\d{4}\s*/, '').trim();
  const city = regionalCities.find(row => row.labels.includes(normalizedLabel))
    ?? regionalCities.find(row => row.native.test(nativeAddress) || row.english.test(address));
  if (city) return unique([city.city[1], prefix]);
  const region = REGIONS.find(r => r.id === hotel.regionId && !r.id.startsWith('pref-') && r.id !== 'all');
  if (region) return unique([region.name, prefix || '홋카이도']);
  const korean = label.split(/[·|]/).map(s => s.trim()).filter(s => /^[가-힣\s-]+$/.test(s));
  return unique([...korean.filter(s => s !== prefix), prefix]) || '일본';
}

export function hotelPlaceSearchText(hotel: PlaceInput): string {
  const pref = prefectureFor(hotel),label=formatHotelLocation(hotel),parts=label.split(' · '),stored=storedLabel(hotel,pref);
  const city = cities.find(([p,ko]) => p === pref?.slug && parts.includes(ko));
  const evidence=[stored,hotel.location.address,hotel.names?.ja??''].join(' ').toLowerCase();
  const address=hotel.location.address.toLowerCase(),towns=plan.towns.filter(t=>t.prefecture===pref?.id&&(t.terms.some(term=>evidence.includes(term.toLowerCase()))||t.addressTerms?.some(term=>address.includes(term.toLowerCase())))).flatMap(t=>[t.name,t.query,...t.terms]);
  return [stored,hotel.location.address,label,pref?.name.split(' · ')[0],pref?.ja,pref?.en.split(' ')[0],city?.[2],city?.[3],[city?.[3],pref?.en.split(' ')[0]].filter(Boolean).join(' '),[city?.[2],pref?.ja].filter(Boolean).join(' '),...towns].filter(Boolean).join(' ');
}

// The geocoder's input for a hotel without coordinates (D06, built into the
// search snapshot by scripts/geo/geocode.py): the stored address, the
// prefecture in Japanese, and Japanese names of the onsen area and city the
// list shows (formatHotelLocation), most specific first, each with the usual
// suffixes, then the prefecture. Only map positions come from these.
const NATIVE=/^[\u3040-\u30ff\u3400-\u9fff]+$/;
export function geocodeInput(hotel: PlaceInput): GeocodeInput {
  const address = hotel.location.address ?? '', pref = prefectureFor(hotel);
  if (!pref) return { address, prefecture: null, places: [] };
  // The prefecture's own label is last; a city of the same name is not told apart.
  const prefix = pref.name.split(' · ')[0], parts = formatHotelLocation(hotel).split(' · ').filter(part => part !== prefix);
  const onsen = onsens.find(([p, label]) => p === pref.slug && parts.includes(label));
  const city = cities.find(([p, ko]) => p === pref.slug && (parts.includes(ko) || ko === onsen?.[2]));
  const names = [onsen?.[3].source.split('|').find(part => NATIVE.test(part)), city?.[2]].filter((n): n is string => !!n);
  const places = names.flatMap(n => /[市町村区]$/.test(n) ? [n] : [n + '市', n + '町', n + '村', n + '区', n]).map(n => pref.ja + n);
  return { address, prefecture: pref.ja, places: [...new Set([...places, pref.ja])] };
}
