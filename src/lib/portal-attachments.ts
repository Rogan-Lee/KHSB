// 포털 첨부(질문·채팅·수행평가 제출/피드백) 메타 정규화 — 서버 액션 공용.
// 클라이언트가 보낸 첨부 객체를 그대로 JSON 컬럼에 저장하지 않고, 알려진 필드만 길이 제한해 남긴다.
// URL 은 https:// 절대 주소와 비공개 저장소 내부 경로(/api/files/…)만 허용한다
// (javascript:/data:/http:/그 밖의 상대 경로 차단 — 다른 사용자 화면의 href/src 로 렌더되므로).
// 클라가 새로 보내는 첨부는 sanitizeIncomingAttachments — 내부 경로는 서명된 것만 받는다.
import { z } from "zod";

import { isStoredFileUrl, normalizeIncomingFileUrl } from "@/lib/blob-store";

export type PortalAttachment = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

const MAX_URL_LEN = 2000;
const MAX_NAME_LEN = 200;
const MAX_MIME_LEN = 120;

export function isSafeAttachmentUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0 || url.length > MAX_URL_LEN) return false;
  return url.startsWith("https://") || isStoredFileUrl(url);
}

/** 안전하지 않은 항목은 버리고 최대 max 개까지 정규화. 배열이 아니면 빈 배열. */
export function sanitizePortalAttachments(input: unknown, max: number): PortalAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (a): a is Record<string, unknown> =>
        !!a && typeof a === "object" && isSafeAttachmentUrl((a as { url?: unknown }).url)
    )
    .slice(0, max)
    .map((a) => ({
      url: a.url as string,
      name:
        typeof a.name === "string" && a.name.trim()
          ? a.name.slice(0, MAX_NAME_LEN)
          : "첨부",
      sizeBytes:
        typeof a.sizeBytes === "number" && Number.isFinite(a.sizeBytes) && a.sizeBytes >= 0
          ? Math.round(a.sizeBytes)
          : 0,
      mimeType:
        typeof a.mimeType === "string" && a.mimeType.trim()
          ? a.mimeType.slice(0, MAX_MIME_LEN)
          : "application/octet-stream",
    }));
}

/**
 * 클라가 새로 보낸 첨부용. 서명된 내부 주소는 서명을 떼어 저장값으로 바꾸고, 서명 없는 내부 주소는 버린다
 * (남의 파일 경로를 적어 넣은 뒤 조회 응답에서 서명을 받아 가는 것 차단). 나머지는 sanitizePortalAttachments 와 같다.
 */
export function sanitizeIncomingAttachments(input: unknown, max: number): PortalAttachment[] {
  if (!Array.isArray(input)) return [];
  const normalized = input.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const url = (a as { url?: unknown }).url;
    if (typeof url !== "string") return [];
    const next = normalizeIncomingFileUrl(url);
    return next ? [{ ...(a as Record<string, unknown>), url: next }] : [];
  });
  return sanitizePortalAttachments(normalized, max);
}

const INVALID_URL = "첨부 파일 주소가 올바르지 않아요";

/** 모바일 API 가 새로 받는 첨부 url (zod). https 만 받고, 서명된 내부 주소는 저장값으로 바꾼다 */
export const incomingAttachmentUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((url) => url.startsWith("https://") && URL.canParse(url) && normalizeIncomingFileUrl(url) !== null, INVALID_URL)
  .transform((url) => normalizeIncomingFileUrl(url) as string);

/** 저장된 첨부를 내려보낼 때 (zod). http(s) 또는 내부 경로만 — 서명은 응답 직전(mobileJson)에 붙는다 */
export const storedAttachmentUrl = z
  .string()
  .max(2000)
  .refine((url) => (/^https?:\/\//i.test(url) && URL.canParse(url)) || isStoredFileUrl(url), INVALID_URL);
