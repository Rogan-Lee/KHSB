// 앱·서비스 카탈로그 — 직원이 "유튜브" 처럼 이름으로 고르는 차단 단위.
//  · AdGuard Home 내장 서비스(id 는 장비와 동일): 실제 도메인 목록은 장비가 올려 준다(AccessAgent.catalog).
//    장비가 붙기 전에도 규칙을 만들 수 있게 id·이름만 여기 둔다 (v0.107.79 기준 139개).
//  · 국내 서비스(kr:*): AdGuard 목록에 없어 도메인을 직접 적는다.
//  · sys:bypass: 차단 우회(암호화 DNS·iCloud 비공개 릴레이) 방지 — 화면에 고르는 항목으로 나오지 않는다.

export type CatalogGroupId =
  | "streaming"
  | "social_network"
  | "gaming"
  | "messenger"
  | "community"
  | "webtoon"
  | "shopping"
  | "ai"
  | "music"
  | "etc";

export const CATALOG_GROUP_LABELS: Record<CatalogGroupId, string> = {
  streaming: "영상",
  social_network: "SNS",
  gaming: "게임",
  messenger: "메신저",
  community: "커뮤니티",
  webtoon: "웹툰·웹소설",
  shopping: "쇼핑",
  ai: "AI",
  music: "음악",
  etc: "기타",
};

export const CATALOG_GROUP_ORDER: CatalogGroupId[] = [
  "streaming",
  "social_network",
  "gaming",
  "messenger",
  "community",
  "webtoon",
  "shopping",
  "ai",
  "music",
  "etc",
];

export type CatalogEntry = {
  id: string;
  /** 화면 표시 이름 (한국어 우선) */
  name: string;
  group: CatalogGroupId;
  /** 자주 쓰는 항목 — 목록 맨 위에 모아 보여 준다 */
  popular?: boolean;
  /** 고를 때 함께 보여 줄 주의 */
  caution?: string;
  /** 이름 검색·학생 신청 자동 연결용 별칭 */
  aliases?: string[];
};

/** 서비스 id → adblock 규칙 목록 (장비가 올린 목록 + 국내 서비스) */
export type CatalogRules = Record<string, string[]>;

export const BYPASS_SERVICE_ID = "sys:bypass";

// AdGuard Home 의 group_id → 화면 묶음
const ADGUARD_GROUP: Record<string, CatalogGroupId> = {
  streaming: "streaming",
  social_network: "social_network",
  gaming: "gaming",
  messenger: "messenger",
  shopping: "shopping",
  ai: "ai",
};

// ponytail: 목록을 코드에 박아 둠 — AdGuard Home 이 서비스를 추가하면 장비가 올린 목록에서 영문 이름·"기타" 묶음으로만 보인다.
// 한국어 이름이나 묶음이 필요해지면 여기와 ADGUARD_KO 에 추가.
/** [id, 영문 이름, AdGuard group_id] — 장비의 GET /control/blocked_services/all 에서 뽑은 그대로 */
const ADGUARD_SERVICES: [string, string, string][] = [
  ["4chan", "4chan", "social_network"],
  ["500px", "500px", "social_network"],
  ["9gag", "9GAG", "social_network"],
  ["activision_blizzard", "Activision Blizzard", "gaming"],
  ["aliexpress", "AliExpress", "shopping"],
  ["amazon", "Amazon", "shopping"],
  ["amazon_streaming", "Amazon Streaming", "streaming"],
  ["amino", "Amino", "social_network"],
  ["apple_streaming", "Apple Streaming", "streaming"],
  ["battle_net", "Battle.net", "gaming"],
  ["betano", "Betano", "gambling"],
  ["betfair", "Betfair", "gambling"],
  ["betway", "Betway", "gambling"],
  ["bigo_live", "Bigo Live", "streaming"],
  ["bilibili", "Bilibili", "streaming"],
  ["blaze", "Blaze", "gambling"],
  ["blizzard_entertainment", "Blizzard Entertainment", "gaming"],
  ["bluesky", "Bluesky", "social_network"],
  ["box", "Box", "hosting"],
  ["canais_globo", "Canais Globo", "streaming"],
  ["chatgpt", "ChatGPT", "ai"],
  ["claro", "Claro", "streaming"],
  ["claude", "Claude", "ai"],
  ["cloudflare", "Cloudflare", "cdn"],
  ["clubhouse", "Clubhouse", "social_network"],
  ["coolapk", "CoolApk", "shopping"],
  ["copilot", "Copilot", "ai"],
  ["crunchyroll", "Crunchyroll", "streaming"],
  ["dailymotion", "Dailymotion", "streaming"],
  ["deepseek", "DeepSeek", "ai"],
  ["deezer", "Deezer", "streaming"],
  ["directvgo", "DirecTV Go", "streaming"],
  ["discord", "Discord", "social_network"],
  ["discoveryplus", "Discovery+", "streaming"],
  ["disneyplus", "Disney+", "streaming"],
  ["douban", "Douban", "social_network"],
  ["dropbox", "Dropbox", "hosting"],
  ["ebay", "eBay", "shopping"],
  ["electronic_arts", "Electronic Arts", "gaming"],
  ["epic_games", "Epic Games", "gaming"],
  ["espn", "ESPN", "streaming"],
  ["facebook", "Facebook", "social_network"],
  ["fdj_united", "FDJ United", "gambling"],
  ["fifa", "FIFA", "streaming"],
  ["flickr", "Flickr", "hosting"],
  ["gemini", "Google Gemini", "ai"],
  ["globoplay", "Globoplay", "streaming"],
  ["gog", "GOG", "gaming"],
  ["grindr", "Grindr", "dating"],
  ["grok", "Grok", "ai"],
  ["hbomax", "HBO Max", "streaming"],
  ["hulu", "Hulu", "streaming"],
  ["icloud_private_relay", "iCloud Private Relay", "privacy"],
  ["iheartradio", "iHeartRadio", "streaming"],
  ["imgur", "Imgur", "hosting"],
  ["instagram", "Instagram", "social_network"],
  ["io_interactive", "IO Interactive", "gaming"],
  ["iqiyi", "iQIYI", "streaming"],
  ["kakaotalk", "KakaoTalk", "messenger"],
  ["kik", "Kik", "messenger"],
  ["kook", "KOOK", "social_network"],
  ["lazada", "Lazada", "shopping"],
  ["leagueoflegends", "League of Legends", "gaming"],
  ["line", "LINE", "social_network"],
  ["linkedin", "LinkedIn", "social_network"],
  ["lionsgateplus", "Lionsgate+", "streaming"],
  ["looke", "Looke", "streaming"],
  ["mail_ru", "Mail.ru", "social_network"],
  ["manus", "Manus", "ai"],
  ["mastodon", "Mastodon", "social_network"],
  ["max", "MAX", "messenger"],
  ["mercado_libre", "Mercado Libre", "shopping"],
  ["meta_ai", "Meta AI", "ai"],
  ["microsoft_teams", "Microsoft Teams", "messenger"],
  ["minecraft", "Minecraft", "gaming"],
  ["nebula", "Nebula", "streaming"],
  ["netflix", "Netflix", "streaming"],
  ["nintendo", "Nintendo", "gaming"],
  ["nvidia", "Nvidia", "software"],
  ["odysee", "Odysee", "social_network"],
  ["ok", "OK.ru", "social_network"],
  ["olvid", "Olvid", "messenger"],
  ["onlyfans", "OnlyFans", "social_network"],
  ["origin", "Origin", "gaming"],
  ["paramountplus", "Paramount Plus", "streaming"],
  ["peacock_tv", "Peacock TV", "streaming"],
  ["perplexity", "Perplexity", "ai"],
  ["pinterest", "Pinterest", "social_network"],
  ["playstation", "PlayStation", "gaming"],
  ["playstore", "Google Play Store", "software"],
  ["plenty_of_fish", "Plenty of Fish", "dating"],
  ["plex", "Plex", "streaming"],
  ["pluto_tv", "Pluto TV", "streaming"],
  ["privacy", "Privacy", "privacy"],
  ["proton", "Proton", "privacy"],
  ["qq", "QQ", "streaming"],
  ["rakuten_viki", "Rakuten Viki", "streaming"],
  ["reddit", "Reddit", "social_network"],
  ["riot_games", "Riot Games", "gaming"],
  ["roblox", "Roblox", "gaming"],
  ["rockstar_games", "Rockstar Games", "gaming"],
  ["samsung_tv_plus", "Samsung TV Plus", "streaming"],
  ["shein", "Shein", "shopping"],
  ["shell_shockers", "Shell Shockers", "gaming"],
  ["shopee", "Shopee", "shopping"],
  ["signal", "Signal", "messenger"],
  ["skype", "Skype", "messenger"],
  ["slack", "Slack", "messenger"],
  ["snapchat", "Snapchat", "social_network"],
  ["soundcloud", "SoundCloud", "streaming"],
  ["spotify", "Spotify", "streaming"],
  ["spotify_video", "Spotify Video", "streaming"],
  ["steam", "Steam", "gaming"],
  ["telegram", "Telegram (Web)", "messenger"],
  ["temu", "Temu", "shopping"],
  ["tidal", "Tidal", "streaming"],
  ["tiktok", "TikTok", "social_network"],
  ["tinder", "Tinder", "dating"],
  ["tumblr", "Tumblr", "social_network"],
  ["twitch", "Twitch", "streaming"],
  ["twitter", "X (formerly Twitter)", "social_network"],
  ["ubisoft", "Ubisoft", "gaming"],
  ["valorant", "Valorant", "gaming"],
  ["viber", "Viber", "messenger"],
  ["vimeo", "Vimeo", "streaming"],
  ["vivo_play", "Vivo Play", "streaming"],
  ["vk", "VK.com", "social_network"],
  ["voot", "Voot", "streaming"],
  ["wargaming", "Wargaming", "gaming"],
  ["warnerbrosgames", "Warner Bros. Games", "gaming"],
  ["wechat", "WeChat", "messenger"],
  ["weibo", "Weibo", "streaming"],
  ["whatsapp", "WhatsApp", "messenger"],
  ["wizz", "Wizz", "dating"],
  ["xboxlive", "Xbox Live", "gaming"],
  ["xiaohongshu", "Xiaohongshu", "shopping"],
  ["youtube", "YouTube", "streaming"],
  ["yy", "YY", "streaming"],
  ["zhihu", "Zhihu", "social_network"],
];

/** 자주 쓰는 AdGuard 서비스의 한국어 이름·주의·별칭 */
const ADGUARD_KO: Record<string, Omit<CatalogEntry, "id" | "group">> = {
  youtube: { name: "유튜브", popular: true, aliases: ["youtube", "유튭", "유튜브뮤직", "youtube music"] },
  instagram: { name: "인스타그램", popular: true, aliases: ["instagram", "인스타", "insta"] },
  tiktok: { name: "틱톡", popular: true, aliases: ["tiktok"] },
  facebook: { name: "페이스북", aliases: ["facebook", "페북"] },
  twitter: { name: "X (트위터)", popular: true, aliases: ["twitter", "x", "트위터"] },
  discord: { name: "디스코드", popular: true, aliases: ["discord", "디코"] },
  kakaotalk: {
    name: "카카오톡 · 카카오 서비스",
    popular: true,
    caution: "kakao.com 전체를 막아 카카오 로그인·카카오페이지·카카오웹툰도 함께 막혀요.",
    aliases: ["kakaotalk", "카카오톡", "카톡", "kakao"],
  },
  netflix: { name: "넷플릭스", popular: true, aliases: ["netflix", "넷플"] },
  disneyplus: { name: "디즈니+", aliases: ["disney", "디즈니플러스", "디즈니"] },
  twitch: { name: "트위치", aliases: ["twitch"] },
  roblox: { name: "로블록스", popular: true, aliases: ["roblox"] },
  minecraft: { name: "마인크래프트", aliases: ["minecraft", "마크"] },
  leagueoflegends: { name: "리그 오브 레전드", popular: true, aliases: ["lol", "롤", "league of legends", "리그오브레전드"] },
  valorant: { name: "발로란트", aliases: ["valorant", "발로"] },
  riot_games: { name: "라이엇 게임즈", aliases: ["riot", "라이엇"] },
  steam: { name: "스팀", popular: true, aliases: ["steam"] },
  epic_games: { name: "에픽게임즈", aliases: ["epic", "에픽", "포트나이트", "fortnite"] },
  battle_net: { name: "배틀넷", aliases: ["battle.net", "battlenet", "오버워치", "overwatch"] },
  blizzard_entertainment: { name: "블리자드", aliases: ["blizzard"] },
  nintendo: { name: "닌텐도", aliases: ["nintendo"] },
  playstation: { name: "플레이스테이션", aliases: ["playstation", "ps"] },
  xboxlive: { name: "엑스박스 라이브", aliases: ["xbox"] },
  electronic_arts: { name: "EA", aliases: ["ea"] },
  chatgpt: { name: "ChatGPT", popular: true, aliases: ["chatgpt", "챗지피티", "gpt", "openai"] },
  gemini: { name: "Gemini", aliases: ["gemini", "제미나이"] },
  claude: { name: "Claude", aliases: ["claude", "클로드"] },
  copilot: { name: "Copilot", aliases: ["copilot", "코파일럿"] },
  perplexity: { name: "Perplexity", aliases: ["perplexity", "퍼플렉시티"] },
  reddit: { name: "레딧", aliases: ["reddit"] },
  pinterest: { name: "핀터레스트", aliases: ["pinterest"] },
  snapchat: { name: "스냅챗", aliases: ["snapchat"] },
  telegram: { name: "텔레그램", aliases: ["telegram"] },
  line: { name: "라인", aliases: ["line"] },
  whatsapp: { name: "왓츠앱", aliases: ["whatsapp"] },
  spotify: { name: "스포티파이", aliases: ["spotify"] },
  amazon: { name: "아마존", aliases: ["amazon"] },
  aliexpress: { name: "알리익스프레스", aliases: ["aliexpress", "알리"] },
  temu: { name: "테무", aliases: ["temu"] },
  shein: { name: "쉬인", aliases: ["shein"] },
  bilibili: { name: "비리비리", aliases: ["bilibili"] },
  playstore: { name: "구글 플레이 스토어", aliases: ["play store", "플레이스토어"] },
  icloud_private_relay: { name: "iCloud 비공개 릴레이", aliases: ["private relay"] },
};

type KrPreset = CatalogEntry & { domains: string[] };

/** 국내 서비스 — AdGuard 목록에 없는 것. 도메인은 하위 도메인까지 함께 막힌다. */
const KR_PRESETS: KrPreset[] = [
  { id: "kr:chzzk", name: "치지직", group: "streaming", popular: true, domains: ["chzzk.naver.com"], aliases: ["chzzk"] },
  { id: "kr:soop", name: "SOOP (아프리카TV)", group: "streaming", popular: true, domains: ["sooplive.co.kr", "afreecatv.com"], aliases: ["soop", "숲", "아프리카", "아프리카tv", "afreeca"] },
  { id: "kr:tving", name: "티빙", group: "streaming", domains: ["tving.com"], aliases: ["tving"] },
  { id: "kr:wavve", name: "웨이브", group: "streaming", domains: ["wavve.com"], aliases: ["wavve"] },
  { id: "kr:coupangplay", name: "쿠팡플레이", group: "streaming", domains: ["coupangplay.com"], aliases: ["coupang play"] },
  { id: "kr:watcha", name: "왓챠", group: "streaming", domains: ["watcha.com"], aliases: ["watcha"] },
  { id: "kr:laftel", name: "라프텔", group: "streaming", domains: ["laftel.net"], aliases: ["laftel"] },
  { id: "kr:naver-webtoon", name: "네이버 웹툰·시리즈", group: "webtoon", popular: true, domains: ["comic.naver.com", "series.naver.com"], aliases: ["네이버웹툰", "네이버 웹툰", "웹툰", "naver webtoon", "네이버시리즈"] },
  { id: "kr:kakao-webtoon", name: "카카오웹툰·카카오페이지", group: "webtoon", popular: true, domains: ["webtoon.kakao.com", "page.kakao.com"], aliases: ["카카오웹툰", "카카오페이지", "카카페"] },
  { id: "kr:dcinside", name: "디시인사이드", group: "community", popular: true, domains: ["dcinside.com"], aliases: ["디시", "dc", "dcinside"] },
  { id: "kr:fmkorea", name: "에펨코리아", group: "community", popular: true, domains: ["fmkorea.com"], aliases: ["펨코", "fmkorea"] },
  { id: "kr:arcalive", name: "아카라이브", group: "community", domains: ["arca.live"], aliases: ["아카", "arca"] },
  { id: "kr:theqoo", name: "더쿠", group: "community", domains: ["theqoo.net"], aliases: ["theqoo"] },
  { id: "kr:inven", name: "인벤", group: "community", domains: ["inven.co.kr"], aliases: ["inven"] },
  { id: "kr:ruliweb", name: "루리웹", group: "community", domains: ["ruliweb.com"], aliases: ["ruliweb"] },
  { id: "kr:instiz", name: "인스티즈", group: "community", domains: ["instiz.net"], aliases: ["instiz"] },
  { id: "kr:natepann", name: "네이트판", group: "community", domains: ["pann.nate.com"], aliases: ["판", "pann"] },
  { id: "kr:everytime", name: "에브리타임", group: "community", domains: ["everytime.kr"], aliases: ["에타", "everytime"] },
  { id: "kr:nexon", name: "넥슨 (메이플·FC 온라인 등)", group: "gaming", popular: true, domains: ["nexon.com"], aliases: ["넥슨", "nexon", "메이플", "메이플스토리", "fc온라인", "피파"] },
  { id: "kr:krafton", name: "배틀그라운드 (크래프톤)", group: "gaming", domains: ["pubg.com", "krafton.com"], aliases: ["배그", "배틀그라운드", "pubg"] },
  { id: "kr:supercell", name: "슈퍼셀 (브롤스타즈·클래시 로얄)", group: "gaming", popular: true, domains: ["supercell.com", "brawlstars.com", "clashroyale.com", "clashofclans.com"], aliases: ["브롤", "브롤스타즈", "클래시로얄", "클로", "supercell"] },
  { id: "kr:hoyoverse", name: "호요버스 (원신·스타레일)", group: "gaming", domains: ["hoyoverse.com", "mihoyo.com"], aliases: ["원신", "스타레일", "hoyoverse", "genshin"] },
  { id: "kr:stove", name: "스토브 (로스트아크)", group: "gaming", domains: ["onstove.com"], aliases: ["로아", "로스트아크", "stove"] },
  { id: "kr:ncsoft", name: "엔씨소프트 (플레이엔씨)", group: "gaming", domains: ["plaync.com"], aliases: ["엔씨", "리니지", "plaync"] },
  { id: "kr:netmarble", name: "넷마블", group: "gaming", domains: ["netmarble.com", "netmarble.net"], aliases: ["netmarble"] },
  { id: "kr:coupang", name: "쿠팡", group: "shopping", domains: ["coupang.com"], aliases: ["coupang"] },
  { id: "kr:musinsa", name: "무신사", group: "shopping", domains: ["musinsa.com"], aliases: ["musinsa"] },
  { id: "kr:ably", name: "에이블리", group: "shopping", domains: ["a-bly.com"], aliases: ["ably"] },
  { id: "kr:zigzag", name: "지그재그", group: "shopping", domains: ["zigzag.kr"], aliases: ["zigzag"] },
  { id: "kr:daangn", name: "당근", group: "shopping", domains: ["daangn.com"], aliases: ["당근마켓", "daangn"] },
  { id: "kr:melon", name: "멜론", group: "music", domains: ["melon.com"], aliases: ["melon"] },
  { id: "kr:genie", name: "지니뮤직", group: "music", domains: ["genie.co.kr"], aliases: ["지니", "genie"] },
  { id: "kr:bugs", name: "벅스", group: "music", domains: ["bugs.co.kr"], aliases: ["bugs"] },
  { id: "kr:flo", name: "FLO", group: "music", domains: ["music-flo.com"], aliases: ["플로", "flo"] },
  { id: "kr:wrtn", name: "뤼튼", group: "ai", domains: ["wrtn.ai"], aliases: ["wrtn"] },
];

/**
 * 차단 우회 방지 규칙.
 *  · iCloud 비공개 릴레이·Firefox DoH 는 "이 이름이 없다(NXDOMAIN)"로 답하면 기기가 스스로 끈다 (각 사 공식 방식).
 *  · 공개 암호화 DNS(DoH·DoT) 주소는 이름을 못 찾게 막는다. IP 를 직접 적는 우회는 공유기 방화벽 몫.
 */
export const BYPASS_RULES: string[] = [
  "||mask.icloud.com^$dnsrewrite=NXDOMAIN;;",
  "||mask-h2.icloud.com^$dnsrewrite=NXDOMAIN;;",
  "||mask-canary.icloud.com^$dnsrewrite=NXDOMAIN;;",
  "||use-application-dns.net^$dnsrewrite=NXDOMAIN;;",
  ...[
    "dns.google",
    "dns.google.com",
    "cloudflare-dns.com",
    "one.one.one.one",
    "dns.quad9.net",
    "dns.adguard-dns.com",
    "dns.adguard.com",
    "doh.opendns.com",
    "dns.nextdns.io",
    "doh.cleanbrowsing.org",
    "dns.alidns.com",
    "doh.pub",
    "dns.sb",
    "dns.mullvad.net",
    "freedns.controld.com",
  ].map((d) => `||${d}^`),
];

const BUILTIN: CatalogEntry[] = [
  ...KR_PRESETS.map((p): CatalogEntry => ({ id: p.id, name: p.name, group: p.group, popular: p.popular, aliases: p.aliases })),
  ...ADGUARD_SERVICES.flatMap(([id, name, group]): CatalogEntry[] => {
    // 도박·데이팅·CDN·호스팅 등은 고를 일이 거의 없고 잘못 막으면 다른 사이트가 깨진다 — "기타"로 뒤에 둔다
    const ko = ADGUARD_KO[id];
    return [{ id, group: ADGUARD_GROUP[group] ?? "etc", ...(ko ?? { name }) }];
  }),
];

const BUILTIN_BY_ID = new Map(BUILTIN.map((e) => [e.id, e]));

const norm = (s: string) => s.toLowerCase().replace(/[\s·.\-_()+]/g, "");

/** 화면에 보여 줄 전체 목록 — 자주 쓰는 것 먼저, 그다음 묶음·이름순 */
export function listCatalog(): CatalogEntry[] {
  return [...BUILTIN].sort((a, b) => {
    if (!!a.popular !== !!b.popular) return a.popular ? -1 : 1;
    const g = CATALOG_GROUP_ORDER.indexOf(a.group) - CATALOG_GROUP_ORDER.indexOf(b.group);
    return g !== 0 ? g : a.name.localeCompare(b.name, "ko");
  });
}

export function getCatalogEntry(id: string): CatalogEntry | null {
  return BUILTIN_BY_ID.get(id) ?? null;
}

/** 규칙·기록에 남길 표시 이름. 목록에 없는 id 는 그대로 보여 준다. */
export function serviceLabel(id: string): string {
  return BUILTIN_BY_ID.get(id)?.name ?? id;
}

/**
 * 학생이 적은 앱 이름("유튜브", "Discord") → 서비스 id. 정확히 같은 이름·별칭만 인정한다.
 * (비슷한 이름으로 엉뚱한 서비스를 열어 주지 않기 위해 부분 일치는 쓰지 않는다)
 */
export function matchServiceByName(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const q = norm(text);
  if (!q) return null;
  for (const e of BUILTIN) {
    if (norm(e.id.replace(/^kr:/, "")) === q || norm(e.name) === q) return e.id;
    if (e.aliases?.some((a) => norm(a) === q)) return e.id;
  }
  return null;
}

/** 국내 서비스 + 우회 방지의 규칙. 장비가 올린 AdGuard 목록과 합쳐 쓴다. */
export function builtinCatalogRules(): CatalogRules {
  const rules: CatalogRules = { [BYPASS_SERVICE_ID]: BYPASS_RULES };
  for (const p of KR_PRESETS) rules[p.id] = p.domains.map((d) => `||${d}^`);
  return rules;
}

/** 장비가 올린 목록([{ id, rules }])을 검증해 규칙 맵으로. 형식이 다른 항목은 버린다. */
export function parseAgentCatalog(raw: unknown): CatalogRules {
  const out: CatalogRules = {};
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, rules } = item as { id?: unknown; rules?: unknown };
    if (typeof id !== "string" || !/^[a-z0-9_]{1,60}$/.test(id) || !Array.isArray(rules)) continue;
    out[id] = rules.filter((r): r is string => typeof r === "string" && r.length > 0 && r.length <= 300 && !/[\r\n]/.test(r));
  }
  return out;
}
