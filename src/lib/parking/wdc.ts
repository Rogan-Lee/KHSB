// 주차장 "방문차량 웹할인" 사이트(JSP) 연동 — 공식 API 가 없어 독서실 계정으로 로그인해 화면이 보내는 요청을 그대로 보낸다.
// 흐름(2026-10-27 화면 확인): login.do → search.jsp(4자리 POST) → discount.jsp?carNo= → 버튼 링크 discount.do?…&dcCode=
// ponytail: 화면 긁기라 업체가 화면을 바꾸면 깨진다 — 실패는 학부모에게 "시설로 문의" + 슬랙 알림으로 드러난다.
// 사이트가 http 뿐이고 로그인 성공 리다이렉트 주소에 비밀번호가 붙어 온다 — Location 을 로그·오류 문구에 절대 넣지 않는다.

const MOCK = process.env.PARKING_WDC_URL === "mock" && process.env.NODE_ENV !== "production";
const BASE = (process.env.PARKING_WDC_URL?.trim() || "http://hsdream.iptime.org/WDC").replace(/\/$/, "");
/** 적용할 할인 버튼 — 03 = "1시간"(60포인트). 직원이 지금까지 쓴 할인도 모두 이 버튼 */
const DC_CODE = process.env.PARKING_WDC_DC_CODE?.trim() || "03";
const TIMEOUT_MS = 8000;

export type WdcResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY" | "ERROR"; detail: string };

/** 계정이 설정된 시설에서만 학부모 메뉴를 연다 */
export function parkingEnabled(): boolean {
  return MOCK || !!(process.env.PARKING_WDC_ID?.trim() && process.env.PARKING_WDC_PASSWORD);
}

/** 입차한 차량을 찾아 할인을 적용한다. carNo 는 normalizeCarNo 를 거친 전체 번호 */
export async function applyWdcDiscount(carNo: string): Promise<WdcResult> {
  if (MOCK) return mockApply(carNo);
  const cookie = await login();
  try {
    const list = await page("search.jsp", cookie, { searchCar: carNo.slice(-4) });
    const plates = [...list.matchAll(/href="discount\.jsp\?carNo=([^"]+)"/g)].map((m) => decodeHtml(m[1]));
    const plate = plates.find((p) => samePlate(p, carNo));
    if (!plate) return { ok: false, reason: "NOT_FOUND", detail: `끝 4자리 검색 ${plates.length}대 중 일치 없음` };

    const before = parseDiscountPage(await page(`discount.jsp?carNo=${encodeURIComponent(plate)}`, cookie));
    // 이번 주차에 이미 할인을 받은 차량 — 같은 방문에 두 번 쓰지 않는다 (직원이 이미 넣었거나 중복 등록)
    if (before.dcMin > 0) return { ok: false, reason: "ALREADY", detail: `이미 ${before.dcMin}분 할인됨` };
    const href = before.buttons.find((h) => new URL(h, `${BASE}/`).searchParams.get("dcCode") === DC_CODE);
    if (!href) {
      return { ok: false, reason: "ERROR", detail: `할인 버튼(${DC_CODE}) 없음 · 무료 포인트 ${before.freePoint ?? "?"}` };
    }

    await page(href, cookie);

    // 응답 형식에 기대지 않고, 할인 화면을 다시 열어 할인 시간이 늘었는지로 판단한다
    const after = parseDiscountPage(await page(`discount.jsp?carNo=${encodeURIComponent(plate)}`, cookie));
    return after.dcMin > before.dcMin
      ? { ok: true }
      : { ok: false, reason: "ERROR", detail: `적용 확인 실패 · 무료 포인트 ${after.freePoint ?? "?"}` };
  } finally {
    await request("logout.jsp", cookie).catch(() => undefined);
  }
}

/** 같은 차량인지 — 사이트와 입력 중 한쪽에만 지역 표기(서울 등)가 있어도 같은 번호로 본다 */
export function samePlate(a: string, b: string): boolean {
  const strip = (v: string) => v.replace(/\s/g, "").replace(/^[가-힣]{2}(?=\d)/, "");
  return strip(a) === strip(b);
}

/** 할인 화면에서 쓰는 값만 — 적용된 할인 시간(분), 무료 포인트, 할인 버튼 링크 */
export function parseDiscountPage(html: string) {
  const dc = html.match(/name="dcMin"\s+value="(\d+)시간\s*(\d+)분"/);
  const point = html.match(/name="freePoint"[^>]*value="(\d+)"/);
  return {
    dcMin: dc ? Number(dc[1]) * 60 + Number(dc[2]) : 0,
    freePoint: point ? Number(point[1]) : null,
    buttons: [...html.matchAll(/href="(discount\.do\?[^"]+)"/g)].map((m) => decodeHtml(m[1])),
  };
}

const decodeHtml = (v: string) => v.replace(/&amp;/g, "&");

async function request(path: string, cookie: string | null, form?: Record<string, string>) {
  // 사이트가 Referer 없는 요청을 "잘못된 접근경로"로 막는다
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0",
    Referer: `${BASE}/${path.startsWith("login") ? "login.jsp" : "search.jsp"}`,
  };
  if (cookie) headers.Cookie = cookie;
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  // new URL 이 한글 쿼리(carNo·userName)를 UTF-8 로 인코딩한다
  return fetch(new URL(path, `${BASE}/`), {
    method: form ? "POST" : "GET",
    headers,
    body: form ? new URLSearchParams(form) : undefined,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function page(path: string, cookie: string, form?: Record<string, string>) {
  const res = await request(path, cookie, form);
  // 세션이 끊기면 로그인·오류 화면으로 보낸다 (주소는 남기지 않는다)
  if (res.status !== 200) throw new Error(`웹할인 응답 ${res.status} (${path.split("?")[0]})`);
  return res.text();
}

function sessionCookie(res: Response): string | null {
  return res.headers.get("set-cookie")?.match(/JSESSIONID=[^;]+/)?.[0] ?? null;
}

async function login(): Promise<string> {
  const cookie = sessionCookie(await request("login.jsp", null));
  if (!cookie) throw new Error("웹할인 세션을 받지 못함");
  const res = await request("login.do", cookie, {
    userID: process.env.PARKING_WDC_ID?.trim() ?? "",
    userPassword: process.env.PARKING_WDC_PASSWORD ?? "",
  });
  // 성공: index.jsp 로 302. 실패: 로그인 화면·500.jsp. Location 에는 비밀번호가 있어 경로만 본다
  const to = (res.headers.get("location") ?? "").split("?")[0];
  if (res.status !== 302 || !to.endsWith("index.jsp")) throw new Error(`웹할인 로그인 실패 (${res.status} ${to})`);
  return sessionCookie(res) ?? cookie;
}

// 로컬 확인용 — 끝자리 0 은 입차 기록 없음, 9 는 이미 할인됨
function mockApply(carNo: string): WdcResult {
  if (carNo.endsWith("0")) return { ok: false, reason: "NOT_FOUND", detail: "모의: 입차 기록 없음" };
  if (carNo.endsWith("9")) return { ok: false, reason: "ALREADY", detail: "모의: 이미 할인됨" };
  return { ok: true };
}
