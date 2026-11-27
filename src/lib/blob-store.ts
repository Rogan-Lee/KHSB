import { createHmac, timingSafeEqual } from "node:crypto";

import { del, get, put } from "@vercel/blob";

// 학생 관련 첨부의 저장소 선택 (서버 전용).
//
// BLOB_PRIVATE_READ_WRITE_TOKEN(비공개 저장소의 읽기·쓰기 토큰)이 있으면 새 업로드를 비공개 저장소로 보내고,
// DB 의 기존 URL 칸에는 앱 내부 경로 `/api/files/<pathname>` 을 저장한다. 그 경로는 src/app/api/files 가
// 권한을 확인한 뒤 비공개 저장소에서 읽어 보내 준다. 토큰이 없으면 지금처럼 공개 저장소의 공개 URL.
//
// 토큰은 항상 명시해서 넘긴다 — 프로젝트에 저장소를 하나 더 연결하면 Vercel 이 BLOB_STORE_ID(OIDC)를 넣는데,
// SDK 는 토큰을 안 받으면 OIDC 를 먼저 써서 엉뚱한 저장소로 갈 수 있다.

export const FILE_ROUTE = "/api/files/";

export const publicBlobToken = () => process.env.BLOB_READ_WRITE_TOKEN;
export const privateBlobToken = () => process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || undefined;
export const isPrivateBlobEnabled = () => !!privateBlobToken();

const PUBLIC_BLOB_URL = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//;

// ─────────────────────────── 경로 ───────────────────────────

/** 파일 이름에 #?%·괄호가 있어도 주소 한 덩어리로 남게 세그먼트마다 인코딩 (괄호는 마크다운 링크를 깨므로 함께) */
function encodeSegment(segment: string) {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePathname(pathname: string) {
  return pathname.split("/").map(encodeSegment).join("/");
}

/** 빈 세그먼트·./..·역슬래시·제어문자 없는 blob pathname 인지 */
export function isSafeBlobPathname(pathname: string) {
  return (
    pathname.length > 0 &&
    pathname.length <= 1024 &&
    !/[\\\u0000-\u001f\u007f]/.test(pathname) &&
    pathname.split("/").every((s) => s !== "" && s !== "." && s !== "..")
  );
}

/** DB 저장값: blob pathname → `/api/files/<인코딩된 pathname>` */
export function fileUrlForPathname(pathname: string) {
  return FILE_ROUTE + encodePathname(pathname);
}

/** `/api/files/...`(쿼리 무시)에서 blob pathname. 내부 경로가 아니거나 안전하지 않으면 null */
export function pathnameFromFileUrl(url: string): string | null {
  if (typeof url !== "string" || !url.startsWith(FILE_ROUTE)) return null;
  const raw = url.slice(FILE_ROUTE.length).split(/[?#]/)[0];
  let pathname: string;
  try {
    pathname = raw.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  return isSafeBlobPathname(pathname) ? pathname : null;
}

export const isStoredFileUrl = (url: string) => pathnameFromFileUrl(url) !== null;

// ─────────────────────────── 서명 ───────────────────────────
// 앱·학생 포털·토큰 리포트처럼 세션 쿠키 없이 여는 곳에 주는 짧은 기한 주소. 키는 비공개 저장소 토큰.

const SIGN_BUCKET_SECONDS = 60 * 60;
const INCOMING_GRACE_MS = 24 * 60 * 60 * 1000;

function signature(pathname: string, exp: number, key: string) {
  return createHmac("sha256", key).update(`${pathname}\n${exp}`).digest("base64url").slice(0, 32);
}

/**
 * 저장된 내부 경로에 기한 서명을 붙인다. origin 을 주면 절대 주소(앱용).
 * 내부 경로가 아니거나 비공개 저장소가 꺼져 있으면 그대로 돌려준다.
 */
export function signFileUrl(url: string, origin = "", nowMs = Date.now()) {
  const key = privateBlobToken();
  const pathname = key ? pathnameFromFileUrl(url) : null;
  if (!key || !pathname) return url;
  // ponytail: 1~2시간 유효 — 한 시간 동안은 같은 주소라 앱 이미지 캐시가 맞는다. 더 짧게 하려면 버킷을 줄인다
  const exp = (Math.floor(nowMs / 1000 / SIGN_BUCKET_SECONDS) + 2) * SIGN_BUCKET_SECONDS;
  return `${origin}${fileUrlForPathname(pathname)}?e=${exp}&s=${signature(pathname, exp, key)}`;
}

export function verifyFileSignature(
  pathname: string,
  e: string | null | undefined,
  s: string | null | undefined,
  nowMs = Date.now(),
) {
  const key = privateBlobToken();
  const exp = Number(e);
  if (!key || !s || !Number.isInteger(exp) || exp * 1000 < nowMs) return false;
  const expected = Buffer.from(signature(pathname, exp, key));
  const given = Buffer.from(s);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const STORED_FILE_URL = /(?<=["(])\/api\/files\/[A-Za-z0-9\-._~%/]+/g;

/**
 * 응답 데이터 안의 저장된 내부 경로(첨부 url·마크다운 이미지)를 전부 서명 주소로 바꾼다.
 * 비공개 저장소가 꺼져 있거나 내부 경로가 없으면 원본 그대로. (JSON 왕복이라 Date 는 문자열이 된다 — 응답 직전에만)
 */
export function signFileUrls<T>(data: T, origin = ""): T {
  if (!isPrivateBlobEnabled() || data == null) return data;
  const json = JSON.stringify(data);
  if (!json || !json.includes(FILE_ROUTE)) return data;
  return JSON.parse(json.replace(STORED_FILE_URL, (m) => signFileUrl(m, origin)));
}

/**
 * 클라가 보낸 첨부 주소를 저장 전에 정규화한다.
 * - 서명된 내부 주소(상대·절대, 업로드 응답이나 조회 응답에서 받은 것) → 서명을 뗀 `/api/files/...`
 * - 서명 없는 내부 주소·비공개 저장소 원본 주소 → null (남의 파일 경로를 적어 넣고 서명을 받아 가는 것 차단)
 * - 그 밖(공개 blob URL 등) → 그대로 (호출부의 기존 검사에 맡긴다)
 */
export function normalizeIncomingFileUrl(raw: string, nowMs = Date.now()): string | null {
  let rel = raw;
  if (/^https?:\/\//i.test(raw)) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return raw;
    }
    if (u.hostname.endsWith(".private.blob.vercel-storage.com")) return null;
    if (!u.pathname.startsWith(FILE_ROUTE)) return raw;
    rel = u.pathname + u.search;
  }
  if (!rel.startsWith(FILE_ROUTE)) return raw;
  const pathname = pathnameFromFileUrl(rel);
  const query = new URLSearchParams(rel.split("?")[1] ?? "");
  // 업로드 뒤 작성 화면에 오래 둔 경우를 위해 하루 유예
  return pathname && verifyFileSignature(pathname, query.get("e"), query.get("s"), nowMs - INCOMING_GRACE_MS)
    ? fileUrlForPathname(pathname)
    : null;
}

/**
 * 업로드 라우트가 돌려준 주소인지 확인하고 저장할 값을 돌려준다 (아니면 null).
 * 공개 blob URL 이거나 서명된 내부 주소이면서 pathname 이 prefix(예: `mentoring/<id>/`)로 시작해야 한다.
 * stored=true 는 이미 DB 에 있는 값(서명 없는 내부 경로)을 지우기 전에 확인할 때.
 */
export function uploadedFileUrlUnder(raw: unknown, prefix: string, { stored = false } = {}): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  const url = stored ? raw : normalizeIncomingFileUrl(raw);
  if (!url) return null;
  const internal = pathnameFromFileUrl(url);
  if (internal) return internal.startsWith(prefix) ? url : null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      u.hostname.endsWith(".public.blob.vercel-storage.com") &&
      u.pathname.startsWith(`/${prefix}`)
      ? url
      : null;
  } catch {
    return null;
  }
}

// ─────────────────────────── 저장소 작업 ───────────────────────────

type PutBody = Parameters<typeof put>[1];

/**
 * 학생 관련 파일 업로드. 돌려주는 값이 DB 에 저장할 url —
 * 비공개 저장소가 켜져 있으면 `/api/files/<pathname>`, 아니면 지금처럼 공개 URL.
 */
export async function putStudentFile(
  pathname: string,
  body: PutBody,
  opts: { contentType?: string; addRandomSuffix?: boolean } = {},
): Promise<string> {
  const privateToken = privateBlobToken();
  if (privateToken) {
    const blob = await put(pathname, body, { ...opts, access: "private", token: privateToken });
    return fileUrlForPathname(blob.pathname);
  }
  const blob = await put(pathname, body, { ...opts, access: "public", token: publicBlobToken() });
  return blob.url;
}

/**
 * 클라 직접 업로드 토큰을 만들 저장소. acceptsPrivate=false(비공개를 모르는 이전 앱)면 비공개가 켜져 있어도 공개.
 * 비공개면 업로드가 끝난 파일의 저장값은 fileUrlForPathname(pathname).
 */
export function directUploadStore(acceptsPrivate = true) {
  const privateToken = acceptsPrivate ? privateBlobToken() : undefined;
  return privateToken
    ? { access: "private" as const, token: privateToken }
    : { access: "public" as const, token: publicBlobToken() };
}

function privateBlobUrl(pathname: string, token: string) {
  // 토큰 형식: vercel_blob_rw_<storeId>_<secret>
  const storeId = token.split("_")[3];
  return `https://${storeId}.private.blob.vercel-storage.com/${encodePathname(pathname)}`;
}

/** 비공개 저장소에서 읽기 (없으면 null). range 를 넘기면 저장소의 206 응답 헤더가 그대로 온다 */
export async function getPrivateFile(pathname: string, range?: string | null) {
  const token = privateBlobToken();
  if (!token) return null;
  return get(privateBlobUrl(pathname, token), {
    access: "private",
    token,
    headers: range ? { range } : undefined,
  });
}

/**
 * 저장된 url 들을 저장소별로 지운다 — 공개 blob URL 은 공개 토큰, `/api/files/...` 는 비공개 토큰.
 * 그 밖의 주소(외부 링크 등)는 건너뛴다. 실패하면 throw (호출부가 잡는다).
 */
export async function deleteBlobFiles(urls: readonly string[]) {
  const publicUrls = urls.filter((u) => PUBLIC_BLOB_URL.test(u));
  const privatePaths = urls.map(pathnameFromFileUrl).filter((p): p is string => p !== null);
  if (publicUrls.length > 0) await del(publicUrls, { token: publicBlobToken() });
  if (privatePaths.length > 0) {
    const token = privateBlobToken();
    if (!token) throw new Error("비공개 저장소 토큰이 없어 파일을 지우지 못했습니다");
    await del(privatePaths.map((p) => privateBlobUrl(p, token)), { token });
  }
}

/** 지울 대상이 되는 저장값인지 (공개 blob URL 또는 내부 경로) */
export const isDeletableBlobUrl = (url: string) => PUBLIC_BLOB_URL.test(url) || isStoredFileUrl(url);
